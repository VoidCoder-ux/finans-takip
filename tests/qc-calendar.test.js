// Usage: node tests/qc-calendar.test.js
// İşlemler › Takvim: ay takviminde günlük gider/gelir (geçmiş), beklenen ödeme/gelir (gelecek: planlı, taksit, tekrarlayan,
// kart ekstresi); güne dokununca o günün kayıtları; ay geçişi; süzgeçler; görünüm seçimi bu cihazda hatırlanır.
// Beklenen değerler elle hesaplandı. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Mart 2027, bugün 20 Mart (Cumartesi). Kart: kesim 25, son ödeme kesimden 10 gün sonra.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const A = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 54100, openingBalance: 40000, ts: 1 },
  { id: 'c', name: 'Kart', type: 'card', owner: 'shared', limit: 20000, statementDay: 25, dueOffset: 10, balance: -1300, openingBalance: 0, ts: 2 }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, accountId, userId, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId, userId, ts: n, balanceApplied: date <= '2027-03-20' }, extra || {}));
tx('2027-02-20', 'expense', 1600, 'Market', 'Migros', 'b', 'u_a');
tx('2027-03-01', 'income', 30000, 'Maaş', 'Maaş', 'b', 'u_b');
tx('2027-03-05', 'expense', 1200, 'Market', 'Migros', 'c', 'u_a');
tx('2027-03-05', 'expense', 300, 'Yiyecek', 'Kafe', 'b', 'u_b');
tx('2027-03-10', 'expense', 800, 'Market', 'A101', 'c', 'u_a');
tx('2027-03-12', 'income', 200, 'İade', 'İade: A101', 'c', 'u_a');
tx('2027-03-15', 'expense', 1500, 'Transfer', 'Kart borcu ödemesi: Kart', 'b', 'u_a', { transferId: 'tr1' });
tx('2027-03-15', 'income', 1500, 'Transfer', 'Kart borcu ödemesi: Kart', 'c', 'u_a', { transferId: 'tr1' });
tx('2027-03-20', 'expense', 12500, 'Faturalar', 'Kira', 'b', 'u_b');
tx('2027-03-28', 'expense', 500, 'Sağlık', 'Diş kontrolü', 'b', 'u_a', { balanceApplied: false });
[0, 1, 2].forEach(i => tx('2027-0' + (3 + i) + '-16', 'expense', 1000, 'Giyim', 'Mont (' + (i + 1) + '/3)', 'c', 'u_a', { balanceApplied: i === 0, installment: { planId: 'p1', index: i + 1, total: 3, totalAmount: 3000, name: 'Mont', startDate: '2027-03-16', balanceApplied: i === 0 } }));
const REC = [{ id: 'r_nf', type: 'expense', amount: 230, category: 'Eğlence', day: 22, note: 'Netflix', accountId: 'c', active: true, isSubscription: true },
  { id: 'r_el', type: 'expense', amount: 1100, category: 'Faturalar', day: 26, note: 'Elektrik', accountId: 'b', active: true }];
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T, pf_r: REC };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2027-03-20T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
    await page.reload(); await page.waitForTimeout(300);
    await page.evaluate(() => App.UI.nav('islemler'));
    return { ctx, page };
  }
  // Takvim durumu: başlık, toplam, dolu günler (gün → hücredeki tutarlar), işaretli günler, seçili günün paneli
  const st = p => p.evaluate(() => {
    const c = document.getElementById('txnCal'), sp = s => s.replace(/\s+/g, ' ').trim(), tx = el => sp(el ? el.textContent : '');
    const cells = {}, cls = {}; c.querySelectorAll('.cal-d').forEach(b => { const d = +b.dataset.d.slice(8); const v = [...b.querySelectorAll('.cal-v')].map(tx); if (v.length) cells[d] = v;
      const k = ['cal-today', 'cal-sel', 'cal-fut', 'cal-h1', 'cal-h2', 'cal-h3', 'cal-h4'].filter(x => b.classList.contains(x)); if (k.length) cls[d] = k.join(' '); });
    const day = c.querySelector('.cal-day');
    return { title: tx(c.querySelector('.cal-title')), sum: tx(c.querySelector('.cal-sum')), cells, cls, note: tx(c.querySelector('.cal-note')), today: !!c.querySelector('.cal-head .btn-ghost'),
      day: day ? { title: tx(day.querySelector('.sh-title')), sum: tx(day.querySelector('.cal-day-sum')), txns: [...day.querySelectorAll('.ti')].map(t => [tx(t.querySelector('.ti-cat')), tx(t.querySelector('.ti-amt'))]),
        exp: [...day.querySelectorAll('.cash-row')].map(r => [tx(r.querySelector('.cash-name')), tx(r.querySelector('.cash-meta')), tx(r.querySelector('.cash-amt'))]), empty: tx(day.querySelector('.empty-t')) } : null };
  });
  const vis = p => p.evaluate(() => { const v = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
    return { list: v('txnList'), cal: v('txnCal'), month: v('fMonth'), tabs: ['txnViewList', 'txnViewCal'].map(id => document.getElementById(id).getAttribute('aria-selected')) }; });

  {
    const { page, ctx } = await open();
    eq('ilk açılış liste görünümü; takvim gizli', await vis(page), { list: true, cal: false, month: true, tabs: ['true', 'false'] });
    await page.click('#txnViewCal'); await page.waitForTimeout(100);
    eq('Takvim sekmesi: takvim görünür, liste ve ay süzgeci gizli', await vis(page), { list: false, cal: true, month: false, tabs: ['false', 'true'] });
    let s = await st(page);
    // Gider: 1.200 + 300 + 800 − 200 iade + 1.000 taksit + 12.500 = 15.600 (transfer ve 28 Mart planlı sayılmaz)
    eq('Mart: başlık ve bugüne kadarki toplam', [s.title, s.sum], ['Mart 2027', 'Bugüne kadar gelir ₺30.000,00 · gider ₺15.600,00']);
    // Geçmiş: harcanan (5: 1.200 + 300), iade yeşil (12), gelir (1); gelecek: tekrarlayan (22 Netflix kartla, 26 Elektrik), planlı (28)
    eq('günlerin tutarları', s.cells, { 1: ['+30b'], 5: ['1.500'], 10: ['800'], 12: ['+200'], 16: ['1.000'], 20: ['12,5b'], 22: ['230'], 26: ['1.100'], 28: ['500'] });
    // Renk: en çok harcanan gün (12.500) en koyu; 1.500 / 12.500 → 1. ton; gelecekteki günler kesik çizgili
    eq('bugün işaretli ve seçili; harcama tonları; beklenen günler', s.cls, { 5: 'cal-h1', 10: 'cal-h1', 16: 'cal-h1', 20: 'cal-today cal-sel cal-h4', 22: 'cal-fut', 26: 'cal-fut', 28: 'cal-fut' });
    eq('bugünün paneli: gün adı, toplam, o günün işlemi', s.day, { title: '20 Mart 2027 Cumartesi', sum: 'Gider ₺12.500,00 · Gelir ₺0,00', txns: [['Kira', '-₺12.500,00']], exp: [], empty: '' });
    eq('hücre açıklaması (ekran okuyucu)', await page.evaluate(() => [...document.querySelectorAll('.cal-d')].filter(b => ['2027-03-05', '2027-03-12', '2027-03-22'].includes(b.dataset.d)).map(b => b.getAttribute('aria-label'))),
      ['5 Mart, gider ₺1.500,00', '12 Mart, iade ₺200,00', '22 Mart, beklenen ödeme ₺230,00']);
    await page.click('.cal-d[data-d="2027-03-15"]'); s = await st(page);
    eq('15 Mart: kart borcu ödemesi (aktarım) listede, gider/gelir değil', [s.day.sum, s.day.txns, await page.evaluate(() => /Vadesiz → Kart/.test(document.querySelector('.cal-day .ti-meta').textContent))], ['Gider ₺0,00 · Gelir ₺0,00', [['Transfer', '₺1.500,00']], true]);
    await page.click('.cal-d[data-d="2027-03-22"]'); s = await st(page);
    eq('22 Mart: beklenen abonelik kartla (karta yazılır), toplam yok', [s.day.title, s.day.sum, s.day.txns, s.day.exp], ['22 Mart 2027 Pazartesi', '', [], [['Netflix', 'Abonelik · karta yazılır', '-₺230,00']]]);
    await page.click('.cal-d[data-d="2027-03-22"]'); s = await st(page);
    eq('seçili güne tekrar dokununca panel kapanır', s.day, null);
    await page.click('.cal-d[data-d="2027-03-03"]'); s = await st(page);
    eq('kaydı olmayan gün', [s.day.txns, s.day.exp, s.day.empty], [[], [], 'Bu gün kayıt yok']);
    // Sonraki ay: Kart ekstresi 4 Nisan'da (25 Mart kesimi: borç 1.300 + 22 Mart Netflix 230 = 1.530, tahmini), Mont 2/3, tekrarlayanlar
    await page.click('.cal-nav[aria-label="Sonraki ay"]'); s = await st(page);
    eq('Nisan: henüz başlamadı; ekstre, taksit, tekrarlayanlar; Bugün düğmesi', [s.title, s.sum, s.cells, s.today, s.day], ['Nisan 2027', 'Bu ay henüz başlamadı', { 4: ['1.530'], 16: ['1.000'], 22: ['230'], 26: ['1.100'] }, true, null]);
    await page.click('.cal-d[data-d="2027-04-04"]'); s = await st(page);
    eq('4 Nisan: kart ekstresi (tahmini)', s.day.exp, [['💳 Kart ekstresi', 'Kart ekstresi (tahmini)', '-₺1.530,00']]);
    await page.click('.cal-nav[aria-label="Önceki ay"]'); await page.click('.cal-nav[aria-label="Önceki ay"]'); s = await st(page);
    eq('Şubat: ay boyunca toplam; geçmiş ayda beklenen yok', [s.title, s.sum, s.cells, s.day], ['Şubat 2027', 'Ay boyunca gelir ₺0,00 · gider ₺1.600,00', { 20: ['1.600'] }, null]);
    await page.click('.cal-head .btn-ghost'); s = await st(page);
    eq('Bugün düğmesi: bu aya ve bugüne döner', [s.title, s.day && s.day.title, s.today], ['Mart 2027', '20 Mart 2027 Cumartesi', false]);
    // Süzgeç: yalnız Deniz → yalnız onun kayıtları; tekrarlayan/ekstre gösterilmez (kişi bilgisi yok)
    await page.selectOption('#fUser', 'u_a'); await page.waitForTimeout(100); s = await st(page);
    eq('Deniz süzgeci: toplam 1.200 + 800 − 200 + 1.000 = 2.800; tekrarlayanlar yok, not var', [s.sum, s.cells, /Süzgeç seçiliyken/.test(s.note)],
      ['Bugüne kadar gelir ₺0,00 · gider ₺2.800,00', { 5: ['1.200'], 10: ['800'], 12: ['+200'], 16: ['1.000'], 28: ['500'] }, true]);
    await page.selectOption('#fUser', ''); await page.selectOption('#fType', 'income'); await page.waitForTimeout(100); s = await st(page);
    // İade gelir türünde kayıtlı: listedeki süzgeç toplamı gibi giderden düşer (−200)
    eq('Gelir süzgeci: gelir ve iade; beklenen gider yok', [s.sum, s.cells], ['Bugüne kadar gelir ₺30.000,00 · gider -₺200,00', { 1: ['+30b'], 12: ['+200'] }]);
    await page.selectOption('#fType', '');
    // Takvim açıkken yeni kayıt: bugünün hücresi güncellenir
    await page.evaluate(() => { App.UI.setType('expense'); document.getElementById('txnAmt').value = '100'; document.getElementById('txnDate').value = '2027-03-20'; document.getElementById('txnNote').value = 'Simit'; App.UI.pickAcc('b'); App.Transactions.add(); });
    await page.waitForTimeout(150); s = await st(page);
    eq('yeni gider eklenince bugün 12.600 ve panelde', [s.cells[20], s.day.txns.map(x => x[0]).sort()], [['12,6b'], ['Kira', 'Simit']]);
    // Görünüm bu cihazda hatırlanır
    await page.reload(); await page.waitForTimeout(300); await page.evaluate(() => App.UI.nav('islemler'));
    eq('yeniden açılınca takvim görünümü sürer', await vis(page), { list: false, cal: true, month: false, tabs: ['false', 'true'] });
    // Liste görünümüne dönüş; ay süzgeci seçiliyken takvime geçince o ay açılır
    await page.click('#txnViewList'); await page.selectOption('#fMonth', '2027-02'); await page.click('#txnViewCal'); s = await st(page);
    eq('ay süzgeci (Şubat) seçiliyken takvim Şubat\'ta açılır', s.title, 'Şubat 2027');
    await ctx.close();
  }
  // Dar ekranda taşma ve kesilen tutar yok (320 ve 390 piksel), bilgisayarda da
  for (const vp of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    const { page, ctx } = await open(vp);
    await page.evaluate(() => App.Transactions.setView('cal'));
    eq(vp.width + ' px: sayfa yana taşmıyor, hücre tutarları kesilmiyor, hücreler en az 34 px', await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth,
      [...document.querySelectorAll('.cal-v')].filter(x => x.scrollWidth > x.clientWidth + 0.5).map(x => x.textContent), Math.min(...[...document.querySelectorAll('.cal-d')].map(b => b.getBoundingClientRect().width)) >= 34]), [true, [], true]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
