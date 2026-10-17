// Usage: node tests/qc-health.test.js
// Aile finans sağlığı puanı (Özet ve PDF rapor) ve Yıllık Özet'teki birikim oranı grafiği. Beş ölçü (birikim oranı, acil
// durum fonu, kredi/borç ödemesi, kart limiti kullanımı, bütçeye uyum), geçen ayın puanı, verisi olmayan ölçü, öneriler.
// Beklenen değerler elle hesaplandı. Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027. Temmuz–Eylül her ay: gelir 60.000; Kira 12.000 + Market 9.000 + Faturalar 4.000 + Kredi Ödemesi 3.000 (ihtiyaç 28.000),
// kartla Yiyecek 6.000 + Giyim 5.000, bankadan Eğlence 4.000 (istek 15.000) → gider 43.000, birikim 17.000; her ay birikim hesabına 8.000 aktarım.
// Ocak–Haziran yalnız maaş ve Market (Haziran'da gider gelirden 1.000 fazla). Ekim: gelir 60.000, Kira 12.000, Market 7.000, kartla Yiyecek 8.000.
// Kart limiti 60.000; aylık bütçe Market 8.000 (Eylül'de 9.000 → aşıldı), Yiyecek 7.000, Giyim 5.000.
//   Birikim: 51.000 / 180.000 = %28,3 ≥ %20 → 20 · Acil fon: zorunlu gider (ihtiyaç; kredi modülü yok) 28.000; 24.000 / 28.000 = 0,86 ay → 0,86/3×12 = 3,4
//   Kredi: 9.000 / 180.000 = %5 → 20 · Kart: 41.000 / 60.000 = %68,3 → (0,9−0,683)/0,6×20 = 7,2 · Bütçe: 3'te 2 → 13,3   → 63,9 → 64 (İyi)
// Geçen ay (Haziran–Ağustos, 30 Eylül bakiyeleri): birikim 33.000/180.000 = %18,3 → 18,3 · fon 24.000 / ((61.000+28.000+28.000)/3 = 39.000) = 0,62 ay → 2,5
//   kredi %3,3 → 20 · kart 33.000/60.000 = %55 → 11,7 · bütçe (Ağustos) 13,3   → 65,8 → 66
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId: 'b', userId: 'u_a', ts: n, balanceApplied: date <= '2027-10-20' }, extra || {}));
const tr = (date, amount, from, to) => { const id = 'X' + (++n); T.push({ id: id + 'o', date, type: 'expense', amount, category: 'Transfer', note: 'Aktarım', accountId: from, transferId: id, userId: 'u_a', ts: n, balanceApplied: true }, { id: id + 'i', date, type: 'income', amount, category: 'Transfer', note: 'Aktarım', accountId: to, transferId: id, userId: 'u_a', ts: n, balanceApplied: true }); };
const ME = { '2027-01': [52000, 30000], '2027-02': [52000, 31000], '2027-03': [52000, 29000], '2027-04': [60000, 52000], '2027-05': [60000, 48000], '2027-06': [60000, 61000] };
for (const m in ME) { tx(m + '-01', 'income', ME[m][0], 'Maaş', 'Maaş'); tx(m + '-08', 'expense', ME[m][1], 'Market', 'Migros'); }
for (const m of ['2027-07', '2027-08', '2027-09']) {
  tx(m + '-01', 'income', 40000, 'Maaş', 'Maaş'); tx(m + '-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' }); tx(m + '-02', 'expense', 12000, 'Kira', 'Kira'); tx(m + '-05', 'expense', 9000, 'Market', 'Migros');
  tx(m + '-10', 'expense', 4000, 'Faturalar', 'Elektrik'); tx(m + '-12', 'expense', 3000, 'Kredi Ödemesi', 'Taşıt kredisi'); tx(m + '-15', 'expense', 6000, 'Yiyecek', 'Restoran', { accountId: 'c' });
  tx(m + '-18', 'expense', 5000, 'Giyim', 'Mont', { accountId: 'c' }); tx(m + '-20', 'expense', 4000, 'Eğlence', 'Sinema', { userId: 'u_b' }); tr(m + '-04', 8000, 'b', 'sv');
}
tx('2027-10-01', 'income', 40000, 'Maaş', 'Maaş'); tx('2027-10-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' }); tx('2027-10-02', 'expense', 12000, 'Kira', 'Kira'); tx('2027-10-05', 'expense', 7000, 'Market', 'Migros'); tx('2027-10-14', 'expense', 8000, 'Yiyecek', 'Restoran', { accountId: 'c' });
const bal = {}; T.forEach(t => { if (t.balanceApplied) bal[t.accountId] = (bal[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount); });
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now(), customCats: [{ name: 'Kira', emoji: '🏠', type: 'expense' }] },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: bal.b, openingBalance: 0, ts: 1 }, { id: 'sv', name: 'Birikim', type: 'savings', owner: 'shared', balance: bal.sv, openingBalance: 0, ts: 1 },
    { id: 'c', name: 'Bonus', type: 'card', owner: 'shared', balance: bal.c, openingBalance: 0, ts: 1, limit: 60000, statementDay: 20, dueOffset: 10 }],
  pf_t: T, pf_b: { Market: 8000, Yiyecek: 7000, Giyim: 5000 }, pf_bm: { Market: { history: { '0000-00': 8000 } }, Yiyecek: { history: { '0000-00': 7000 } }, Giyim: { history: { '0000-00': 5000 } } } };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-10-20T10:00:00'));
  await page.goto(base);
  const seed = async sd => { await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd); await page.reload(); await page.waitForTimeout(300); };
  await seed(SEED);
  const hc = back => page.evaluate(b => { const h = App.Health.compute(b); return [h.score, h.label, h.items.map(x => [x.key, x.na ? null : x.pts, x.na || x.val])]; }, back);

  // 1) Puan ve ölçüler (bugün, geçen ay)
  eq('bugün: 64 (İyi)', await hc(0), [64, 'İyi', [['save', 20, '%28 · hedef %20'], ['fund', 3.4, '0,9 aylık zorunlu gider'], ['debt', 20, 'gelire oranı %5'], ['card', 7.2, '%68 kullanılıyor'], ['budget', 13.3, '3 bütçe · 2 tanesi tuttu']]]);
  eq('ayrıntı satırları ve öneriler (en düşük iki ölçü)', await page.evaluate(() => { const h = App.Health.compute(0); return [h.items.map(x => x.sub), h.tips]; }),
    [['son 3 tam ayın ortalaması', 'birikim hesaplarında ₺24.000,00 · aylık zorunlu gider ₺28.000,00 (ihtiyaçlar + kredi taksidi)', 'ayda ortalama ₺3.000,00', 'borç ₺41.000,00 · limit ₺60.000,00', 'aşılan: Market'],
      ['En az 3 aylık zorunlu gider (₺84.000,00) birikim hesabında dursun; ₺60.000,00 eksik.', 'Kullanımı %30 altına indirmek için ₺23.000,00 ödeyin.']]);
  eq('geçen ay: 66 (Haziran–Ağustos, 30 Eylül bakiyeleri)', await hc(1), [66, 'İyi', [['save', 18.3, '%18 · hedef %20'], ['fund', 2.5, '0,6 aylık zorunlu gider'], ['debt', 20, 'gelire oranı %3'], ['card', 11.7, '%55 kullanılıyor'], ['budget', 13.3, '3 bütçe · 2 tanesi tuttu']]]);

  // 2) Özet kartı
  await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(150);
  const oz = await page.evaluate(() => { const c = document.querySelector('#ozet-health .hl-card'), sp = s => String(s || '').replace(/\s+/g, ' ').trim();
    return [sp(c.querySelector('.hl-score').textContent), c.querySelector('.hl-score').className, sp(c.querySelector('.hl-label').textContent), sp(c.querySelector('.hl-sub').textContent),
      [...c.querySelectorAll('.hl-row')].map(r => [sp(r.querySelector('.hl-name').textContent), sp(r.querySelector('.hl-pt').textContent), (r.querySelector('.prog-fill') || {}).className || '']), c.querySelectorAll('.hl-tips div').length,
      !!document.querySelector('.sh[data-sec="ozet-health"] .sh-toggle')]; });
  eq('Özet kartı: puan, etiket, değişim, satırlar, öneriler, katlanır bölüm', oz, ['64/100', 'hl-score hl-ok', 'İyi', '▼ 2 puan düştü (geçen ay 66)',
    [['Birikim oranı', '20/20', 'prog-fill pok'], ['Acil durum fonu', '3,4/20', 'prog-fill pover'], ['Kredi ve borç ödemesi', '20/20', 'prog-fill pok'], ['Kart limiti kullanımı', '7,2/20', 'prog-fill pover'], ['Bütçeye uyum (Eylül)', '13,3/20', 'prog-fill pwarn']], 2, true]);

  // 3) Birikim hedefi %30 (40/30/30): 28,3/30×20 = 18,9 → 62,8 → 63; geçen ay 18,3/30×20 = 12,2 → 59,7 → 60
  await page.evaluate(() => S.saveSetting('split', { need: 40, want: 30, save: 30, cats: {} }));
  eq('birikim hedefi %30', [(await hc(0)).slice(0, 2), (await hc(0))[2][0], (await hc(1))[0]], [[63, 'İyi'], ['save', 18.9, '%28 · hedef %30'], 60]);
  await page.evaluate(() => S.saveSetting('split', { need: 50, want: 30, save: 20, cats: {} }));

  // 4) Acil durum hedefi birikim hesabından büyükse o sayılır: 150.000 / 28.000 = 5,36 ay → 12 + 2,36/3×8 = 18,3 → 78,8 → 79;
  // geçen ay yalnız 30 Eylül'e kadarki 50.000: 50.000 / 49.000 = 1,02 ay → 4,1 → 67
  await page.evaluate(() => { const g = S.goals(); g.push({ id: 'ge', name: '6 Aylık Acil Durum Fonu', target: 258000, emoji: '🛡️', txnMode: 'none', contributions: [{ id: 'k1', amount: 50000, date: '2027-09-01', note: '' }, { id: 'k2', amount: 100000, date: '2027-10-01', note: '' }], done: null, emergency: true, ts: 1 }); S.saveGoals(g); });
  eq('acil durum hedefi', [(await hc(0)).slice(0, 2), (await hc(0))[2][1], await page.evaluate(() => App.Health.compute(0).items[1].tip), (await hc(1))[0]],
    [[79, 'İyi'], ['fund', 18.3, '5,4 aylık zorunlu gider'], 'İdeali 6 aylık zorunlu gider (₺168.000,00); ₺18.000,00 eksik.', 68]);
  await page.evaluate(() => S.saveGoals([]));

  // 5) Kartın son ödemesi geçti (kesim 5'i, son ödeme 15 Ekim; ödenmedi): kart 0 puan → 56,7 → 57 (Orta)
  await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'c').statementDay = 5; S.saveAccounts(a); });
  eq('son ödemesi geçen kart', [(await hc(0)).slice(0, 2), (await hc(0))[2][3], await page.evaluate(() => App.Health.compute(0).tips[0])], [[57, 'Orta'], ['card', 0, 'son ödeme geçti'], 'Son ödemesi geçen kart borcunu hemen ödeyin; gecikme faizi işler.']);
  await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'c').statementDay = 20; S.saveAccounts(a); });

  // 6) Verisi olmayan ölçü puana girmez: kart ve bütçe yokken (20 + 3,4 + 20) / 60 = %72,3 → 72
  await page.evaluate(() => { S.saveAccounts(S.accounts().filter(a => a.id !== 'c')); S.saveBudgets({}); S.saveBudgetMeta({}); });
  eq('kart ve bütçe yok: üç ölçüyle 72', await hc(0), [72, 'İyi', [['save', 20, '%28 · hedef %20'], ['fund', 3.4, '0,9 aylık zorunlu gider'], ['debt', 20, 'gelire oranı %5'], ['card', null, 'Limiti girilmiş kredi kartı yok'], ['budget', null, 'Aylık bütçe limiti yok (Bütçe sayfası)']]]);
  await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(100);
  eq('Özet: verisi olmayan satırda puan yok', await page.evaluate(() => [...document.querySelectorAll('#ozet-health .hl-row.na .hl-pt')].map(x => x.textContent)), ['—', '—']);

  // 7) Boş uygulama: puan yok, açıklama
  await seed({ pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 0, ts: 1 }], pf_t: [] });
  await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(100);
  eq('boş uygulamada puan yok', [await page.evaluate(() => App.Health.compute(0).score), await page.evaluate(() => /en az iki ölçünün verisi gerekli/.test(document.querySelector('#ozet-health .hl-empty').textContent))], [null, true]);

  // 8) Yıllık Özet: birikim oranı. Ocak 22.000/52.000 %42 · Şubat %40 · Mart %44 · Nisan 8.000/60.000 %13 (hedefin altı) · Mayıs %20 (hedefte)
  // · Haziran −%2 · Temmuz–Eylül %28 · Ekim (sürüyor) 33.000/60.000 %55. Yıl: 169.000 / 576.000 = %29
  await seed(SEED);
  await page.evaluate(() => App.UI.nav('istatistikler')); await page.waitForTimeout(300);
  const yr = await page.evaluate(() => { const el = document.getElementById('statsYear'), sp = s => String(s || '').replace(/\s+/g, ' ').trim(), box = el.querySelector('.yr-sr');
    return { cap: sp(box.previousElementSibling.textContent), aria: box.getAttribute('aria-label'), cols: [...box.querySelectorAll('.yr-sr-c')].map(c => { const i = c.querySelector('i'); return i ? (c.classList.contains('live') ? 'live:' : '') + (i.className || 'below') : ''; }),
      leg: [...box.nextElementSibling.nextElementSibling.children].map(x => sp(x.textContent)) }; });
  eq('birikim oranı başlığı', yr.cap, 'Yılın birikim oranı %29 · hedef %20 · gelir − ihtiyaç − istek · bu ay sürüyor (soluk sütun; ay sonunda azalabilir)');
  eq('birikim oranı ekran okuyucu metni', yr.aria, 'Aylara göre birikim oranı: Ocak %42, Şubat %40, Mart %44, Nisan %13, Mayıs %20, Haziran −%2, Temmuz %28, Ağustos %28, Eylül %28, Ekim %55; hedef %20');
  eq('sütunlar: hedefte, altında, eksi, bu ay soluk, gelecek aylar boş', yr.cols, ['ok', 'ok', 'ok', 'below', 'ok', 'neg', 'ok', 'ok', 'ok', 'live:ok', '', '']);
  eq('açıklama', yr.leg, ['Hedefe ulaşan ay', 'Hedefin altı', 'Gider gelirden fazla', 'Hedef %20']);

  // 9) PDF rapor: bu ayın raporunda "Finans sağlığı" (kuruşsuz tutarlar), rehberde açıklama; eski ayın raporunda yok
  const rep = m => page.evaluate(m => { const d = document.createElement('div'); d.innerHTML = App.Report.build(m); const sp = s => String(s || '').replace(/\s+/g, ' ').trim(), t = d.querySelector('.pr-health');
    return t ? { h: sp(t.closest('.pr-sec').querySelector('.pr-h2').textContent), rows: [...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => sp(c.textContent))), note: sp((t.parentElement.querySelector('.pr-note') || {}).textContent), guide: /Finans sağlığı:/.test(d.querySelector('.pr-guide').textContent) } : { none: true }; }, m);
  eq('rapor Ekim: finans sağlığı', await rep('2027-10'), { h: 'Finans sağlığı: 64/100 (İyi)bugün · son 3 tam ay ve bugünkü bakiyeler', rows: [
    ['🐖 Birikim oranı', '%28 · hedef %20 · son 3 tam ayın ortalaması', '20/20'], ['🛡️ Acil durum fonu', '0,9 aylık zorunlu gider · birikim hesaplarında ₺24.000 · aylık zorunlu gider ₺28.000 (ihtiyaçlar + kredi taksidi)', '3,4/20'],
    ['🏦 Kredi ve borç ödemesi', 'gelire oranı %5 · ayda ortalama ₺3.000', '20/20'], ['💳 Kart limiti kullanımı', '%68 kullanılıyor · borç ₺41.000 · limit ₺60.000', '7,2/20'], ['🎯 Bütçeye uyum (Eylül)', '3 bütçe · 2 tanesi tuttu · aşılan: Market', '13,3/20']],
    note: 'En az 3 aylık zorunlu gider (₺84.000) birikim hesabında dursun; ₺60.000 eksik. Kullanımı %30 altına indirmek için ₺23.000 ödeyin.', guide: true });
  eq('rapor Ağustos: bölüm yok', await rep('2027-08'), { none: true });

  // 10) Dar ekran: Özet kartı taşmıyor
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(100);
  eq('320 px: taşma yok', await page.evaluate(() => { const bad = []; document.querySelectorAll('#ozet-health *, #statsYear *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5)]; }), [true, []]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
