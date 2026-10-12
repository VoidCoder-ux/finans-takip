// Usage: node tests/qc-split.test.js
// 50/30/20: gider kategorileri İhtiyaç / İstek / Birikim gruplarına girer; gelirin payları hedefle karşılaştırılır. Bütçe sayfası
// kartı, kategori grubu ve oran değişimi, gelire göre limit önerisi, uyarılar, İstatistikler, PDF rapor, ayar temizliği ve
// eşitleme. Beklenen değerler elle hesaplandı. Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027. Temmuz–Eylül her ay: gelir 40.000 (Deniz) + 20.000 (Ece) = 60.000; ihtiyaç Kira 12.000 + Market 9.000 +
// Faturalar 4.000 + Kredi Ödemesi 3.000 = 28.000; istek Yiyecek 6.000 + Giyim 5.000 + Eğlence 4.000 = 15.000; birikim 17.000.
// Ekim (20 gün; hedef katkısı 1.000 Diğer'de ama birikim sayılır): gelir 60.000; ihtiyaç Kira 12.000 + Market 7.000 + Faturalar 4.500 + Kredi Ödemesi 3.000 = 26.500; istek Yiyecek 8.000 +
// Giyim 7.500 − 500 iade + Eğlence 4.000 = 19.000; BES 2.000 (Birikim grubu); kategorisiz iade 300; 25 Ekim planlı 1.000 sayılmaz;
// birikim hesabına 5.000 aktarım. Birikim = 60.000 − 26.500 − 19.000 = 14.500.
// Mayıs: gelir 10.000, Market 8.000 + Yiyecek 4.000 (gider gelirden 2.000 fazla). Haziran: yalnız Market 1.000 (gelir yok).
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId: 'b', userId: 'u_a', ts: n, balanceApplied: date <= '2027-10-20' }, extra || {}));
for (const m of ['2027-07', '2027-08', '2027-09']) {
  tx(m + '-01', 'income', 40000, 'Maaş', 'Maaş'); tx(m + '-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' });
  tx(m + '-02', 'expense', 12000, 'Kira', 'Kira'); tx(m + '-05', 'expense', 9000, 'Market', 'Migros'); tx(m + '-10', 'expense', 4000, 'Faturalar', 'Elektrik'); tx(m + '-12', 'expense', 3000, 'Kredi Ödemesi', 'Taşıt kredisi');
  tx(m + '-15', 'expense', 6000, 'Yiyecek', 'Restoran'); tx(m + '-18', 'expense', 5000, 'Giyim', 'Mont'); tx(m + '-20', 'expense', 4000, 'Eğlence', 'Sinema', { userId: 'u_b' });
}
tx('2027-10-01', 'income', 40000, 'Maaş', 'Maaş'); tx('2027-10-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' });
tx('2027-10-02', 'expense', 12000, 'Kira', 'Kira'); tx('2027-10-05', 'expense', 7000, 'Market', 'Migros'); tx('2027-10-10', 'expense', 4500, 'Faturalar', 'Elektrik'); tx('2027-10-12', 'expense', 3000, 'Kredi Ödemesi', 'Taşıt kredisi');
tx('2027-10-14', 'expense', 8000, 'Yiyecek', 'Restoran'); tx('2027-10-16', 'expense', 7500, 'Giyim', 'Mont', { userId: 'u_b' }); tx('2027-10-18', 'expense', 4000, 'Eğlence', 'Konser');
tx('2027-10-08', 'expense', 2000, 'BES', 'Bireysel emeklilik'); tx('2027-10-17', 'income', 500, 'İade', 'İade: Mont', { refCat: 'Giyim' }); tx('2027-10-19', 'income', 300, 'İade', 'İade');
tx('2027-10-25', 'expense', 1000, 'Eğlence', 'Planlı', { balanceApplied: false });
tx('2027-05-01', 'income', 10000, 'Maaş', 'Maaş'); tx('2027-05-04', 'expense', 8000, 'Market', 'Migros'); tx('2027-05-09', 'expense', 4000, 'Yiyecek', 'Restoran');
tx('2027-06-04', 'expense', 1000, 'Market', 'Migros');
// Birikim sayfasında hedefe "gider olarak" girilen katkılar (kategori Diğer): Eylül 2.000, Ekim 1.000 → birikim sayılır, İstek değil
T.push({ id: 'tg1', date: '2027-09-25', type: 'expense', amount: 2000, category: 'Diğer', note: 'Hedef katkısı: Tatil', accountId: 'b', userId: 'u_a', ts: 950, balanceApplied: true },
  { id: 'tg2', date: '2027-10-06', type: 'expense', amount: 1000, category: 'Diğer', note: 'Hedef katkısı: Tatil', accountId: 'b', userId: 'u_a', ts: 951, balanceApplied: true });
const G = [{ id: 'g1', name: 'Tatil', target: 20000, emoji: '🏖', accountId: 'b', sourceAccountId: '', txnMode: 'expense', contributions: [{ id: 'c1', amount: 2000, date: '2027-09-25', note: '', accountId: 'b', txnId: 'tg1' }, { id: 'c2', amount: 1000, date: '2027-10-06', note: '', accountId: 'b', txnId: 'tg2' }], done: null, ts: 1 }];
T.push({ id: 'x1o', date: '2027-10-04', type: 'expense', amount: 5000, category: 'Transfer', note: 'Birikime', accountId: 'b', transferId: 'X1', userId: 'u_a', ts: 900, balanceApplied: true },
  { id: 'x1i', date: '2027-10-04', type: 'income', amount: 5000, category: 'Transfer', note: 'Birikime', accountId: 'sv', transferId: 'X1', userId: 'u_a', ts: 901, balanceApplied: true });
const bal = {}; T.forEach(t => { if (t.balanceApplied) bal[t.accountId] = (bal[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount); });
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now(), customCats: [{ name: 'Kira', emoji: '🏠', type: 'expense' }, { name: 'BES', emoji: '🐖', type: 'expense' }] },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: bal.b, openingBalance: 0, ts: 1 }, { id: 'sv', name: 'Birikim', type: 'savings', owner: 'shared', balance: bal.sv, openingBalance: 0, ts: 1 }],
  pf_t: T, pf_g: G, pf_b: { Market: 8000, Eğlence: 1000 }, pf_bm: { Eğlence: { period: 'week' } } };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-10-20T10:00:00'));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(300);
  const sp = s => String(s || '').replace(/\s+/g, ' ').trim();
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent));
  const short = o => ({ income: o.income, need: o.need, want: o.want, save: o.save, saveExp: o.saveExp, goals: o.goals, moved: o.moved, rest: o.refundsRest, pct: ['need', 'want', 'save'].map(k => o.pct[k] == null ? null : Math.round(o.pct[k] * 100) / 100), target: o.target });

  // 1) Gruplar: hazır kategoriler ve adından tahmin
  eq('kategori grupları (hazır + addan tahmin)', await page.evaluate(() => ['Market', 'Faturalar', 'Kredi Kartı Ödemesi', 'Yiyecek', 'Giyim', 'Diğer', 'Kira', 'BES', 'Altın alımı', 'Aidat', 'Su faturası', 'Telefon', 'Spor salonu', 'Hobi', 'constructor', 'toString'].map(c => App.Split.groupOf(c))),
    ['need', 'need', 'need', 'want', 'want', 'want', 'need', 'save', 'save', 'need', 'need', 'need', 'want', 'want', 'want', 'want']);

  // 2) Hesap: Ekim (iade kendi kategorisinden, kategorisiz iade gruplara girmez, planlı sayılmaz), Eylül, Mayıs (eksi birikim), Haziran (gelir yok)
  eq('Ekim: 26.500 / 19.000 / 14.500; BES 2.000, aktarılan 5.000, kategorisiz iade 300', await page.evaluate(() => App.Split.compute('2027-10')).then(short),
    { income: 60000, need: 26500, want: 19000, save: 14500, saveExp: 2000, goals: 1000, moved: 5000, rest: 300, pct: [44.17, 31.67, 24.17], target: { need: 30000, want: 18000, save: 12000 } });
  eq('Eylül: 28.000 / 15.000 / 17.000', await page.evaluate(() => App.Split.compute('2027-09')).then(short),
    { income: 60000, need: 28000, want: 15000, save: 17000, saveExp: 0, goals: 2000, moved: 0, rest: 0, pct: [46.67, 25, 28.33], target: { need: 30000, want: 18000, save: 12000 } });
  eq('Mayıs: gider gelirden 2.000 fazla, birikim eksi', await page.evaluate(() => App.Split.compute('2027-05')).then(short),
    { income: 10000, need: 8000, want: 4000, save: -2000, saveExp: 0, goals: 0, moved: 0, rest: 0, pct: [80, 40, -20], target: { need: 5000, want: 3000, save: 2000 } });
  eq('Ekim için önceki 3 ayın ortalaması (Temmuz–Eylül)', await page.evaluate(() => { const a = App.Split.average('2027-10'); return [a.n, Math.round(a.pct.need), Math.round(a.pct.want), Math.round(a.pct.save)]; }), [3, 47, 25, 28]);
  eq('durum metinleri (ay sürüyor / bitti)', await page.evaluate(() => { const o = App.Split.compute('2027-10'), m = App.Split.compute('2027-05'); return [['need', 'want', 'save'].map(k => App.Split.status(k, o, true)), App.Split.status('save', m, false), App.Split.status('need', App.Split.compute('2027-09'), false)]; }),
    [[{ cls: 'good', txt: '₺3.500,00 kaldı' }, { cls: 'bad', txt: '₺1.000,00 fazla' }, { cls: 'good', txt: 'hedeften ₺2.500,00 fazla' }], { cls: 'bad', txt: 'gider gelirden ₺2.000,00 fazla' }, { cls: 'good', txt: 'hedefin ₺2.000,00 altında' }]);

  // 3) Bütçe sayfası kartı
  await page.evaluate(() => App.UI.nav('butce')); await page.waitForTimeout(100);
  const card = await page.evaluate(() => { const c = document.querySelector('#splitCard .sp-card'), sp = s => s.replace(/\s+/g, ' ').trim();
    return { title: sp(c.querySelector('.chart-title').textContent), intro: sp(c.querySelector('.sp-intro').textContent), sub: sp(c.querySelector('.sp-sub').textContent),
      rows: [...c.querySelectorAll('.sp-row')].map(r => [sp(r.querySelector('.sp-name').textContent), r.querySelector('.sp-amt').textContent, sp(r.querySelector('.sp-foot').textContent), r.querySelector('.prog-fill').className.split(' ')[1], r.querySelector('.prog-fill').style.width, sp((r.querySelector('.sp-cats') || {}).textContent)]),
      notes: [...c.querySelectorAll('.sp-notes div')].map(d => d.textContent), avg: sp(c.querySelector('.sp-avg').textContent), btn: !!c.querySelector('.sp-sug'), map: c.querySelectorAll('.sp-map select').length }; });
  eq('kart: başlık, hedef, gelir', [card.title, card.intro, card.sub], ['⚖️ 50/30/20 · Ekim 2027', 'Hedef: gelirin %50 ihtiyaçlara, %30 isteklere, %20 birikime.', 'Gelir ₺60.000,00 · ay devam ediyor (20/31 gün)']);
  eq('kart: satırlar (tutar, hedef, durum, çubuk, kategoriler)', card.rows, [
    ['🏠 İhtiyaç %44', '₺26.500,00', 'hedef %50 · ₺30.000,00₺3.500,00 kaldı', 'pok', '88.3%', 'Kira, Market, Faturalar, Kredi Ödemesi'],
    ['🎈 İstek %32', '₺19.000,00', 'hedef %30 · ₺18.000,00₺1.000,00 fazla', 'pover', '100%', 'Yiyecek, Giyim, Eğlence'],
    ['🐖 Birikim %24', '₺14.500,00', 'hedef %20 · ₺12.000,00hedeften ₺2.500,00 fazla', 'pok', '100%', 'gelir − ihtiyaç − istek · BES ₺2.000,00 dahil · hedef katkıları ₺1.000,00 dahil · birikim hesaplarına ₺5.000,00 aktarıldı']]);
  eq('kart: notlar ve önceki aylar', [card.notes, card.avg, card.btn, card.map], [['Ay bitmedi: harcandıkça birikim payı azalır.', 'Hangi harcamanın iadesi olduğu seçilmemiş ₺300,00 iade gruplara yansımadı.'], 'Önceki 3 ayın ortalaması: ihtiyaç %47 · istek %25 · birikim %28', true, 14]);

  // 4) Kategori grubu değiştirme: Giyim İhtiyaç olunca Ekim ihtiyaç 33.500, istek 12.000; liste açık kalır; geri alınır
  eq('kategori listesi kapalı başlar', await page.evaluate(() => [document.querySelector('#splitCard .sp-map').hidden, document.querySelector('#splitCard .sp-map-btn').getAttribute('aria-expanded')]), [true, 'false']);
  await page.evaluate(() => document.querySelector('#splitCard .sp-map-btn').click());
  await page.evaluate(() => { const s = [...document.querySelectorAll('#splitCard .sp-map select')].find(x => /Giyim/.test(x.getAttribute('aria-label'))); s.value = 'need'; s.dispatchEvent(new Event('change')); });
  eq('Giyim → İhtiyaç: ayar, toplamlar, liste açık', await page.evaluate(() => { const o = App.Split.compute('2027-10'); return [S.settings().split.cats, o.need, o.want, o.save, !document.querySelector('#splitCard .sp-map').hidden, document.querySelector('#splitCard .sp-map-btn').getAttribute('aria-expanded')]; }), [{ 'Giyim': 'need' }, 33500, 12000, 14500, true, 'true']);
  eq('toast', (await toasts()).some(t => /Giyim: İhtiyaç/.test(t)), true);
  await page.evaluate(() => App.Split.setGroup('Giyim', 'want'));

  // 5) Oranlar: toplam 100 değilse kaydedilmez, pencere açık kalır; 40/30/30 kaydedilir
  await page.evaluate(() => App.Split.editRates());
  const fill = async (a, b, c) => page.evaluate(v => { const d = document.querySelector('.app-dialog-holder'); ['need', 'want', 'save'].forEach((k, i) => { d.querySelector('[data-pkey="' + k + '"]').value = v[i]; }); d.querySelector('[data-act="ok"]').click(); }, [a, b, c]);
  await fill('60', '30', '20');
  eq('toplam 110: hata, pencere açık, ayar değişmedi', [(await toasts()).some(t => /Toplam %110; 100 olmalı/.test(t)), await page.evaluate(() => !!document.querySelector('.app-dialog-holder')), await page.evaluate(() => App.Split.label())], [true, true, '50/30/20']);
  await fill('40', '30', '30');
  eq('40/30/30 kaydedildi; kart başlığı', [await page.evaluate(() => [S.settings().split.need, S.settings().split.want, S.settings().split.save, App.Split.label()]), await page.evaluate(() => document.querySelector('#splitCard .chart-title').textContent), await page.evaluate(() => !!document.querySelector('.app-dialog-holder'))],
    [[40, 30, 30, '40/30/30'], '⚖️ 40/30/30 · Ekim 2027', false]);

  // 6) Uyarılar. Eylül (40/30/30): ihtiyaç 28.000 > 24.000 (bilgi), birikim 17.000 < 18.000 (dikkat). Ekim: istek 19.000 > 18.000
  const sw = m => page.evaluate(m => App.Insights.compute(m).warnings.filter(w => /hedefin (üzerinde|altında)/.test(w.title)).map(w => [w.level, w.title, w.text]), m);
  eq('Eylül uyarıları (40/30/30)', await sw('2027-09'), [
    ['yellow', 'Birikim hedefin altında', 'Birikim ₺17.000,00, gelire oranı %28 (hedef %30, ₺18.000,00). Eksik ₺1.000,00.'],
    ['info', 'İhtiyaçlar hedefin üzerinde', 'İhtiyaç harcaması ₺28.000,00, gelire oranı %47 (hedef %40, ₺24.000,00). Kira, fatura gibi sabit giderler yüksekse oranları Bütçe sayfasında değiştirebilirsiniz.']]);
  await page.evaluate(() => S.saveSetting('split', { need: 50, want: 30, save: 20, cats: {} }));
  eq('Ekim uyarısı (ay sürüyor: birikim uyarısı yok)', await sw('2027-10'), [['yellow', 'İstekler hedefin üzerinde', 'İstek harcaması ₺19.000,00, gelire oranı %32 (hedef %30, ₺18.000,00). Fazlası ₺1.000,00.']]);
  eq('Eylül (50/30/20): uyarı yok; Mayıs: istek ve ihtiyaç (gider gelirden fazla, birikim uyarısı yok)', [await sw('2027-09'), (await sw('2027-05')).map(w => w[1])], [[], ['İstekler hedefin üzerinde', 'İhtiyaçlar hedefin üzerinde']]);
  eq('İyi gidiyor eşiği birikim hedefine göre (Eylül %28 ≥ %20; hedef %30 iken yok)', await page.evaluate(() => { const a = App.Insights.compute('2027-09').warnings.some(w => w.title === 'İyi gidiyor'); S.saveSetting('split', { need: 40, want: 30, save: 30, cats: {} }); const b = App.Insights.compute('2027-09').warnings.some(w => w.title === 'İyi gidiyor'); S.saveSetting('split', { need: 50, want: 30, save: 20, cats: {} }); return [a, b]; }), [true, false]);

  // 7) Gelire göre limit önerisi (40/20/40): istek hedefi 12.000 < ortalama 15.000 → ×0,8 (4.800, 4.000, 3.200), %20 azalır;
  // ihtiyaç hedefi 24.000 − kredi 3.000 = 22.000 < 25.000 → ×0,84 (10.080 → 10.050, 7.560 → 7.550, 3.360 → 3.350), %16 azalır
  await page.evaluate(() => S.saveSetting('split', { need: 40, want: 20, save: 40, cats: {} }));
  eq('öneri hesabı', await page.evaluate(() => { const p = App.Split.plan(); return [p.income, p.months, ['need', 'want'].map(g => [p.groups[g].target, p.groups[g].avg, p.groups[g].fixed, p.groups[g].cut]), p.rows.map(r => [r.cat, r.group, r.avg, r.limit, r.current, r.period])]; }),
    [60000, ['2027-07', '2027-08', '2027-09'], [[24000, 28000, 3000, 16], [12000, 15000, 0, 20]],
      [['Kira', 'need', 12000, 10050, 0, 'month'], ['Market', 'need', 9000, 7550, 8000, 'month'], ['Faturalar', 'need', 4000, 3350, 0, 'month'], ['Yiyecek', 'want', 6000, 4800, 0, 'month'], ['Giyim', 'want', 5000, 4000, 0, 'month'], ['Eğlence', 'want', 4000, 3200, 1000, 'week']]]);
  await page.evaluate(() => App.Split.suggest()); await page.waitForTimeout(100);
  const md = await page.evaluate(() => { const m = document.querySelector('.sp-modal'), sp = s => s.replace(/\s+/g, ' ').trim(); return { text: sp(m.querySelector('.sp-mtext').textContent), groups: [...m.querySelectorAll('.sp-mgroup')].map(g => sp(g.textContent)),
    rows: [...m.querySelectorAll('.sp-mrow')].map(r => [sp(r.querySelector('.sp-mname').textContent), r.querySelector('input[type=checkbox]').checked, r.querySelector('input[type=checkbox]').disabled, r.querySelector('input[type=text]').value]) }; });
  eq('öneri penceresi: gelir ve hedefler', md.text, 'Ortalama aylık gelir ₺60.000,00 (Temmuz–Eylül). Hedef 40/20/40: ihtiyaç ₺24.000,00 · istek ₺12.000,00 · birikim ₺24.000,00.');
  eq('öneri penceresi: grup açıklamaları', md.groups, ['🏠 İhtiyaç · hedef ₺24.000,00Ortalama ₺28.000,00, hedeften ₺4.000,00 fazla: limitler %16 azaltıldı. Kredi ve borç ödemeleri (₺3.000,00) olduğu gibi kaldı.', '🎈 İstek · hedef ₺12.000,00Ortalama ₺15.000,00, hedeften ₺3.000,00 fazla: limitler %20 azaltıldı.']);
  eq('öneri penceresi: satırlar (haftalık bütçe değişmez)', md.rows, [
    ['🏠 Kiraortalama ₺12.000,00 · limit yok', true, false, '10.050'], ['🛒 Marketortalama ₺9.000,00 · şu an ₺8.000,00', true, false, '7.550'], ['🧾 Faturalarortalama ₺4.000,00 · limit yok', true, false, '3.350'],
    ['🍽 Yiyecekortalama ₺6.000,00 · limit yok', true, false, '4.800'], ['👕 Giyimortalama ₺5.000,00 · limit yok', true, false, '4.000'], ['🎬 Eğlenceortalama ₺4.000,00 · haftalık limit var; değişmez', false, true, '3.200']]);
  // Faturalar seçimi kaldırılır, Kira 11.000 yazılır
  await page.evaluate(() => { const rows = [...document.querySelectorAll('.sp-modal .sp-mrow')]; rows[2].querySelector('input[type=checkbox]').checked = false; rows[0].querySelector('input[type=text]').value = '11.000'; document.querySelector('.sp-modal [data-act="ok"]').click(); });
  eq('uygula: 4 aylık limit, haftalık Eğlence ve Faturalar değişmedi, Market limit geçmişi', await page.evaluate(() => [S.budgets(), S.budgetMeta().Eğlence, S.budgetMeta().Market.history, !!document.querySelector('.sp-modal')]),
    [{ Market: 7550, Eğlence: 1000, Kira: 11000, Yiyecek: 4800, Giyim: 4000 }, { period: 'week' }, { '0000-00': 8000, '2027-10': 7550 }, false]);
  eq('uygula: toast ve bütçe kartları', [(await toasts()).some(t => /4 kategoriye aylık limit konuldu/.test(t)), await page.evaluate(() => document.querySelectorAll('#budgetGrid .bc').length)], [true, 5]);
  // Geçersiz tutar: pencere açık kalır
  await page.evaluate(() => App.Split.suggest()); await page.waitForTimeout(50);
  await page.evaluate(() => { document.querySelector('.sp-modal .sp-mrow input[type=text]').value = 'abc'; document.querySelector('.sp-modal [data-act="ok"]').click(); });
  eq('geçersiz tutar: hata, pencere açık', [(await toasts()).some(t => /Kira için geçerli bir limit girin/.test(t)), await page.evaluate(() => !!document.querySelector('.sp-modal'))], [true, true]);
  await page.evaluate(() => document.querySelector('.sp-modal [data-act="cancel"]').click());
  await page.evaluate(() => S.saveSetting('split', { need: 50, want: 30, save: 20, cats: {} }));

  // 8) Gelir yok / eksi birikim kartları; önceki ayda gelir yoksa öneri yapılmaz
  // Önceki aylardan yalnız Mayıs'ta gelir var: ortalama tek aydan (ihtiyaç %80, istek %40, birikim −%20)
  eq('Haziran kartı: gelir yok', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Split.card('2027-06'); return [d.querySelector('.sp-empty').textContent, d.querySelectorAll('.sp-row').length, d.querySelector('.sp-avg').textContent, !!d.querySelector('.sp-map')]; }),
    ['Bu ay gelir kaydı yok; paylar gelire göre hesaplanır. Harcama: ihtiyaç ₺1.000,00.', 0, 'Önceki aylardan gelir kaydı olan 1 ayın ortalaması: ihtiyaç %80 · istek %40 · birikim −%20', false]);
  eq('Mayıs kartı: eksi birikim', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Split.card('2027-05'); const r = [...d.querySelectorAll('.sp-row')][2], sp = s => s.replace(/\s+/g, ' ').trim(); return [sp(r.querySelector('.sp-name').textContent), r.querySelector('.sp-amt').textContent, sp(r.querySelector('.sp-foot').textContent), r.querySelector('.prog-fill').style.width, d.querySelectorAll('.sp-notes div').length]; }),
    ['🐖 Birikim −%20', '−₺2.000,00', 'hedef %20 · ₺2.000,00gider gelirden ₺2.000,00 fazla', '0%', 0]);

  // 9) İstatistikler: seçili ayın kartı (Eylül), gelecek ayda yok
  await page.evaluate(() => { App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2027-09'; App.Charts.refresh(); }); await page.waitForTimeout(150);
  eq('İstatistikler: Eylül kartı (ayar düğmeleri yok)', await page.evaluate(() => { const c = document.querySelector('#statsSplit .sp-card'), sp = s => s.replace(/\s+/g, ' ').trim(); return [sp(c.querySelector('.chart-title').textContent), sp(c.querySelector('.sp-sub').textContent), [...c.querySelectorAll('.sp-foot')].map(f => sp(f.textContent)), !!c.querySelector('.sp-map'), !!c.querySelector('.sp-sug')]; }),
    ['⚖️ 50/30/20 · Eylül 2027', 'Gelir ₺60.000,00', ['hedef %50 · ₺30.000,00hedefin ₺2.000,00 altında', 'hedef %30 · ₺18.000,00hedefin ₺3.000,00 altında', 'hedef %20 · ₺12.000,00hedeften ₺5.000,00 fazla'], false, false]);
  eq('İstatistikler: gelecek ayda kart yok', await page.evaluate(() => { document.getElementById('statMonth').value = '2027-12'; App.Charts.refresh(); return document.getElementById('statsSplit').innerHTML; }), '');

  // 10) PDF rapor: Ekim ve Eylül bölümü, rehber; gelirsiz ayda bölüm yok
  const rep = m => page.evaluate(m => { const d = document.createElement('div'); d.innerHTML = App.Report.build(m); const sp = s => String(s || '').replace(/\s+/g, ' ').trim(), t = d.querySelector('.pr-split');
    return t ? { h: sp(t.closest('.pr-sec').querySelector('.pr-h2').textContent), rows: [...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => sp(c.textContent))), note: sp((t.parentElement.querySelector('.pr-note') || {}).textContent), guide: /Gelirin bölünüşü:/.test(d.textContent) } : { none: true, guide: /Gelirin bölünüşü:/.test(d.textContent) }; }, m);
  eq('rapor Ekim', await rep('2027-10'), { h: 'Gelirin bölünüşü (50/30/20)hedef: gelirin %50 ihtiyaç · %30 istek · %20 birikim', rows: [
    ['🏠 İhtiyaç · Kira, Market, Faturalar, Kredi Ödemesi', '₺26.500', '%44', '%50 · ₺30.000', '₺3.500 kaldı'],
    ['🎈 İstek · Yiyecek, Giyim, Eğlence', '₺19.000', '%32', '%30 · ₺18.000', '₺1.000 fazla'],
    ['🐖 Birikim · gelir − ihtiyaç − istek · BES ₺2.000 dahil · hedef katkıları ₺1.000 dahil · birikim hesaplarına ₺5.000 aktarıldı', '₺14.500', '%24', '%20 · ₺12.000', 'hedeften ₺2.500 fazla']],
    note: 'Ay bitmedi: harcandıkça birikim payı azalır. Hangi harcamanın iadesi olduğu seçilmemiş ₺300 iade gruplara yansımadı.', guide: true });
  eq('rapor Mayıs (ay bitti, eksi birikim)', (await rep('2027-05')).rows.map(r => r[4]), ['₺3.000 fazla', '₺1.000 fazla', 'gider gelirden ₺2.000 fazla']);
  eq('rapor Haziran: gelir yok, bölüm ve rehber yok', await rep('2027-06'), { none: true, guide: false });

  // 11) Ayar temizliği ve eşitleme
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pf_s')); s.split = { need: 70, want: 30, save: 20, cats: { 'Giyim': 'need', 'X': 'bad', '': 'save', 'Hobi': 'save' } }; localStorage.setItem('pf_s', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(300);
  eq('toplamı 100 olmayan oran → 50/30/20; geçersiz grup atılır', await page.evaluate(() => S.settings().split), { need: 50, want: 30, save: 20, cats: { Giyim: 'need', Hobi: 'save' } });
  await page.evaluate(() => S.saveSetting('activeTag', { name: 'Antalya tatili', from: '2027-10-01' }));
  eq('eşitlenen ayarlar: 50/30/20 ve etkin etiket', await page.evaluate(() => { const c = App.Sync.collect().s; return [c.split, c.activeTag]; }), [{ need: 50, want: 30, save: 20, cats: { Giyim: 'need', Hobi: 'save' } }, { name: 'Antalya tatili', from: '2027-10-01' }]);
  eq('iki cihaz: biri oranı, öbürü kategori grubunu değiştirir → ikisi de kalır', await page.evaluate(() => {
    const b = { stores: {}, s: { split: { need: 50, want: 30, save: 20, cats: {} } } }, l = { stores: {}, s: { split: { need: 60, want: 30, save: 10, cats: {} } } }, r = { stores: {}, s: { split: { need: 50, want: 30, save: 20, cats: { Giyim: 'need' } } } };
    return mergeSnapshot(b, l, r).s.split; }), { need: 60, want: 30, save: 10, cats: { Giyim: 'need' } });

  // 12) Dar ekran (320 px): kart ve öneri penceresi taşmıyor
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => App.UI.nav('butce')); await page.waitForTimeout(100);
  const ov = () => page.evaluate(() => { const bad = []; document.querySelectorAll('#splitCard *, .sp-modal *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5)]; });
  eq('320 px: Bütçe kartı taşmıyor', await ov(), [true, []]);
  await page.evaluate(() => App.Split.suggest()); await page.waitForTimeout(100);
  eq('320 px: öneri penceresi taşmıyor', await ov(), [true, []]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
