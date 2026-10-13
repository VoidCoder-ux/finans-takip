// Usage: node tests/qc-bills.test.js
// Fatura takibi (İstatistikler › 🧾 Faturalar): Faturalar kategorisindeki giderler notundaki kurum adıyla türe ayrılır, geçen yılın
// aynı ayıyla ve son 3 ayın ortalamasıyla karşılaştırılır; beklenmedik artış "Dikkat" uyarısı olur. Aile enflasyonu
// (📈): market, kira ve faturaların son 3 tamamlanmış aydaki artışı TÜFE ile. Beklenen değerler elle hesaplandı.
// Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027. TÜFE: Eylül 2026 = 4.000, Eylül 2027 = 5.320 → yıllık %33 (son veri Eylül 2027). Fatura sınırı %33 + 20 = %53.
// Ekim 2027 faturaları (geçen yıl Ekim):
//   Elektrik (Enerjisa) 1.500 (900): %67 > %53 ve fark 600 ≥ 200 → uyarı. Son 3 ay 1.300, 1.400, 1.200 → ortalama 1.300.
//   Su (İSKİ) 520 (yok): son 3 ay 300, 320, 280 → ortalama 300; 520 > 450 ve fark 220 → uyarı (%73).
//   Doğalgaz (İGDAŞ) 700 (600): %17; son 3 ay ortalaması 200 ama doğalgaz mevsimlik → yalnız geçen yılla, uyarı yok.
//   İnternet (Türk Telekom) 480 (400): %20. Telefon (Turkcell) 350 (300): %17. Diğer (Apartman aidatı) 1.000 (yok).
//   Toplam 4.550; geçen yıl Ekim 2.200.
// Aile enflasyonu (Temmuz–Eylül 2027 / 2026): Market 27.000 / 19.500 = %38; Kira 45.000 / 30.000 = %50;
// Faturalar (iki dönemde de olan türler: elektrik 3.900 / 3.000, doğalgaz 600 / 500; su yalnız bu yıl) 4.500 / 3.500 = %29.
// Sepet 76.500 / 53.000 = %44 → TÜFE (%33) üzerinde.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
let n = 0; const T = [];
const tx = (date, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type: 'expense', amount, category, note, accountId: 'b', userId: 'u_a', ts: n, balanceApplied: true }, extra || {}));
const F = (date, amount, note) => tx(date, amount, 'Faturalar', note);
F('2026-10-06', 900, 'ENERJİSA ELEKTRİK'); F('2026-10-09', 600, 'İGDAŞ'); F('2026-10-04', 400, 'Türk Telekom internet'); F('2026-10-12', 300, 'Turkcell fatura');
F('2026-07-06', 1000, 'Enerjisa'); F('2026-08-06', 1100, 'Enerjisa'); F('2026-09-06', 900, 'Enerjisa'); F('2026-07-09', 180, 'İgdaş'); F('2026-08-09', 150, 'İgdaş'); F('2026-09-09', 170, 'İgdaş');
F('2027-07-06', 1300, 'Enerjisa'); F('2027-08-06', 1400, 'Enerjisa'); F('2027-09-06', 1200, 'Enerjisa'); F('2027-07-09', 200, 'İgdaş'); F('2027-08-09', 150, 'İgdaş'); F('2027-09-09', 250, 'İgdaş');
F('2027-07-11', 300, 'İSKİ su'); F('2027-08-11', 320, 'İSKİ su'); F('2027-09-11', 280, 'İSKİ su');
F('2027-10-05', 1500, 'Enerjisa elektrik'); F('2027-10-08', 700, 'İGDAŞ doğalgaz'); F('2027-10-10', 520, 'İSKİ'); F('2027-10-03', 480, 'Türk Telekom'); F('2027-10-12', 350, 'Turkcell'); F('2027-10-15', 1000, 'Apartman aidatı');
for (const m of ['07', '08', '09']) { tx('2026-' + m + '-02', 10000, 'Kira', 'Kira'); tx('2027-' + m + '-02', 15000, 'Kira', 'Kira'); tx('2026-' + m + '-05', 6500, 'Market', 'Migros'); tx('2027-' + m + '-05', 9000, 'Market', 'Migros'); }
T.push({ id: 'inc1', date: '2027-10-01', type: 'income', amount: 60000, category: 'Maaş', note: 'Maaş', accountId: 'b', userId: 'u_a', ts: 900, balanceApplied: true },
  { id: 'kg', date: '2027-08-01', type: 'income', amount: 20000, category: 'Kira Geliri', note: 'Kiracı', accountId: 'b', userId: 'u_a', ts: 901, balanceApplied: true });
const CPI = { '2026-08': 4000, '2026-09': 4000, '2027-08': 5250, '2027-09': 5320 };
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now(), customCats: [{ name: 'Kira', emoji: '🏠', type: 'expense' }], cpiVersion: 2 },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 0, ts: 1 }], pf_t: T, pf_cpi: CPI };

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

  // 1) Fatura türü: kategori adı, sonra Faturalar kategorisinde not
  eq('tür tanıma', await page.evaluate(() => [['Faturalar', 'ENERJİSA'], ['Faturalar', 'CK Boğaziçi Elektrik'], ['Faturalar', 'Aksa Doğalgaz'], ['Faturalar', 'Vodafone Net'], ['Faturalar', 'Vodafone'], ['Faturalar', 'BUSKİ'],
    ['Faturalar', 'Apartman aidatı'], ['Su', 'Damacana'], ['Elektrik', ''], ['Otomobil', 'Bakım'], ['Market', 'Su 5L'], ['Faturalar', 'Superonline fiber']].map(x => App.Bills.typeOf({ type: 'expense', category: x[0], note: x[1] }))),
    ['elec', 'elec', 'gas', 'net', 'phone', 'water', 'other', 'water', 'elec', null, null, 'net']);
  eq('gelir ve aktarım fatura değil', await page.evaluate(() => [App.Bills.typeOf({ type: 'income', category: 'Faturalar', note: 'Enerjisa iade' }), App.Bills.typeOf({ type: 'expense', category: 'Transfer', note: 'Enerjisa', transferId: 'x' })]), [null, null]);

  // 2) Karşılaştırma
  const cmp = await page.evaluate(() => { const c = App.Bills.compare('2027-10'); return [c.cpi && [Math.round(c.cpi.rate * 100), c.cpi.month], c.rows.map(r => [r.k, r.cur, r.ly, r.avg, r.chg === null ? null : Math.round(r.chg * 100), r.flag]), c.total, c.totalLy]; });
  eq('Ekim 2027 faturaları', cmp, [[33, '2027-09'], [['elec', 1500, 900, 1300, 67, 'yoy'], ['water', 520, 0, 300, null, 'avg'], ['gas', 700, 600, 200, 17, ''], ['net', 480, 400, 0, 20, ''], ['phone', 350, 300, 0, 17, ''], ['other', 1000, 0, 0, null, '']], 4550, 2200]);
  eq('uyarılar (Dikkat)', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => /faturası|Diğer faturalar/.test(w.title)).map(w => [w.level, w.icon, w.title, w.text])), [
    ['yellow', '⚡', 'Elektrik faturası geçen yıldan çok yüksek', 'Ekim: ₺1.500,00 · geçen yıl Ekim ₺900,00 (%67 fazla; TÜFE %33).'],
    ['yellow', '💧', 'Su faturası beklenenden yüksek', 'Ekim: ₺520,00 · son 3 ayın ortalaması ₺300,00 (%73 fazla).']]);
  eq('genel "Faturalar harcaması arttı" uyarısı tekrar edilmez', await page.evaluate(() => [App.Insights.compute('2027-10').warnings.some(w => w.title === 'Faturalar harcaması arttı'), (() => { const a = App.Bills.alerts; App.Bills.alerts = () => []; const r = App.Insights.compute('2027-10').warnings.some(w => w.title === 'Faturalar harcaması arttı'); App.Bills.alerts = a; return r; })()]), [false, true]);
  eq('Eylül 2027: uyarı yok', await page.evaluate(() => App.Bills.alerts('2027-09').length), 0);

  // 3) İstatistikler kartı
  await page.evaluate(() => { App.UI.nav('istatistikler'); }); await page.waitForTimeout(300);
  const card = () => page.evaluate(() => { const c = document.querySelector('#statsBills .bl-card'), sp = s => String(s || '').replace(/\s+/g, ' ').trim(); if (!c) return null;
    return { title: sp(c.querySelector('.chart-title').textContent), intro: sp(c.querySelector('.bl-intro').textContent), rows: [...c.querySelectorAll('.bl-row')].map(r => [sp(r.querySelector('.bl-name').textContent), sp(r.querySelector('.bl-amt').textContent), sp(r.querySelector('.bl-sub').textContent), r.classList.contains('warn')]), total: c.querySelector('.bl-total') ? [...c.querySelector('.bl-total').children].map(x => sp(x.textContent)) : null }; });
  eq('Faturalar kartı', await card(), { title: '🧾 Faturalar · Ekim 2027', intro: 'Geçen yılın aynı ayıyla karşılaştırma · TÜFE yıllık %33 (Eylül 2027)', rows: [
    ['⚡ Elektrik', '₺1.500,00', '⚠️ Geçen yıl Ekim: ₺900,00 · %67 arttı · son 3 ay ortalaması ₺1.300,00', true],
    ['💧 Su', '₺520,00', '⚠️ Geçen yıl Ekim kaydı yok · son 3 ay ortalaması ₺300,00', true],
    ['🔥 Doğalgaz', '₺700,00', 'Geçen yıl Ekim: ₺600,00 · %17 arttı · son 3 ay ortalaması ₺200,00', false],
    ['🌐 İnternet', '₺480,00', 'Geçen yıl Ekim: ₺400,00 · %20 arttı', false],
    ['📱 Telefon', '₺350,00', 'Geçen yıl Ekim: ₺300,00 · %17 arttı', false],
    ['🧾 Diğer faturalar', '₺1.000,00', 'Geçen yıl Ekim kaydı yok', false]], total: ['Toplam', '₺4.550,00', 'Geçen yıl Ekim: ₺2.200,00'] });
  // Bu ay henüz gelmeyen fatura: Kasım 2026'da su yok, Ekim'e bakınca "bu ay yok"
  await page.evaluate(() => { document.getElementById('statMonth').value = '2027-09'; App.Charts.refresh(); }); await page.waitForTimeout(200);
  eq('Eylül 2027 kartı: yalnız kaydı olan türler', await card().then(c => c.rows.map(r => [r[0], r[1]])), [['⚡ Elektrik', '₺1.200,00'], ['💧 Su', '₺280,00'], ['🔥 Doğalgaz', '₺250,00'], ['🌐 İnternet', 'bu ay yok'], ['📱 Telefon', 'bu ay yok']]);

  // 4) Aile enflasyonu
  const fi = await page.evaluate(() => { const o = App.FamInf.compute('2027-10'); return [o.start, o.end, o.rows.map(r => [r.k, r.cur, r.prev, r.rate === null ? null : Math.round(r.rate * 100)]), Math.round(o.rate * 100), Math.round(o.cpi.rate * 100)]; });
  eq('aile enflasyonu hesabı', fi, ['2027-07', '2027-09', [['market', 27000, 19500, 38], ['rent', 45000, 30000, 50], ['bills', 4500, 3500, 29]], 44, 33]);
  await page.evaluate(() => { document.getElementById('statMonth').value = '2027-10'; App.Charts.refresh(); }); await page.waitForTimeout(200);
  eq('aile enflasyonu kartı', await page.evaluate(() => { const c = document.querySelector('#statsInfl .fi-card'), sp = s => String(s || '').replace(/\s+/g, ' ').trim();
    return [sp(c.querySelector('.bl-intro').textContent), [...c.querySelectorAll('.fi-sum > div')].map(d => [...d.children].map(x => sp(x.textContent))), sp(c.querySelector('.fi-vs').textContent), c.querySelector('.fi-vs').classList.contains('up'), [...c.querySelectorAll('.bl-row')].map(r => [...r.children].map(x => sp(x.textContent)))]; }),
    ['Temmuz–Eylül 2027, geçen yılın aynı aylarına göre', [['Sizin sepetiniz', '+%44'], ['TÜFE yıllık (Eylül 2027)', '+%33']], 'TÜFE\'nin üzerinde', true,
      [['🛒 Market', '%38 arttı', '₺27.000,00 · geçen yıl ₺19.500,00'], ['🏠 Kira', '%50 arttı', '₺45.000,00 · geçen yıl ₺30.000,00'], ['🧾 Faturalar', '%29 arttı', '₺4.500,00 · geçen yıl ₺3.500,00']]]);
  // Geçmiş ay: Ağustos 2027 → Haziran–Ağustos; geçen yıl Haziran yok, Temmuz–Ağustos var
  eq('geçmiş ay seçilince o aya kadar', await page.evaluate(() => { const o = App.FamInf.compute('2027-08'); return [o.start, o.end, o.rows.map(r => [r.k, r.cur, r.prev]), Math.round(o.cpi.rate * 100), o.cpi.month]; }),
    ['2027-06', '2027-08', [['market', 18000, 13000], ['rent', 30000, 20000], ['bills', 3050, 2430]], 31, '2027-08']);
  // TÜFE yoksa: yalnız sepet, not
  await page.evaluate(() => { S.saveCpi({ '2027-09': 5320 }); App.Charts.refresh(); }); await page.waitForTimeout(150);
  eq('TÜFE yoksa', await page.evaluate(() => { const c = document.querySelector('#statsInfl .fi-card'); return [c.querySelectorAll('.fi-sum > div').length, !!c.querySelector('.fi-vs'), /TÜFE verisi bulunamadı/.test(c.textContent), document.querySelector('#statsBills .bl-intro').textContent]; }), [1, false, true, 'Geçen yılın aynı ayıyla karşılaştırma']);
  // TÜFE yokken fatura sınırı %50: elektrik %67 yine uyarı
  eq('TÜFE yokken fatura sınırı %50', await page.evaluate(() => App.Bills.alerts('2027-10').map(r => [r.k, r.flag, r.text])), [['elec', 'yoy', 'Ekim: ₺1.500,00 · geçen yıl Ekim ₺900,00 (%67 fazla).'], ['water', 'avg', 'Ekim: ₺520,00 · son 3 ayın ortalaması ₺300,00 (%73 fazla).']]);

  // 5) Fatura yoksa kartlar görünmez
  await page.evaluate(() => { S.saveTxns(S.txns().filter(t => t.category !== 'Faturalar' && t.category !== 'Market' && t.category !== 'Kira')); App.Charts.refresh(); }); await page.waitForTimeout(150);
  eq('kayıt yoksa kart yok', await page.evaluate(() => [document.getElementById('statsBills').innerHTML, document.getElementById('statsInfl').innerHTML]), ['', '']);

  // 6) Dar ekran
  await page.evaluate(sd => { S.saveTxns(sd.pf_t); S.saveCpi(sd.pf_cpi); App.Charts.refresh(); }, SEED); await page.waitForTimeout(150);
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(150);
  eq('320 px: taşma yok', await page.evaluate(() => { const bad = []; document.querySelectorAll('#statsBills *, #statsInfl *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5), !!document.querySelector('#statsBills .bl-card'), !!document.querySelector('#statsInfl .fi-card')]; }), [true, [], true, true]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
