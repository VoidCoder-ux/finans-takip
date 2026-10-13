// Usage: node tests/qc-payday.test.js
// Maaş planı (Özet): nakit ve banka hesaplarındaki para + gelecek gelir − ay sonuna kadar ödenecekler − önce ayrılacaklar
// (birikim hedefinin kalanı, yıllık giderin bu ayki payı) = harcanabilir; birikime aktar düğmesi. Beklenen değerler elle
// hesaplandı. Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027 (ay sonuna 12 gün). Vadesiz 186.000 (Ocak–Haziran 336.000 gelir − 251.000 market; Temmuz–Eylül her ay
// 60.000 − 32.000 − 8.000 birikime; Ekim 60.000 − 19.000). Birikim hesabı 24.000. Bonus kartı 41.000 borç, kesim 20'si → 30 Ekim ekstresi 41.000.
// Ödenecek: Elektrik + su 2.500 (25 Ekim) + Bonus ekstresi 41.000 = 43.500; dizi aboneliği karttan (ekstreye girer, burada yok).
// Önce ayır: birikim Ekim geliri 60.000 × %20 = 12.000 (bu ay ayrılan yok) + Kasko (18.000 − 6.000 biriken) / 6 ay (Mart 2028) = 2.000 → 14.000.
// Harcanabilir: 186.000 − 43.500 − 14.000 = 128.500; günde 128.500 / 12 = 10.708,33.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId: 'b', userId: 'u_a', ts: n, balanceApplied: date <= '2027-10-20' }, extra || {}));
const tr = (date, amount, from, to) => { const id = 'X' + (++n); T.push({ id: id + 'o', date, type: 'expense', amount, category: 'Transfer', note: 'Aktarım', accountId: from, transferId: id, userId: 'u_a', ts: n, balanceApplied: true }, { id: id + 'i', date, type: 'income', amount, category: 'Transfer', note: 'Aktarım', accountId: to, transferId: id, userId: 'u_a', ts: n, balanceApplied: true }); };
const ME = { '2027-01': [52000, 30000], '2027-02': [52000, 31000], '2027-03': [52000, 29000], '2027-04': [60000, 52000], '2027-05': [60000, 48000], '2027-06': [60000, 61000] };
for (const m in ME) { tx(m + '-01', 'income', ME[m][0], 'Maaş', 'Maaş'); tx(m + '-08', 'expense', ME[m][1], 'Market', 'Migros'); }
for (const m of ['2027-07', '2027-08', '2027-09']) {
  tx(m + '-01', 'income', 40000, 'Maaş', 'Maaş'); tx(m + '-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' }); tx(m + '-02', 'expense', 12000, 'Kira', 'Kira'); tx(m + '-05', 'expense', 9000, 'Market', 'Migros');
  tx(m + '-10', 'expense', 4000, 'Faturalar', 'Elektrik'); tx(m + '-12', 'expense', 3000, 'Kredi Ödemesi', 'Taşıt kredisi'); tx(m + '-15', 'expense', 6000, 'Yiyecek', 'Restoran', { accountId: 'c' });
  tx(m + '-18', 'expense', 5000, 'Giyim', 'Mont', { accountId: 'c' }); tx(m + '-20', 'expense', 4000, 'Eğlence', 'Sinema'); tr(m + '-04', 8000, 'b', 'sv');
}
tx('2027-10-01', 'income', 40000, 'Maaş', 'Maaş'); tx('2027-10-03', 'income', 20000, 'Maaş', 'Maaş', { userId: 'u_b' }); tx('2027-10-02', 'expense', 12000, 'Kira', 'Kira'); tx('2027-10-05', 'expense', 7000, 'Market', 'Migros'); tx('2027-10-14', 'expense', 8000, 'Yiyecek', 'Restoran', { accountId: 'c' });
const bal = {}; T.forEach(t => { if (t.balanceApplied) bal[t.accountId] = (bal[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount); });
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now(), customCats: [{ name: 'Kira', emoji: '🏠', type: 'expense' }] },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: bal.b, openingBalance: 0, ts: 1 }, { id: 'sv', name: 'Birikim', type: 'savings', owner: 'shared', balance: bal.sv, openingBalance: 0, ts: 1 },
    { id: 'c', name: 'Bonus', type: 'card', owner: 'shared', balance: bal.c, openingBalance: 0, ts: 1, limit: 60000, statementDay: 20, dueOffset: 10 }],
  pf_t: T,
  pf_r: [{ id: 'r1', type: 'expense', amount: 2500, category: 'Faturalar', day: 25, note: 'Elektrik + su', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: false },
    { id: 'r2', type: 'expense', amount: 399, category: 'Eğlence', day: 28, note: 'Dizi aboneliği', accountId: 'c', userId: 'u_a', isSubscription: true, active: true, autoLog: false }],
  pf_f: [{ id: 'f1', name: 'Kasko', amount: 18000, dueMonth: 3, contributed: 6000, paidYear: 2027, ts: new Date('2027-04-01T12:00:00').getTime() }] };

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
  const pl = () => page.evaluate(() => { const p = App.Payday.plan(); return { days: p.daysLeft, cash: p.cash, inc: p.incomeTotal, pay: p.payments.map(x => [x.label, x.amount]), P: p.paymentsTotal, set: p.setAside.map(x => [x.label, x.amount]), A: p.setAsideTotal, free: p.free, perDay: p.perDay, recv: p.received, target: p.target, saved: p.saved, toSave: p.toSave }; });

  // 1) Plan
  eq('maaş planı', await pl(), { days: 12, cash: 186000, inc: 0, pay: [['Elektrik + su', 2500], ['💳 Bonus ekstresi', 41000]], P: 43500, set: [['🐖 Birikim (hedef %20)', 12000], ['📅 Kasko', 2000]], A: 14000, free: 128500, perDay: 10708.33, recv: 60000, target: 12000, saved: 0, toSave: 12000 });

  // 2) Özet kartı
  await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(150);
  const card = () => page.evaluate(() => { const c = document.querySelector('#ozet-payday .pd-card'), sp = s => String(s || '').replace(/\s+/g, ' ').trim();
    return { title: sp(c.querySelector('.pd-title').textContent), sub: sp(c.querySelector('.pd-head .pd-sub').textContent), sum: [...c.querySelectorAll('.pd-sum > div')].map(d => sp(d.textContent)), heads: [...c.querySelectorAll('.pd-h')].map(h => h.textContent),
      rows: [...c.querySelectorAll('.pd-row')].map(r => [sp(r.querySelector('.pd-lbl').textContent), r.querySelector('.pd-amt').textContent, r.classList.contains('done')]), btn: sp((c.querySelector('.pd-btn') || {}).textContent), sec: !!document.querySelector('.sh[data-sec="ozet-payday"] .sh-toggle') }; });
  eq('Özet kartı', await card(), { title: 'Ekim sonuna kadar (12 gün)', sub: 'Bu ay gelen ₺60.000,00', sum: ['Hesaplarda₺186.000,00', '− Ödenecek₺43.500,00', '− Önce ayır₺14.000,00', '= Harcanabilir₺128.500,00günde ₺10.708,33'],
    heads: ['1 · Önce kendine öde', '2 · Ay sonuna kadar ödenecekler', '3 · Kalan'], rows: [['🐖 Birikim (hedef %20)', '₺12.000,00', false], ['📅 Kasko', '₺2.000,00', false], ['Elektrik + su', '₺2.500,00', false], ['💳 Bonus ekstresi', '₺41.000,00', false]], btn: '🐖 ₺12.000,00 birikime aktar', sec: true });

  // 3) Birikime aktar: Vadesiz → Birikim 12.000; birikim kalanı 0, harcanabilir aynı (para birikim hesabına geçti)
  await page.evaluate(() => document.querySelector('#ozet-payday .pd-btn').click()); await page.waitForTimeout(50);
  eq('aktarım penceresi', await page.evaluate(() => { const d = document.querySelector('.app-dialog-holder'); return ['amount', 'from', 'to'].map(k => d.querySelector('[data-pkey="' + k + '"]').value); }), ['12000', 'b', 'sv']);
  await page.evaluate(() => document.querySelector('.app-dialog-holder [data-act="ok"]').click()); await page.waitForTimeout(100);
  eq('aktarıldı: hesaplar ve plan', [await page.evaluate(() => S.accounts().filter(a => a.type !== 'card').map(a => a.balance)), await pl().then(p => [p.cash, p.saved, p.toSave, p.A, p.free])], [[174000, 36000], [174000, 12000, 0, 2000, 128500]]);
  eq('kart: birikim tamam, düğme yok, toast', [await card().then(c => [c.rows[0], c.btn]), (await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent))).some(t => /₺12\.000,00 birikime aktarıldı/.test(t))], [[['🐖 Birikim (hedef %20)', '₺0,00', true], ''], true]);

  // 4) Gelecek gelir ve açık: 28 Ekim'de planlı 5.000 ek gelir, 29 Ekim'de planlı 150.000 gider. Birikim hedefi (60.000 + 5.000) × %20 = 13.000,
  // ayrılan 12.000 → 1.000 daha; kasko 2.000 → önce ayır 3.000. 174.000 + 5.000 − 193.500 − 3.000 = −17.500
  await page.evaluate(() => { const t = S.txns(); t.push({ id: 'pf1', date: '2027-10-28', type: 'income', amount: 5000, category: 'Freelance', note: 'Proje', accountId: 'b', userId: 'u_a', ts: 9001, balanceApplied: false }, { id: 'pf2', date: '2027-10-29', type: 'expense', amount: 150000, category: 'Diğer', note: 'Araç peşinatı', accountId: 'b', userId: 'u_a', ts: 9002, balanceApplied: false }); S.saveTxns(t); App.Payday.render(); });
  eq('gelecek gelir ve açık', await pl().then(p => [p.inc, p.P, p.free, p.target]), [5000, 193500, -17500, 13000]);
  eq('açık uyarısı', await card().then(c => [c.sub, c.sum[1], c.sum[4]]), ['Bu ay gelen ₺60.000,00 · gelecek ₺5.000,00', '+ Gelecek₺5.000,00', '= Harcanabilir−₺17.500,00ödemelere ve birikime yetmiyor']);
  eq('birikim hedefi gelecek gelirle: 65.000 × %20 = 13.000; ayrılan 12.000 → 1.000', await pl().then(p => [p.saved, p.toSave, p.set[0]]), [12000, 1000, ['🐖 Birikim (hedef %20)', 1000]]);

  // 5) Tarihli hedef: ayda gereken birikim notu
  await page.evaluate(() => { S.saveGoals([{ id: 'g1', name: 'Tatil', target: 30000, emoji: '🏖', txnMode: 'none', contributions: [], done: null, ts: new Date('2027-10-01T12:00:00').getTime(), due: '2028-03' }]); App.Payday.render(); });
  eq('hedef notu (30.000 / 5 ay = 6.000)', await page.evaluate(() => [App.Payday.plan().goalNeed, [...document.querySelectorAll('#ozet-payday .pd-note')].map(x => x.textContent).find(t => /Tarihli hedefler/.test(t))]), [6000, 'Tarihli hedefler için ayda ₺6.000,00 gerekiyor; birikimin bir kısmını hedeflere ayırın.']);

  // 6) Birikim hesabı yoksa aktarım düğmesi yok
  await page.evaluate(() => { S.saveAccounts(S.accounts().filter(a => a.type !== 'savings')); App.Payday.render(); });
  eq('birikim hesabı yok: düğme yok', await card().then(c => c.btn), '');

  // 7) Dar ekran
  await page.setViewportSize({ width: 320, height: 700 }); await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(100);
  eq('320 px: taşma yok', await page.evaluate(() => { const bad = []; document.querySelectorAll('#ozet-payday *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5)]; }), [true, []]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
