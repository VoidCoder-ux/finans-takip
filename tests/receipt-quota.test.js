// Usage: node tests/receipt-quota.test.js
// Fiş yapay zekâsı: kasa başına ve sunucu geneli günlük sınır (sahte D1 ve sahte DeepSeek ile; ağ yok).
const path = require('path');
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
function fakeDB() {
  const rows = new Map();
  const key = (v, d) => v + '|' + d;
  return {
    rows,
    prepare(sql) {
      return { bind(...a) {
        return {
          async first() { if (/INSERT INTO receipt_usage/.test(sql)) { const k = key(a[0], a[1]); rows.set(k, (rows.get(k) || 0) + 1); return { n: rows.get(k) }; } return null; },
          async run() { if (/UPDATE receipt_usage SET n = n - 1/.test(sql)) { const k = key(a[0], a[1]); if (rows.get(k) > 0) rows.set(k, rows.get(k) - 1); } return { meta: { changes: 1 } }; }
        };
      } };
    }
  };
}
(async () => {
  const { readReceipt } = await import(path.join(__dirname, '..', 'worker', 'src', 'receipt.js'));
  const realFetch = global.fetch;
  global.fetch = async (url) => /models$/.test(url) ? new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] })) : new Response(JSON.stringify({ choices: [{ message: { content: '{"readable":true,"merchant":"Migros","date":"2026-09-27","total":12.5,"category":"Market","items":[]}' } }] }));
  const db = fakeDB(), env = { DB: db, DEEPSEEK_API_KEY: 'test', RECEIPT_DAILY_LIMIT: '2', RECEIPT_GLOBAL_DAILY_LIMIT: '3' };
  const body = { text: 'MIGROS TOPLAM 12,50 TL', categories: ['Market'] }, day = '2026-10-04';
  const r = [];
  for (const v of ['v1', 'v1', 'v1', 'v2', 'v3', 'v4']) r.push((await readReceipt(env, v, body, day)).status);
  eq('kasa başına 2, sunucu geneli 3: v1 ikiyi kullanır, üçüncüsü 429; v2 kabul, v3/v4 genel sınırla 429', r, [200, 200, 429, 200, 429, 429]);
  eq('reddedilen istekler genel sayaçta yer tutmaz (3)', db.rows.get('__all__|' + day), 3);
  // DeepSeek hata verirse hak geri verilir
  global.fetch = async (url) => /models$/.test(url) ? new Response(JSON.stringify({ data: [] })) : new Response('busy', { status: 503 });
  const db2 = fakeDB(), env2 = { DB: db2, DEEPSEEK_API_KEY: 'test' };
  eq('yapay zekâ meşgul → 503, hak geri verilir', [(await readReceipt(env2, 'v1', body, day)).status, db2.rows.get('v1|' + day), db2.rows.get('__all__|' + day)], [503, 0, 0]);
  global.fetch = realFetch;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
