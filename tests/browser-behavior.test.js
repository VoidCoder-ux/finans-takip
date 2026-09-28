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
  eq('budget usage ignores unbudgeted categories', kpis[3], '%50,0');
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

// Eşitleme birleştirmesi (sunucusuz, saf fonksiyon): tests/sync-e2e.test.js gerçek sunucuyla aynı kuralları doğrular
async function runMergeCases() {
  var r = await openApp({});
  var p = r.page;
  var res = await p.evaluate(function() {
    var t = function(id, amount, note) { return { id: id, type: 'expense', amount: amount, note: note || '' }; };
    var base = { stores: { pf_t: [t('t1', 10), t('t2', 20), t('t3', 30)], pf_b: { Market: 100 } }, s: { users: [{ id: 'u1', name: 'Ben' }] } };
    var local = { stores: { pf_t: [Object.assign(t('t1', 10), { note: 'yerel not' }), t('t3', 30), t('t4', 40)], pf_b: { Market: 150 } }, s: { users: [{ id: 'u1', name: 'Ben' }, { id: 'u2', name: 'Eş' }] } };
    var remote = { stores: { pf_t: [Object.assign(t('t1', 15)), t('t2', 20), t('t5', 50)], pf_b: { Market: 100, Yiyecek: 80 } }, s: { users: [{ id: 'u1', name: 'Ben (uzak)' }] } };
    var m = mergeSnapshot(base, local, remote);
    // düzenleme vs silme
    var m2 = mergeSnapshot({ stores: { pf_t: [t('x', 1)] }, s: {} }, { stores: { pf_t: [] }, s: {} }, { stores: { pf_t: [t('x', 2)] }, s: {} });
    // iç içe liste: aynı hedefe iki cihazdan katkı
    var g = function(c) { return { stores: { pf_g: [{ id: 'g1', name: 'Tatil', contributions: c }] }, s: {} }; };
    var m3 = mergeSnapshot(g([{ id: 'c1', amount: 5 }]), g([{ id: 'c1', amount: 5 }, { id: 'c2', amount: 7 }]), g([{ id: 'c1', amount: 5 }, { id: 'c3', amount: 9 }]));
    return {
      ids: m.stores.pf_t.map(function(x) { return x.id; }),
      t1: [m.stores.pf_t[0].amount, m.stores.pf_t[0].note],
      budget: m.stores.pf_b,
      users: m.s.users.map(function(u) { return u.name; }),
      editBeatsDelete: m2.stores.pf_t.map(function(x) { return x.amount; }),
      nested: m3.stores.pf_g[0].contributions.map(function(c) { return c.id; }),
      // silinen kayıt, diğer cihazın yalnız otomatik "bakiyeye işlendi" güncellemesiyle geri gelmemeli
      normalized: mergeSnapshot({ stores: { pf_t: [t('n', 4)] }, s: {} }, { stores: { pf_t: [] }, s: {} }, { stores: { pf_t: [Object.assign(t('n', 4), { transferId: '', recurringId: '', installment: null })] }, s: {} }).stores.pf_t.length,
      derived: mergeSnapshot({ stores: { pf_t: [Object.assign(t('d', 3), { balanceApplied: false })] }, s: {} }, { stores: { pf_t: [] }, s: {} }, { stores: { pf_t: [Object.assign(t('d', 3), { balanceApplied: true })] }, s: {} }).stores.pf_t.length
    };
  });
  eq('merge: union of adds; t2 deleted here, t3 deleted remotely', res.ids, ['t1', 't4', 't5']);
  eq('merge: field-level (remote amount + local note)', res.t1, [15, 'yerel not']);
  eq('merge: map keys merged', res.budget, { Market: 150, Yiyecek: 80 });
  eq('merge: shared settings merged by id', res.users, ['Ben (uzak)', 'Eş']);
  eq('merge: edit beats concurrent delete', res.editBeatsDelete, [2]);
  eq('merge: nested contributions from two devices kept', res.nested, ['c1', 'c2', 'c3']);
  eq('merge: automatic balanceApplied change does not resurrect a deleted record', res.derived, 0);
  eq('merge: fields filled with empty defaults on load do not resurrect a deleted record', res.normalized, 0);
  await r.ctx.close();
}

// Tekrarlayan işlemde "Kimin?": eşin maaşı eşe yazılır; yanlış kişiyle eklenmişse geçmiş kayıtlarla birlikte düzeltilir
async function runRecurringOwner() {
  var A = 'a1700000000000_rrrr';
  var r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 0)] });
  var p = r.page;
  await p.evaluate(function() { App.UI.nav('tekrarlayan'); });
  eq('recurring form lists family members', await p.evaluate(function() { return Array.prototype.map.call(document.querySelectorAll('#recUser option'), function(o) { return o.value; }); }), ['u_self', 'u_partner']);
  await p.selectOption('#recType', 'income');
  await p.fill('#recAmt', '50000');
  await p.selectOption('#recCat', 'Maaş');
  await p.fill('#recDay', '1');
  await p.fill('#recNote', 'Eşimin maaşı');
  await p.selectOption('#recUser', 'u_partner');
  await p.evaluate(function() { App.Recurring.add(); });
  var rid = await p.evaluate(function() { return S.recurring()[0].id; });
  eq('recurring saved for chosen member', await p.evaluate(function() { return S.recurring()[0].userId; }), 'u_partner');
  eq('member name visible on recurring card', (await p.textContent('#recList')).indexOf('Eş') >= 0, true);
  await p.evaluate(function(id) { App.Recurring.log(id); }, rid);
  var stats = await p.evaluate(function() { return [App.Users.stats('u_self').income, App.Users.stats('u_partner').income, S.txns()[0].userId]; });
  eq('logged salary counts for spouse, not for me', stats, [0, 50000, 'u_partner']);
  // Yanlışlıkla bana yazılmış eski maaş: düzenle → Eş, geçmiş kayıtlar da düzelsin
  await p.evaluate(function(a) {
    var rec = S.recurring(); rec.push({ id: 'r1700000000000_wrng', type: 'income', amount: 30000, category: 'Maaş', day: 5, note: 'Eski kayıt', accountId: a, userId: 'u_self', isSubscription: false, active: true, ts: 1 }); S.saveRecurring(rec);
    var t = S.txns(); t.push({ id: 't1700000000000_wrg1', type: 'income', amount: 30000, category: 'Maaş', date: '2026-01-05', note: 'Eski kayıt', accountId: a, userId: 'u_self', recurringId: 'r1700000000000_wrng', ts: 1, balanceApplied: true }); S.saveTxns(t);
    App.Recurring.edit('r1700000000000_wrng');
  }, A);
  await submitPrompt(p, { userId: 'u_partner', pastUser: '1' });
  eq('editing owner fixes past logged transactions', await p.evaluate(function() { return [S.recurring().find(function(x) { return x.id === 'r1700000000000_wrng'; }).userId, S.txns().find(function(t) { return t.id === 't1700000000000_wrg1'; }).userId]; }), ['u_partner', 'u_partner']);
  await r.ctx.close();
}

// Kalite kontrol denetimi (QC) bulguları: tekrarlayan otomatik kayıt, yedek, CSV, yuvarlama, fon, borç, pencere doğrulaması
async function runQC() {
  var A = 'a1700000000000_qcqc';
  var cur = iso(now).slice(0, 7), m3 = iso(new Date(now.getFullYear(), now.getMonth() - 3, 1)).slice(0, 7);
  var r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 10000)], pf_r: [
    { id: 'r1700000000000_auto', type: 'expense', amount: 100, category: 'Faturalar', day: 1, note: 'Kira', accountId: A, userId: 'u_self', active: true, autoLog: true, autoFrom: m3, ts: 1 },
    { id: 'r1700000000000_paus', type: 'expense', amount: 50, category: 'Eğlence', day: 1, note: 'Dizi', accountId: A, userId: 'u_self', active: false, autoLog: true, autoFrom: m3, autoDone: m3, ts: 1 }
  ] });
  var p = r.page;
  var st = await p.evaluate(function() { return { n: S.txns().filter(function(t) { return t.recurringId === 'r1700000000000_auto'; }).length, done: S.recurring()[0].autoDone, ids: S.txns().map(function(t) { return t.id; }), bal: S.accounts()[0].balance }; });
  eq('auto-log backfills due months once', [st.n, st.done, st.bal], [4, cur, 9600]);
  eq('auto-log ids are per month (devices merge into one)', st.ids.indexOf('trr1700000000000_auto_' + cur.replace('-', '')) >= 0, true);
  await p.evaluate(function(id) { App.Transactions.remove(id); }, 'trr1700000000000_auto_' + cur.replace('-', ''));
  await p.reload(); await p.waitForFunction(function() { return window.App && App.Transactions; });
  eq('deleted auto-log is not re-created on next open', await p.evaluate(function() { return [S.txns().filter(function(t) { return t.recurringId === 'r1700000000000_auto'; }).length, S.accounts()[0].balance]; }), [3, 9700]);
  await p.evaluate(function() { App.Recurring.togglePause('r1700000000000_paus'); });
  await p.reload(); await p.waitForFunction(function() { return window.App && App.Transactions; });
  eq('resuming a paused auto-log does not charge paused months', await p.evaluate(function() { return S.txns().filter(function(t) { return t.recurringId === 'r1700000000000_paus'; }).length; }), 0);
  // Biçim ve ayrıştırma
  eq('no negative zero from float residue', await p.evaluate(function() { return fmt(100.1 + 200.2 - 300.3); }), '₺0,00');
  eq('dot parsing: 0.500 money, 1.500 thousands, 1.234 qty', await p.evaluate(function() { return [parseMoney('0.500'), parseMoney('1.500'), parseQty('1.234')]; }), [0.5, 1500, 1.234]);
  eq('csv header/type folding and formula-guard strip', await p.evaluate(function() { return [csvFold('TARIH'), csvFold('AÇIKLAMA'), csvFold('GIDER'), csvText("'-avans"), csvText("'=SUM(A1)"), csvText("normal")]; }), ['tarih', 'aciklama', 'gider', '-avans', '=SUM(A1)', 'normal']);
  eq('goal completes despite float sums', await p.evaluate(function() { return !!App.Goals.refreshDone({ target: 0.8, contributions: [{ amount: 0.7 }, { amount: 0.1 }], done: null }).done; }), true);
  // Yıllık fon döngüsü
  eq('yearly fund: overdue shortly after due, paid moves one year, year boundary', await p.evaluate(function() {
    var ts = new Date(2025, 0, 1).getTime(), N = App.YearlyFund.nextDue;
    var a = N({ dueMonth: 3, paidYear: 0, contributed: 0, ts: ts }, new Date(2026, 3, 15));
    var b = N({ dueMonth: 3, paidYear: a.year, contributed: 0, ts: ts }, new Date(2026, 3, 15));
    var c = N({ dueMonth: 12, paidYear: 0, contributed: 9000, ts: ts }, new Date(2027, 0, 10));
    var d = N({ dueMonth: 3, paidYear: 0, contributed: 0, ts: ts }, new Date(2026, 8, 15));
    return [a.year, a.overdue, b.year, b.overdue, c.year, c.overdue, d.year, d.overdue];
  }), [2026, true, 2027, false, 2026, true, 2027, false]);
  // Planlı kayıt ay toplamına bugün gelmeden girmez
  eq('month totals exclude future-dated plans', await p.evaluate(function(a) {
    var fut = new Date(); fut.setDate(fut.getDate() + 1); var f = fut.getFullYear() + '-' + String(fut.getMonth() + 1).padStart(2, '0') + '-' + String(fut.getDate()).padStart(2, '0');
    var before = App.Transactions.monthTotals(f.slice(0, 7)).expense, t = S.txns();
    t.push({ id: 't1700000000000_futr', type: 'expense', amount: 777, category: 'Market', date: f, note: '', accountId: a, userId: 'u_self', ts: 1, balanceApplied: false }); S.saveTxns(t);
    return App.Transactions.monthTotals(f.slice(0, 7)).expense - before;
  }, A), 0);
  // Borç: ileri tarihli ödeme reddedilir
  await p.evaluate(function(a) {
    S.saveDebts([{ id: 'd1700000000000_qc01', direction: 'borrowed', person: 'X', amount: 1000, date: td(), hasDue: false, dueDate: '', note: '', accountId: '', txnId: '', payments: [], settled: false, ts: 1 }]);
    App.UI.nav('borclar'); App.Debts.renderAll(); App.Debts.togglePay('d1700000000000_qc01');
    document.getElementById('pay_amt_d1700000000000_qc01').value = '400'; document.getElementById('pay_date_d1700000000000_qc01').value = '2099-01-01'; App.Debts.addPayment('d1700000000000_qc01');
  }, A);
  eq('future-dated debt payment rejected', await p.evaluate(function() { return S.debts()[0].payments.length; }), 0);
  // Düzenleme penceresi hatalı tutarda açık kalır
  var tid = await p.evaluate(function(a) { var t = S.txns(); t.push({ id: 't1700000000000_edit', type: 'expense', amount: 10, category: 'Market', date: td(), note: '', accountId: a, userId: 'u_self', ts: 1, balanceApplied: true }); S.saveTxns(t); App.Transactions.edit('t1700000000000_edit'); return 't1700000000000_edit'; }, A);
  await submitPrompt(p, { amount: 'abc' });
  eq('edit modal stays open on invalid amount', await p.evaluate(function() { return document.querySelectorAll('.app-dialog-holder').length; }), 1);
  await submitPrompt(p, { amount: '449,9' });
  eq('edit modal closes after valid save', await p.evaluate(function(id) { return [document.querySelectorAll('.app-dialog-holder').length, S.txns().find(function(t) { return t.id === id; }).amount]; }, tid), [0, 449.9]);
  await p.evaluate(function(id) { App.Transactions.edit(id); }, tid);
  eq('edit field shows two decimals (449,90)', await p.evaluate(function() { return document.querySelector('.app-dialog-holder [data-pkey="amount"]').value; }), '449,90');
  await p.keyboard.press('Escape');
  // İç hareket (borç/portföy) düzenlemesinde yalnız not
  await p.evaluate(function(a) { var id = App.Transactions.addInternal({ type: 'expense', amount: 200, date: td(), accountId: a, note: 'Borç verildi: Y' }); App.Transactions.edit(id); }, A);
  eq('internal movement edit offers only the note', await p.evaluate(function() { return Array.prototype.map.call(document.querySelectorAll('.app-dialog-holder [data-pkey]'), function(x) { return x.getAttribute('data-pkey'); }); }), ['note']);
  await p.keyboard.press('Escape');
  // Bozuk yedek mevcut veriyi silmez
  var before = await p.evaluate(function() { return S.txns().length; });
  await p.evaluate(function() { App.Backup.restore({ files: [new File(['{"app":"finanstakip","stores":{"pf_t":"garbage","pf_a":{"x":1}}}'], 'b.json', { type: 'application/json' })] }); });
  await p.waitForTimeout(300);
  eq('malformed backup is rejected without a confirm', await p.evaluate(function() { return document.querySelectorAll('.app-dialog-holder').length; }), 0);
  eq('data intact after malformed backup', await p.evaluate(function() { return S.txns().length; }), before);
  await r.ctx.close();
}

// Her telefon kendi profilini hatırlar; "Kim yaptı" varsayılanı o profil, kayıt başına değiştirilebilir; profil eşitlenmez
async function runDeviceProfile() {
  var A = 'a1700000000000_dvce';
  var r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000)] });
  var p = r.page;
  await p.evaluate(function() { App.UI.nav('ayarlar'); App.Users.chooseDevice(); });
  await submitPrompt(p, { u: 'u_partner' });
  eq('device profile chosen and form follows it', await p.evaluate(function() { return [S.settings().activeUser, document.getElementById('txnUser').value, document.getElementById('recUser').value, document.getElementById('setDeviceCard').textContent.indexOf('Eş') >= 0]; }), ['u_partner', 'u_partner', 'u_partner', true]);
  await p.evaluate(function() { App.UI.nav('islemler'); App.UI.setType('expense'); });
  await p.fill('#txnAmt', '120'); await p.selectOption('#txnAccount', A); await p.selectOption('#txnUser', 'u_self');
  await p.evaluate(function() { App.Transactions.add(); });
  eq('who-did-it can be changed per entry, then returns to device profile', await p.evaluate(function() { return [S.txns()[0].userId, document.getElementById('txnUser').value]; }), ['u_self', 'u_partner']);
  eq('active profile is not part of synced data', await p.evaluate(function() { var c = App.Sync.collect(); return [Object.prototype.hasOwnProperty.call(c.s || {}, 'activeUser'), Object.prototype.hasOwnProperty.call(c.s || {}, 'users')]; }), [false, true]);
  await p.reload(); await p.waitForFunction(function() { return window.App && App.Transactions; });
  eq('device profile survives restart', await p.evaluate(function() { return [S.settings().activeUser, document.getElementById('txnUser').value]; }), ['u_partner', 'u_partner']);
  await r.ctx.close();
}

// Fiş okutma: telefonda okunan metinden toplam/tarih/mağaza/kategori, karekod, kontrol penceresinden gider kaydı
async function runReceipt() {
  var A = 'a1700000000000_rcpt';
  var r = await openApp({ pf_a: [acc(A, 'Banka', 'bank', 1000)] });
  var p = r.page;
  var res = await p.evaluate(function() {
    var P = App.Receipt.parseText;
    var a = P(['MİGROS TİCARET A.Ş.', 'ATAŞEHİR MAĞAZASI', 'TARİH : 27.09.2026 SAAT : 18:42', 'FİŞ NO : 0042', 'SÜT 1L *34,90', 'EKMEK *12,50', 'DETERJAN 3KG *249,00', 'TOPKDV *25,76', 'TOPLAM *296,40', 'NAKİT *300,00', 'PARA ÜSTÜ *3,60'].join('\n'));
    var b = P(['OPET PETROLCÜLÜK A.Ş.', 'TARİH 14/09/2026', 'KURŞUNSUZ 95 40,12 LT', 'ARA TOPLAM 1.100,00', 'KDV 134,56', 'GENEL TOPLAM 1.234,56', 'KREDİ KARTI 1.234,56'].join('\n'));
    var c = P(['ECZANE ŞİFA', '05.09.26 10:12', 'İLAÇ *45,50', 'TOPLAM', '*45,50'].join('\n'));
    var d = P('bulanık yazı\nhiç tutar yok');
    var e = P(['A101 YENİ MAĞAZACILIK', '12.O9.2026', 'SU *15,OO', 'T0PLAM *29O,4O', 'KREDİ KARTI *290,40'].join('\n'));
    var f = P(['BAKKAL', 'EKMEK *12,50', 'NAKİT *200,00', 'TOPLAM *112,50', 'PARA ÜSTÜ *87,50'].join('\n'));
    window.__qcExtra = [[e.total, e.date, e.confident], [f.total]];
    // Gerçek taranmış fişlerden (iPhone Dosyalar > Belgeleri Tara) yazı tanıma çıktıları: mağaza adı bozuk, "*" → "4", KDV'li ödenecek satırı
    var bimBin = P(['AYSA;', 'E-Arsiv atura', 'BIN BİRLESİK YALAZALAR A.S.', 'DUTLU ÇE WH. KARACAOCLAN CD. ANA APT.', '12.08.2026 17:56            Sira No : 58', 'GAZOZ 2.5 L ULUDAĞ — $10        4145.00', 'TOPLAN KDV               116,13', 'denecek KOY Dahil Tutar        4411.33', 'Banka Kredi Kartı (1)          4411,33'].join('\n'));
    var bimGray = P(['E-Ârsiv atura', 'BIN BİRLESİK MALAZALAR A.S,', '12.08.2026 17:56            Sira No : 58', 'TOPLAN KOV |               “16,13', 'Ödenecek KDV Dahil Tutar        *411,33', 'Banka Kredi Kartı (1)          *411,33'].join('\n'));
    var bim = App.Receipt._debug.merge(bimBin, bimGray);
    var a101 = P(['Maz Adi :Dutlubahce Antol / Maz Kodu:3305', 'ALO1 YENİ MAGAZALCILIK R.S.', 'Dutlubahçe Mah.Fatih -ed.', 'TARIH 21 09 2026', 'SAAT     15:14', 'TÜR : E-ARSIV FATURA', 'TOPKOV            OT 83.06', 'TOPLAM                :    :     X1005,80', 'DİĞER                          *1005,80', 'A101 Hediye Ceki'].join('\n'));
    window.__real = [[bimBin.merchant, bimBin.category], [bim.total, bim.date, bim.merchant, bim.category], [a101.total, a101.date, a101.merchant, a101.category]];
    var q = App.Receipt.parseQr('{"vkntckn":"1234567890","tarih":"2026-09-20","odenecek":"523.40","parabirimi":"TRY"}');
    return [[a.total, a.date, a.merchant, a.category, a.confident], [b.total, b.date, b.merchant, b.category], [c.total, c.date, c.category], [d.total, d.confident], [q && q.total, q && q.date], App.Receipt.parseQr('https://example.com')];
  });
  eq('receipt text: total, date, merchant, category', res[0], [296.4, '2026-09-27', 'Migros', 'Market', true]);
  eq('receipt text: GENEL TOPLAM with thousands, not KDV/ARA TOPLAM', res[1], [1234.56, '2026-09-14', 'Opet', 'Ulaşım']);
  eq('receipt text: amount on the line after TOPLAM, 2-digit year', res[2], [45.5, '2026-09-05', 'Sağlık']);
  eq('receipt text: nothing readable', res[3], [0, false]);
  eq('e-Arşiv QR read, other QR ignored', [res[4], res[5]], [[523.4, '2026-09-20'], null]);
  eq('OCR letter/digit mix-ups and card line agree (T0PLAM *29O,4O)', await p.evaluate(function() { return window.__qcExtra[0]; }), [290.4, '2026-09-12', true]);
  eq('cash handed over is not taken as the total', await p.evaluate(function() { return window.__qcExtra[1]; }), [112.5]);
  eq('garbled chain name recognised (BİM), e-Arşiv "Fatura" header is not Faturalar', await p.evaluate(function() { return window.__real[0]; }), ['BİM', 'Market']);
  eq('two OCR passes merged: starred *411,33 beats misread 4411,33', await p.evaluate(function() { return window.__real[1]; }), [411.33, '2026-08-12', 'BİM', 'Market']);
  eq('A101: garbled name, space-separated date, TOPKDV skipped', await p.evaluate(function() { return window.__real[2]; }), [1005.8, '2026-09-21', 'A101', 'Market']);
  // Kontrol penceresi → gider kaydı (hesap bakiyesi, kişi, kategori)
  await p.evaluate(function() { App.Receipt.review({ total: 296.4, date: td(), merchant: 'Migros', category: 'Market', items: [{ name: 'Süt', amount: 34.9 }], confident: true }, 'ai'); });
  eq('review modal pre-filled', await p.evaluate(function() { var h = document.getElementById('rcpReview'); return [h.querySelector('[data-rk="amount"]').value, h.querySelector('[data-rk="category"]').value, h.querySelector('[data-rk="userId"]').value, h.querySelectorAll('.rcp-items div').length]; }), ['296,40', 'Market', 'u_self', 1]);
  await p.evaluate(function() { var h = document.getElementById('rcpReview'); h.querySelector('[data-rk="amount"]').value = 'abc'; h.querySelector('[data-act="ok"]').click(); });
  eq('invalid amount keeps review open', await p.evaluate(function() { return !!document.getElementById('rcpReview'); }), true);
  await p.evaluate(function() { var h = document.getElementById('rcpReview'); h.querySelector('[data-rk="amount"]').value = '296,40'; h.querySelector('[data-act="ok"]').click(); });
  eq('receipt saved as expense and balance updated', await p.evaluate(function(a) { var t = S.txns()[0]; return [!!document.getElementById('rcpReview'), t.type, t.amount, t.category, t.note, t.accountId === a, t.userId, S.accounts()[0].balance]; }, A), [false, 'expense', 296.4, 'Market', 'Migros — Süt', true, 'u_self', 703.6]);
  await r.ctx.close();
}

server.listen(0, '127.0.0.1', async function() {
  base = 'http://127.0.0.1:' + server.address().port;
  try {
    browser = await pw.chromium.launch();
    await run();
    await runAudit3b();
    await runAudit4();
    await runMergeCases();
    await runRecurringOwner();
    await runQC();
    await runDeviceProfile();
    await runReceipt();
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
