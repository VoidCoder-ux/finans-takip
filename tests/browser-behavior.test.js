// Usage: node tests/browser-behavior.test.js
// Runs the real index.html in headless Chromium (Playwright) and checks money flows end-to-end.
// Skips (exit 0) when Playwright is not installed.

var http = require('http');
var fs = require('fs');
var path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try {
    var root = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(root, 'playwright'));
  } catch (e) { return null; }
}

var pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; tarayıcı testleri atlandı.'); process.exit(0); }

var pass = 0, fail = 0;
function eq(label, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  (ok ? pass++ : fail++);
  console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(actual) + (ok ? '' : ' (expected ' + JSON.stringify(expected) + ')'));
}

var ROOT = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
var server = http.createServer(function(req, res) {
  var file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
var now = new Date();
var TODAY = iso(now);
var PAST = iso(new Date(now.getFullYear(), now.getMonth(), 1));
var PREV_MONTH_DAY = iso(new Date(now.getFullYear(), now.getMonth() - 1, 10));

var browser, base;

// Opens a fresh page whose localStorage is seeded before the app boots.
async function openApp(seed) {
  var ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  var page = await ctx.newPage();
  page.on('pageerror', function(err) { fail++; console.log('✗ page error: ' + err.message); });
  await page.goto(base + '/index.html');
  await page.evaluate(function(seed) {
    localStorage.clear();
    Object.keys(seed || {}).forEach(function(k) { localStorage.setItem(k, JSON.stringify(seed[k])); });
  }, seed || {});
  await page.reload();
  await page.waitForFunction(function() { return window.App && App.Transactions && document.getElementById('heroNet'); });
  return { page: page, ctx: ctx };
}

function acc(id, name, type, balance, extra) {
  return Object.assign({ id: id, name: name, type: type, owner: 'shared', userId: null, statementDay: null, balance: balance, openingBalance: balance, ts: 1 }, extra || {});
}

async function submitPrompt(page, values) {
  await page.evaluate(function(values) {
    var holder = document.querySelector('.app-dialog-holder:last-of-type');
    Object.keys(values).forEach(function(k) { holder.querySelector('[data-pkey="' + k + '"]').value = values[k]; });
    holder.querySelector('[data-act="ok"]').click();
  }, values);
}

async function balances(page) {
  return page.evaluate(function() { var o = {}; S.accounts().forEach(function(a) { o[a.name] = a.balance; }); return o; });
}

async function run() {
  // 1) Legacy account without openingBalance must not be double-counted by the startup reconcile.
  var r = await openApp({
    pf_a: [{ id: 'a1700000000000_aaaa', name: 'Banka', type: 'bank', owner: 'shared', balance: 1000, ts: 1 }],
    pf_t: [{ id: 't1700000000000_aaaa', type: 'expense', amount: 200, category: 'Market', date: PAST, accountId: 'a1700000000000_aaaa', userId: 'u_self', ts: 1, balanceApplied: true }]
  });
  var a = await r.page.evaluate(function() { var x = S.accounts()[0]; return { balance: x.balance, opening: x.openingBalance }; });
  eq('legacy account keeps its real balance', a.balance, 1000);
  eq('legacy opening balance derived from history', a.opening, 1200);
  await r.page.reload();
  await r.page.waitForFunction(function() { return window.App && App.Accounts; });
  eq('legacy balance stable after second load', (await balances(r.page)).Banka, 1000);
  await r.ctx.close();

  // 2) Deleted member stays unassigned after reload; legacy record without userId goes to active profile.
  r = await openApp({
    pf_a: [acc('a1700000000000_bbbb', 'Banka', 'bank', 0)],
    pf_t: [
      { id: 't1700000000000_bbb1', type: 'expense', amount: 10, category: 'Market', date: PAST, accountId: 'a1700000000000_bbbb', userId: null, ts: 1, balanceApplied: false },
      { id: 't1700000000000_bbb2', type: 'expense', amount: 10, category: 'Market', date: PAST, accountId: 'a1700000000000_bbbb', ts: 2, balanceApplied: false }
    ]
  });
  var owners = await r.page.evaluate(function() { var o = {}; S.txns().forEach(function(t) { o[t.id] = t.userId; }); return o; });
  eq('cleared userId stays cleared', owners['t1700000000000_bbb1'], '');
  eq('missing userId falls back to active profile', owners['t1700000000000_bbb2'], 'u_self');
  await r.ctx.close();

  // 3) Transfer between own accounts: balances move, totals do not; edit and delete keep balances right.
  r = await openApp({ pf_a: [acc('a1700000000000_cccc', 'Banka', 'bank', 1000), acc('a1700000000000_dddd', 'Kart', 'card', -500)] });
  var p = r.page;
  await p.click('[data-nav="islemler"]');
  await p.click('#pillTrf');
  eq('transfer hides category field', await p.isVisible('#txnCatWrap'), false);
  eq('transfer shows target account', await p.isVisible('#txnToAccount'), true);
  await p.fill('#txnAmt', '300');
  await p.selectOption('#txnAccount', 'a1700000000000_cccc');
  await p.selectOption('#txnToAccount', 'a1700000000000_dddd');
  await p.click('#page-islemler .btn-primary');
  eq('transfer moves balances', await balances(p), { Banka: 700, Kart: -200 });
  var totals = await p.evaluate(function(m) { return App.Transactions.monthTotals(m); }, TODAY.slice(0, 7));
  eq('transfer excluded from monthly totals', totals, { income: 0, expense: 0, count: 0 });
  eq('transfer shown as a single row', await p.locator('#txnList .ti').count(), 1);
  var outId = await p.evaluate(function() { return S.txns().find(function(t) { return t.transferId && t.type === 'expense'; }).id; });
  await p.evaluate(function(id) { App.Transactions.edit(id); }, outId);
  await submitPrompt(p, { amount: '250' });
  eq('edited transfer rebalances both accounts', await balances(p), { Banka: 750, Kart: -250 });
  await p.evaluate(function(id) { App.Transactions.remove(id); }, outId);
  eq('deleted transfer restores balances', await balances(p), { Banka: 1000, Kart: -500 });
  eq('both transfer legs deleted', await p.evaluate(function() { return S.txns().length; }), 0);

  // 4) Editing a normal transaction moves the effect to the new account/amount.
  await p.click('#pillExp');
  await p.fill('#txnAmt', '100');
  await p.selectOption('#txnAccount', 'a1700000000000_cccc');
  await p.click('#page-islemler .btn-primary');
  eq('expense reduces bank', (await balances(p)).Banka, 900);
  var tid = await p.evaluate(function() { return S.txns()[0].id; });
  await p.evaluate(function(id) { App.Transactions.edit(id); }, tid);
  await submitPrompt(p, { amount: '150', accountId: 'a1700000000000_dddd' });
  eq('edited expense moved to card', await balances(p), { Banka: 1000, Kart: -650 });
  await p.reload();
  await p.waitForFunction(function() { return window.App && App.Accounts; });
  eq('edited balances survive reconcile on reload', await balances(p), { Banka: 1000, Kart: -650 });

  // 5) Account edit keeps reconcile consistent.
  await p.evaluate(function() { App.Accounts.edit('a1700000000000_cccc'); });
  await submitPrompt(p, { balance: '1234.5' });
  await p.reload();
  await p.waitForFunction(function() { return window.App && App.Accounts; });
  eq('manual balance correction persists after reload', (await balances(p)).Banka, 1234.5);

  // 6) Kural Motoru reachable from desktop sidebar.
  await p.click('.sidebar [data-nav="kurallar"]');
  eq('rules page opens from sidebar', await p.isVisible('#page-kurallar'), true);
  await r.ctx.close();

  // 7) Goal contribution in transfer mode is a real transfer (source debited, no phantom income).
  r = await openApp({
    pf_a: [acc('a1700000000000_eeee', 'Banka', 'bank', 1000), acc('a1700000000000_ffff', 'Birikim', 'savings', 0)],
    pf_g: [{ id: 'g1700000000000_gggg', name: 'Tatil', target: 500, emoji: '🎯', accountId: 'a1700000000000_ffff', sourceAccountId: 'a1700000000000_eeee', txnMode: 'transfer', contributions: [], done: null, ts: 1 }]
  });
  p = r.page;
  await p.click('[data-nav="hedefler"]');
  await p.evaluate(function() { App.Goals.togglePanel('g1700000000000_gggg'); });
  await p.fill('#ca_g1700000000000_gggg', '100');
  await p.evaluate(function() { App.Goals.addContrib('g1700000000000_gggg'); });
  eq('goal transfer debits source and credits savings', await balances(p), { Banka: 900, Birikim: 100 });
  eq('goal transfer adds no income', (await p.evaluate(function(m) { return App.Transactions.monthTotals(m); }, TODAY.slice(0, 7))).income, 0);
  var cid = await p.evaluate(function() { return S.goals()[0].contributions[0].id; });
  await p.evaluate(function(cid) { App.Goals.removeContrib('g1700000000000_gggg', cid); }, cid);
  eq('removing goal contribution reverts both accounts', await balances(p), { Banka: 1000, Birikim: 0 });
  await r.ctx.close();

  // 8) Portfolio: fractional units survive, P&L only over assets with a known cost.
  r = await openApp({
    pf_s: { rates: { USD: 40, EUR: 0, GBP: 0, GOLD_GRAM: 0, GOLD_QUARTER: 0, GOLD_FULL: 0, FUND: 1, updated: Date.now(), provider: 'Test' } },
    pf_p: [
      { id: 'pa1700000000000_hhhh', type: 'USD', qty: 10, cost: 30, currentPrice: 0, label: '', ts: 1 },
      { id: 'pa1700000000000_iiii', type: 'FUND', qty: 1000.123456, cost: 0, currentPrice: 0.123456, label: 'Fon', ts: 2 }
    ]
  });
  p = r.page;
  var port = await p.evaluate(function() { return S.portfolio().map(function(x) { return [x.qty, x.currentPrice]; }); });
  eq('fund units and price keep 6 decimals', port[1], [1000.123456, 0.123456]);
  await p.click('[data-nav="portfoy"]');
  var pnlText = await p.locator('#portfolioSummary .ps-card').nth(1).locator('.ps-val').textContent();
  eq('P&L ignores uncosted asset value', pnlText, '₺100,00');
  await r.ctx.close();

  // 9) Budget whose carry-over went negative must show as exceeded, not "İyi".
  r = await openApp({
    pf_a: [acc('a1700000000000_jjjj', 'Banka', 'bank', 0)],
    pf_b: { Market: 100 },
    pf_bm: { Market: { carryOver: true, carryStart: PREV_MONTH_DAY.slice(0, 7) } },
    pf_t: [{ id: 't1700000000000_jjj1', type: 'expense', amount: 500, category: 'Market', date: PREV_MONTH_DAY, accountId: 'a1700000000000_jjjj', userId: 'u_self', ts: 1, balanceApplied: true }]
  });
  p = r.page;
  await p.click('[data-nav="butce"]');
  eq('exhausted carry-over budget flagged as exceeded', (await p.locator('#budgetGrid .badge').first().textContent()).trim(), '⚠ Aşıldı');
  await r.ctx.close();
}

function monthShift(n) { var d = new Date(now.getFullYear(), now.getMonth() + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
var CUR_MONTH = TODAY.slice(0, 7);
var IN_10_DAYS = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10));

async function reload(page) {
  await page.reload();
  await page.waitForFunction(function() { return window.App && App.Transactions && document.getElementById('heroNet'); });
}

// Denetim #3, orta/düşük öncelikli maddeler (8–21)
async function runAudit3b() {
  var A = 'a1700000000000_kkkk', B = 'a1700000000000_llll';

  // 8) Carry-over counts every month since carryStart (no 6-month cap) with the limit valid in that month.
  var r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 0)],
    pf_b: { Market: 100 },
    pf_bm: { Market: { carryOver: true, carryStart: monthShift(-8), history: { '0000-00': 50 } } }
  });
  var p = r.page;
  eq('rollover spans all months since carryStart', await p.evaluate(function() { return App.Budget.rolloverBalance('Market'); }), 400);
  await p.evaluate(function(m) { var bm = S.budgetMeta(); bm.Market.history[m] = 100; S.saveBudgetMeta(bm); }, monthShift(-2));
  eq('rollover uses the limit valid in each month', await p.evaluate(function() { return App.Budget.rolloverBalance('Market'); }), 6 * 50 + 2 * 100);
  await r.ctx.close();

  // 9 + 10) Stats: budget usage over budgeted categories only; daily average over elapsed days.
  r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 0)],
    pf_b: { Market: 100 },
    pf_t: [
      { id: 't1700000000000_st01', type: 'expense', amount: 50, category: 'Market', date: CUR_MONTH + '-01', accountId: A, userId: 'u_self', ts: 1, balanceApplied: true },
      { id: 't1700000000000_st02', type: 'expense', amount: 500, category: 'Yiyecek', date: CUR_MONTH + '-01', accountId: A, userId: 'u_self', ts: 2, balanceApplied: true }
    ]
  });
  p = r.page;
  await p.click('[data-nav="istatistikler"]');
  var kpis = await p.locator('#statsKpis .skpi-val').allTextContents();
  eq('budget usage ignores unbudgeted categories', kpis[3], '50.0%');
  var dayAvg = (550 / now.getDate()).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  eq('daily average divides by elapsed days this month', kpis[2], '₺' + dayAvg);
  await r.ctx.close();

  // 11 + 17) Recurring: own account, logged month not projected twice, paused excluded, forgotten month can be logged.
  r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000), acc(B, 'Kart', 'card', 0)] });
  p = r.page;
  await p.click('[data-nav="tekrarlayan"]');
  await p.fill('#recAmt', '200');
  await p.selectOption('#recCat', 'Faturalar');
  await p.fill('#recDay', '28');
  await p.fill('#recNote', 'İnternet');
  await p.selectOption('#recAccount', B);
  await p.click('#page-tekrarlayan .btn-primary');
  var rid = await p.evaluate(function() { return S.recurring()[0].id; });
  eq('recurring keeps chosen account', await p.evaluate(function() { return S.recurring()[0].accountId; }), B);
  await p.evaluate(function(id) { App.Recurring.log(id); }, rid);
  var logged = await p.evaluate(function() { return S.txns().map(function(t) { return [t.accountId, t.date.slice(0, 7)]; }); });
  eq('log writes to the recurring account', logged, [[B, CUR_MONTH]]);
  var projected = await p.evaluate(function(m) { return App.Cashflow.items(95).filter(function(x) { return x.label === 'İnternet' && x.date.slice(0, 7) === m; }).length; }, CUR_MONTH);
  eq('logged month is not projected twice', projected <= 1, true);
  await p.evaluate(function(id) { App.Recurring.log(id); }, rid);
  await submitPrompt(p, { month: monthShift(-1) });
  eq('second log records the forgotten previous month', await p.evaluate(function(m) { return S.txns().filter(function(t) { return t.date.slice(0, 7) === m; }).length; }, monthShift(-1)), 1);
  await p.evaluate(function(id) { App.Recurring.togglePause(id); }, rid);
  eq('paused recurring leaves cash-flow projection', await p.evaluate(function() { return App.Cashflow.items(95).filter(function(x) { return x.src === 'Tekrarlayan'; }).length; }), 0);
  await reload(p);
  eq('pause survives reload', await p.evaluate(function() { return S.recurring()[0].active; }), false);
  await r.ctx.close();

  // 12 + 13) Debts: legacy due==date means "no due"; explicit due feeds cash flow; settled debt's payment can be removed.
  r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 0)],
    pf_d: [{ id: 'd1700000000000_mmmm', direction: 'lent', person: 'Eski', amount: 100, date: PAST, dueDate: PAST, note: '', payments: [], settled: false, ts: 1 }]
  });
  p = r.page;
  eq('legacy debt without explicit due has no due date', await p.evaluate(function() { return S.debts()[0].dueDate; }), '');
  await p.click('[data-nav="borclar"]');
  await p.fill('#debtPerson', 'Ali');
  await p.fill('#debtAmt', '300');
  await p.fill('#debtDue', IN_10_DAYS);
  await p.click('#page-borclar .btn-primary');
  eq('debt with due date appears in cash flow', await p.evaluate(function() { return App.Cashflow.items(30).filter(function(x) { return x.label === 'Ali'; }).map(function(x) { return [x.date, x.amount]; }); }), [[IN_10_DAYS, 300]]);
  var did = await p.evaluate(function() { return S.debts().find(function(d) { return d.person === 'Ali'; }).id; });
  await p.evaluate(function(id) { App.Debts.togglePay(id); }, did);
  await p.fill('#pay_amt_' + did, '300');
  await p.evaluate(function(id) { App.Debts.addPayment(id); }, did);
  eq('full payment settles debt', await p.evaluate(function(id) { return S.debts().find(function(d) { return d.id === id; }).settled; }, did), true);
  eq('settled debt still shows removable payment', await p.locator('#dpay_' + did + ' .pay-item .btn-del').count(), 1);
  await p.evaluate(function(id) { var d = S.debts().find(function(x) { return x.id === id; }); App.Debts.removePayment(id, d.payments[0].id); }, did);
  eq('removing payment reopens debt', await p.evaluate(function(id) { return S.debts().find(function(d) { return d.id === id; }).settled; }, did), false);
  await r.ctx.close();

  // 14) Yearly fund: "Ödendi" records the expense, resets contributions and moves to next year's cycle.
  r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 5000)],
    pf_f: [{ id: 'yf1700000000000_nnnn', name: 'MTV', amount: 1200, dueMonth: now.getMonth() + 1, contributed: 1200, ts: 1 }]
  });
  p = r.page;
  await p.evaluate(function() { App.YearlyFund.markPaid('yf1700000000000_nnnn'); });
  await submitPrompt(p, { record: 'yes', amount: '1200', accountId: A });
  var fund = await p.evaluate(function() { var f = S.fund()[0]; return { c: f.contributed, y: f.paidYear, next: App.YearlyFund.nextDue(f).year }; });
  eq('paid fund resets and rolls to next year', fund, { c: 0, y: now.getFullYear(), next: now.getFullYear() + 1 });
  eq('paid fund recorded as expense', (await balances(p)).Banka, 3800);
  await r.ctx.close();

  // 15) CPI: stale bundled series is replaced; months after the last index use the last index.
  r = await openApp({ pf_cpi: { '2022-12': 1446.72, '2023-12': 2364.0 } });
  p = r.page;
  var cpi = await p.evaluate(function() { var d = App.Inflation.data(); return { dec22: d['2022-12'], dec23: d['2023-12'], latest: App.Inflation.latestMonth() }; });
  eq('CPI 2022-12 matches official chain (±0.2)', Math.abs(cpi.dec22 - 1128.45) < 0.2, true);
  eq('CPI 2023-12 matches official chain (±0.2)', Math.abs(cpi.dec23 - 1859.38) < 0.2, true);
  eq('real value after last CPI month is not left unadjusted', await p.evaluate(function(l) { return App.Inflation.adjust(100, '2099-01', l); }, cpi.latest), 100);
  await r.ctx.close();

  // 19 + 20 + 21) Bank-style CSV, Turkish amounts, undo delete.
  r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 1000)],
    pf_ru: [{ id: 'ru1700000000000_oooo', field: 'note', value: 'migros', category: 'Market', active: true, ts: 1 }]
  });
  p = r.page;
  eq('"1.500" reads as fifteen hundred', await p.evaluate(function() { return parseMoney('1.500'); }), 1500);
  eq('"1,5" still reads as one and a half', await p.evaluate(function() { return parseMoney('1,5'); }), 1.5);
  await p.click('[data-nav="islemler"]');
  await p.click('#pillExp');
  await p.fill('#txnAmt', '1.500');
  eq('amount preview shows parsed value', (await p.locator('#txnAmt + .money-hint').textContent()).trim(), '= ₺1.500,00');
  var csv = '﻿İşlem Tarihi;Açıklama;Tutar\r\n' + TODAY.split('-').reverse().join('.') + ';MIGROS KADIKOY;-1.234,56\r\n' + TODAY.split('-').reverse().join('.') + ';MAAS;25.000,00\r\n';
  await p.setInputFiles('#csvImport', { name: 'ekstre.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await p.waitForSelector('.app-dialog-holder [data-act="ok"]');
  await p.click('.app-dialog-holder [data-act="ok"]');
  var imported = await p.evaluate(function() { return S.txns().map(function(t) { return [t.type, t.amount, t.category]; }).sort(); });
  eq('bank CSV: sign sets type, rule sets category', imported, [['expense', 1234.56, 'Market'], ['income', 25000, 'Diğer']]);
  eq('bank CSV applied to balance', (await balances(p)).Banka, 24765.44);
  var txId = await p.evaluate(function() { return S.txns().find(function(t) { return t.type === 'expense'; }).id; });
  await p.evaluate(function(id) { App.Transactions.remove(id); }, txId);
  eq('delete applies immediately', (await balances(p)).Banka, 26000);
  await p.click('.toast .toast-act');
  eq('undo restores transaction and balance', [await p.evaluate(function() { return S.txns().length; }), (await balances(p)).Banka], [2, 24765.44]);
  var exported = await p.evaluate(function() {
    var out = null, orig = URL.createObjectURL;
    URL.createObjectURL = function(b) { out = b; return orig.call(URL, b); };
    App.Transactions.exportCSV(); URL.createObjectURL = orig; return out.text();
  });
  eq('export uses ; and decimal comma', exported.split('\r\n')[0].replace('﻿', '') + ' | ' + /;"1234,56";/.test(exported), 'Tarih;Tür;Kategori;Tutar;Hesap;Üye;Not | true');
  await r.ctx.close();
}

// Denetim #4: eksik özellikler ve arayüz
async function runAudit4() {
  var A = 'a1700000000000_pppp', B = 'a1700000000000_qqqq';

  // Custom category flows into every category select and survives reload.
  var r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000)] });
  var p = r.page;
  await p.evaluate(function() { App.UI.nav('ayarlar'); });
  await p.fill('#catName', 'Evcil Hayvan');
  await p.fill('#catEmoji', '🐾');
  await p.evaluate(function() { App.Categories.add(); });
  await reload(p);
  eq('custom category in budget and rule selects', await p.evaluate(function() {
    return [document.getElementById('bCat').innerHTML.indexOf('Evcil Hayvan') >= 0, document.getElementById('ruCat').innerHTML.indexOf('Evcil Hayvan') >= 0, ci('Evcil Hayvan').i];
  }), [true, true, '🐾']);
  // Family emoji (multi code unit) is kept whole.
  eq('multi-codepoint emoji kept', await p.evaluate(function() { return firstEmoji('👨‍👩‍👧x', '?'); }), '👨‍👩‍👧');

  // Income rule + apply to existing transactions.
  await p.evaluate(function(a) {
    var t = S.txns(); t.push({ id: 't1700000000000_rul1', type: 'income', amount: 100, category: 'Diğer', date: '2026-01-05', note: 'ACME maaş', accountId: a, userId: 'u_self', ts: 1, balanceApplied: true });
    t.push({ id: 't1700000000000_rul2', type: 'expense', amount: 40, category: 'Diğer', date: '2026-01-06', note: 'mama', accountId: a, userId: 'u_self', ts: 2, balanceApplied: true });
    S.saveTxns(t);
    var r = S.rules(); r.push({ id: 'ru1700000000000_r001', field: 'note', value: 'maaş', category: 'Maaş', active: true, ts: 1 }, { id: 'ru1700000000000_r002', field: 'note', value: 'mama', category: 'Evcil Hayvan', active: true, ts: 2 }); S.saveRules(r);
    App.Rules.applyExisting();
  }, A);
  await p.click('.app-dialog-holder [data-act="ok"]');
  eq('rules re-categorize existing income and expense', await p.evaluate(function() { var o = {}; S.txns().forEach(function(t) { o[t.id] = t.category; }); return [o.t1700000000000_rul1, o.t1700000000000_rul2]; }), ['Maaş', 'Evcil Hayvan']);

  // Date range filter + filtered totals.
  await p.evaluate(function() { App.UI.nav('islemler'); });
  await p.fill('#fFrom', '2026-01-06');
  await p.fill('#fTo', '2026-01-06');
  await p.dispatchEvent('#fTo', 'change');
  eq('date range filter narrows list', await p.locator('#txnList .ti').count(), 1);
  eq('filtered totals shown', (await p.textContent('#txnFilterSum')).indexOf('Gider ₺40,00') >= 0, true);
  await r.ctx.close();

  // Auto-log recurring: due months since enabling are recorded on startup, once.
  r = await openApp({
    pf_a: [acc(A, 'Banka', 'bank', 1000)],
    pf_r: [{ id: 'r1700000000000_auto', type: 'expense', amount: 100, category: 'Faturalar', day: 1, note: 'Aidat', accountId: A, userId: 'u_self', isSubscription: false, active: true, autoLog: true, autoFrom: monthShift(-2), ts: 1 }]
  });
  p = r.page;
  eq('auto-log records due months (3)', await p.evaluate(function() { return S.txns().filter(function(t) { return t.recurringId === 'r1700000000000_auto'; }).length; }), 3);
  eq('auto-log debits account', (await balances(p)).Banka, 700);
  await reload(p);
  eq('auto-log does not duplicate on next start', await p.evaluate(function() { return S.txns().length; }), 3);
  await r.ctx.close();

  // Portfolio: buy debits account (not an expense), partial sell credits it and keeps the rest.
  r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 10000)], pf_s: { rates: { USD: 40, FUND: 1, updated: Date.now(), provider: 'Test' } } });
  p = r.page;
  await p.evaluate(function() { App.UI.nav('portfoy'); });
  await p.selectOption('#portType', 'USD');
  await p.fill('#portQty', '100');
  await p.fill('#portCost', '35');
  await p.selectOption('#portAccount', A);
  await p.evaluate(function() { App.Portfolio.add(); });
  eq('asset purchase debits account', (await balances(p)).Banka, 6500);
  eq('asset purchase is not counted as expense', (await p.evaluate(function(m) { return App.Transactions.monthTotals(m); }, CUR_MONTH)).expense, 0);
  var pid = await p.evaluate(function() { return S.portfolio()[0].id; });
  await p.evaluate(function(id) { App.Portfolio.sell(id); }, pid);
  await submitPrompt(p, { qty: '40', price: '42', accountId: A });
  eq('partial sell keeps remaining units', await p.evaluate(function() { return S.portfolio()[0].qty; }), 60);
  eq('sale proceeds credited to account', (await balances(p)).Banka, 8180);
  await r.ctx.close();

  // Debt linked to an account: lend, collect, delete → balances follow; totals untouched.
  r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000)] });
  p = r.page;
  await p.evaluate(function() { App.UI.nav('borclar'); });
  await p.fill('#debtPerson', 'Veli');
  await p.fill('#debtAmt', '400');
  await p.selectOption('#debtAccount', A);
  await p.evaluate(function() { App.Debts.add(); });
  eq('lending debits linked account', (await balances(p)).Banka, 600);
  var did = await p.evaluate(function() { return S.debts()[0].id; });
  await p.evaluate(function(id) { App.Debts.togglePay(id); }, did);
  await p.fill('#pay_amt_' + did, '150');
  await p.evaluate(function(id) { App.Debts.addPayment(id); }, did);
  eq('collection credits linked account', (await balances(p)).Banka, 750);
  eq('debt movements are not income/expense', await p.evaluate(function(m) { var t = App.Transactions.monthTotals(m); return [t.income, t.expense]; }, CUR_MONTH), [0, 0]);
  await p.evaluate(function(id) { App.Debts.remove(id); }, did);
  await p.click('.app-dialog-holder [data-act="ok"]');
  eq('deleting debt reverts linked movements', [(await balances(p)).Banka, await p.evaluate(function() { return S.txns().length; })], [1000, 0]);
  await r.ctx.close();

  // Screen lock: set PIN, lock on reload, wrong PIN rejected, right PIN opens.
  r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000)] });
  p = r.page;
  await p.evaluate(function() { App.Lock.set(); });
  await submitPrompt(p, { pin: '2468', pin2: '2468' });
  await p.waitForFunction(function() { return !!S.settings().lockHash; });
  eq('PIN stored only as hash', await p.evaluate(function() { var s = JSON.stringify(S.settings()); return s.indexOf('2468') < 0 && S.settings().lockHash.length === 64; }), true);
  await reload(p);
  eq('app starts locked', await p.isVisible('#lockScreen'), true);
  await p.fill('#lockPin', '1111');
  await p.click('#lockBtn');
  await p.waitForFunction(function() { return document.getElementById('lockMsg').textContent === 'PIN hatalı.'; });
  eq('wrong PIN keeps lock', await p.isVisible('#lockScreen'), true);
  await p.fill('#lockPin', '2468');
  await p.click('#lockBtn');
  await p.waitForFunction(function() { return document.getElementById('lockScreen').hidden; });
  eq('right PIN unlocks', await p.isVisible('#lockScreen'), false);
  await r.ctx.close();
}

server.listen(0, '127.0.0.1', async function() {
  base = 'http://127.0.0.1:' + server.address().port;
  try {
    browser = await pw.chromium.launch();
    await run();
    await runAudit3b();
    await runAudit4();
  } catch (e) {
    fail++;
    console.log('✗ test run crashed: ' + (e && e.stack || e));
  } finally {
    if (browser) await browser.close();
    server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  }
});
