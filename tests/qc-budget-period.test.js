// Usage: node tests/qc-budget-period.test.js
// Haftalık / yıllık bütçe ve yıllık özet: dönem seçimi ve kaydı, bu haftanın (Pazartesi–Pazar) ve bu yılın harcaması,
// günlük kalan, sıfır bazlı toplamda aylık karşılık, uyarılar, rapor ve İstatistikler tablosu; yıllık özet (geçen yılın aynı
// dönemiyle karşılaştırma). Beklenen değerler elle hesaplandı. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ağustos 2027 Cuma; bu hafta 16–22 Ağustos. Bütçeler: Market haftalık 600, Yiyecek yıllık 5.000, Giyim aylık 1.000
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId: 'b', userId: 'u_a', ts: n, balanceApplied: date <= '2027-08-20' }, extra || {}));
// 2026 (geçen yıl): 20 Ağustos'a kadar gelir 20.000, gider 800 + 1.200; Eylül'deki 5.000 aynı döneme girmez
tx('2026-01-10', 'expense', 800, 'Market', 'Migros'); tx('2026-03-01', 'income', 20000, 'Maaş', 'Maaş'); tx('2026-08-10', 'expense', 1200, 'Yiyecek', 'Restoran'); tx('2026-09-05', 'expense', 5000, 'Market', 'Toptan');
// 2027
tx('2027-01-01', 'income', 25000, 'Maaş', 'Maaş'); tx('2027-03-10', 'expense', 2000, 'Yiyecek', 'Restoran'); tx('2027-07-05', 'expense', 1500, 'Yiyecek', 'Kafe');
tx('2027-08-01', 'income', 30000, 'Maaş', 'Maaş'); tx('2027-08-02', 'expense', 1000, 'Market', 'Migros'); tx('2027-08-05', 'expense', 400, 'Giyim', 'Tişört');
tx('2027-08-16', 'expense', 300, 'Market', 'A101'); tx('2027-08-17', 'expense', 500, 'Yiyecek', 'Pizza'); tx('2027-08-18', 'expense', 450, 'Market', 'BİM');
tx('2027-08-19', 'income', 50, 'İade', 'İade: BİM', { refCat: 'Market' }); tx('2027-08-21', 'expense', 200, 'Market', 'Planlı', { balanceApplied: false });
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 0, ts: 1 }], pf_t: T,
  pf_b: { Market: 600, Yiyecek: 5000, Giyim: 1000 }, pf_bm: { Market: { period: 'week' }, Yiyecek: { period: 'year' } } };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-08-20T10:00:00'));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(300);
  const sp = s => String(s || '').replace(/\s+/g, ' ').trim();

  // 1) Dönem ve durum: Market bu hafta 300 + 450 − 50 iade = 700 (21 Ağustos planlı sayılmaz); Yiyecek bu yıl 2.000 + 1.500 + 500 = 4.000
  eq('dönemler ve bu dönemin durumu', await page.evaluate(() => ['Market', 'Yiyecek', 'Giyim'].map(k => { const s = App.Budget.status(k); return [k, s.per, s.label, s.from, s.to, s.limit, s.spent, Math.round(s.pct), s.daysLeft]; })),
    [['Market', 'week', '16–22 Ağustos', '2027-08-16', '2027-08-22', 600, 700, 117, 3], ['Yiyecek', 'year', '2027', '2027-01-01', '2027-12-31', 5000, 4000, 80, 134], ['Giyim', 'month', 'Ağustos 2027', '2027-08-01', '2027-08-31', 1000, 400, 40, 12]]);
  eq('ay ve yıl geçişinde hafta etiketi', await page.evaluate(() => [App.Budget.rangeOf('week', '2027-09-01').label, App.Budget.rangeOf('week', '2027-01-01').label]), ['30 Ağustos – 5 Eylül', '28 Aralık – 3 Ocak']);

  // 2) Bütçe sayfası: kartlar, günlük kalan, sıfır bazlı toplam (600 × 31/7 = 2.657,14 + 5.000/12 = 416,67 + 1.000 = 4.073,81)
  await page.evaluate(() => App.UI.nav('butce')); await page.waitForTimeout(100);
  const pg = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#budgetGrid .bc')].map(c => [c.querySelector('.bc-name').textContent, c.querySelector('.bc-amounts').textContent, c.querySelector('.badge').textContent, c.querySelector('.bc-pct').textContent]),
    daily: [...document.querySelectorAll('#budgetDailyGrid .cash-card')].map(c => [c.querySelector('.cash-lbl').textContent, c.querySelector('.cash-val').textContent, c.querySelector('.daily-line').textContent]),
    zbb: [document.getElementById('zbbLimit').textContent, document.getElementById('zbbRemain').textContent, /aylığa çevrilerek/.test(document.getElementById('zbbHint').textContent)] }));
  eq('bütçe kartları: dönem etiketi, bu dönemin harcaması, kalan gün', pg.cards, [
    ['MarketHaftalık · 16–22 Ağustos', '₺700,00 / ₺600,00', '⚠ Aşıldı', '%117 kullanıldı · 3 gün kaldı'],
    ['YiyecekYıllık · 2027', '₺4.000,00 / ₺5.000,00', '⚠ Yaklaşıyor', '%80 kullanıldı · 134 gün kaldı'],
    ['Giyim', '₺400,00 / ₺1.000,00', '✓ İyi', '%40 kullanıldı']]);
  eq('günlük kalan: her bütçe kendi döneminde (Yiyecek 1.000 / 134 gün, Giyim 600 / 12 gün)', pg.daily, [
    ['Market Haftalık', '₺100,00', 'limit aşıldıBu hafta 3 gün kaldı'], ['Yiyecek Yıllık', '₺7,46', 'günlük kalan₺1.000,00 / 134 gün'], ['Giyim', '₺50,00', 'günlük kalan₺600,00 / 12 gün']]);
  eq('sıfır bazlı: haftalık ve yıllık aylığa çevrilir (gelir 30.000)', pg.zbb, ['₺4.073,81', '+₺25.926,19', true]);

  // 3) Form: kategori seçilince dönemi gelir; dönem değişince etiket, devir ve açıklama
  eq('form: Market seçilince Haftalık, devir gizli, açıklama', await page.evaluate(() => { const c = document.getElementById('bCat'); c.value = 'Market'; App.Budget.syncCarry(); return [document.getElementById('bPer').value, document.getElementById('bLimitLbl').textContent, document.getElementById('bCarryWrap').style.display, document.getElementById('bPerHint').hidden, /Pazartesi/.test(document.getElementById('bPerHint').textContent)]; }),
    ['week', 'Haftalık Limit (₺)', 'none', false, true]);
  eq('form: Giyim seçilince Aylık, devir görünür', await page.evaluate(() => { const c = document.getElementById('bCat'); c.value = 'Giyim'; App.Budget.syncCarry(); return [document.getElementById('bPer').value, document.getElementById('bLimitLbl').textContent, document.getElementById('bCarryWrap').style.display, document.getElementById('bPerHint').hidden]; }),
    ['month', 'Aylık Limit (₺)', '', true]);
  // Giyim'i yıllık 3.000 yap, sonra devirli aylık 1.200'e geri al
  await page.evaluate(() => { document.getElementById('bCat').value = 'Giyim'; App.Budget.syncCarry(); const p = document.getElementById('bPer'); p.value = 'year'; App.Budget.onPer(); document.getElementById('bLimit').value = '3.000'; App.Budget.save(); });
  eq('yıllık kaydedildi: dönem, devir kapalı, toast', await page.evaluate(() => [S.budgets().Giyim, S.budgetMeta().Giyim.period, S.budgetMeta().Giyim.carryOver, [...document.querySelectorAll('.toast')].map(t => t.textContent).some(t => /Yıllık limit kaydedildi/.test(t))]), [3000, 'year', false, true]);
  await page.evaluate(() => { document.getElementById('bCat').value = 'Giyim'; App.Budget.syncCarry(); const p = document.getElementById('bPer'); p.value = 'month'; App.Budget.onPer(); document.getElementById('bCarry').checked = true; document.getElementById('bLimit').value = '1.000'; App.Budget.save(); });
  eq('aylığa dönüş: dönem kalkar, devir ve limit geçmişi', await page.evaluate(() => { const m = S.budgetMeta().Giyim; return [S.budgets().Giyim, 'period' in m, m.carryOver, m.carryStart, m.history['2027-08']]; }), [1000, false, true, '2027-08', 1000]);

  // 4) Uyarılar (Ağustos): Market haftalık aşıldı, Yiyecek yıllık %80; aylık toplamlara girmez
  eq('uyarılar: dönemiyle', await page.evaluate(() => App.Insights.compute('2027-08').warnings.filter(w => /bütçesi/.test(w.title)).map(w => [w.title, w.text || w.detail || w.body || ''])),
    [['Market haftalık bütçesi aşıldı', '₺700,00 / ₺600,00 (bu hafta, %117)'], ['Yiyecek yıllık bütçesi dolmak üzere', '₺4.000,00 / ₺5.000,00 (2027, %80)']]);
  // Giyim yıllığa çevrilip Ağustos'ta yeniden aylık yapıldı: aylık limit geçmişi Ağustos'tan başlar, Temmuz'da bütçe yok
  eq('geçmiş ayda (Temmuz) haftalık/yıllık bütçe yok; aylığa dönen Giyim Ağustos\'tan başlar', await page.evaluate(() => [App.Insights.compute('2027-07').budgets.map(b => b.k), App.Budget.limitFor('Giyim', '2027-07'), App.Budget.limitFor('Giyim', '2027-08')]), [[], 0, 1000]);

  // 5) Rapor: Bütçe sütununda dönem; toplam yalnız aylık; dönemli bütçeler notta
  const rep = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-08'); const sp = s => s.replace(/\s+/g, ' ').trim();
    const head = [...d.querySelectorAll('.pr-cats th')].map(x => x.textContent), bi = head.indexOf('Bütçe');
    return { bud: [...d.querySelectorAll('.pr-cats tbody tr')].filter(r => r.cells.length === head.length).map(r => [sp(r.cells[0].textContent), sp(r.cells[bi].textContent)]), note: sp(d.querySelector('.pr-cats + .pr-note').textContent) }; });
  eq('rapor: bütçe sütunu (hafta aşıldı, yıl %80, aylık %40)', rep.bud, [['🛒 Market', 'hafta aşıldı'], ['🍽 Yiyecek', 'yıl %80'], ['👕 Giyim', '%40'], ['Toplam gider', '']]);
  eq('rapor notu: aylık toplam ve dönemli bütçeler', /Bütçe: limit koyduğunuz kategorilerde ₺400 \/ ₺1\.000 \(%40\)\. Market haftalık bütçe: bu hafta \(16–22 Ağustos\) ₺700 \/ ₺600; Yiyecek yıllık bütçe: 2027 yılında ₺4\.000 \/ ₺5\.000\./.test(rep.note), true);

  // 6) İstatistikler: tablo ve bütçe kullanımı (yalnız aylık)
  await page.evaluate(() => { App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2027-08'; App.Charts.refresh(); }); await page.waitForTimeout(200);
  eq('istatistik tablosu: haftalık limit kendi dönemiyle', await page.evaluate(() => { const sp = s => s.replace(/\s+/g, ' ').trim(); return [...document.querySelectorAll('#statsTable tbody tr')].map(r => [sp(r.cells[0].textContent), sp(r.cells[2].textContent), sp(r.cells[3].textContent)]).filter(r => /Market|Yiyecek|Giyim/.test(r[0])); }),
    [['🛒 Market', '₺600,00 / hafta · ₺700,00 harcandı', '⚠ Aşıldı'], ['🍽 Yiyecek', '₺5.000,00 / yıl · ₺4.000,00 harcandı', '⚠ %80'], ['👕 Giyim', '₺1.000,00', '✓ %40']]);

  // 7) Yıllık özet 2027: gelir 55.000; gider 2.000 + 1.500 + (1.000 + 400 + 300 + 500 + 450 − 50) = 6.100 → gelir − gider 48.900; 4 kayıtlı ay → ortalama 1.525
  // Geçen yılın aynı dönemi (20 Ağustos 2026'ya kadar): gelir 20.000, gider 2.000 (3 ay, ortalama 666,67)
  const yr = () => page.evaluate(() => { const c = document.getElementById('statsYear'), sp = s => String(s || '').replace(/\s+/g, ' ').trim(), kids = el => el ? [...el.children].map(x => sp(x.textContent)).filter(Boolean).join(' ') : '';
    return { title: sp(c.querySelector('.chart-title').textContent), kpis: [...c.querySelectorAll('.yr-kpi')].map(kids), fut: c.querySelectorAll('.yr-col.fut').length, cur: sp((c.querySelector('.yr-x .cur') || {}).textContent),
      leg: kids(c.querySelector('.yr-leg')), cats: [...c.querySelectorAll('.yr-cat')].map(kids), next: (c.querySelector('[aria-label="Sonraki yıl"]') || {}).disabled,
      hAug: c.querySelectorAll('.yr-col')[7] ? [...c.querySelectorAll('.yr-col')[7].querySelectorAll('i')].map(i => i.style.height) : [] }; });
  let y = await yr();
  eq('yıllık özet 2027: başlık, göstergeler, karşılaştırma', [y.title, y.kpis], ['📅 Yıllık Özet · 2027', ['Gelir ₺55.000,00 ▲ %175 geçen yılın aynı dönemine göre', 'Gider ₺6.100,00 ▲ %205 geçen yılın aynı dönemine göre', 'Gelir − gider +₺48.900,00 elde kalan para değildir', 'Aylık ortalama gider ₺1.525,00 kayıtlı 4 ayın ortalaması · ▲ %129']]);
  // Sütunlar: en büyük aylık tutar Ağustos geliri 30.000 → Ağustos gelir %100, gider 2.600 / 30.000 = %8,7
  eq('sütunlar: gelecek 4 ay soluk, bu ay kalın, Ağustos yükseklikleri; en çok harcanan ay', [y.fut, y.cur, y.hAug, y.leg], [4, 'Ağu', ['100%', '8.7%'], 'Gelir Gider En çok harcanan ay: Ağustos (₺2.600,00)']);
  eq('kategoriler: pay ve geçen yılla fark', y.cats, ['🍽 Yiyecek ₺4.000,00 yılın giderindeki payı %66 · ▲ %233 geçen yılın aynı dönemine göre', '🛒 Market ₺1.700,00 yılın giderindeki payı %28 · ▲ %113 geçen yılın aynı dönemine göre', '👕 Giyim ₺400,00 yılın giderindeki payı %7 · geçen yıl yoktu']);
  eq('bu yılda sonraki yıl düğmesi kapalı', y.next, true);
  await page.click('#statsYear [aria-label="Önceki yıl"]'); y = await yr();
  // 2026 tamamı: gelir 20.000, gider 800 + 1.200 + 5.000 = 7.000; 2025 kaydı yok → karşılaştırma yok
  eq('2026: tüm yıl, karşılaştırma yok, sonraki yıl açık', [y.title, y.kpis, y.fut, y.next], ['📅 Yıllık Özet · 2026', ['Gelir ₺20.000,00', 'Gider ₺7.000,00', 'Gelir − gider +₺13.000,00 elde kalan para değildir', 'Aylık ortalama gider ₺1.750,00 kayıtlı 4 ayın ortalaması'], 0, false]);
  await page.click('#statsYear [aria-label="Önceki yıl"]'); y = await yr();
  eq('kaydı olmayan yıl', [y.title, await page.evaluate(() => document.querySelector('#statsYear .empty-t').textContent)], ['📅 Yıllık Özet · 2025', '2025 yılında kayıt yok']);
  await page.click('#statsYear [aria-label="Sonraki yıl"]'); await page.click('#statsYear [aria-label="Sonraki yıl"]'); y = await yr();
  eq('ileri: 2027\'ye döner', y.title, '📅 Yıllık Özet · 2027');
  eq('320 px: yatay taşma yok', await page.evaluate(async () => { document.documentElement.style.width = '320px'; return document.documentElement.scrollWidth <= innerWidth; }), true);
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
