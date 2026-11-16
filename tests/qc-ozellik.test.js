// Usage: node tests/qc-ozellik.test.js
// Kasım 2026 yeni özellikleri (beklenen değerler elle hesaplandı):
//  1) İşlem bölme: tek kayıt iki kategoriye ayrılır, toplam ve bakiye değişmez; banka mesajının öbür kanaldan gelen eşi toplamla tanınır.
//  2) Şifreli yedek: parola olmadan okunamaz, doğru parolayla geri yüklenir, yanlış parolada veri değişmez.
//  3) Ortak gider dengeleme: kişisel hesaptan ödenen ortak giderler eşit paylaşılır; ortak hesap ve istek harcaması sayılmaz.
//  4) Döviz/altın borç kurla yeniden değerlenir.  5) Fon stopajı net kârı gösterir.  6) Taksitli nakit avans gelir/gider şişirmez.
//  7) Bütçe limiti uyarısı %80 ve %100'de birer kez gelir.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = () => ({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() });
const at = iso => new Date(iso + 'T10:00:00').getTime();
const bank = (balance, id = 'b', x = {}) => Object.assign({ id, name: 'Vadesiz ' + id, type: 'bank', owner: 'shared', balance, openingBalance: balance, ts: at('2025-01-01') }, x);
let tn = 1;
const tx = (date, type, amount, category, note, accountId = 'b', x = {}) => Object.assign({ id: 't' + tn++, type, amount, category, date, note, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, x);

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(today, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(today + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS(), pf_a: [bank(50000)], pf_t: [] }, data || {}));
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  // Açık penceredeki alanları doldurup onaylar
  const fill = (p, vals) => p.evaluate(v => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); Object.keys(v).forEach(k => { m.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); m.querySelector('[data-act="ok"]').click(); }, vals);

  // 1) İşlem bölme
  {
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(47500, 'b', { openingBalance: 50000 })], pf_t: [tx('2026-11-08', 'expense', 2500, 'Market', 'Migros', 'b', { id: 'm1', src: 'sms', sh: 'abc123' })] });
    await page.evaluate(() => App.Transactions.edit('m1'));
    await fill(page, { spAmt: '2500', spCat: 'Çocuk' });
    eq('toplamın tamamı ayrılamaz', await page.evaluate(() => S.txns().length), 1);
    await fill(page, { spAmt: '700', spCat: 'Market' });
    eq('aynı kategoriye bölünmez', await page.evaluate(() => S.txns().length), 1);
    await fill(page, { spAmt: '700', spCat: 'Çocuk' });
    eq('iki kayıt: 1.800 Market + 700 Çocuk', await page.evaluate(() => S.txns().map(t => [t.amount, t.category, t.note, t.date, t.sg, t.src]).sort((a, b) => b[0] - a[0])), [[1800, 'Market', 'Migros', '2026-11-08', 'm1', 'sms'], [700, 'Çocuk', 'Migros', '2026-11-08', 'm1', 'sms']]);
    eq('bakiye değişmez', await page.evaluate(() => App.Accounts.get('b').balance), 47500);
    eq('kategori toplamları', await page.evaluate(() => { const c = App.Transactions.catTotals('2026-11'); return [c.Market, c['Çocuk']]; }), [1800, 700]);
    eq('aynı harcamanın e-postası ikinci kez yazılmaz', await page.evaluate(() => { const r = App.BankSms.ingest([{ id: 5, label: 'gmailbox_u_a', text: 'Akbank\nKartinizla MIGROS isyerinden 2.500,00 TL harcama yapilmistir.\nE-posta tarihi: 08.11.2026 14:00', receivedAt: Date.now() }]); return [r.added, S.txns().length, App.Accounts.get('b').balance]; }), [0, 2, 47500]);
    await page.reload(); await page.waitForTimeout(200);
    eq('yeniden açılınca grup korunur', await page.evaluate(() => S.txns().every(t => t.sg === 'm1')), true);
    await ctx.close();
  }
  // 2) Şifreli yedek
  {
    const { page, ctx } = await open('2026-11-10', { pf_t: [tx('2026-11-08', 'expense', 2500, 'Market', 'Gizli Market', 'b')] });
    const r = await page.evaluate(async () => {
      const enc = await App.Backup.encrypt(App.Backup.snapshot(), 'parola123'), txt = JSON.stringify(enc);
      const dec = await App.Backup.decrypt(enc, 'parola123');
      let wrong = 'açıldı'; try { await App.Backup.decrypt(enc, 'parola124'); } catch (e) { wrong = 'reddedildi'; }
      return { enc: txt, plain: txt.includes('Gizli Market') || txt.includes('pf_t'), ok: dec.stores.pf_t[0].note, wrong, alan: [enc.app, enc.enc, enc.iter] };
    });
    eq('şifreli dosyada açık veri yok', r.plain, false);
    eq('doğru parola açar, yanlış parola reddedilir', [r.ok, r.wrong, r.alan], ['Gizli Market', 'reddedildi', ['finanstakip', 1, 250000]]);
    // Geri yükleme: önce yanlış, sonra doğru parola
    await page.evaluate(() => { const t = S.txns(); t[0].note = 'Sonradan değişti'; S.saveTxns(t); App.Backup.open(); });
    const file = { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(r.enc) };
    await page.setInputFiles('#backupFile', file); await page.waitForTimeout(150);
    await fill(page, { p: 'yanlis-parola' }); await page.waitForTimeout(900);
    eq('yanlış parolada veri değişmez', await page.evaluate(() => S.txns()[0].note), 'Sonradan değişti');
    await page.setInputFiles('#backupFile', file); await page.waitForTimeout(150);
    await fill(page, { p: 'parola123' }); await page.waitForTimeout(900);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(1200);
    eq('doğru parolayla geri yüklenir', await page.evaluate(() => S.txns()[0].note), 'Gizli Market');
    await ctx.close();
  }
  // 3) Ortak gider dengeleme: 28.000 + 12.000 = 40.000, kişi başı 20.000; Ece 8.000 aktarır
  {
    const acc = [bank(50000), bank(30000, 'pa', { owner: 'personal', userId: 'u_a' }), bank(20000, 'pb', { owner: 'personal', userId: 'u_b' })];
    const t = [tx('2026-11-02', 'expense', 22000, 'Kira', 'Kira', 'pa'), tx('2026-11-03', 'expense', 6000, 'Market', 'Migros', 'pa'), tx('2026-11-04', 'expense', 12000, 'Faturalar', 'Elektrik', 'pb', { userId: 'u_b' }),
      tx('2026-11-05', 'expense', 5000, 'Market', 'Ortak hesaptan', 'b'), tx('2026-11-06', 'expense', 3000, 'Eğlence', 'Sinema', 'pa'), tx('2026-10-06', 'expense', 9000, 'Market', 'Geçen ay', 'pb', { userId: 'u_b' }), tx('2026-11-20', 'expense', 4000, 'Market', 'Planlı', 'pa', { balanceApplied: false })];
    const { page, ctx } = await open('2026-11-10', { pf_a: acc, pf_t: t });
    const s = await page.evaluate(() => { const x = App.Users.settle('2026-11'); return [x.total, x.share, x.rows.map(r => [r.u.name, r.paid, r.diff]), x.moves.map(m => [m.from.name, m.to.name, m.amount])]; });
    eq('yalnız kişisel hesaptan ödenen ortak giderler', s, [40000, 20000, [['Deniz', 28000, 8000], ['Ece', 12000, -8000]], [['Ece', 'Deniz', 8000]]]);
    await page.evaluate(() => App.UI.nav('aile')); await page.waitForTimeout(100);
    eq('kart cümlesi', await page.evaluate(() => document.getElementById('settleCard').textContent.includes('Ece, Deniz hesabına ₺8.000,00 aktarırsa eşitlenir')), true);
    await page.evaluate(() => App.Users.settleNav());
    eq('geçen ay: Ece 9.000 ödedi, Deniz 4.500 aktarır', await page.evaluate(() => App.Users.settle('2026-10').moves.map(m => [m.from.name, m.amount])), [['Deniz', 4500]]);
    await page.evaluate(() => { App.Users.settleEdit(); document.querySelector('#settleHolder [data-cat="Eğlence"]').checked = true; App.Users.settleSave(); });
    eq('kategori eklenince hesap değişir', await page.evaluate(() => { const x = App.Users.settle('2026-11'); return [x.total, x.moves[0].amount]; }), [43000, 9500]);
    await ctx.close();
  }
  // 4) Döviz / altın cinsinden borç: miktar sabit, TL karşılığı kurla değişir; ödeme o günkü kurla miktardan düşer
  {
    const s = Object.assign(USERS(), { rates: { USD: 40, EUR: 45, GBP: 0, GOLD_GRAM: 4000, GOLD_QUARTER: 7000, GOLD_FULL: 0, FUND: 1, updated: Date.now() } });
    const { page, ctx } = await open('2026-11-10', { pf_s: s });
    const rate = (p, v) => p.evaluate(v => { const r = Object.assign({}, S.settings().rates, { USD: v }); S.saveSetting('rates', r); App.Debts.renderAll(); }, v);
    const d = p => p.evaluate(() => S.debts().map(x => [x.amount, x.cur || '', x.qty || 0, x.settled, x.payments.map(y => [y.amount, Math.round(y.q * 1000) / 1000])]));
    await page.evaluate(() => { const g = (i, v) => { document.getElementById(i).value = v; }; g('debtDir', 'lent'); g('debtPerson', 'Ali'); g('debtAmt', '1000'); g('debtCur', 'USD'); g('debtDate', '2026-11-10'); App.Debts.add(); });
    eq('1.000 USD, kur 40: 40.000 ₺', await d(page), [[40000, 'USD', 1000, false, []]]);
    await rate(page, 45);
    eq('kur 45: 45.000 ₺', (await d(page))[0][0], 45000);
    await page.evaluate(() => { const id = S.debts()[0].id; document.getElementById('pay_amt_' + id).value = '9000'; App.Debts.addPayment(id); });
    eq('9.000 ₺ ödeme 200 USD düşer; kalan 800 × 45 = 36.000', await d(page), [[45000, 'USD', 1000, false, [[9000, 200]]]]);
    await rate(page, 50);
    eq('kur 50: ödenen 9.000 + kalan 800 × 50', (await d(page))[0][0], 49000);
    eq('kartta miktar ve kalan görünür', await page.evaluate(() => document.getElementById('debtGrid').textContent.includes('1000 USD · kalan 800 · bugünkü kurla ₺40.000,00')), true);
    await page.evaluate(() => { const id = S.debts()[0].id; document.getElementById('pay_amt_' + id).value = '40000'; App.Debts.addPayment(id); });
    eq('kalan ödenince kapanır', await page.evaluate(() => { const x = S.debts()[0]; return [x.settled, x.amount]; }), [true, 49000]);
    await page.evaluate(() => { const g = (i, v) => { document.getElementById(i).value = v; }; g('debtDir', 'borrowed'); g('debtPerson', 'Veli'); g('debtAmt', '5'); g('debtCur', 'GOLD_QUARTER'); g('debtDate', '2026-11-10'); App.Debts.add(); g('debtPerson', 'Can'); g('debtAmt', '500'); g('debtCur', ''); g('debtDate', '2026-11-10'); App.Debts.add(); });
    eq('5 çeyrek = 35.000 ₺; TL borç eskisi gibi', await page.evaluate(() => S.debts().slice(1).map(x => [x.amount, x.cur || '', 'qty' in x])), [[35000, 'GOLD_QUARTER', true], [500, '', false]]);
    await ctx.close();
  }
  // 5) Fon stopajı: 100 adet, alış 10, fiyat 15, stopaj %10: kâr 500, stopaj 50, net 450; satışta hesaba 1.450 girer
  {
    const fon = { id: 'pa1', type: 'FUND', qty: 100, cost: 10, currentPrice: 15, label: 'Para Piyasası', code: '', priceDate: '', priceSource: '', tax: 10, ts: at('2026-01-01') };
    const { page, ctx } = await open('2026-11-10', { pf_p: [fon, Object.assign({}, fon, { id: 'pa2', label: 'Hisse Fonu', tax: undefined })] });
    eq('stopaj yalnız oranı olan fonda', await page.evaluate(() => S.portfolio().map(a => [App.Portfolio.netTax(a), a.tax || 0])), [[50, 10], [0, 0]]);
    await page.evaluate(() => App.UI.nav('portfoy')); await page.waitForTimeout(100);
    eq('kartta ve özette net kâr', await page.evaluate(() => [document.getElementById('portGrid').textContent.includes('Stopaj %10 sonrası net ▲ ₺450,00'), document.getElementById('portfolioSummary').textContent.includes('Stopaj sonrası net: ₺950,00')]), [true, true]);
    await page.evaluate(() => App.Portfolio.sell('pa1')); await fill(page, { qty: '100', price: '15', date: '2026-11-10', accountId: 'b' });
    eq('satışta stopaj düşülür', await page.evaluate(() => [S.txns().map(t => [t.type, t.amount, t.category]), App.Accounts.get('b').balance, S.portfolio().length]), [[['income', 1450, 'Transfer']], 51450, 1]);
    await ctx.close();
  }
  // 6) Taksitli nakit avans: 12.000 çekildi, 3 taksit, toplam 13.200: hesaba 12.000 girer, gider yalnız 1.200 faiz
  {
    const kart = { id: 'k', name: 'World', type: 'card', owner: 'shared', last4: '1234', balance: 0, openingBalance: 0, limit: 50000, statementDay: 20, dueOffset: 10, ts: at('2025-01-01') };
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(1000), kart] });
    await page.evaluate(() => App.Cards.advance('k')); await fill(page, { amount: '12000', count: '1', total: '13200', date: '2026-11-10', to: 'b' });
    eq('tek taksit kabul edilmez', await page.evaluate(() => S.txns().length), 0);
    await fill(page, { amount: '12000', count: '3', total: '13200', date: '2026-11-10', to: 'b' });
    const r = await page.evaluate(() => ({ t: S.txns().map(t => [t.date, t.type, t.amount, t.category, t.accountId]).sort((a, b) => (a[0] + a[3]).localeCompare(b[0] + b[3])), b: App.Accounts.get('b').balance, k: App.Accounts.get('k').balance, ay: App.Transactions.monthTotals('2026-11'), kat: App.Transactions.catTotals('2026-11'), akis: App.Cashflow.items(70).filter(x => x.card).map(x => [x.date, x.amount]).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]) }));
    eq('kayıtlar: hesaba giriş + 3 anapara + 3 faiz taksiti', r.t, [['2026-11-10', 'expense', 400, 'Diğer', 'k'], ['2026-11-10', 'expense', 4000, 'Transfer', 'k'], ['2026-11-10', 'income', 12000, 'Transfer', 'b'], ['2026-12-10', 'expense', 400, 'Diğer', 'k'], ['2026-12-10', 'expense', 4000, 'Transfer', 'k'], ['2027-01-10', 'expense', 400, 'Diğer', 'k'], ['2027-01-10', 'expense', 4000, 'Transfer', 'k']]);
    eq('hesap +12.000, kart borcu ilk taksit kadar', [r.b, r.k], [13000, -4400]);
    eq('bu ay gelir yok, gider yalnız 400 faiz', [r.ay.income, r.ay.expense, r.kat], [0, 400, { 'Diğer': 400 }]);
    eq('gelecek taksitler ekstre tahmininde (anapara dahil)', r.akis, [['2026-12-10', 400], ['2026-12-10', 4000], ['2027-01-10', 400], ['2027-01-10', 4000]]);
    await page.evaluate(() => App.UI.nav('islemler')); await page.waitForTimeout(150);
    await ctx.close();
  }
  // 7) Bütçe limiti uyarısı: %80 ve %100'de birer kez; açılışta eski durum için uyarı yok
  {
    const { page, ctx } = await open('2026-11-10', { pf_b: { Market: 10000, 'Eğlence': 2000 }, pf_t: [tx('2026-11-03', 'expense', 5000, 'Market', 'Migros'), tx('2026-11-04', 'expense', 1900, 'Eğlence', 'Sinema')] });
    const add = (amt, cat) => page.evaluate(a => { const t = S.txns(); t.unshift({ id: 'x' + t.length, type: 'expense', amount: a.amt, category: a.cat, date: '2026-11-10', note: 'Test', accountId: 'b', userId: 'u_a', ts: Date.now(), balanceApplied: true }); S.saveTxns(t); return App.Budget.checkAlerts(); }, { amt, cat });
    eq('açılışta %95 dolu Eğlence için uyarı yok', await page.evaluate(() => App.Budget.checkAlerts()), []);
    eq('%79: uyarı yok', await add(2900, 'Market'), []);
    eq('%80 geçilince bir kez', await add(300, 'Market'), ["⚠️ Market bütçesinin %82'i doldu: kalan ₺1.800,00, 21 gün var"]);
    eq('aynı düzeyde tekrar etmez', await add(100, 'Market'), []);
    eq('limit aşılınca bir kez', await add(2000, 'Market'), ['🚨 Market bütçesi aşıldı: ₺10.300,00 / ₺10.000,00']);
    eq('aşıldıktan sonra susar', await add(500, 'Market'), []);
    eq('öbür kategori ayrı izlenir', await add(200, 'Eğlence'), ['🚨 Eğlence bütçesi aşıldı: ₺2.100,00 / ₺2.000,00']);
    await ctx.close();
  }
  // 8) Aktarımda yön açık yazılır: hangi hesaptan çıktı, hangi hesaba girdi
  {
    const acc = [bank(40000, 'a1', { name: 'Akbank Vadesiz', last4: '4821' }), bank(15000, 'a2', { name: 'Yapı Kredi Vadesiz' }), { id: 'k', name: 'World Kart', type: 'card', owner: 'shared', last4: '2947', balance: -3000, openingBalance: -3000, limit: 50000, ts: at('2025-01-01') }];
    const t = [tx('2026-11-08', 'expense', 5000, 'Transfer', 'Akbank Vadesiz → Yapı Kredi Vadesiz', 'a1', { id: 'o1', transferId: 'tr1' }), tx('2026-11-08', 'income', 5000, 'Transfer', 'Akbank Vadesiz → Yapı Kredi Vadesiz', 'a2', { id: 'i1', transferId: 'tr1' }),
      tx('2026-11-07', 'expense', 2000, 'Transfer', 'Kart borcu ödemesi: World Kart', 'a2', { id: 'o2', transferId: 'tr2' }), tx('2026-11-07', 'income', 2000, 'Transfer', 'Kart borcu ödemesi: World Kart', 'k', { id: 'i2', transferId: 'tr2' }),
      tx('2026-11-06', 'income', 7000, 'Transfer', 'Gelen para: Deniz Kaya (kendi hesabınızdan)', 'a1', { id: 's1', src: 'sms', xext: true }), tx('2026-11-05', 'expense', 900, 'Transfer', 'Birikime', 'a1', { id: 's2', src: 'sms', xext: true }),
      tx('2026-11-04', 'income', 1500, 'Diğer', 'Gelen para: Ali Veli', 'a2', { id: 'p1', src: 'sms' }), tx('2026-11-03', 'expense', 22000, 'Kira', 'Giden para: Ev Sahibi', 'a1', { id: 'p2', src: 'sms' }), tx('2026-11-02', 'expense', 300, 'Market', 'Migros', 'a1', { id: 'n1' })];
    const { page, ctx } = await open('2026-11-10', { pf_a: acc, pf_t: t });
    await page.evaluate(() => App.UI.nav('islemler')); await page.waitForTimeout(150);
    const rows = await page.evaluate(() => { const o = {}; [...document.querySelectorAll('#txnList .ti')].forEach(r => { const e = r.querySelector('[onclick*="edit"]'), id = e && /'([^']+)'/.exec(e.getAttribute('onclick'))[1]; o[id] = [...r.querySelectorAll('.ti-route > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim()); }); return o; });
    eq('hesaplar arası: çıkan ve giren hesap', rows.o1, ['⬆ Çıkan hesap: Akbank Vadesiz …4821', '⬇ Giren hesap: Yapı Kredi Vadesiz']);
    eq('kart ödemesi: hesaptan karta', rows.o2, ['⬆ Çıkan hesap: Yapı Kredi Vadesiz', '⬇ Giren hesap: World Kart …2947']);
    eq('uygulamada olmayan hesabımdan gelen', rows.s1, ['⬆ Çıkan hesap: uygulamada olmayan hesabım', '⬇ Giren hesap: Akbank Vadesiz …4821']);
    eq('uygulamada olmayan hesabıma giden', rows.s2, ['⬆ Çıkan hesap: Akbank Vadesiz …4821', '⬇ Giren hesap: uygulamada olmayan hesabım']);
    eq('başkasından gelen havale: girdiği hesap', rows.p1, ['⬇ Giren hesap: Yapı Kredi Vadesiz']);
    eq('başkasına giden havale: çıktığı hesap', rows.p2, ['⬆ Çıkan hesap: Akbank Vadesiz …4821']);
    eq('sıradan harcamada yön satırı yok', rows.n1, []);
    await ctx.close();
  }
  // 9) "Bunu alırsam ne olur?" her yerden açılır; sonuç yazarken güncellenir, hiçbir şey kaydedilmez
  {
    const kart = { id: 'k', name: 'World Kart', type: 'card', owner: 'shared', last4: '2947', balance: -3000, openingBalance: -3000, limit: 20000, statementDay: 20, dueOffset: 10, ts: at('2025-01-01') };
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(10000), kart] });
    eq('Özet düğmesi ve Daha menüsü', await page.evaluate(() => { const q = !!document.querySelector('#page-ozet .quick-btn.qwi'); App.UI.moreMenu(); const m = [...document.querySelectorAll('.more-grid-item')].some(x => /Alırsam Ne Olur/.test(x.textContent)); App.UI.moreClose(); return [q, m]; }), [true, true]);
    await page.evaluate(() => document.querySelector('#page-ozet .quick-btn.qwi').click()); await page.waitForTimeout(100);
    const type = (amt, inst, acc) => page.evaluate(o => { const g = i => document.getElementById(i); g('wiAcc').value = o.acc; g('wiInst').value = o.inst; g('wiAmt').value = o.amt; g('wiAmt').dispatchEvent(new Event('input', { bubbles: true })); return g('wiRes').innerText.replace(/\s+/g, ' ').trim(); }, { amt, inst, acc });
    const a = await type('6000', '3', 'k');
    eq('karta 3 taksit: aksatmıyor, limit ve taksit yükü', [/Sonuç: ✓ Yaklaşan ödemeleri aksatmıyor/.test(a), /Kartta kalan limit ₺17\.000,00 → ₺11\.000,00/.test(a), /Aylık taksit yükü ₺2\.000,00 × 3 ay/.test(a), /90 günün en düşük bakiyesi/.test(a)], [true, true, true, true]);
    const b = await type('15000', '1', 'b');
    eq('hesaptan peşin: 10.000 − 15.000 − 3.000 kart ekstresi = 8.000 açık', [/Sonuç: ⚠️ .*hesaplar ₺8.000,00 eksiye düşer/.test(b), /Aylık taksit/.test(b)], [true, false]);
    eq('hiçbir şey kaydedilmez', await page.evaluate(() => [S.txns().length, App.Accounts.get('b').balance, App.Accounts.get('k').balance]), [0, 10000, -3000]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
