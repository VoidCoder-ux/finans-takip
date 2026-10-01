// Usage: node tests/ozet-summary.test.js [ekran-görüntüsü-klasörü]
// Özet: kredi kartıyla yapılan harcama bankadaki paradan düşmüş görünmemeli; kart borcu ayrı, net durum ayrı yazılmalı.
// Net servet grafiği silinip yeniden kurulmuş hesapların eski ay kayıtlarıyla sahte düşüş göstermemeli.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const now = new Date(), ym = k => iso(new Date(now.getFullYear(), now.getMonth() + k, 1)).slice(0, 7), today = iso(now), T = Date.now();

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  // Kullanıcının durumu: hesaplar bugün kuruldu; TLCARD 6.000; Hepsiburada kartıyla 115 TL market; eski aylarda başka hesaplardan kalma 60 bin kayıtları
  await page.evaluate(d => {
    localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now()));
    localStorage.setItem('pf_a', JSON.stringify([
      { id: 'a_tl', name: 'Yapıkredi TLCARD', type: 'bank', owner: 'shared', last4: '4359', balance: 6000, openingBalance: 6000, ts: d.T },
      { id: 'a_hb', name: 'Yapıkredi Hepsiburada', type: 'card', owner: 'shared', last4: '8191', balance: -115, openingBalance: 0, ts: d.T + 1 },
      { id: 'a_ax', name: 'Akbank Axess Gold', type: 'card', owner: 'personal', userId: 'u_self', last4: '1483', balance: 0, openingBalance: 0, ts: d.T + 2 }]));
    localStorage.setItem('pf_t', JSON.stringify([{ id: 't1', type: 'expense', amount: 115, category: 'Market', date: d.today, note: '', accountId: 'a_hb', userId: 'u_partner', ts: 1, balanceApplied: true }]));
    localStorage.setItem('pf_nw', JSON.stringify([{ month: d.m5, total: 60000, accounts: 60000 }, { month: d.m3, total: 60000, accounts: 60000 }, { month: d.m1, total: 6000, accounts: 6000 }]));
    localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, users: [{ id: 'u_self', name: 'Ben', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Eş', emoji: '💑', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() }));
  }, { T, today, m5: ym(-5), m3: ym(-3), m1: ym(-1) });
  await page.reload(); await page.waitForTimeout(500);
  await page.evaluate(() => App.UI.nav('ozet'));
  const hero = await page.evaluate(() => ['heroNet', 'heroCard', 'heroAfter', 'heroAcc'].map(id => document.getElementById(id).textContent).concat(document.querySelector('.hero-lbl').textContent));
  eq('hero: bank money stays 6.000; card debt and net after card debt separate', hero, ['₺6.000,00', '💳 Kart borcu ₺115,00', 'Kart borcu düşünce ₺5.885,00', '3 Hesap', 'Hesaplarımdaki Para']);
  eq('net worth = 5.885 with clear breakdown', await page.evaluate(() => [document.getElementById('nwVal').textContent, document.getElementById('nwFoot').innerText.replace(/\s+/g, ' ').trim().split(' 💎')[0]]), ['₺5.885,00', '🏦 ₺6.000,00 Hesaplardaki para 💳 −₺115,00 Kart borcu']);
  eq('no fake drop from old snapshots of deleted accounts (history starts when accounts were opened)', await page.evaluate(() => document.getElementById('nwDelta').textContent), 'İlk kayıt');
  eq('Ortak Cüzdan shows money in shared accounts, card debt in the note', await page.evaluate(() => { const r = document.querySelector('#ozet-family .wallet-row'); return [r.querySelector('.wr-bal').textContent, r.querySelector('.wr-cap').textContent, /kart borcu ₺115,00/.test(r.querySelector('.wr-meta').textContent)]; }), ['₺6.000,00', 'hesaplarda', true]);
  eq('person rows say what the number is', await page.evaluate(() => [...document.querySelectorAll('#ozet-family .wallet-row')].slice(1).map(r => [r.querySelector('.wr-name').textContent, r.querySelector('.wr-bal').textContent, r.querySelector('.wr-cap').textContent])), [['Ben', '₺0,00', 'bu ay net'], ['Eş', '-₺115,00', 'bu ay net']]);
  if (OUT) await page.screenshot({ path: OUT + '/ozet-new.png', fullPage: false });

  // Hesaplar aylar önce açıldıysa geçmiş korunur ve hareketlerden geri hesaplanır
  await page.evaluate(d => {
    const a = S.accounts(); a.forEach(x => { x.ts = d.old; }); S.saveAccounts(a);
    const t = S.txns(); t.push({ id: 't_old', type: 'income', amount: 1000, category: 'Maaş', date: d.m1 + '-15', note: '', accountId: 'a_tl', userId: 'u_self', ts: 2, balanceApplied: true }); S.saveTxns(t);
    const ac = S.accounts(); ac.find(x => x.id === 'a_tl').balance = 7000; S.saveAccounts(ac);
    App.NetWorth.render();
  }, { old: new Date(now.getFullYear(), now.getMonth() - 4, 1).getTime(), m1: ym(-1) });
  eq('older accounts: history kept from their opening month, last month rebuilt from transactions', await page.evaluate(() => document.getElementById('nwDelta').textContent), '▼ ₺115,00 (-%1,6)');

  // Kart borcu yokken
  await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_hb').balance = 0; S.saveAccounts(a); App.Accounts.renderSummary(); });
  eq('no card debt', await page.evaluate(() => document.getElementById('heroCard').textContent), '💳 Kart borcu yok');
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
