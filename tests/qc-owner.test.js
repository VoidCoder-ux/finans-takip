// Usage: node tests/qc-owner.test.js
// Hesap sahibi (kurmaca veri, sunucu gerekmez; bugün 22 Ekim 2026 sabit):
//  1) Hesap düzenle: sahip Ortak ↔ Kişisel değişir; istenirse geçmiş işlemlerin "Kim Yaptı"sı sahibine geçer
//  2) Formda kişisel kart seçilince "Kim Yaptı" kartın sahibine geçer; ortak hesapta değişmez
//  3) Banka SMS'i: kişisel karta düşen harcama SMS'i gönderene değil kartın sahibine yazılır
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };
const ACC = [{ id: 'b', name: 'Ortak Vadesiz', type: 'bank', owner: 'shared', userId: null, balance: 50000, openingBalance: 50000, ts: 1 },
  { id: 'c', name: 'Ece Kart', type: 'card', owner: 'shared', userId: null, balance: -500, openingBalance: 0, ts: 2, last4: '4321' }];
const TX = [{ id: 't1', type: 'expense', amount: 300, category: 'Market', date: '2026-10-10', note: '', accountId: 'c', userId: 'u_a', ts: 1, balanceApplied: true },
  { id: 't2', type: 'expense', amount: 200, category: 'Giyim', date: '2026-10-12', note: '', accountId: 'c', userId: 'u_a', ts: 2, balanceApplied: true },
  { id: 't3', type: 'expense', amount: 100, category: 'Market', date: '2026-10-12', note: '', accountId: 'b', userId: 'u_a', ts: 3, balanceApplied: true }];
const TODAY = '2026-10-22';

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(TODAY + 'T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS, pf_a: ACC, pf_t: TX }, data || {}));
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  async function editAcc(page, id, values) {
    await page.evaluate(id => App.Accounts.edit(id), id);
    return page.evaluate(values => {
      const h = [...document.querySelectorAll('.app-dialog-holder')].pop();
      const keys = [...h.querySelectorAll('[data-pkey]')].map(x => x.getAttribute('data-pkey'));
      Object.keys(values).forEach(k => { h.querySelector('[data-pkey="' + k + '"]').value = values[k]; });
      h.querySelector('[data-act="ok"]').click();
      return keys.filter(k => k === 'ownerUser' || k === 'pastOwner');
    }, values);
  }
  const owners = page => page.evaluate(() => S.accounts().map(a => [a.id, a.owner, a.userId]));
  const who = page => page.evaluate(() => S.txns().map(t => [t.id, t.userId]).sort());

  // 1) Hesap düzenle: sahip değişir, geçmiş işlemler isteğe bağlı
  {
    const { page, ctx } = await open();
    eq('düzenlemede sahip ve geçmiş işlem seçimi var', await editAcc(page, 'c', { ownerUser: 'u_b', pastOwner: '1' }), ['ownerUser', 'pastOwner']);
    eq('kart Ece\'nin kişisel kartı oldu', await owners(page), [['b', 'shared', null], ['c', 'personal', 'u_b']]);
    eq('karttaki geçmiş harcamalar Ece\'ye yazıldı, ortak hesaptaki değişmedi', await who(page), [['t1', 'u_b'], ['t2', 'u_b'], ['t3', 'u_a']]);
    eq('kişisel kartta "geçmişe dokunma" varsayılan', await page.evaluate(() => { App.Accounts.edit('c'); const h = [...document.querySelectorAll('.app-dialog-holder')].pop(), v = h.querySelector('[data-pkey="pastOwner"]').value; h.querySelector('[data-act="cancel"]') && h.querySelector('[data-act="cancel"]').click(); return v; }), '0');
    await editAcc(page, 'c', { ownerUser: '' });
    eq('kart yeniden Ortak oldu; geçmiş "Kim Yaptı" korunur', [await owners(page), await who(page)], [[['b', 'shared', null], ['c', 'shared', null]], [['t1', 'u_b'], ['t2', 'u_b'], ['t3', 'u_a']]]);
    await ctx.close();
  }

  // 1b) Geçmişe dokunmadan sahip değişir
  {
    const { page, ctx } = await open();
    await editAcc(page, 'c', { ownerUser: 'u_b', pastOwner: '0' });
    eq('"dokunma" seçilince geçmiş işlemler değişmez', [await owners(page), await who(page)], [[['b', 'shared', null], ['c', 'personal', 'u_b']], [['t1', 'u_a'], ['t2', 'u_a'], ['t3', 'u_a']]]);
    await ctx.close();
  }

  // 2) Form: kişisel kart seçilince "Kim Yaptı" kartın sahibine geçer
  {
    const A2 = ACC.map(a => a.id === 'c' ? Object.assign({}, a, { owner: 'personal', userId: 'u_b' }) : a);
    const { page, ctx } = await open({ pf_a: A2, pf_t: [] });
    const r = await page.evaluate(() => { const u = document.getElementById('txnUser'), out = [u.value]; App.UI.pickAcc('c'); out.push(u.value); App.UI.pickAcc('b'); out.push(u.value); return out; });
    eq('aktif Deniz → Ece\'nin kartı seçilince Ece → ortak hesapta Ece kalır (elle değiştirilebilir)', r, ['u_a', 'u_b', 'u_b']);
    await ctx.close();
  }

  // 3) SMS: Deniz'in telefonuna gelen, Ece'nin kartındaki harcama Ece'ye yazılır
  {
    const A3 = ACC.map(a => a.id === 'c' ? Object.assign({}, a, { owner: 'personal', userId: 'u_b' }) : a);
    const { page, ctx } = await open({ pf_a: A3, pf_t: [] });
    const r = await page.evaluate(() => {
      App.BankSms.ingest([{ id: 1, label: 'abcd1234_u_a', receivedAt: Date.now(), text: '4321 ile biten kredi kartinizla 22.10.2026 MIGROS TIC. A.S. isyerinden 245,50 TL tutarinda harcama yapilmistir. Yapi Kredi' }]);
      return S.txns().map(t => [t.amount, t.accountId, t.userId]);
    });
    eq('kişisel karta düşen SMS harcaması kartın sahibine', r, [[245.5, 'c', 'u_b']]);
    await ctx.close();
  }

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
