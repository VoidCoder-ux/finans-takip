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
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}

eq('CSV formula is escaped', csvSafe('=IMPORTXML("x")'), '"\'=IMPORTXML(""x"")"');
eq('CSV plus formula is escaped', csvSafe('+cmd'), '"\'+cmd"');
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
ok('direct DeepSeek call is available only through assistant key flow', /pf_direct_ai_key/.test(indexHtml) && /api\.deepseek\.com\/chat\/completions/.test(indexHtml));
ok('AI proxy URL setting exists', /aiProxyUrl/.test(indexHtml));
ok('local no-key analysis fallback exists', /Yerel analiz/.test(indexHtml) && /API key, proxy veya dış servis kullanılmadı/.test(indexHtml));

var sw = fs.readFileSync('sw.js', 'utf8');
ok('service worker only caches ok HTML responses', /if \(resp && resp\.ok\)/.test(sw));
ok('service worker keeps external APIs no-store', /cache: 'no-store'/.test(sw) && /API_HOSTS/.test(sw));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
