// Usage: node tests/worker-api.test.js [http://127.0.0.1:8787]
// Çalışan bir `wrangler dev --test-scheduled` örneğine karşı eşitleme API'sini ve push cron'unu test eder.
// Sunucuya ulaşılamazsa atlanır. .dev.vars içinde ALLOW_INSECURE_PUSH=1 olmalı (yerel sahte push servisi için).
const http = require('http'), crypto = require('crypto');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const b64u = b => Buffer.from(b).toString('base64url');
async function api(method, path, token, body, extra) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, extra || {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
(async () => {
  let cfg;
  try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) { console.log('Eşitleme sunucusu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  eq('config exposes VAPID public key', typeof cfg.vapidPublicKey === 'string' && cfg.vapidPublicKey.length > 80, true);
  const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), other = b64u(crypto.randomBytes(32));
  eq('missing vault → 404', (await api('GET', '/v1/vault/' + id, token)).status, 404);
  eq('no token → 401', (await api('GET', '/v1/vault/' + id)).status, 401);
  eq('create with base 0', await api('PUT', '/v1/vault/' + id, token, { baseVersion: 0, data: 'QUJD' }).then(r => [r.status, r.body.version]), [201, 1]);
  eq('wrong token → 403', (await api('GET', '/v1/vault/' + id, other)).status, 403);
  eq('read back', await api('GET', '/v1/vault/' + id, token).then(r => [r.body.version, r.body.data]), [1, 'QUJD']);
  eq('unchanged shortcut', (await api('GET', '/v1/vault/' + id + '?known=1', token)).body.unchanged, true);
  eq('update with current base', await api('PUT', '/v1/vault/' + id, token, { baseVersion: 1, data: 'REVG' }).then(r => [r.status, r.body.version]), [200, 2]);
  eq('stale base → 409 with current version', await api('PUT', '/v1/vault/' + id, token, { baseVersion: 1, data: 'WFla' }).then(r => [r.status, r.body.version]), [409, 2]);
  eq('stale write did not land', (await api('GET', '/v1/vault/' + id, token)).body.data, 'REVG');
  eq('non-base64 data rejected', (await api('PUT', '/v1/vault/' + id, token, { baseVersion: 2, data: '<script>' })).status, 400);
  eq('oversize body rejected', (await api('PUT', '/v1/vault/' + id, token, { baseVersion: 2, data: 'A'.repeat(2100000) })).status, 413);

  // Sahte push servisi: VAPID imzasını doğrula
  const hits = [];
  const srv = http.createServer((q, s) => { hits.push({ url: q.url, auth: q.headers.authorization, ttl: q.headers.ttl, len: q.headers['content-length'] }); s.writeHead(q.url.includes('gone') ? 410 : 201); s.end(); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ep = 'http://127.0.0.1:' + srv.address().port;
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  eq('register push device', (await api('PUT', '/v1/vault/' + id + '/push/devA0001', token, { endpoint: ep + '/sub/a', pingDays: [today, '2099-01-01', 'bad'] })).body, { ok: true, days: 2 });
  eq('register second device (expired sub)', (await api('PUT', '/v1/vault/' + id + '/push/devB0001', token, { endpoint: ep + '/sub/gone', pingDays: [today] })).status, 200);
  eq('register device not due today', (await api('PUT', '/v1/vault/' + id + '/push/devC0001', token, { endpoint: ep + '/sub/c', pingDays: ['2099-01-01'] })).status, 200);
  eq('javascript: endpoint rejected', (await api('PUT', '/v1/vault/' + id + '/push/devD0001', token, { endpoint: 'javascript:alert(1)', pingDays: [today] })).status, 400);
  eq('non push-service https endpoint rejected', (await api('PUT', '/v1/vault/' + id + '/push/devE0001', token, { endpoint: 'https://example.com/hook', pingDays: [today] })).status, 400);
  eq('FCM endpoint accepted', (await api('PUT', '/v1/vault/' + id + '/push/devF0001', token, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', pingDays: ['2099-01-02'] })).status, 200);
  for (let i = 0; i < 6; i++) await api('PUT', '/v1/vault/' + id + '/push/devX000' + i, token, { endpoint: 'https://fcm.googleapis.com/fcm/send/x' + i, pingDays: ['2099-01-02'] });
  eq('device limit per vault (10)', (await api('PUT', '/v1/vault/' + id + '/push/devY0001', token, { endpoint: 'https://fcm.googleapis.com/fcm/send/y', pingDays: [] })).status, 429);
  eq('existing device can still update at limit', (await api('PUT', '/v1/vault/' + id + '/push/devA0001', token, { endpoint: ep + '/sub/a', pingDays: [today] })).status, 200);
  await fetch(BASE + '/__scheduled?cron=0+6+*+*+*');
  await new Promise(r => setTimeout(r, 1500));
  eq('cron pinged only devices due today', hits.map(h => h.url).sort(), ['/sub/a', '/sub/gone']);
  const h = hits.find(x => x.url === '/sub/a');
  eq('push has no payload and a TTL', [h.len, h.ttl], ['0', '86400']);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.auth || '');
  let sigOk = false, aud = '';
  if (m) {
    const [hd, pl, sg] = m[1].split('.');
    aud = JSON.parse(Buffer.from(pl, 'base64url')).aud;
    const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(Buffer.from(m[2], 'base64url').subarray(1, 33)), y: b64u(Buffer.from(m[2], 'base64url').subarray(33, 65)) }, format: 'jwk' });
    sigOk = crypto.verify('sha256', Buffer.from(hd + '.' + pl), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url'));
  }
  eq('VAPID JWT signature verifies, aud = push origin', [sigOk, aud], [true, ep]);
  hits.length = 0;
  await fetch(BASE + '/__scheduled?cron=0+6+*+*+*');
  await new Promise(r => setTimeout(r, 1000));
  eq('same day not sent twice; expired sub removed', hits.length, 0);
  eq('delete vault', (await api('DELETE', '/v1/vault/' + id, token)).body, { deleted: true });
  eq('vault gone', (await api('GET', '/v1/vault/' + id, token)).status, 404);
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
