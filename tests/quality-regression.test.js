// Usage: node tests/quality-regression.test.js
// Focused regressions for storage, CSV, installment, AI, and service worker hardening.

var fs = require('fs');
var pass = 0, fail = 0;

function eq(label, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  (ok ? pass++ : fail++);
  console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(actual) + (ok ? '' : ' (expected ' + JSON.stringify(expected) + ')'));
}

function ok(label, value) {
  (value ? pass++ : fail++);
  console.log((value ? '✓' : '✗') + ' ' + label);
}

function csvSafe(v) {
  v = String(v == null ? '' : v);
  if (/^[\t\r=+\-@]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}

eq('CSV formula is escaped', csvSafe('=IMPORTXML("x")'), '"\'=IMPORTXML(""x"")"');
eq('CSV plus formula is escaped', csvSafe('+cmd'), '"\'+cmd"');
eq('CSV tab-prefixed formula is escaped', csvSafe('\t=HYPERLINK("x")'), '"\'\t=HYPERLINK(""x"")"');
eq('CSV normal text remains normal', csvSafe('Market'), '"Market"');

function validDate(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  var d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

eq('valid real date passes', validDate('2026-04-27'), true);
eq('invalid month fails', validDate('2026-99-10'), false);
eq('invalid leap day fails', validDate('2026-02-29'), false);

function parseAmount(v) {
  v = String(v || '').trim();
  if (!v) return NaN;
  if (v.indexOf(',') >= 0) {
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(v)) return NaN;
    return Number(v.replace(/\./g, '').replace(',', '.'));
  }
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  return Number(v);
}

eq('strict amount parses Turkish decimal', parseAmount('1.234,56'), 1234.56);
ok('strict amount rejects mixed suffix', Number.isNaN(parseAmount('123abc')));

var MAX_MONEY = 1000000000000;
function roundMoney(n) {
  n = Number(n);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function parseMoney(v, opt) {
  opt = opt || {};
  var min = opt.min != null ? opt.min : (opt.allowZero ? 0 : .01);
  var max = opt.max || MAX_MONEY;
  var n;
  if (typeof v === 'number') n = v;
  else {
    var s = String(v == null ? '' : v).trim();
    if (!s || /[eE]/.test(s) || /^(nan|infinity|-infinity)$/i.test(s)) return null;
    if (s.indexOf(',') >= 0) {
      if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(s)) return null;
      n = Number(s.replace(/\./g, '').replace(',', '.'));
    } else {
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      n = Number(s);
    }
  }
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return opt.round === false ? n : roundMoney(n);
}

eq('money parser accepts Turkish decimal', parseMoney('1.234,56'), 1234.56);
eq('money parser accepts dot decimal', parseMoney('1234.56'), 1234.56);
eq('money parser allows negative opening balance', parseMoney('-100.25', { min: -MAX_MONEY, allowZero: true }), -100.25);
eq('money parser rejects zero by default', parseMoney('0'), null);
eq('money parser rejects scientific notation', parseMoney('1e309'), null);
eq('money parser rejects Infinity', parseMoney('Infinity'), null);
eq('money parser rejects mixed suffix', parseMoney('123abc'), null);

function safeColor(v) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : '#3b82f6'; }
eq('safe color accepts hex', safeColor('#14b8a6'), '#14b8a6');
eq('safe color rejects CSS injection', safeColor('red;position:absolute'), '#3b82f6');

function goalSaved(g) {
  return (g.contributions || []).reduce(function(s, c) { return s + (c.amount || 0); }, 0);
}
eq('goal saved derives from contributions', goalSaved({ contributions: [{ amount: 10 }, { amount: 15.5 }] }), 25.5);

function reconcileInstallments(txns, accounts, today) {
  var balances = {}, changed = 0;
  txns.forEach(function(t) {
    if (t.balanceApplied !== false || t.date > today || !t.accountId) return;
    t.balanceApplied = true;
    if (t.installment) t.installment.balanceApplied = true;
    changed++;
    balances[t.accountId] = (balances[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount);
  });
  Object.keys(balances).forEach(function(id) {
    var a = accounts.find(function(x) { return x.id === id; });
    if (a) a.balance += balances[id];
  });
  return changed;
}

var txns = [
  { type: 'expense', amount: 100, date: '2026-04-01', accountId: 'a1', balanceApplied: false, installment: { balanceApplied: false } },
  { type: 'expense', amount: 50, date: '2026-05-01', accountId: 'a1', balanceApplied: false, installment: { balanceApplied: false } },
  { type: 'expense', amount: 20, date: '2026-04-01', accountId: 'a1', balanceApplied: true, installment: { balanceApplied: true } },
  { type: 'income', amount: 75, date: '2026-04-20', accountId: 'a1', balanceApplied: false },
  { type: 'income', amount: 40, date: '2026-12-31', accountId: 'a1', balanceApplied: false }
];
var accounts = [{ id: 'a1', balance: 1000 }];
eq('reconcile applies due planned transactions once', reconcileInstallments(txns, accounts, '2026-04-27'), 2);
eq('reconcile updates account balance', accounts[0].balance, 975);
eq('reconcile second pass is idempotent', reconcileInstallments(txns, accounts, '2026-04-27'), 0);
eq('reconcile idempotent balance', accounts[0].balance, 975);
eq('future normal transaction remains unapplied', txns[4].balanceApplied, false);

var indexHtml = fs.readFileSync('index.html', 'utf8');
ok('expense categories include credit payment options', /var EC=\[[^\]]*'Kredi Ödemesi'[^\]]*'Kredi Kartı Ödemesi'[^\]]*'Borç Ödemesi'[^\]]*\]/.test(indexHtml));
ok('credit payment categories have icons and colors', /'Kredi Ödemesi':\{i:'🏦',c:'cc-blue'\}/.test(indexHtml) && /'Kredi Kartı Ödemesi':\{i:'💳',c:'cc-red'\}/.test(indexHtml) && /'Borç Ödemesi':\{i:'🤝',c:'cc-purple'\}/.test(indexHtml));
ok('client no longer stores DeepSeek API key setting', !/saveSetting\('deepseekApiKey'/.test(indexHtml));
ok('direct DeepSeek key is session-only', /sessionStorage\.setItem\(KEY_STORE/.test(indexHtml) && !/localStorage\.setItem\(KEY_STORE/.test(indexHtml));
ok('AI privacy modes exist', /value="local"/.test(indexHtml) && /value="proxy"/.test(indexHtml) && /value="direct"/.test(indexHtml));
ok('AI proxy URL setting exists', /aiProxyUrl/.test(indexHtml));
ok('local no-key analysis fallback exists', /Yerel analiz/.test(indexHtml) && /API key, proxy veya dış servis kullanılmadı/.test(indexHtml));

ok('backup and onboarding modules exist', /App\.Backup=\(function/.test(indexHtml) && /App\.Onboarding=\(function/.test(indexHtml));
ok('cashflow and account selection exist', /App\.Cashflow=\(function/.test(indexHtml) && /id="txnAccount"/.test(indexHtml));
ok('goal account binding and portfolio targets exist', /id="gAccount"/.test(indexHtml) && /portfolioTargets/.test(indexHtml));

var sw = fs.readFileSync('sw.js', 'utf8');
ok('service worker only caches ok HTML responses', /if \(resp && resp\.ok\)/.test(sw));
ok('service worker keeps external APIs no-store', /cache: 'no-store'/.test(sw) && /API_HOSTS/.test(sw));

// FT-009: Recurring duplicate prevention
ok('recurring log uses recurringId for duplicate check', /t\.recurringId===rec\.id/.test(indexHtml));
ok('recurring log checks same month duplicate', /t\.date\.substring\(0,7\)===currentMonth/.test(indexHtml));

// FT-010: Debt payment overflow check
ok('debt addPayment checks remaining before adding', /rem=d\.amount-paid/.test(indexHtml));
ok('debt addPayment rejects overpayment', /amt>rem\+0\.001/.test(indexHtml));

// FT-011: Stats bar chart month selection
ok('last6 accepts optional baseMonth parameter', /last6\(baseMonth/.test(indexHtml));
ok('chart refresh passes selected month to last6', /last6\(month\)/.test(indexHtml));

// FT-005: Account balance reconciliation
ok('accounts have openingBalance field', /openingBalance/.test(indexHtml));
ok('reconcileAccountBalances function exists', /reconcileAccountBalances/.test(indexHtml));
ok('reconcileAccountBalances called on startup', /App\.Accounts\.reconcileAccountBalances\(\)/.test(indexHtml));

// FT-013: Notifications expanded scope
ok('notifications cover installments', /kind:'inst'/.test(indexHtml));
ok('notifications cover funds', /kind:'fund'/.test(indexHtml));
ok('notifications cover debts', /kind:'debt'/.test(indexHtml));

// FT-014: ICS UID stability
ok('ICS UID uses date instead of loop index', /r\.id\+['"]-['"]\+date/.test(indexHtml));

// FT-003: CSV Hesap column import
ok('CSV import reads Hesap column', /iAcc=col\('hesap'\)/.test(indexHtml));
ok('CSV import matches account by name', /accounts\.find\(function\(a\)\{return a\.name===accName\}/.test(indexHtml));

// FIX: type pill state classes no longer collide with .ti txn-item styles
ok('type pill uses on-inc state class', /\.tp\.on-inc\{/.test(indexHtml) && /' on-inc'/.test(indexHtml));
ok('type pill no longer reuses .ti class', !/\.tp\.ti\{/.test(indexHtml));

// FIX: budget carryover tracks its start month (no phantom rollover)
ok('budget carryover stores carryStart', /carryStart=tm\(\)/.test(indexHtml));
ok('rollover skips months before carryStart', /if\(m<start\)continue/.test(indexHtml));

// FIX: CSV dedup signature includes userId
ok('CSV dedup seen-map includes userId', /t\.userId\|\|''\]\.join\('\|'\)/.test(indexHtml));
ok('CSV dedup sig includes userId', /acc\.id,uid\|\|''\]\.join\('\|'\)/.test(indexHtml));

// FIX: csvSafe blocks tab/CR-prefixed formulas
ok('csvSafe escapes tab and CR prefixes', /\^\[\\t\\r=\+\\-@\]/.test(indexHtml));

// FIX: installment + CSV loop ids are collision-free within the same millisecond
ok('installment txn ids carry loop index', /id:gid\('t'\)\+'_'\+i/.test(indexHtml));
ok('CSV import txn ids carry row index', /id:gid\('t'\)\+'_'\+added/.test(indexHtml));

// FIX: backup restore rolls back on quota failure
ok('restore keeps previous values for rollback', /prev\[k\]=localStorage\.getItem\(k\)/.test(indexHtml));

// FIX: user removal clears userId on recurring templates
ok('user removal cleans recurring userId', /recs\.forEach\(function\(r\)\{if\(r\.userId===id\)\{r\.userId=null/.test(indexHtml));

// FIX: offline/online listeners + SW failure toast
ok('offline listener exists', /addEventListener\('offline'/.test(indexHtml));
ok('online listener exists', /addEventListener\('online'/.test(indexHtml));

// FIX: vendor chart.js pinned with SRI
ok('chart.js script has integrity attribute', /chart\.umd\.min\.js" integrity="sha384-/.test(indexHtml));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
