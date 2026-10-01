// Usage: node tests/sms-e2e.test.js [http://127.0.0.1:8787]
// Banka SMS gelen kutusu: Kestirmeler'in POST ettiği SMS saklanır, kasa sahibi çeker ve siler; şifre/kod SMS'leri saklanmaz.
// Sunucu çalışmıyorsa atlanır.
const crypto = require('crypto');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const b64u = b => Buffer.from(b).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function api(method, path, token, body, headers) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, headers || {}), body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

(async () => {
  let cfg;
  try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) { console.log('Sunucu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  eq('config advertises SMS inbox', cfg.smsInbox, true);
  const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), other = b64u(crypto.randomBytes(32));
  const key = b64u(crypto.randomBytes(32)), key2 = b64u(crypto.randomBytes(32)), stranger = b64u(crypto.randomBytes(32));
  await api('PUT', '/v1/vault/' + id, token, { baseVersion: 0, data: 'QUJD' });
  const V = '/v1/vault/' + id;
  eq('register SMS key needs vault token', (await api('PUT', V + '/sms-key/u_self', null, { keyHash: sha('ft-sms|' + key) })).status, 401);
  eq('register SMS key with wrong token', (await api('PUT', V + '/sms-key/u_self', other, { keyHash: sha('ft-sms|' + key) })).status, 403);
  eq('bad key hash rejected', (await api('PUT', V + '/sms-key/u_self', token, { keyHash: 'abc' })).status, 400);
  eq('register SMS key (u_self)', (await api('PUT', V + '/sms-key/u_self', token, { keyHash: sha('ft-sms|' + key) })).status, 200);
  eq('register SMS key (u_partner)', (await api('PUT', V + '/sms-key/u_partner', token, { keyHash: sha('ft-sms|' + key2) })).status, 200);

  const spend = 'YAPI KREDI: 1234 ile biten kartinizla 28.09.2026 14:32 MIGROS TIC A.S. isyerinde 245,50 TL harcama yapilmistir.';
  eq('unknown key → 404', (await api('POST', '/v1/sms/' + stranger, null, { text: spend })).status, 404);
  eq('GET not allowed on SMS url', (await api('GET', '/v1/sms/' + key)).status, 405);
  eq('JSON body stored', (await api('POST', '/v1/sms/' + key, null, { text: spend })).body, { stored: true });
  eq('same SMS again within minutes → not stored twice', (await api('POST', '/v1/sms/' + key, null, { text: spend })).body, { stored: false, reason: 'duplicate' });
  const salary = 'Akbank: Hesabiniza 01.10.2026 tarihinde 45.000,00 TL maas odemesi yatirilmistir.';
  eq('form body stored (partner key)', (await api('POST', '/v1/sms/' + key2, null, 'text=' + encodeURIComponent(salary), { 'Content-Type': 'application/x-www-form-urlencoded' })).body, { stored: true });
  const plain = 'Hesabinizdan AHMET YILMAZ adina 1.500,00 TL FAST ile gonderilmistir.';
  eq('plain text body stored', (await api('POST', '/v1/sms/' + key, null, plain, { 'Content-Type': 'text/plain' })).body, { stored: true });
  eq('OTP SMS never stored', (await api('POST', '/v1/sms/' + key, null, { text: 'MIGROS 245,50 TL islem icin 3D sifreniz: 482913. Kimseyle paylasmayin.' })).body, { stored: false, reason: 'secret' });
  eq('verification code never stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Akbank dogrulama kodunuz 551203. Tutar 99,00 TL' })).body, { stored: false, reason: 'secret' });
  eq('message without amount not stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Yeni kampanyamizi kacirmayin!' })).body, { stored: false, reason: 'no_amount' });
  eq('personal chat with an amount not stored', (await api('POST', '/v1/sms/' + key, null, { text: 'Aksam gelirken 100 TL getirir misin?' })).body, { stored: false, reason: 'not_bank' });
  eq('oversized message rejected', (await api('POST', '/v1/sms/' + key, null, { text: 'x'.repeat(9000) })).status, 413);
  eq('warning line "sifrenizi paylasmayin" does not drop a real spend SMS', (await api('POST', '/v1/sms/' + key, null, { text: '4321 ile biten kartinizdan 99,90 TL harcama yapildi. Sifrenizi kimseyle paylasmayiniz.' })).body, { stored: true });

  eq('inbox needs vault token', (await api('GET', V + '/inbox', other)).status, 403);
  const inbox = await api('GET', V + '/inbox', token);
  eq('inbox lists stored SMS with owner label', inbox.body.items.map(i => [i.label, i.text.slice(0, 12)]), [['u_self', spend.slice(0, 12)], ['u_partner', salary.slice(0, 12)], ['u_self', plain.slice(0, 12)], ['u_self', '4321 ile bit']]);
  eq('inbox reports registered labels', inbox.body.labels.sort(), ['u_partner', 'u_self']);
  eq('inbox reports last call result per key (no text)', inbox.body.keys.map(k => [k.label, k.lastReason, k.lastAt > 0]).sort(), [['u_partner', 'stored', true], ['u_self', 'stored', true]]);
  eq('ack deletes only given ids', (await api('POST', V + '/inbox/ack', token, { ids: inbox.body.items.slice(0, 2).map(i => i.id) })).body, { deleted: 2 });
  eq('ack by other vault token refused', (await api('POST', V + '/inbox/ack', other, { ids: [inbox.body.items[2].id] })).status, 403);
  eq('remaining inbox', (await api('GET', V + '/inbox', token)).body.items.length, 2);

  // Anahtar yenilenince eskisi geçersiz olur; anahtar silinince SMS kabul edilmez
  const key3 = b64u(crypto.randomBytes(32));
  await api('PUT', V + '/sms-key/u_self', token, { keyHash: sha('ft-sms|' + key3) });
  eq('old key invalid after rotation', (await api('POST', '/v1/sms/' + key, null, { text: spend + ' 2' })).status, 404);
  eq('new key works', (await api('POST', '/v1/sms/' + key3, null, { text: spend + ' 3' })).body, { stored: true });
  eq('delete key', (await api('DELETE', V + '/sms-key/u_self', token)).status, 200);
  eq('deleted key refused', (await api('POST', '/v1/sms/' + key3, null, { text: spend + ' 4' })).status, 404);

  // Kasa silinince anahtarlar ve bekleyen SMS'ler de silinir
  eq('vault delete', (await api('DELETE', V, token)).body, { deleted: true });
  eq('partner key gone with vault', (await api('POST', '/v1/sms/' + key2, null, { text: salary + ' x' })).status, 404);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
