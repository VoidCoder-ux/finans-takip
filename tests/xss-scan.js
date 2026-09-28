// Usage: node tests/xss-scan.js
// Eşitlemeyle gelebilecek her metin alanına HTML/JS yükü koyar (hesap, işlem, kategori, üye, borç, hedef, portföy türü…),
// tüm sayfaları ve düzenleme pencerelerini açar; yük bir kez bile çalışır ya da DOM'a <img> olarak girerse başarısız olur.
// Playwright yoksa atlanır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; XSS taraması atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });

// Hem metin hem öznitelik bağlamından kaçmayı dener; 40 karakter sınırlı alanlara da sığar
const P = `"'><img src=x onerror=__x++>`;
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function seed() {
  const now = new Date(), today = iso(now), A = 'a1700000000000_bank', C = 'a1700000000000_card';
  const fut = iso(new Date(now.getFullYear(), now.getMonth() + 1, 5));
  return {
    pf_a: [
      { id: A, name: P, type: 'bank', owner: 'shared', balance: 1000, openingBalance: 1000, ts: 1 },
      { id: C, name: P + '2', type: 'card', owner: 'personal', userId: 'u_x', statementDay: 15, balance: 0, openingBalance: 0, ts: 2 }
    ],
    pf_t: [
      { id: 't1700000000000_a', type: 'expense', amount: 10, category: P, date: today, note: P, accountId: A, userId: 'u_x', ts: 1, balanceApplied: true },
      { id: 't1700000000000_b', type: 'income', amount: 20, category: 'Maaş', date: today, note: P, accountId: C, userId: 'u_x', ts: 2, balanceApplied: true, recurringId: 'r1700000000000_r' },
      { id: 't1700000000000_c', type: 'expense', amount: 5, category: 'Transfer', date: today, note: P, accountId: A, userId: 'u_x', ts: 3, balanceApplied: true, transferId: 'tr1700000000000_t' },
      { id: 't1700000000000_d', type: 'income', amount: 5, category: 'Transfer', date: today, note: P, accountId: C, userId: 'u_x', ts: 4, balanceApplied: true, transferId: 'tr1700000000000_t' },
      { id: 't1700000000000_e', type: 'expense', amount: 50, category: 'Giyim', date: fut, note: P, accountId: C, userId: 'u_x', ts: 5, balanceApplied: false, installment: { planId: 'p1700000000000_p', index: 1, total: 2, totalAmount: 100, name: P, startDate: fut, balanceApplied: false } }
    ],
    pf_s: { onboarded: true, theme: 'dark', rates: { USD: 41, EUR: 48, GBP: 55, GOLD_GRAM: 4300, GOLD_QUARTER: 7000, GOLD_FULL: 28000, FUND: 1, updated: Date.now(), provider: P },
      users: [{ id: 'u_x', name: P, emoji: P, color: P }], activeUser: 'u_x', customCats: [{ name: P, emoji: P, type: 'expense' }, { name: P + 'i', emoji: '🏷️', type: 'income' }],
      portfolioTargets: { USD: 50, FUND: 50 }, lastBackupAt: Date.now(), marketSummary: P, aiProxyUrl: P },
    pf_b: { [P]: 100 },
    pf_bm: { [P]: { carryOver: true, carryStart: today.slice(0, 7), history: {} } },
    pf_r: [{ id: 'r1700000000000_r', type: 'expense', amount: 10, category: P, day: 5, note: P, accountId: A, userId: 'u_x', isSubscription: true, active: true, ts: 1 }],
    pf_d: [{ id: 'd1700000000000_d', direction: 'lent', person: P, amount: 100, date: today, hasDue: true, dueDate: fut, note: P, accountId: A, payments: [{ id: 'p1700000000000_q', amount: 10, date: today }], settled: false, ts: 1 }],
    pf_g: [{ id: 'g1700000000000_g', name: P, target: 100, emoji: P, accountId: A, txnMode: 'none', contributions: [{ id: 'c1700000000000_c', amount: 10, date: today, note: P }], done: null, ts: 1 }],
    pf_f: [{ id: 'yf1700000000000_f', name: P, amount: 100, dueMonth: 12, contributed: 10, ts: 1 }],
    pf_p: [{ id: 'pa1700000000000_a', type: '<img src=x onerror=__x++>', qty: 1, cost: 1, currentPrice: 1, label: P, ts: 1 }, { id: 'pa1700000000000_b', type: 'FUND', code: 'TTE', qty: 1, cost: 1, currentPrice: 1, label: P, ts: 2 }],
    pf_ru: [{ id: 'ru1700000000000_r', field: 'note', value: P, category: P, active: true, ts: 1 }],
    pf_nw: [{ month: today.slice(0, 7), total: 1 }]
  };
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  let fail = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const data = seed();
    await ctx.addInitScript(d => { window.__x = 0; if (!sessionStorage.getItem('seeded')) { localStorage.clear(); Object.keys(d).forEach(k => localStorage.setItem(k, JSON.stringify(d[k]))); sessionStorage.setItem('seeded', '1'); } }, data);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.App && App.UI);
    const pages = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('[data-nav]')).map(e => e.getAttribute('data-nav')))));
    for (const pg of pages) { await page.evaluate(p => App.UI.nav(p), pg); await page.waitForTimeout(80); }
    // Düzenleme ve bilgi pencereleri: her birini açıp kapat
    const openers = [
      () => App.Transactions.edit('t1700000000000_a'), () => App.Transactions.edit('t1700000000000_b'), () => App.Transactions.edit('t1700000000000_c'), () => App.Transactions.edit('t1700000000000_e'),
      () => App.Recurring.edit('r1700000000000_r'), () => App.Debts.edit('d1700000000000_d'), () => App.Goals.edit('g1700000000000_g'),
      () => App.Accounts.edit('a1700000000000_bank'), () => App.Backup.open(), () => App.Onboarding.open(), () => App.YearlyFund.markPaid('yf1700000000000_f'),
      () => App.Recurring.remove('r1700000000000_r'), () => App.Debts.remove('d1700000000000_d'), () => App.Goals.remove('g1700000000000_g')
    ];
    for (const fn of openers) {
      await page.evaluate(`try{(${fn.toString()})()}catch(e){}`);
      await page.waitForTimeout(60);
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.querySelectorAll('.modal-bd.show').forEach(m => m.remove()));
    }
    await page.evaluate(() => { try { App.Transactions.monthTotals && App.UI.nav('islemler'); document.getElementById('fSearch').value = 'img'; App.Transactions.renderList(); } catch (e) {} });
    await page.waitForTimeout(200);
    const res = await page.evaluate(() => ({ ran: window.__x, imgs: document.querySelectorAll('img[src="x"]').length }));
    const ok = res.ran === 0 && res.imgs === 0;
    console.log((ok ? '✓' : '✗') + ' ' + pages.length + ' sayfa ve düzenleme pencereleri: yük çalışmadı, DOM\'a girmedi => ' + JSON.stringify(res));
    if (!ok) fail++;
    const bad = errors.filter(e => !/Failed to fetch|NetworkError|rates unavailable/.test(e));
    console.log((bad.length ? '✗' : '✓') + ' sayfa hatası yok => ' + JSON.stringify(bad.slice(0, 5)));
    if (bad.length) fail++;
  } finally { await browser.close(); srv.close(); }
  console.log(fail ? '\nXSS taraması başarısız' : '\nXSS taraması temiz');
  process.exit(fail ? 1 : 0);
})();
