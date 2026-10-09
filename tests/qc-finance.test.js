// Usage: node tests/qc-finance.test.js
// Bağımsız muhasebe senaryoları: beklenen değerler elle hesaplandı (uygulamanın hesap işlevlerinden üretilmez).
// Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const now = new Date(), day = k => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k));
const TODAY = day(0);

function seed() {
  return {
    pf_a: [
      { id: 'a_bank', name: 'Deneme Bankası Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: 1 },
      { id: 'a_card', name: 'Deneme Kart', type: 'card', owner: 'shared', limit: 20000, balance: 0, openingBalance: 0, ts: 2 },
      { id: 'a_cash', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 0, openingBalance: 0, ts: 3 }],
    pf_t: [],
    pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() }
  };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
  await page.reload(); await page.waitForTimeout(400);
  const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()));
  const okTop = () => page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); const b = m && m.querySelector('[data-act="ok"]'); if (b) b.click(); return !!b; });
  // Formdan gider/gelir: kullanıcının yaptığı gibi
  const addTx = (type, amt, acc, cat, note, date) => page.evaluate(o => { App.UI.nav('islemler'); App.UI.setType(o.type); const ch = document.querySelector('#txnPayChips [data-acc="' + o.acc + '"]'); if (ch) ch.click(); document.getElementById('txnAmt').value = o.amt; if (o.date) document.getElementById('txnDate').value = o.date; if (o.cat) document.getElementById('txnCat').value = o.cat; document.getElementById('txnNote').value = o.note || ''; App.Transactions.add(); }, { type, amt, acc, cat, note, date });
  const state = () => page.evaluate(() => { const m = App.Transactions.monthTotals(tm()); return { bank: App.Accounts.get('a_bank').balance, card: App.Accounts.get('a_card').balance, cash: App.Accounts.get('a_cash').balance, inc: m.income, exp: m.expense }; });
  const views = () => page.evaluate(() => {
    renderAllViews(); App.UI.nav('ozet'); const o = { heroNet: document.getElementById('heroNet').textContent, heroCard: document.getElementById('heroCard').textContent, mInc: document.getElementById('mInc').textContent, mExp: document.getElementById('mExp').textContent };
    const ins = App.Insights.compute(tm()); o.insInc = ins.income; o.insExp = ins.expense;
    window.print = () => {}; App.Report.generateMonth(tm()); o.report = document.getElementById('printHolder').textContent.replace(/\s+/g, ' ');
    return o;
  });

  // ---- Senaryo A: banka 10.000, kartla 1.000 harcama, 400 kart ödemesi ----
  await addTx('expense', '1000', 'a_card', 'Market', 'Market alışverişi');
  eq('A1 kartla 1.000 harcama: banka 10.000 değişmez, kart borcu 1.000, gider 1.000', await state(), { bank: 10000, card: -1000, cash: 0, inc: 0, exp: 1000 });
  await page.evaluate(() => { App.Cards.pay('a_card'); [...document.querySelectorAll('#ccOpts .cc-opt')].pop().click(); document.getElementById('ccAmt').value = '400'; document.getElementById('ccFrom').value = 'a_bank'; document.getElementById('ccPayOk').click(); }); await page.waitForTimeout(150);
  eq('A2 400 kart ödemesi: banka 9.600, kart borcu 600, gider yine 1.000, gelir 0', await state(), { bank: 9600, card: -600, cash: 0, inc: 0, exp: 1000 });
  const v = await views();
  eq('A3 Özet/İstatistik aynı sonuç', [v.heroNet, v.heroCard, v.mInc, v.mExp, v.insInc, v.insExp], ['₺9.600,00', '₺600,00', '₺0,00', '₺1.000,00', 0, 1000]);
  eq('A4 PDF rapor: gider 1.000 (ödeme gider sayılmaz, 1.400 hiç geçmez)', [/Gider\s*₺1\.000(?![\d.,])/.test(v.report), /harcandı/.test(v.report) && /₺1\.000 harcandı/.test(v.report), /1\.400/.test(v.report)], [true, true, false]);
  if (!/Gider\s*₺1\.000(?![\d.,])/.test(v.report)) console.log(v.report.slice(0, 900));
  // Yenileme sonrası
  await page.reload(); await page.waitForTimeout(400);
  eq('A5 yenileme sonrası aynı', await state(), { bank: 9600, card: -600, cash: 0, inc: 0, exp: 1000 });
  // Ödemeyi 500'e düzenle
  const payId = await page.evaluate(() => S.txns().find(t => t.transferId && t.accountId === 'a_card').id);
  await page.evaluate(id => { App.Transactions.edit(id); document.querySelector('.modal-bd.show [data-k="amount"], .modal-bd.show #pm_amount, .modal-bd.show input[name="amount"]'); }, payId);
  const pmField = await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [...m.querySelectorAll('input,select')].map(i => i.id); });
  await page.evaluate(ids => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); const inp = m.querySelectorAll('input')[0]; inp.value = '500'; m.querySelector('[data-act="ok"]').click(); }, pmField); await page.waitForTimeout(150);
  eq('A6 ödeme 500 olarak düzenlendi: banka 9.500, kart 500', await state(), { bank: 9500, card: -500, cash: 0, inc: 0, exp: 1000 });
  // Ödemeyi sil
  await page.evaluate(id => App.Transactions.remove(id), payId); await page.waitForTimeout(150);
  eq('A7 ödeme silindi: banka 10.000, kart 1.000', await state(), { bank: 10000, card: -1000, cash: 0, inc: 0, exp: 1000 });
  // Harcamayı 1.250'ye düzenle, sonra sil
  const expId = await page.evaluate(() => S.txns().find(t => t.accountId === 'a_card' && t.type === 'expense').id);
  await page.evaluate(id => { App.Transactions.edit(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); const f = [...m.querySelectorAll('input')].find(i => i.value === '1000' || i.value === '1000,00' || i.value === '1.000,00'); f.value = '1.250,50'; m.querySelector('[data-act="ok"]').click(); }, expId); await page.waitForTimeout(150);
  eq('A8 harcama 1.250,50 yapıldı: kart −1.250,50, gider 1.250,50', await state(), { bank: 10000, card: -1250.5, cash: 0, inc: 0, exp: 1250.5 });
  await page.evaluate(id => App.Transactions.remove(id), expId); await page.waitForTimeout(150);
  eq('A9 harcama silindi: her şey başa döndü', await state(), { bank: 10000, card: 0, cash: 0, inc: 0, exp: 0 });
  // Geri al: son toast eylemi
  await page.evaluate(() => { const b = [...document.querySelectorAll('.toast button, .toast-act')].pop(); if (b) b.click(); }); await page.waitForTimeout(150);
  eq('A10 "Geri al" harcamayı ve kart borcunu geri getirir', await state(), { bank: 10000, card: -1250.5, cash: 0, inc: 0, exp: 1250.5 });

  // ---- Senaryo B: transfer toplamları değiştirmez; bakiye hareketlerden yeniden kurulabilir ----
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('transfer'); });
  await page.evaluate(() => { document.getElementById('txnAccount').value = 'a_bank'; document.getElementById('txnToAccount').value = 'a_cash'; document.getElementById('txnAmt').value = '300'; App.Transactions.add(); }); await page.waitForTimeout(100);
  eq('B1 bankadan cüzdana 300 transfer: gelir/gider değişmez, toplam para değişmez', await state(), { bank: 9700, card: -1250.5, cash: 300, inc: 0, exp: 1250.5 });
  eq('B2 bakiye = açılış + gerçekleşmiş hareketler (her hesap)', await page.evaluate(() => S.accounts().map(a => { const s = S.txns().filter(t => t.accountId === a.id && t.balanceApplied !== false && t.date <= td()).reduce((x, t) => x + (t.type === 'income' ? t.amount : -t.amount), 0); return [a.id, Math.round((a.openingBalance + s) * 100) / 100 === a.balance]; })), [['a_bank', true], ['a_card', true], ['a_cash', true]]);

  // ---- Senaryo C: ileri tarihli kayıt bugünkü bakiyeyi ve ay toplamını etkilemez ----
  await addTx('expense', '200', 'a_bank', 'Faturalar', 'İleri fatura', day(3));
  const c1 = await state();
  eq('C1 3 gün sonraki 200 gider: banka 9.700 kalır, bu ay gideri artmaz', [c1.bank, c1.exp], [9700, 1250.5]);
  eq('C2 ileri tarihli kayıt "planlı" görünür', await page.evaluate(() => { App.Transactions.renderList(); return /Planlı \/ ileri tarihli \(1\)/.test(document.getElementById('txnList').textContent); }), true);

  eq('C3 ileri tarihli kayıttan sonra tarih alanı bugüne döner (sonraki harcama sessizce planlı olmasın)', await page.evaluate(() => document.getElementById('txnDate').value), TODAY);
  // ---- Senaryo D: kuruş ve taksit bölme ----
  await addTx('expense', '1000', 'a_card', 'Giyim', 'Mont');
  await page.evaluate(() => { const t = S.txns(); const x = t.find(y => y.note === 'Mont'); App.Transactions.purge(x.id); renderAllViews(); });
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="a_card"]').click(); document.getElementById('txnAmt').value = '100'; document.getElementById('txnNote').value = 'Taksitli'; document.getElementById('txnInst').value = '3'; document.getElementById('txnInstStart').value = td(); App.Transactions.add(); }); await page.waitForTimeout(100);
  eq('D1 100 TL 3 taksit: 33,33 + 33,33 + 33,34 = 100,00', await page.evaluate(() => S.txns().filter(t => t.installment && t.installment.name === 'Taksitli').map(t => t.amount).sort()), [33.33, 33.33, 33.34]);
  eq('D2 yalnız ilk taksit bugün işlendi: kart −1.283,83', (await state()).card, -1283.83);
  eq('D3 0,1 + 0,2 kuruş toplamı tam (ondalık hata yok)', await page.evaluate(() => { const b = App.Accounts.get('a_cash').balance; App.Accounts.adjustBalance('a_cash', 0.1); App.Accounts.adjustBalance('a_cash', 0.2); const r = App.Accounts.get('a_cash').balance; App.Accounts.adjustBalance('a_cash', -0.3); return [r - b === 0.3 || Math.round((r - b) * 100) === 30, App.Accounts.get('a_cash').balance === b]; }), [true, true]);

  // ---- Senaryo E: tutar biçimleri ----
  eq('E1 sayı biçimleri', await page.evaluate(() => ['1.234,56', '1,234.56', '229.00', '699,00', ' 1 234,56 ', '₺1.234,56', '1234.5', '12,5', '1.000', '0', '-5', 'abc', '', '1e3', '99999999999999'].map(s => parseMoney(s))), [1234.56, 1234.56, 229, 699, 1234.56, 1234.56, 1234.5, 12.5, 1000, null, null, null, null, null, null]);

  // ---- Senaryo F: iade ----
  const f0 = await state();
  await addTx('income', '250', 'a_card', 'İade', 'İade: Mağaza');
  const f1 = await state();
  eq('F1 karta 250 iade: kart borcu azalır', f1.card, -1033.83);
  eq('F2 iade gelir sayılmaz, bu ayın giderinden düşer (gelir aynı, gider −250)', [f1.inc - f0.inc, Math.round((f1.exp - f0.exp) * 100) / 100], [0, -250]);
  eq('F3 İstatistik ve PDF rapor aynı kuralla: iade gelir değil, raporda iade giderden düşülür (kategorisiz iade satırı)', await page.evaluate(() => { const i = App.Insights.compute(tm()); window.print = () => {}; App.Report.generateMonth(tm()); const r = document.getElementById('printHolder').textContent; return [i.refunds, i.income === App.Transactions.monthTotals(tm()).income, i.expense === App.Transactions.monthTotals(tm()).expense, /Kategorisiz iade\s*−₺250(?![\d.,])/.test(r) || /₺250 iade kendi kategorisinden düşüldü/.test(r)]; }), [250, true, true, true]);
  eq('F4 bankadan gelen eski iade kaydı (Diğer, "İade: …") yüklemede İade kategorisine geçer', await page.evaluate(() => { const t = S.txns(); t.push({ id: 't_oldref', type: 'income', amount: 10, category: 'Diğer', date: td(), note: 'İade: Eski', accountId: 'a_cash', userId: 'u_a', ts: 1, balanceApplied: false, src: 'sms' }); S.saveTxns(t); S.load(); const x = S.txns().find(y => y.id === 't_oldref'); const r = x.category; App.Transactions.purge('t_oldref'); return r; }), 'İade');

  // ---- Senaryo G: çift dokunma ----
  const before = await page.evaluate(() => S.txns().length);
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="a_cash"]').click(); document.getElementById('txnAmt').value = '45'; document.getElementById('txnNote').value = 'Simit'; const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'İşlemi Ekle'); b.click(); b.click(); }); await page.waitForTimeout(150);
  eq('G1 "İşlemi Ekle"ye hızlı çift dokunuş tek kayıt ekler', await page.evaluate(n => S.txns().length - n, before), 1);

  // ---- Senaryo H: geçersiz tutarlar kayıt oluşturmaz ----
  const n0 = await page.evaluate(() => S.txns().length);
  for (const bad of ['0', '-10', 'abc', '']) await addTx('expense', bad, 'a_cash', 'Market', 'Bozuk');
  eq('H1 0 / eksi / harf / boş tutar eklenmez', await page.evaluate(n => S.txns().length - n, n0), 0);

  // ---- Senaryo I: borca bağlı hareketi İşlemler'den silmek borcu da kaldırır ----
  const bI = (await state()).bank;
  await page.evaluate(() => { App.UI.nav('borclar'); document.getElementById('debtDir').value = 'lent'; document.getElementById('debtPerson').value = 'Komşu'; document.getElementById('debtAmt').value = '1000'; document.getElementById('debtDate').value = td(); const s = document.getElementById('debtAccount'); if (s) s.value = 'a_bank'; App.Debts.add(); });
  eq('I1 1.000 borç verildi: banka −1.000, alacak 1.000, gider değil', await page.evaluate(b => [App.Accounts.get('a_bank').balance - b, App.NetWorth.compute().lent, App.Transactions.monthTotals(tm()).expense], bI), [-1000, 1000, (await state()).exp]);
  await page.evaluate(() => { const d = S.debts()[0]; App.Transactions.remove(d.txnId); }); await okTop(); await page.waitForTimeout(150);
  eq('I2 hareket silinince borç da silinir: banka eski haline, alacak 0', await page.evaluate(b => [App.Accounts.get('a_bank').balance - b, App.NetWorth.compute().lent, S.debts().length], bI), [0, 0, 0]);

  // ---- Senaryo J: otomatik tekrarlayan uzun süre açılmayınca her ay bir kez ----
  const nJ = await page.evaluate(() => {
    const m3 = shiftMonth(tm(), -3); const r = S.recurring(); r.push({ id: 'r_kira', type: 'expense', amount: 500, category: 'Faturalar', day: 1, note: 'Kira', accountId: 'a_bank', userId: 'u_a', isSubscription: false, active: true, autoLog: true, autoFrom: m3, autoDone: m3, ts: Date.now() - 100 * 864e5 }); S.saveRecurring(r);
    const a = App.Recurring.autoRun(), b = App.Recurring.autoRun(); return [a, b, S.txns().filter(t => t.recurringId === 'r_kira').map(t => t.date.slice(0, 7)).sort()];
  });
  eq('J1 3 ay açılmadı: eksik 3 ay bir kez yazılır, ikinci çalışmada 0', nJ, [3, 0, await page.evaluate(() => [shiftMonth(tm(), -2), shiftMonth(tm(), -1), tm()])]);

  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
