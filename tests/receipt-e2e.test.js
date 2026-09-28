// Usage: node tests/receipt-e2e.test.js [http://127.0.0.1:8787]
// Yapay zekâ ile fiş okuma uç noktasını sahte bir Claude API'sine karşı sınar (gerçek API'ye istek gitmez, ücret yok).
// worker/.dev.vars içinde: ANTHROPIC_API_KEY=test-key  ANTHROPIC_BASE_URL=http://127.0.0.1:8798  RECEIPT_DAILY_LIMIT=4
// Sunucu çalışmıyorsa veya yapay zekâ kapalıysa atlanır.
const http = require('http'), crypto = require('crypto');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const b64u = b => Buffer.from(b).toString('base64url');
async function api(method, path, token, body) {
  const r = await fetch(BASE + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}

// Sahte Messages API: son isteği kaydeder, moda göre yanıt verir
let mode = 'ok', last = null;
const reply = { readable: true, merchant: 'Migros', date: '2026-09-27', total: 296.4, category: 'Market', items: [{ name: 'Süt', amount: 34.9 }, { name: 'Ekmek', amount: 12.5 }] };
const mock = http.createServer((q, s) => {
  let b = ''; q.on('data', c => b += c); q.on('end', () => {
    try { last = { url: q.url, headers: q.headers, body: JSON.parse(b) }; } catch (e) { last = { url: q.url, headers: q.headers, body: null }; }
    const send = (status, obj) => { s.writeHead(status, { 'Content-Type': 'application/json', 'request-id': 'req_test' }); s.end(JSON.stringify(obj)); };
    if (mode === 'unauth') return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    const msg = { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 120 } };
    if (mode === 'refusal') return send(200, Object.assign(msg, { stop_reason: 'refusal', content: [] }));
    const out = mode === 'garbage' ? Object.assign({}, reply, { total: -5, category: 'Uydurma', date: 'dün', items: [{ name: '', amount: 1 }] }) : reply;
    send(200, Object.assign(msg, { content: [{ type: 'text', text: JSON.stringify(out) }] }));
  });
});

(async () => {
  let cfg;
  try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) { console.log('Sunucu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  if (!cfg.receiptAI) { console.log('Sunucuda ANTHROPIC_API_KEY yok (.dev.vars); fiş testi atlandı.'); process.exit(0); }
  await new Promise(r => mock.listen(8798, '127.0.0.1', r));
  try {
    const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), other = b64u(crypto.randomBytes(32));
    const img = Buffer.from('fake-jpeg-bytes').toString('base64');
    const path = '/v1/vault/' + id + '/receipt';
    eq('config advertises receipt AI', cfg.receiptAI, true);
    eq('no token → 401', (await api('POST', path, null, { image: img })).status, 401);
    eq('unknown vault → 404', (await api('POST', path, token, { image: img })).status, 404);
    await api('PUT', '/v1/vault/' + id, token, { baseVersion: 0, data: 'QUJD' });
    eq('wrong token → 403', (await api('POST', path, other, { image: img })).status, 403);
    eq('GET not allowed', (await api('GET', path, token)).status, 405);
    eq('non-base64 image rejected before calling AI', (await api('POST', path, token, { image: '<svg>' })).status, 400);
    last = null;
    const ok = await api('POST', path, token, { image: img, mediaType: 'image/jpeg', categories: ['Market', 'Yiyecek', 'Diğer', '<b>x</b>'.repeat(20)] });
    eq('receipt read', [ok.status, ok.body.readable, ok.body.merchant, ok.body.total, ok.body.date, ok.body.category, ok.body.items.length, ok.body.used], [200, true, 'Migros', 296.4, '2026-09-27', 'Market', 2, 1]);
    const req = last && last.body || {};
    const content = (req.messages && req.messages[0] && req.messages[0].content) || [];
    eq('request: model, key header, image block, JSON schema output', [last && last.url.split('?')[0],last && last.headers['x-api-key'], req.model, content[0] && content[0].type, content[0] && content[0].source && content[0].source.data === img, req.output_config && req.output_config.format && req.output_config.format.type], ['/v1/messages', 'test-key', 'claude-opus-5', 'image', true, 'json_schema']);
    eq('request: refusal fallback opted in, low effort', [String(last.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), req.fallbacks, req.output_config.effort], [true, 'default', 'low']);
    eq('request: category enum is sanitized and capped', (() => { const e = req.output_config.format.schema.properties.category.enum; return [e.includes('Market'), e.includes('Diğer'), e.every(c => c.length <= 40)]; })(), [true, true, true]);
    mode = 'garbage';
    eq('model output is clamped (negative total → unreadable, unknown category → Diğer, bad date dropped)', await api('POST', path, token, { image: img }).then(r => [r.status, r.body.readable, r.body.total, r.body.category, r.body.date, r.body.items.length]), [200, false, 0, 'Diğer', '', 0]);
    mode = 'refusal';
    eq('refusal → 422', (await api('POST', path, token, { image: img })).status, 422);
    mode = 'unauth';
    eq('bad API key → 503 ai_key (no key leak)', await api('POST', path, token, { image: img }).then(r => [r.status, r.body.error, JSON.stringify(r.body).includes('test-key')]), [503, 'ai_key', false]);
    mode = 'ok';
    const over = await api('POST', path, token, { image: img });
    eq('daily limit per vault', [over.status, over.body.error], [429, 'daily_limit']);
  } finally { mock.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
