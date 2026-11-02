// Usage: node tests/qc-rapor-ekim.test.js
// Aylık rapor metinleri ve kart akışı (beklenen değerler elle hesaplandı):
//  1) Kart eklenmeden önce tarihli, bakiyeye işlenmiş ödeme uygulamadan önceki borçtan düşer; ekstreden gelen preOpen ödeme düşmez.
//  2) Kart uygulamadayken gider yazılmış kart ödemesi iki kez sayılmış olabilir; rapor bunu söyler.
//  3) Ortak kayıt Ek tablosunda "Ortak" görünür; 30 günde beklenen gelir yoksa tahminin gelirsiz olduğu yazılır.
//  4) Bu ay eklenen hesabın ay başı bakiyesi geri hesap olarak işaretlenir; geçen ay gelir yoksa yüzde/fark yerine durum yazılır.
//  5) Sağlık: taksit yoksa metin kart borcuyla çelişmez, acil fon tutarları aynı yuvarlanır. Büyük aynı tutar uyarısı, limit aşımı metni.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };
const at = iso => new Date(iso + 'T10:00:00').getTime();
const TODAY = '2026-11-01';
const tx = (id, type, amount, date, accountId, o) => Object.assign({ id, type, amount, category: type === 'income' ? 'Maaş' : 'Market', date, note: id, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, o || {});
const pay = (id, amount, date, from, to, o) => [tx(id + '_o', 'expense', amount, date, from, Object.assign({ category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id }, o)), tx(id + '_i', 'income', amount, date, to, Object.assign({ category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id }, o))];

// Banka 20.000 − 1.000 + 50.000 − 16.000 − 3.000 − 400,33 = 49.599,67
// World: 15 Ekim'de 40.000 borçla eklendi, 5 Ekim ödemesi 16.000 sonradan girildi: −40.000 + 16.000 = −24.000
// Akbank: 14 Ekim'de 0 borçla eklendi; 11 Ekim satırı (1.500) açılışa dahil; 5.580 × 2 = −11.160, limit 10.000
const ACCS = [
  { id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 49599.67, openingBalance: 20000, ts: at('2026-08-01') },
  { id: 'w', name: 'World', type: 'card', owner: 'shared', balance: -24000, openingBalance: -40000, limit: 100000, last4: '2947', ts: at('2026-10-15') },
  { id: 'ak', name: 'Akbank Axess Platinum Kredi Kartı', type: 'card', owner: 'shared', balance: -11160, openingBalance: 1500, limit: 10000, last4: '7524', ts: at('2026-10-14') },
];
const TXNS = [
  tx('eyl', 'expense', 1000, '2026-09-10', 'b'),
  tx('maas', 'income', 50000, '2026-10-01', 'b'),
  ...pay('p1', 16000, '2026-10-05', 'b', 'w'),
  tx('uyelik', 'expense', 1500, '2026-10-11', 'ak', { preOpen: true }),
  tx('kkode', 'expense', 3000, '2026-10-13', 'b', { category: 'Kredi Kartı Ödemesi' }),
  tx('pazar', 'expense', 400.33, '2026-10-28', 'b', { userId: '' }),
  tx('kira1', 'expense', 5580, '2026-10-29', 'ak', { category: 'Ulaşım' }),
  tx('kira2', 'expense', 5580, '2026-10-30', 'ak', { category: 'Ulaşım' }),
];
const PLANNED = tx('plan', 'expense', 60000, '2026-11-15', 'b', { category: 'Kira', balanceApplied: false });

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(TODAY + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS }, data));
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const report = (p, m) => p.evaluate(m => { const d = document.createElement('div'); d.innerHTML = App.Report.build(m, { txns: true }); const q = s => [...d.querySelectorAll(s)];
    return { text: d.textContent, story: d.querySelector('.pr-story').textContent, inc: d.querySelector('.pr-kin .pr-kd').textContent, accs: q('.pr-accs tbody tr').map(r => r.textContent), flow: q('.pr-flow tr').map(r => r.textContent), rows: q('.pr-txns tbody tr').map(r => [...r.cells].map(c => c.textContent.trim())), cardHtml: q('.pr-cards tbody tr').map(r => r.cells[0].innerHTML) }; }, m);
  {
    const { page, ctx } = await open({ pf_a: ACCS, pf_t: [...TXNS, PLANNED] });
    eq('bakiyeler verilen gibi: banka, World, Akbank', await page.evaluate(() => ['b', 'w', 'ak'].map(i => App.Accounts.get(i).balance)), [49599.67, -24000, -11160]);
    eq('eski borç: eklenmeden önce tarihli ödeme düşer (40.000 − 16.000)', await page.evaluate(() => App.Cards.oldDebt('w')), { start: 40000, since: '2026-10-15', paid: 16000, left: 24000 });
    eq('ekim kart akışı: ödenen 16.000, kartla 12.660, eski borca 16.000', await page.evaluate(() => { const f = App.Cards.monthFlow('2026-10'); return [f.paid, f.spent, f.paidOld]; }), [16000, 12660, 16000]);
    const r = await report(page, '2026-10');
    eq('hesap altı satır: "henüz ödeme yok" değil, ödenen ve kalan yazılı', r.accs.filter(x => /Uygulamadan önceki borç/.test(x)), ['Uygulamadan önceki borç ₺40.000: ₺16.000 ödendi, ₺24.000 kaldı.']);
    eq('gelen para: ödeme eski borç olarak açıklanır', r.flow.some(x => /Kart borcuna ödenen.*uygulamadan önceki kart borcu/.test(x)), true);
    eq('kart ödemesi notu: kart uygulamada, iki kez sayılmış olabilir', [/Kart uygulamadaysa bu tutar aktarım olmalı; harcamalar iki kez gider sayılıyor olabilir\./.test(r.text), /uygulamada olmadığından/.test(r.text)], [true, false]);
    eq('eskimiş Ortak notu yok; Ek tablosunda Ortak yazılı', [/girenin adına/.test(r.text), r.rows.filter(c => c[0].startsWith('pazar')).map(c => c[3])], [false, ['👨‍👩‍👧 Ortak']]);
    eq('gelirsiz tahmin: cümlede ve 30 gün bölümünde yazılı', [/15 Kasım'da hesaplar eksiye düşebilir\. Beklenen maaş girilmemiş; tahmine gelir dahil değil\./.test(r.story), /Maaşı Tekrarlayan'a ekleyin\./.test(r.text)], [true, true]);
    eq('bu ay eklenen hesaplar: ay başı geri hesap işaretli; preOpen satırı olmayan hesapta yok', r.accs.filter(x => /ay başı geri hesaplandı/.test(x)), ['14 Eki günü eklendi; ay başı geri hesaplandı, gerçek bakiye değildir.']);
    eq('geçen ay gelir yok: fark yerine durum yazılır', r.inc, "Eylül'de gelir kaydı yok");
    eq('uzun kart adı: tek üç nokta, son dört hane bölünmez', [/Akbank Axess Platinum …7524/.test(r.text), /… …/.test(r.text), r.cardHtml.filter(x => /7524/.test(x)).every(x => /<span class="pr-nb">…7524<\/span>/.test(x))], [true, false, true]);
    const h = await page.evaluate(() => { const c = App.Health.compute(), g = k => c.items.find(x => x.key === k); return { debt: g('debt').val, fund: g('fund').tip }; });
    eq('sağlık: taksit yoksa metin kart borcuyla çelişmez', h.debt, 'kredi/borç taksidi yok');
    // Eylül 1.000, Ekim 16.060,33 → ortalama 8.530,165; 3 ay 25.590,495 ve birikim 0: iki tutar da 25.590
    eq('sağlık: acil fon cümlesinde iki tutar aynı', h.fund, 'En az 3 aylık zorunlu gider (₺25.590,00) birikim hesabında dursun; ₺25.590,00 eksik.');
    const w = await page.evaluate(() => App.Insights.compute('2026-10').warnings.filter(x => x.title === 'Aynı tutarda iki büyük harcama').map(x => x.text));
    eq('aynı tutarda büyük kayıt uyarısı', w.length === 1 && /₺5\.580,00/.test(w[0]) && /Biri fazla ya da provizyon olabilir/.test(w[0]), true);
    eq('limit aşımı: eksi tutar yerine aşılan tutar', await page.evaluate(() => App.Insights.compute('2026-11').warnings.filter(x => /limiti doldu/.test(x.title)).map(x => x.text)), ["Limitin %112'i kullanılıyor; ₺1.160,00 aşıldı."]);
    await ctx.close();
  }
  // Beklenen gelir girilmişse uyarı notu çıkmaz
  {
    const { page, ctx } = await open({ pf_a: ACCS, pf_t: [...TXNS, PLANNED, tx('m2', 'income', 1000, '2026-11-12', 'b', { balanceApplied: false })] });
    eq('30 günde gelir varsa tahmin notu yok', /Beklenen maaş girilmemiş/.test((await report(page, '2026-10')).text), false);
    await ctx.close();
  }
  // Ödemeler ay öncesine yayılır; ekstreden gelen (preOpen) ödeme girilen borcun içindedir
  {
    // Kart 15 Ekim'de 10.000 borçla eklendi; 20 Eylül 4.000 ve 5 Ekim 9.000 sonradan girildi. Banka 50.000 − 13.000 = 37.000
    const a = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 37000, openingBalance: 50000, ts: at('2026-08-01') },
      { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: 3000, openingBalance: -10000, ts: at('2026-10-15') },
      { id: 'd', name: 'Diğer Kart', type: 'card', owner: 'shared', balance: -5000, openingBalance: -6000, ts: at('2026-10-15') }];
    const t = [...pay('q1', 4000, '2026-09-20', 'b', 'c'), ...pay('q2', 9000, '2026-10-05', 'b', 'c'), tx('pre', 'income', 1000, '2026-10-05', 'd', { category: 'Transfer', note: 'Ekstre ödemesi', xfer: true, preOpen: true })];
    const { page, ctx } = await open({ pf_a: a, pf_t: t });
    eq('ekim akışı: önceki ay 4.000 ödendi, 9.000\'in 6.000\'i eski borca', await page.evaluate(() => { const f = App.Cards.monthFlow('2026-10'); return [f.paid, f.paidOld]; }), [9000, 6000]);
    eq('eski borç: tamamı ödendi; 30 Eylül itibarıyla 6.000 kalmıştı', await page.evaluate(() => [App.Cards.oldDebt('c').left, App.Cards.oldDebt('c', '2026-09-30').left]), [0, 6000]);
    eq('preOpen ödeme eski borçtan ayrıca düşmez (girilen 5.000)', await page.evaluate(() => App.Cards.oldDebt('d')), { start: 5000, since: '2026-10-15', paid: 0, left: 5000 });
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
