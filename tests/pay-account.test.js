// Usage: node tests/pay-account.test.js
// Elle işlem: "Ne ile ödedin?" seçicisi. Harcama seçilen kart/hesaptan düşer (kartta borç), formdan çıkmadan kart eklenir,
// kişinin son kullandığı hesap bir sonraki harcamada seçili gelir; gelirde varsayılan ortak hesap.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': u.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
srv.listen(0, async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, users: [{ id: 'u_self', name: 'Ben', emoji: '🙋', color: '#14b8a6' }, { id: 'u_es', name: 'Eş', emoji: '👩', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() })); localStorage.setItem('pf_a', JSON.stringify([{ id: 'a_sh', name: 'Ortak Hesap', type: 'bank', owner: 'shared', balance: 6000, openingBalance: 6000, ts: 1 }])); });
  await page.reload(); await page.waitForTimeout(300);
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); });
  eq('one account: picker shows it selected, add button and a hint', await page.evaluate(() => [[...document.querySelectorAll('#txnPayChips .pay-chip')].map(b => b.textContent), document.querySelector('.pay-chip.on').textContent, !!document.querySelector('.pay-hint'), getComputedStyle(document.getElementById('txnAccWrap')).display]), [['🏦 Ortak Hesap', '+ Kart / Hesap Ekle'], '🏦 Ortak Hesap', true, 'none']);
  await page.evaluate(() => document.querySelector('[data-acc="__new__"]').click()); await page.waitForTimeout(150);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="name"]').value = 'Akbank Axess'; m.querySelector('[data-pkey="bal"]').value = '1.500'; m.querySelector('[data-pkey="last4"]').value = '7777'; m.querySelector('[data-act="ok"]').click(); });
  await page.waitForTimeout(150);
  eq('quick add: card created with debt as negative balance, last4 kept, selected', await page.evaluate(() => { const a = S.accounts().find(x => x.name === 'Akbank Axess'); return [a.type, a.balance, a.last4, document.getElementById('txnAccount').value === a.id, document.querySelector('.pay-chip.on').textContent]; }), ['card', -1500, '7777', true, '💳 Akbank Axess …7777']);
  await page.evaluate(() => { document.getElementById('txnAmt').value = '250'; App.Transactions.add(); }); await page.waitForTimeout(150);
  eq('card expense: card debt grows, bank money untouched', await page.evaluate(() => S.accounts().map(a => [a.name, a.balance])), [['Ortak Hesap', 6000], ['Akbank Axess', -1750]]);
  await page.reload(); await page.waitForTimeout(300); await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); });
  eq('next expense: last used card preselected', await page.evaluate(() => document.querySelector('.pay-chip.on').textContent), '💳 Akbank Axess …7777');
  await page.evaluate(() => App.UI.setType('income'));
  eq('income: label and default (shared account)', await page.evaluate(() => [document.getElementById('txnPayLbl').textContent, document.querySelector('.pay-chip.on').textContent]), ['🏦 Hangi hesaba geldi?', '🏦 Ortak Hesap']);
  await page.evaluate(() => { App.UI.setType('expense'); document.querySelector('[data-acc="a_sh"]').click(); document.getElementById('txnAmt').value = '100'; App.Transactions.add(); }); await page.waitForTimeout(150);
  eq('tapping another chip pays from it', await page.evaluate(() => S.accounts().map(a => a.balance)), [5900, -1750]);
  eq('partner has own memory (shared account default)', await page.evaluate(() => { document.getElementById('txnUser').value = 'u_es'; App.UI.setType('income'); App.UI.setType('expense'); return document.querySelector('.pay-chip.on').textContent; }), '🏦 Ortak Hesap');
  eq('transfer mode: picker hidden, source/target selects shown', await page.evaluate(() => { App.UI.setType('transfer'); return ['txnPayWrap', 'txnAccWrap', 'txnToWrap'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none'); }), [false, true, true]);
  eq('balances consistent with history', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth), 390);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
