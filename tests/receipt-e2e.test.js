// Usage: node tests/receipt-e2e.test.js [http://127.0.0.1:8787]
// Yapay zekâ ile fiş okuma uç noktasını sahte bir DeepSeek API'sine karşı sınar (gerçek API'ye istek gitmez, ücret yok).
// worker/.dev.vars içinde: DEEPSEEK_API_KEY=test-key  DEEPSEEK_BASE_URL=http://127.0.0.1:8798  RECEIPT_DAILY_LIMIT=4
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

// Sahte DeepSeek (OpenAI uyumlu) API: /models ve /chat/completions; son isteği kaydeder, moda göre yanıt verir
let mode = 'ok', last = null, modelsHits = 0;
const reply = { readable: true, merchant: 'Migros', date: '2026-09-27', total: 296.4, category: 'Market', items: [{ name: 'Süt', amount: 34.9 }, { name: 'Ekmek', amount: 12.5 }] };
const mock = http.createServer((q, s) => {
  let b = ''; q.on('data', c => b += c); q.on('end', () => {
    const send = (status, obj) => { s.writeHead(status, { 'Content-Type': 'application/json' }); s.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    if (q.method === 'GET' && q.url === '/models') { modelsHits++; return send(200, { object: 'list', data: [{ id: 'deepseek-v4-flash-vision-exp' }, { id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] }); }
    try { last = { url: q.url, headers: q.headers, body: JSON.parse(b) }; } catch (e) { last = { url: q.url, headers: q.headers, body: null }; }
    if (mode === 'unauth') return send(401, { error: { message: 'Authentication Fails, Your api key: ****-key is invalid', type: 'authentication_error' } });
    if (mode === 'nobalance') return send(402, { error: { message: 'Insufficient Balance' } });
    const out = mode === 'garbage' ? Object.assign({}, reply, { total: -5, category: 'Uydurma', date: 'dün', items: [{ name: '', amount: 1 }] }) : reply;
    const content = mode === 'notjson' ? 'Üzgünüm, okuyamadım.' : mode === 'fenced' ? '```json\n' + JSON.stringify(out) + '\n```' : JSON.stringify(out);
    send(200, { id: 'x', object: 'chat.completion', model: last.body && last.body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 90 } });
  });
});

(async () => {
  let cfg;
  try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) { console.log('Sunucu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  if (!cfg.receiptAI) { console.log('Sunucuda DEEPSEEK_API_KEY yok (.dev.vars); fiş testi atlandı.'); process.exit(0); }
  await new Promise(r => mock.listen(8798, '127.0.0.1', r));
  try {
    const id = b64u(crypto.randomBytes(16)), token = b64u(crypto.randomBytes(32)), other = b64u(crypto.randomBytes(32));
    const text = ['MİGROS TİCARET A.Ş.', 'TARİH: 27.09.2026', 'SÜT *34,90', 'EKMEK *12,50', 'TOPKDV *4,62', 'TOPLAM *47,40'].join('\n');
    const path = '/v1/vault/' + id + '/receipt';
    eq('config advertises receipt AI', cfg.receiptAI, true);
    eq('no token → 401', (await api('POST', path, null, { text })).status, 401);
    eq('unknown vault → 404', (await api('POST', path, token, { text })).status, 404);
    await api('PUT', '/v1/vault/' + id, token, { baseVersion: 0, data: 'QUJD' });
    eq('wrong token → 403', (await api('POST', path, other, { text })).status, 403);
    eq('GET not allowed', (await api('GET', path, token)).status, 405);
    eq('empty text rejected before calling AI', (await api('POST', path, token, { text: '  ' })).status, 400);
    eq('oversize text rejected', (await api('POST', path, token, { text: 'x'.repeat(9000) })).status, 413);
    last = null;
    const ok = await api('POST', path, token, { text, categories: ['Market', 'Yiyecek', 'Diğer', '<b>x</b>'.repeat(20)] });
    eq('receipt read', [ok.status, ok.body.readable, ok.body.merchant, ok.body.total, ok.body.date, ok.body.category, ok.body.items.length, ok.body.used], [200, true, 'Migros', 296.4, '2026-09-27', 'Market', 2, 1]);
    const req = last && last.body || {};
    eq('request: chat completions, bearer key, JSON mode, model picked from list', [last && last.url, last && last.headers.authorization, req.response_format && req.response_format.type, req.model, modelsHits], ['/chat/completions', 'Bearer test-key', 'json_object', 'deepseek-flash', 1]);
    eq('request: only OCR text is sent (no image), prompt mentions json, categories sanitized', [JSON.stringify(req).includes('image'), /json/i.test(req.messages[0].content), req.messages[1].content.includes('TOPLAM *47,40'), req.messages[1].content.includes('<b>x</b><b>x</b><b>x</b><b>x</b><b>x</b><b>x</b><b>x</b><b>x</b><b>x</b>')], [false, true, true, false]);
    mode = 'garbage';
    eq('model output is clamped (negative total → unreadable, unknown category → Diğer, bad date dropped)', await api('POST', path, token, { text }).then(r => [r.status, r.body.readable, r.body.total, r.body.category, r.body.date, r.body.items.length]), [200, false, 0, 'Diğer', '', 0]);
    mode = 'fenced';
    eq('JSON inside code fence accepted', await api('POST', path, token, { text }).then(r => [r.status, r.body.total]), [200, 296.4]);
    mode = 'unauth';
    eq('bad API key → 503 ai_key (no key leak)', await api('POST', path, token, { text }).then(r => [r.status, r.body.error, JSON.stringify(r.body).includes('key is invalid')]), [503, 'ai_key', false]);
    mode = 'ok';
    // Başarısız çağrılar (unauth) hakkı tüketmez: 3 başarılı (ok, garbage, fenced) + 1 hak kaldı
    eq('failed AI call does not use the daily quota', await api('POST', path, token, { text }).then(r => [r.status, r.body.used]), [200, 4]);
    const over = await api('POST', path, token, { text });
    eq('daily limit per vault', [over.status, over.body.error], [429, 'daily_limit']);
  } finally { mock.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
