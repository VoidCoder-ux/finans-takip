// Usage: node tests/qc-owner.test.js
// Hesap sahibi (kurmaca veri, sunucu gerekmez; bugün 22 Ekim 2026 sabit):
//  1) Hesap düzenle: sahip Ortak ↔ Kişisel değişir; istenirse geçmiş işlemlerin "Kim Yaptı"sı sahibine geçer
//  2) Formda kişisel kart seçilince "Kim Yaptı" kartın sahibine geçer; ortak hesapta değişmez
//  3) Banka SMS'i: kişisel karta düşen harcama SMS'i gönderene değil kartın sahibine yazılır
//  4) Ortak: "Kim Yaptı"da Ortak seçeneği; ortak hesabın geçmişi Ortak'a çevrilir; Aile panelinde Ortak + kişiler = toplam gider
//  5) SMS ortak hesaba: harcama Ortak'a, maaş planlı maaşın kişisine
//  6) Tekrarlayan: bu ay elle girilmiş fatura tanınır ("Kaydet" sorar, otomatik kayıt ikinci kayıt açmaz)
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
    eq('açılışta ortak hesap seçili: Ortak → Ece\'nin kartı: Ece → ortak hesap: Ortak', r, ['', 'u_b', '']);
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

  // 4) Ortak etiketi ve Aile paneli
  {
    const { page, ctx } = await open();
    eq('"Kim Yaptı" ve "Kimin?" kutularında Ortak var, hesap sahibinde yok', await page.evaluate(() => ['txnUser', 'recUser', 'accUser'].map(id => [...document.getElementById(id).options].some(o => o.value === ''))), [true, true, false]);
    await editAcc(page, 'c', { ownerUser: '', pastOwner: '1' });
    eq('ortak kartın geçmişi Ortak\'a çevrildi, ortak hesaptaki kayda dokunulmadı', await who(page), [['t1', ''], ['t2', ''], ['t3', 'u_a']]);
    const st = await page.evaluate(() => ({ ortak: App.Users.sharedStats().expense, deniz: App.Users.stats('u_a').expense, ece: App.Users.stats('u_b').expense, toplam: App.Transactions.monthTotals('2026-10').expense }));
    eq('Aile paneli: Ortak 500 + Deniz 100 + Ece 0 = toplam 600 (çakışma yok)', st, { ortak: 500, deniz: 100, ece: 0, toplam: 600 });
    eq('işlem listesinde Ortak etiketi ve "Sadece Ortak" filtresi', await page.evaluate(() => { App.UI.nav('islemler'); document.getElementById('fUser').value = '__shared__'; App.Transactions.renderList(); return [...document.querySelectorAll('#txnList .ti .user-tag')].map(x => x.textContent.trim()); }), ['👨‍👩‍👧 Ortak', '👨‍👩‍👧 Ortak']);
    const add = await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); App.UI.pickAcc('b'); document.getElementById('txnAmt').value = '75'; document.getElementById('txnDate').value = '2026-10-21'; App.Transactions.add(); const t = S.txns().find(x => x.amount === 75); return t && [t.accountId, t.userId]; });
    eq('ortak hesaptan eklenen gider Ortak kalır (aktif profile dönmez)', add, ['b', '']);
    await ctx.close();
  }

  // 5) SMS ortak hesaba: kart harcaması Ortak, maaş planlı maaşın kişisine
  {
    const A5 = [{ id: 'b', name: 'Yapı Kredi Ortak Vadesiz', type: 'bank', owner: 'shared', userId: null, balance: 0, openingBalance: 0, ts: 1 },
      { id: 'c', name: 'Ortak Kart', type: 'card', owner: 'shared', userId: null, balance: 0, openingBalance: 0, ts: 2, last4: '4321' }];
    const R5 = [{ id: 'rs', type: 'income', amount: 45000, category: 'Maaş', day: 1, note: 'Ece maaş', accountId: 'b', userId: 'u_b', isSubscription: false, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: 1 }];
    const { page, ctx } = await open({ pf_a: A5, pf_t: [], pf_r: R5 });
    const r = await page.evaluate(() => {
      App.BankSms.ingest([{ id: 1, label: 'abcd1234_u_a', receivedAt: Date.now(), text: '4321 ile biten kredi kartinizla 22.10.2026 MIGROS TIC. A.S. isyerinden 245,50 TL tutarinda harcama yapilmistir. Yapi Kredi' },
        { id: 2, label: 'abcd1234_u_a', receivedAt: Date.now(), text: 'YKB: hesabiniza 22.10.2026 tarihinde 45.000,00 TL maas odemesi yatirilmistir.' }]);
      return S.txns().map(t => [t.amount, t.accountId, t.userId, t.recurringId || '']).sort((a, b) => a[0] - b[0]);
    });
    eq('ortak karta düşen SMS Ortak; ortak hesaba gelen maaş Ece\'nin planına bağlanır', r, [[245.5, 'c', '', ''], [45000, 'b', 'u_b', 'rs']]);
    await ctx.close();
  }

  // 6) Tekrarlayan: elle girilmiş fatura
  {
    const T6 = [{ id: 'f1', type: 'expense', amount: 2500, category: 'Faturalar', date: '2026-10-10', note: 'Elektrik', accountId: 'b', userId: '', ts: 1, balanceApplied: true }];
    const R6 = [{ id: 'r1', type: 'expense', amount: 2400, category: 'Faturalar', day: 10, note: 'Elektrik', accountId: 'b', userId: '', isSubscription: false, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: 1 }];
    const bills = page => page.evaluate(() => S.txns().filter(t => t.category === 'Faturalar' && t.date.startsWith('2026-10')).map(t => [t.id, t.recurringId || '']));
    {
      const { page, ctx } = await open({ pf_t: T6, pf_r: R6 });
      await page.evaluate(() => App.Recurring.log('r1')); await page.waitForTimeout(100);
      eq('"Kaydet": elle girilmiş fatura soruluyor', await page.evaluate(() => /Bu ay zaten girilmiş/.test(([...document.querySelectorAll('.app-dialog-holder')].pop() || {}).textContent || '')), true);
      await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(100);
      eq('"Eşleştir": yeni kayıt açılmaz, elle girilen bağlanır', await bills(page), [['f1', 'r1']]);
      await ctx.close();
    }
    {
      const { page, ctx } = await open({ pf_t: T6, pf_r: [Object.assign({}, R6[0], { autoLog: true, autoFrom: '2026-10', autoDone: '2026-09' })] });
      await page.evaluate(() => App.Recurring.autoRun());
      eq('otomatik kayıt: ikinci fatura açılmaz, elle girilen bağlanır; bakiye kaymaz', [await bills(page), await page.evaluate(() => App.Accounts.reconcileAccountBalances(true))], [[['f1', 'r1']], false]);
      await ctx.close();
    }
    {
      const T7 = [{ id: 'm1', type: 'expense', amount: 2500, category: 'Market', date: '2026-10-10', note: '', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true }];
      const { page, ctx } = await open({ pf_t: T7, pf_r: [Object.assign({}, R6[0], { autoLog: true, autoFrom: '2026-10', autoDone: '2026-09' })] });
      await page.evaluate(() => App.Recurring.autoRun());
      eq('başka kategorideki aynı tutar fatura sayılmaz: fatura otomatik kaydedilir', await page.evaluate(() => S.txns().map(t => [t.category, t.recurringId || '']).sort()), [['Faturalar', 'r1'], ['Market', '']]);
      await ctx.close();
    }
  }

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
