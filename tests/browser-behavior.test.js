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

server.listen(0, '127.0.0.1', async function() {
  base = 'http://127.0.0.1:' + server.address().port;
  try {
    browser = await pw.chromium.launch();
    await run();
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
