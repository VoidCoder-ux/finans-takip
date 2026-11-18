// Usage: node tests/review-ai.test.js
// Ayın değerlendirmesi yapay zekâsı (sunucu): girdi sınırları, fiş okumayla ortak günlük sınır, hata durumunda hak iadesi, çıktının süzülmesi
// (sahte D1 ve sahte DeepSeek ile; ağ yok).
const path = require('path'), { pathToFileURL } = require('url');
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
function fakeDB() {
  const rows = new Map(), key = (v, d) => v + '|' + d;
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
const ai = content => async url => /models$/.test(url) ? new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] })) : new Response(JSON.stringify({ choices: [{ message: { content } }] }));
(async () => {
  const src = f => pathToFileURL(path.join(__dirname, '..', 'worker', 'src', f)).href;
  const { writeReview, cleanReview, MAX_FACTS } = await import(src('review.js'));
  const { readReceipt } = await import(src('receipt.js'));
  const realFetch = global.fetch, day = '2026-11-18', facts = { month: '2026-10', income: 40000, expense: 31654 };
  let sent = null;
  const good = JSON.stringify({ summary: " Ekim'de ₺40.000 geldi. ", budget: 'Bütçe aşıldı.', mistakes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], review: [], cuts: ['x'] });
  global.fetch = async (url, o) => { if (!/models$/.test(url)) sent = JSON.parse(o.body); return ai(good)(url); };
  let db = fakeDB(), env = { DB: db, DEEPSEEK_API_KEY: 'test', RECEIPT_DAILY_LIMIT: '2' };
  const r1 = await writeReview(env, 'v1', { facts }, day);
  eq('başarılı: süzülmüş çıktı ve kullanım', [r1.status, r1.body.summary, r1.body.mistakes.length, r1.body.used, r1.body.limit], [200, "Ekim'de ₺40.000 geldi.", 5, 1, 2]);
  eq('modele yalnız özet gider, JSON çıktı istenir', [sent.messages[1].content.includes('"income":40000'), sent.response_format.type], [true, 'json_object']);
  eq('fiş okumayla ortak günlük sınır', [(await readReceipt(env, 'v1', { text: 'MIGROS TOPLAM 12,50 TL', categories: ['Market'] }, day)).status, (await writeReview(env, 'v1', { facts }, day)).status], [200, 429]);
  eq('girdi: özet yok / dizi / çok uzun', [(await writeReview(env, 'v2', {}, day)).status, (await writeReview(env, 'v2', { facts: [1] }, day)).status, (await writeReview(env, 'v2', { facts: { x: 'a'.repeat(MAX_FACTS) } }, day)).status], [400, 400, 413]);
  eq('reddedilen girdi hak tüketmez', db.rows.get('v2|' + day) || 0, 0);
  // Kod bloğu içinde gelen JSON da okunur
  global.fetch = ai('```json\n' + good + '\n```');
  eq('kod bloğu içindeki JSON', (await writeReview({ DB: fakeDB(), DEEPSEEK_API_KEY: 'test' }, 'v1', { facts }, day)).status, 200);
  // Bozuk çıktı ve meşgul servis: hak geri verilir
  for (const [ad, f, st] of [['bozuk çıktı', ai('merhaba'), 502], ['özetsiz çıktı', ai(JSON.stringify({ summary: '' })), 502], ['meşgul', async url => /models$/.test(url) ? new Response('{"data":[]}') : new Response('busy', { status: 503 }), 503], ['anahtar geçersiz', async url => /models$/.test(url) ? new Response('{"data":[]}') : new Response('no', { status: 401 }), 503]]) {
    global.fetch = f; db = fakeDB();
    const r = await writeReview({ DB: db, DEEPSEEK_API_KEY: 'test' }, 'v1', { facts }, day);
    eq(ad + ' → hata, hak geri verilir', [r.status, db.rows.get('v1|' + day), db.rows.get('__all__|' + day)], [st, 0, 0]);
  }
  eq('cleanReview: boşluk, uzunluk ve tür', cleanReview({ summary: 'a\n\n b', mistakes: 'tek metin', review: [null, '', 'x'.repeat(500)], cuts: [1] }), { summary: 'a b', budget: '', mistakes: [], review: ['x'.repeat(400)], cuts: ['1'] });
  global.fetch = realFetch;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
