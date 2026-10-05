// Usage: node tests/qc-finance2.test.js
// Denetim #5 para senaryoları (beklenen değerler elle): işlemin hesabını / türünü / tarihini düzenleme, taksit planında tek taksidi
// düzenleme ve planı silme, gün geçince taksitlerin bakiyeye bir kez işlenmesi, transferin tarihini ileri alma, hesap ve üye silme,
// bütçe limitinin geçmiş aylara uygulanması.
// Kurmaca veri, sunucu gerekmez.
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
const ACCS = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: 1 },
  { id: 'c', name: 'Kart', type: 'card', owner: 'shared', limit: 20000, statementDay: 10, balance: 0, openingBalance: 0, ts: 2 },
  { id: 'k', name: 'Cüzdan', type: 'cash', owner: 'personal', userId: 'u_b', balance: 500, openingBalance: 500, ts: 3 }];

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(when, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(when + 'T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS, pf_a: ACCS }, data || {}));
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const bal = p => p.evaluate(() => S.accounts().map(a => a.balance));
  // Düzenleme penceresindeki alanlar (data-pkey) doldurulup Kaydet'e basılır
  const editTx = (p, id, vals) => p.evaluate(({ id, vals }) => { App.Transactions.edit(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); Object.keys(vals).forEach(k => { const el = m.querySelector('[data-pkey="' + k + '"]'); el.value = vals[k]; }); m.querySelector('[data-act="ok"]').click(); }, { id, vals });

  // 1) İşlem düzenleme: hesap, tür, tarih
  {
    const { page, ctx } = await open('2027-03-15', { pf_t: [{ id: 't1', type: 'expense', amount: 300, category: 'Market', date: '2027-03-15', note: 'Market', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true }] });
    // açılış 10.000 − 300 = 9.700 (yükleme mutabakatı: bakiye açılış + hareketlerden)
    eq('başlangıç: banka 9.700, kart 0, cüzdan 500', await bal(page), [9700, 0, 500]);
    await editTx(page, 't1', { accountId: 'c' });
    eq('hesap bankadan karta: banka 10.000, kart −300', await bal(page), [10000, -300, 500]);
    await editTx(page, 't1', { type: 'income', category: 'Diğer' });
    eq('tür gidere → gelire: kart +300 (borç değil alacak)', [await bal(page), await page.evaluate(() => App.Transactions.monthTotals('2027-03'))], [[10000, 300, 500], { income: 300, expense: 0, count: 1 }]);
    await editTx(page, 't1', { type: 'expense', category: 'Market', date: '2027-03-20' });
    eq('tarihi ileri: bakiyeden çıkar, bu ayın toplamına girmez', [await bal(page), await page.evaluate(() => App.Transactions.monthTotals('2027-03'))], [[10000, 0, 500], { income: 0, expense: 0, count: 0 }]);
    await editTx(page, 't1', { date: '2027-03-01' });
    eq('tarihi geri: yeniden işlenir', [await bal(page), await page.evaluate(() => App.Transactions.monthTotals('2027-03').expense)], [[10000, -300, 500], 300]);
    await page.reload(); await page.waitForTimeout(300);
    eq('yenilemeden sonra aynı (bakiye = açılış + hareketler)', await bal(page), [10000, -300, 500]);
    await ctx.close();
  }
  // 2) Taksit planı: tek taksidi düzenleme, tarihini ileri alma, planı silme
  {
    const { page, ctx } = await open('2027-03-15');
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="c"]').click(); document.getElementById('txnAmt').value = '300'; document.getElementById('txnNote').value = 'Koltuk'; document.getElementById('txnInst').value = '3'; document.getElementById('txnInstStart').value = '2027-02-15'; App.Transactions.add(); });
    await page.waitForTimeout(100);
    const plan = () => page.evaluate(() => S.txns().filter(t => t.installment).sort((a, b) => a.date < b.date ? -1 : 1).map(t => [t.date, t.amount, t.balanceApplied, t.installment.totalAmount]));
    eq('3 taksit (15.02, 15.03 geçmiş; 15.04 ileri), kart −200', [await plan(), (await bal(page))[1]], [[['2027-02-15', 100, true, 300], ['2027-03-15', 100, true, 300], ['2027-04-15', 100, false, 300]], -200]);
    const second = await page.evaluate(() => S.txns().find(t => t.installment && t.date === '2027-03-15').id);
    await editTx(page, second, { amount: '150' });
    eq('2. taksit 150: kart −250, plan toplamı 350', [(await bal(page))[1], (await plan()).map(x => x[3])], [-250, [350, 350, 350]]);
    await editTx(page, second, { date: '2027-03-25' });
    eq('2. taksidin tarihi ileri: bakiyeden çıkar (kart −100), gelecek taksitlere ayrılır', [(await bal(page))[1], await page.evaluate(() => App.Cards.info('c').blocked)], [-100, 250]);
    await page.evaluate(id => App.Transactions.remove(id), second);
    await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click());
    await page.waitForTimeout(100);
    eq('plan silindi: tüm taksitler gider, kart 0, ayrılan 0', [await plan(), (await bal(page))[1], await page.evaluate(() => App.Cards.info('c').blocked)], [[], 0, 0]);
    await ctx.close();
  }
  // 3) Gün geçince: ileri tarihli taksit/kayıt açılışta bakiyeye bir kez işlenir (iki kez açılsa da)
  {
    const t = (id, date, inst) => Object.assign({ id, type: 'expense', amount: 100, category: 'Giyim', date, note: id, accountId: 'c', userId: 'u_a', ts: 1, balanceApplied: date <= '2027-03-15' }, inst ? { installment: { planId: 'p1', index: inst, total: 2, totalAmount: 200, name: 'Mont', startDate: '2027-03-01', balanceApplied: date <= '2027-03-15' } } : {});
    const data = { pf_a: ACCS.map(a => a.id === 'c' ? Object.assign({}, a, { balance: -100, openingBalance: 0 }) : a), pf_t: [t('i1', '2027-03-01', 1), t('i2', '2027-04-01', 2), t('fut', '2027-03-20')] };
    const { page, ctx } = await open('2027-03-15', data);
    eq('15 Mart: yalnız 1. taksit işli, kart −100', (await bal(page))[1], -100);
    const st = await page.evaluate(() => JSON.stringify({ pf_t: S.txns(), pf_a: S.accounts() }));
    await ctx.close();
    const later = await open('2027-04-02', JSON.parse(st));
    eq('2 Nisan açılış: 2. taksit ve 20 Mart kaydı işlendi, kart −300', (await bal(later.page))[1], -300);
    await later.page.reload(); await later.page.waitForTimeout(300);
    eq('ikinci açılışta tekrar düşülmez', (await bal(later.page))[1], -300);
    eq('nisan gideri yalnız 2. taksit (100); mart gideri 1. taksit + 20 Mart (200)', await later.page.evaluate(() => [App.Transactions.monthTotals('2027-04').expense, App.Transactions.monthTotals('2027-03').expense]), [100, 200]);
    await later.ctx.close();
  }
  // 4) Transferin tarihini ileri alma ve hesap silme
  {
    const { page, ctx } = await open('2027-03-15');
    const tr = await page.evaluate(() => App.Transactions.createTransfer({ from: 'b', to: 'k', amount: 200, date: '2027-03-15', note: 'Harçlık' }));
    eq('transfer: banka 9.800, cüzdan 700', await bal(page), [9800, 0, 700]);
    await editTx(page, tr.outId, { date: '2027-03-30' });
    eq('transfer tarihi ileri: iki bacak da bakiyeden çıkar', await bal(page), [10000, 0, 500]);
    await editTx(page, tr.outId, { date: '2027-03-14' });
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="k"]').click(); document.getElementById('txnAmt').value = '50'; document.getElementById('txnNote').value = 'Simit'; App.Transactions.add(); });
    await page.evaluate(() => { App.Accounts.remove('k'); [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(100);
    eq('cüzdan silindi: banka 9.800 kalır, aylık gider 50 kalır (kayıt hesapsız)', [await bal(page), await page.evaluate(() => [App.Transactions.monthTotals('2027-03').expense, S.txns().filter(t => !t.accountId).length])], [[9800, 0], [50, 2]]);
    await ctx.close();
  }
  // 5) Üye silme: kişisel hesap ve kayıtlar "Ortak" olur, tutarlar değişmez
  {
    const { page, ctx } = await open('2027-03-15', { pf_t: [{ id: 'x', type: 'expense', amount: 80, category: 'Yiyecek', date: '2027-03-10', note: 'Kahve', accountId: 'k', userId: 'u_b', ts: 1, balanceApplied: true }] });
    await page.evaluate(() => { App.Users.remove('u_b'); [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(100);
    eq('üye silindi: cüzdan ortak, kayıt kişisiz, gider ve bakiye aynı', await page.evaluate(() => { const a = App.Accounts.get('k'); return [a.owner, !S.txns()[0].userId, App.Transactions.monthTotals('2027-03').expense, a.balance]; }), ['shared', true, 80, 420]);
    await ctx.close();
  }
  // 6) Bütçe geçmiş ay: yeni konan limit geçmiş aya uygulanmaz; değişen limit geçmiş ayda o ayın limitiyle değerlendirilir
  {
    const feb = { id: 'f1', type: 'expense', amount: 1500, category: 'Market', date: '2027-02-10', note: 'Market', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true };
    const setLimit = (p, cat, v) => p.evaluate(({ cat, v }) => { App.UI.nav('butce'); document.getElementById('bCat').value = cat; document.getElementById('bLimit').value = v; App.Budget.save(); }, { cat, v });
    const febWarn = p => p.evaluate(() => App.Insights.compute('2027-02').warnings.filter(w => /Market bütçesi/.test(w.title)).map(w => w.title));
    const { page, ctx } = await open('2027-03-15', { pf_t: [feb] });
    await setLimit(page, 'Market', '1000');
    eq('mart ayında ilk kez konan 1.000 limit: şubatın 1.500 harcaması "aşıldı" sayılmaz', [await febWarn(page), await page.evaluate(() => [App.Budget.limitFor('Market', '2027-02'), App.Budget.limitFor('Market', '2027-03')])], [[], [0, 1000]]);
    await ctx.close();
    const two = await open('2027-03-15', { pf_t: [feb], pf_b: { Market: 2000 } });
    await setLimit(two.page, 'Market', '1000');
    eq('limit 2.000 → 1.000 (mart): şubat 2.000 ile değerlendirilir, uyarı yok; mart 1.000', [await febWarn(two.page), await two.page.evaluate(() => [App.Budget.limitFor('Market', '2027-02'), App.Budget.limitFor('Market', '2027-03')])], [[], [2000, 1000]]);
    await two.ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
