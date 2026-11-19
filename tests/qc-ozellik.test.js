// Usage: node tests/qc-ozellik.test.js
// Kasım 2026 yeni özellikleri (beklenen değerler elle hesaplandı):
//  1) İşlem bölme: tek kayıt istenen kadar kategoriye ayrılır, toplam ve bakiye değişmez; banka mesajının öbür kanaldan gelen eşi toplamla tanınır.
//  2) Şifreli yedek: parola olmadan okunamaz, doğru parolayla geri yüklenir, yanlış parolada veri değişmez.
//  3) Ortak gider dengeleme: kişisel hesaptan ödenen ortak giderler eşit paylaşılır; ortak hesap ve istek harcaması sayılmaz.
//  4) Döviz/altın borç kurla yeniden değerlenir.  5) Fon stopajı net kârı gösterir.  6) Taksitli nakit avans gelir/gider şişirmez.
//  7) Bütçe limiti uyarısı %80 ve %100'de birer kez gelir.
//  8) Aktarımda çıkan/giren hesap.  9) "Bunu alırsam ne olur?" erişimi.  10) Hızlı komut satırı.  11-12) Açılamayan kayıtlar.  13-14) Ayın değerlendirmesi.  15-16) Yapay zekânın yazdığı değerlendirme.  17) Sabit gider öneriye girmez.  18-19) /review düzeltmeleri ve kararları.
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

  // 1) İşlem bölme: istenen kadar kaleme
  {
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(47500, 'b', { openingBalance: 50000 })], pf_t: [tx('2026-11-08', 'expense', 2500, 'Market', 'Migros', 'b', { id: 'm1', src: 'sms', sh: 'abc123' })] });
    eq('düzenlemeden Kalemlere Böl açılır', await page.evaluate(() => { App.Transactions.edit('m1'); const m = [...document.querySelectorAll('.modal-bd.show')].pop(), b = m.querySelector('[data-act="extra"]'), ok = !!b && /Kalemlere Böl/.test(b.textContent); b.click(); return [ok, !!document.getElementById('splitHolder'), document.querySelectorAll('#spRows .sp-row').length, !!m.querySelector('[data-pkey="spAmt"]')]; }), [true, true, 1, false]);
    const rows = parts => page.evaluate(parts => { const box = document.getElementById('spRows'); while (box.children.length < parts.length) App.Transactions.splitRow(); [...box.children].forEach((r, i) => { r.querySelector('.sp-c').value = parts[i] ? parts[i][0] : ''; r.querySelector('.sp-a').value = parts[i] ? parts[i][1] : ''; }); App.Transactions.splitCalc(); const left = document.getElementById('spLeft').textContent; App.Transactions.splitSave(); return [left, S.txns().length]; }, parts);
    eq('toplamın tamamı ayrılamaz', await rows([['Çocuk', '2500']]), ['Ayrılan toplam, işlem tutarından küçük olmalı.', 1]);
    eq('kalanın kategorisi seçilemez', (await rows([['Market', '700']]))[1], 1);
    eq('kategorisiz kalem kabul edilmez', (await rows([['', '700']]))[1], 1);
    eq('üç kaleme bölünür; kalan canlı yazar', await rows([['Çocuk', '500'], ['Ev ve Bakım', '200']]), ['Kalan: ₺1.800,00 Market', 3]);
    eq('1.800 Market + 500 Çocuk + 200 Ev ve Bakım', await page.evaluate(() => S.txns().map(t => [t.amount, t.category, t.note, t.date, t.sg, t.src]).sort((a, b) => b[0] - a[0])), [[1800, 'Market', 'Migros', '2026-11-08', 'm1', 'sms'], [500, 'Çocuk', 'Migros', '2026-11-08', 'm1', 'sms'], [200, 'Ev ve Bakım', 'Migros', '2026-11-08', 'm1', 'sms']]);
    eq('bakiye değişmez, pencere kapanır', await page.evaluate(() => [App.Accounts.get('b').balance, !!document.getElementById('splitHolder')]), [47500, false]);
    eq('kategori toplamları', await page.evaluate(() => { const c = App.Transactions.catTotals('2026-11'); return [c.Market, c['Çocuk'], c['Ev ve Bakım']]; }), [1800, 500, 200]);
    eq('aynı harcamanın e-postası ikinci kez yazılmaz', await page.evaluate(() => { const r = App.BankSms.ingest([{ id: 5, label: 'gmailbox_u_a', text: 'Akbank\nKartinizla MIGROS isyerinden 2.500,00 TL harcama yapilmistir.\nE-posta tarihi: 08.11.2026 14:00', receivedAt: Date.now() }]); return [r.added, S.txns().length, App.Accounts.get('b').balance]; }), [0, 3, 47500]);
    eq('parça yeniden bölünebilir, grup aynı kalır', await page.evaluate(() => { const p = S.txns().find(t => t.category === 'Çocuk'), r = App.Transactions.split(p.id, [{ category: 'Giyim', amount: 100 }]); return [typeof r, S.txns().length, S.txns().every(t => t.sg === 'm1'), App.Accounts.get('b').balance]; }), ['object', 4, true, 47500]);
    eq('aktarım bölünemez', await page.evaluate(() => { const t = S.txns(); t.unshift({ id: 'x1', type: 'expense', amount: 100, category: 'Transfer', date: '2026-11-09', note: '', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true }); S.saveTxns(t); return App.Transactions.split('x1', [{ category: 'Market', amount: 10 }]); }), 'Bu kayıt bölünemez.');
    await page.reload(); await page.waitForTimeout(200);
    eq('yeniden açılınca grup korunur', await page.evaluate(() => S.txns().filter(t => t.id !== 'x1').every(t => t.sg === 'm1')), true);
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
  // 10) Hızlı komut satırı: metin çözülür, formun kendi kuralları geçerlidir
  {
    const acc = [bank(40000, 'a1', { name: 'Akbank Vadesiz' }), bank(2000, 'n1', { name: 'Cüzdan', type: 'cash' }), { id: 'k', name: 'World Kart', type: 'card', owner: 'shared', last4: '2947', balance: 0, openingBalance: 0, limit: 50000, statementDay: 20, dueOffset: 10, ts: at('2025-01-01') }];
    const { page, ctx } = await open('2026-11-10', { pf_a: acc });
    const P = t => page.evaluate(t => { const p = App.Cmd.parse(t); return p && [p.type, p.amount, p.category, p.note, p.accId, p.inst, p.tags, p.date, p.err ? 'hata' : '']; }, t);
    eq('"850 migros"', await P('850 migros'), ['expense', 850, 'Market', 'Migros', '', 1, [], '2026-11-10', '']);
    eq('kategori sözcüğü nottan çıkar', await P('850 migros market'), ['expense', 850, 'Market', 'Migros', '', 1, [], '2026-11-10', '']);
    eq('taksit: tek kart kendiliğinden seçilir', await P('12000 teknosa 4 taksit'), ['expense', 12000, 'Diğer', 'Teknosa', 'k', 4, [], '2026-11-10', '']);
    eq('gelir', await P('+78000 maaş'), ['income', 78000, 'Maaş', '', '', 1, [], '2026-11-10', '']);
    eq('kuruş, nakit, etiket, dün', await P('1.450,75 opet nakit #yol dün'), ['expense', 1450.75, 'Ulaşım', 'Opet', 'n1', 1, ['yol'], '2026-11-09', '']);
    eq('aktarım', await page.evaluate(() => { const p = App.Cmd.parse('transfer 5000 akbank → world'); return [p.type, p.amount, p.accId, p.toId, p.err]; }), ['transfer', 5000, 'a1', 'k', '']);
    eq('tutarsız metin ve hatalar', await page.evaluate(() => [App.Cmd.parse('migros'), App.Cmd.parse('transfer 5000 akbank → akbank').err, App.Cmd.parse('500 migros nakit 3 taksit').err, App.Cmd.parse('+5000 maaş 3 taksit').err].map(x => x === null ? null : !!x)), [null, true, true, true]);
    const run = t => page.evaluate(t => { const i = document.getElementById('cmdInp'); i.value = t; App.Cmd.preview(); const prev = document.getElementById('cmdPrev').textContent; App.Cmd.run(); return [prev, i.value]; }, t);
    eq('önizleme ve kayıt', await run('850 migros #mutfak'), ['− Gider · ₺850,00 · Market · Migros · varsayılan hesap · #mutfak', '']);
    await run('12000 teknosa 4 taksit'); await run('transfer 5000 akbank → world'); await run('450 opet nakit');
    eq('hatalı komut kaydetmez, yazı durur', (await run('500 migros nakit 3 taksit'))[1], '500 migros nakit 3 taksit');
    const r = await page.evaluate(() => ({ t: S.txns().map(t => [t.type, t.amount, t.category, t.accountId, t.installment ? t.installment.index + '/' + t.installment.total : '', (t.tags || []).join()]).sort((a, b) => (a[2] + a[4] + a[0]).localeCompare(b[2] + b[4] + b[0])), bal: ['a1', 'n1', 'k'].map(i => App.Accounts.get(i).balance) }));
    eq('kayıtlar: gider, 4 taksit, aktarım çifti, nakit gider', r.t.map(x => x.join('|')), ['expense|3000|Diğer|k|1/4|', 'expense|3000|Diğer|k|2/4|', 'expense|3000|Diğer|k|3/4|', 'expense|3000|Diğer|k|4/4|', 'expense|850|Market|a1||mutfak', 'expense|5000|Transfer|a1||', 'income|5000|Transfer|k||', 'expense|450|Ulaşım|n1||']);
    eq('bakiyeler: 40.000 − 850 − 5.000; nakit 2.000 − 450; kart −3.000 + 5.000', r.bal, [34150, 1550, 2000]);
    await ctx.close();
  }
  // 11) Açılamayan kayıtlar: listeden çıkar, aslı birikir (üzerine yazılmaz), Ayarlar'da görünür, yedeğe girer
  {
    const bozuk = [tx('2026-11-08', 'expense', 300, 'Market', 'Migros', 'b', { id: 'ok1' }), 'bozuk-metin', 42, null];
    const { page, ctx } = await open('2026-11-10', { pf_t: bozuk, pf_g: ['bozuk-hedef'] });
    const st = () => page.evaluate(() => { const o = JSON.parse(localStorage.getItem('pf_invalid_records') || 'null'); return o ? o.records.map(r => [r.store, r.value]) : []; });
    const kayit = await page.evaluate(() => S.txns().map(t => t.id));
    const ilk = await st();
    eq('sağlam kayıt kalır', kayit, ['ok1']);
    eq('bozuklar içi boş kayda dönüşmez, saklanır', ilk, [['pf_t', 'bozuk-metin'], ['pf_t', 42], ['pf_t', null], ['pf_g', 'bozuk-hedef']]);
    await page.evaluate(() => { S.load(); S.load(); });
    eq('yeniden açılışta aynısı iki kez eklenmez', (await st()).length, ilk.length);
    await page.evaluate(() => { localStorage.setItem('pf_d', JSON.stringify(['bozuk-borc'])); S.load(); });
    const sonra = await st();
    eq('yeni bozuk kayıt eskilerin üzerine yazmaz', [sonra.length > ilk.length, ilk.every(a => sonra.some(b => JSON.stringify(a) === JSON.stringify(b)))], [true, true]);
    await page.evaluate(() => { App.UI.nav('ayarlar'); App.Settings.render(); });
    eq('Ayarlar uyarısı ve düğmesi', await page.evaluate(() => [/kayıt okunamadığı için listelerden çıkarıldı/.test(document.getElementById('setInvalid').textContent), /Açılamayan Kayıtlar \(\d+\)/.test(document.getElementById('setInvalid').textContent)]), [true, true]);
    await page.evaluate(() => App.Invalid.open());
    eq('pencere: her kayıt görünür, metin kaçışlı', await page.evaluate(() => [document.querySelectorAll('#invHolder .sms-q-item').length, App.Invalid.list().length]), [sonra.length, sonra.length]);
    eq('tam yedeğe eklenir', await page.evaluate(() => (App.Backup.snapshot().invalidRecords || []).length), sonra.length);
    await page.evaluate(() => App.Invalid.clear()); await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
    eq('temizlenince kart kaybolur', await page.evaluate(() => [localStorage.getItem('pf_invalid_records'), document.getElementById('setInvalid').textContent]), [null, '']);
    await ctx.close();
  }
  // 12) Kötü niyetli bozuk kayıt pencerede çalışmaz
  {
    const { page, ctx } = await open('2026-11-10', { pf_t: [['<img src=x onerror=window.__inv=1>']] });
    await page.evaluate(() => App.Invalid.open()); await page.waitForTimeout(100);
    eq('XSS çalışmaz', await page.evaluate(() => window.__inv || 0), 0);
    await ctx.close();
  }
  // 13) Ayın değerlendirmesi (yapay zekâsız): Ekim, önceki 3 ayla karşılaştırılır. Elle hesap:
  //  Market 6.000 ort. → 11.000 (Migros 6.000, A101 3.000, kişiye havale 2.000): +5.000; limit 8.000, 3.000 aşım
  //  Yiyecek 1.000 ort. → Yemeksepeti 6 × 450 = 2.700: +1.700; sık tekrar 2.700 → yarısı 1.350
  //  Banka ücreti: yıllık üyelik 2.834 + gecikme faizi 120 = 2.954; abonelik 229,99
  {
    const hist = [];
    ['2026-07', '2026-08', '2026-09'].forEach(m => hist.push(tx(m + '-05', 'income', 40000, 'Maaş', 'Maaş'), tx(m + '-06', 'expense', 15000, 'Kira', 'Kira'), tx(m + '-10', 'expense', 6000, 'Market', 'Migros'), tx(m + '-12', 'expense', 1000, 'Yiyecek', 'Restoran')));
    const ekim = [tx('2026-10-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-10-06', 'expense', 15000, 'Kira', 'Kira'), tx('2026-10-08', 'expense', 6000, 'Market', 'Migros'), tx('2026-10-15', 'expense', 3000, 'Market', 'A101'),
      tx('2026-10-16', 'expense', 2000, 'Market', 'Giden para: Ahmet Yılmaz'), tx('2026-10-20', 'expense', 2834, 'Diğer', 'Yıllık Üyelik Ücreti'), tx('2026-10-21', 'expense', 120, 'Diğer', 'Gecikme faizi')];
    for (let i = 0; i < 6; i++) ekim.push(tx('2026-10-' + String(10 + i * 3).padStart(2, '0'), 'expense', 450, 'Yiyecek', 'Yemeksepeti'));
    const rec = { id: 'nf', type: 'expense', amount: 229.99, category: 'Eğlence', day: 3, note: 'Netflix', accountId: 'b', userId: '', active: true, isSubscription: true, autoLog: false, autoFrom: '', autoDone: '', ts: at('2026-01-01') };
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(100000)], pf_t: hist.concat(ekim), pf_r: [rec], pf_b: { Market: 8000 } });
    const r = await page.evaluate(() => App.Review.compute('2026-10'));
    eq('özet rakamlar', [r.income, r.expense, r.net, r.avgExpense, r.histMonths], [40000, 31654, 8346, 22000, 3]);
    eq('bütçe: Market 11.000 / 8.000', r.budget.map(b => [b.cat, b.spent, b.limit, b.pct, b.left]), [['Market', 11000, 8000, 138, -3000]]);
    eq('sapmalar ve işyerleri (kişiye havale işyeri sayılmaz)', r.spikes.map(x => [x.cat, x.amount, x.avg, x.diff, x.places.map(p => p.name)]), [['Market', 11000, 6000, 5000, ['Migros', 'A101']], ['Yiyecek', 2700, 1000, 1700, ['Yemeksepeti']]]);
    eq('banka ücreti ve faiz', [r.leaks.total, r.leaks.items.map(x => x.amount)], [2954, [2834, 120]]);
    eq('sık küçük harcama', r.frequent.map(x => [x.name, x.count, x.total]), [['Yemeksepeti', 6, 2700]]);
    eq('abonelik', [r.subs.count, r.subs.monthly], [1, 229.99]);
    eq('kısma önerileri büyükten küçüğe', r.cuts.map(c => c.save), [5000, 2954, 1700, 1350, 229.99]);
    eq('hatalar: bütçe aşımı, ücretler, kontrol edilmemiş kayıt', r.findings.map(x => [x.amount, x.text.replace(/<[^>]+>/g, '')]), [[3000, 'Market bütçesi ₺3.000,00 aşıldı (limit ₺8.000,00, harcanan ₺11.000,00).'], [2954, 'Faiz ve banka ücretlerine ₺2.954,00 ödendi.'], [0, r.openChecks + ' şüpheli kayıt henüz kontrol edilmedi; toplamlar değişebilir (Ay Kontrolü).']]);
    eq('Ay Kontrolü kişiye giden havaleyi soruyor', r.openChecks >= 1, true);
    eq('özet cümlesi', (await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Review.summary(App.Review.compute('2026-10')); return d.textContent; })), "Ekim'de ₺40.000,00 geldi, ₺31.654,00 harcandı; ₺8.346,00 arta kaldı. 1 bütçeden 1 tanesi aşıldı. En büyük kısma fırsatı: Market'i son 3 ayın ortalamasına (₺6.000,00) indirmek (ayda ~₺5.000,00).");
    // Rapor penceresinden açılır
    await page.evaluate(() => App.Report.open('2026-10')); await page.waitForTimeout(150);
    await page.evaluate(() => [...document.querySelectorAll('#rapHolder button')].find(b => /Ayın Değerlendirmesi/.test(b.textContent)).click()); await page.waitForTimeout(100);
    eq('pencere bölümleri', await page.evaluate(() => [...document.querySelectorAll('#revHolder .rv-h')].map(x => x.textContent)), ['📊 Bütçe durumu', '⚠️ Nerede kaçtı', '🔍 Gözden geçirmeye değer', '✂️ Kısabileceğin yerler']);
    eq('PDF bölümü', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); const sec = [...d.querySelectorAll('.pr-sec')].find(x => /Ayın değerlendirmesi/.test(x.textContent)); return sec ? [sec.querySelectorAll('.pr-rv').length, sec.querySelectorAll('.pr-al').length] : 0; }), [9, 0]);
    // Dışarı gidebilecek özet: kişi adı, kişiye giden havale, hesap adı ve bakiye yok
    const fx = await page.evaluate(() => JSON.stringify(App.Review.facts('2026-10')));
    eq('özette kişisel bilgi yok', ['Ahmet', 'Deniz', 'Ece', 'Vadesiz', '100000', 'balance'].filter(w => fx.includes(w)), []);
    // Ücret satırı notla değil sabit etiketle gider ("Üyelik Ücreti" → "Kart ücreti")
    eq('özette tespitler var', ['Migros', 'Yemeksepeti', 'Kart ücreti', 'Netflix'].every(w => fx.includes(w)), true);
    eq('belirtme eki', await page.evaluate(() => App.Review.compute('2026-10').cuts.slice(0, 3).map(c => c.title.split(' son ')[0])), ["Market'i", 'Faiz ve ücretlerden kurtulmak (kart borcunu', "Yiyecek'i"]);
    await ctx.close();
  }
  // 14) Değerlendirme: verisi az ay hata vermez; ilk ay (geçmiş yok) karşılaştırma yapmaz
  {
    const { page, ctx } = await open('2026-11-10', { pf_t: [tx('2026-11-03', 'expense', 500, 'Market', 'Migros')] });
    const r = await page.evaluate(() => { const x = App.Review.compute('2026-11'); App.Review.open('2026-11'); return [x.spikes.length, x.cuts.length, x.partial, document.querySelectorAll('#revHolder .rv-empty').length]; });
    eq('geçmiş yok: sapma ve öneri yok, boş mesajlar görünür', r, [0, 0, true, 4]);
    eq('boş ayda PDF bölümü çıkmaz', await page.evaluate(() => App.Review.pdfSection('2026-11')), '');
    await ctx.close();
  }
  // 15) Yapay zekâ değerlendirmesi: onay, yalnız özet gider, rakamı tutmayan cümle atılır, sonuç verinin imzasıyla saklanır, PDF'e girer
  {
    const hist = [];
    ['2026-07', '2026-08', '2026-09'].forEach(m => hist.push(tx(m + '-05', 'income', 40000, 'Maaş', 'Maaş'), tx(m + '-06', 'expense', 15000, 'Kira', 'Kira'), tx(m + '-10', 'expense', 6000, 'Market', 'Migros')));
    const ekim = [tx('2026-10-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-10-06', 'expense', 15000, 'Kira', 'Kira'), tx('2026-10-08', 'expense', 11000, 'Market', 'Migros'), tx('2026-10-16', 'expense', 2000, 'Market', 'Giden para: Ahmet Yılmaz')];
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(100000)], pf_t: hist.concat(ekim), pf_b: { Market: 8000 } });
    await page.route('https://sync.test/v1/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviewAI: true }) }));
    await page.evaluate(() => {
      window.__calls = []; window.__resp = null;
      App.Sync.configured = () => true; App.Sync.cfg = () => ({ url: 'https://sync.test', vault: 'v', key: 'k' });
      App.Sync.api = (c, m, p, b) => { if (p !== '/review') return Promise.resolve({ status: 404, body: {} }); window.__calls.push(b); return Promise.resolve(window.__resp); };
    });
    eq('rakam denetimi', await page.evaluate(() => { const f = App.Review.facts('2026-10'); return [App.Review.check('Market bütçesi ₺5.000,00 aşıldı, %163 doldu, 3 ay', f), App.Review.check('Kartına ₺9.999 faiz ödedin', f), App.Review.check('₺40.000 geldi', f), App.Review.check('Market ₺13.000 oldu', f)]; }), [true, false, true, true]);
    await page.evaluate(() => { window.__resp = { status: 200, body: { summary: "Ekim'de ₺40.000 geldi, ₺28.000 harcadın. **Market** öne çıkıyor.", budget: 'Market bütçesi ₺8.000 iken ₺13.000 harcandı.', mistakes: ['Market bütçesini ₺5.000 aştın.', 'Kartına ₺9.999 faiz ödedin.'], review: ['<img src=x onerror=window.__ai=1> Migros ₺11.000.'], cuts: ["Market'i ortalamaya indirirsen ayda ₺7.000 kalır."] } }; App.Review.open('2026-10'); });
    await page.waitForFunction(() => { const b = document.getElementById('revAiBtn'); return b && !b.hidden; }, null, { timeout: 5000 });
    await page.evaluate(() => document.getElementById('revAiBtn').click()); await page.waitForTimeout(100);
    eq('ilk seferde onay sorulur, gönderilmez', await page.evaluate(() => [!!document.querySelector('.modal-bd.show [data-act="ok"]') && /DeepSeek/.test([...document.querySelectorAll('.modal-bd.show')].pop().textContent), window.__calls.length]), [true, 0]);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(200);
    const sent = await page.evaluate(() => JSON.stringify(window.__calls[0]));
    eq('yalnız özet gider: kişi adı, havale, hesap, bakiye yok', [!!sent && sent.includes('"facts"'), ['Ahmet', 'Deniz', 'Ece', 'Vadesiz', '100000'].filter(w => sent.includes(w))], [true, []]);
    const box = await page.evaluate(() => document.getElementById('revAi').innerText.replace(/\s+/g, ' '));
    // ₺9.999 hiçbir rakamda yok, atılır; ₺7.000 Market'in ortalamadan farkı (13.000 − 6.000), kalır
    eq('gösterilen değerlendirme', [/Ekim'de ₺40\.000 geldi, ₺28\.000 harcadın\. Market öne çıkıyor\./.test(box), /9\.999/.test(box), /tutmayan 1 cümle gösterilmedi/.test(box), /ayda ₺7\.000 kalır/.test(box)], [true, false, true, true]);
    eq('model metni kaçışlı', await page.evaluate(() => [window.__ai || 0, document.querySelectorAll('#revAi img').length]), [0, 0]);
    eq('saklanır; düğme "Yeniden Yaz"', await page.evaluate(() => [!!localStorage.getItem('ft_rev_ai_2026-10'), document.getElementById('revAiBtn').textContent]), [true, '🔄 Yeniden Yaz']);
    eq('PDF başında yapay zekânın özeti', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); const sec = [...d.querySelectorAll('.pr-sec')].find(x => /Ayın değerlendirmesi/.test(x.textContent)); return [!!sec && /Ekim'de ₺40\.000 geldi/.test(sec.textContent), !!sec && /yorum yapay zekânın, rakamlar uygulamanın/.test(sec.textContent)]; }), [true, true]);
    // İkinci seferde onay sorulmaz; rakamları hiç tutmayan cevap kullanılmaz, eski sonuç kalır
    await page.evaluate(() => { window.__resp = { status: 200, body: { summary: 'Bu ay ₺77.777 harcadın.', budget: '', mistakes: [], review: [], cuts: [] } }; App.Review.aiWrite('2026-10'); }); await page.waitForTimeout(200);
    eq('tutmayan özet: uyarı, eski sonuç durur', await page.evaluate(() => [window.__calls.length, [...document.querySelectorAll('.toast')].some(t => /rakamlar uygulamanın hesabıyla tutmadı/.test(t.textContent)), /₺28\.000 harcadın/.test(document.getElementById('revAi').textContent)]), [2, true, true]);
    await page.evaluate(() => { window.__resp = { status: 429, body: { error: 'daily_limit' } }; App.Review.aiWrite('2026-10'); }); await page.waitForTimeout(200);
    eq('günlük sınır mesajı', await page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /sınırı doldu/.test(t.textContent))), true);
    // Veri değişince eski değerlendirme gösterilmez, PDF'e girmez
    await page.evaluate(() => { App.UI.closeModal('revHolder'); const t = S.txns(); t.unshift({ id: 'yeni', type: 'expense', amount: 500, category: 'Market', date: '2026-10-20', note: 'A101', accountId: 'b', userId: 'u_a', ts: Date.now(), balanceApplied: true }); S.saveTxns(t); App.Review.open('2026-10'); });
    await page.waitForTimeout(150);
    eq('veri değişti: yeniden yazdırma notu, PDF\'te yok', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); return [/eski verisiyle yazılmıştı/.test(document.getElementById('revAi').textContent), /yorum yapay zekânın|₺28\.000 harcadın/.test(d.textContent)]; }), [true, false]);
    await ctx.close();
  }
  // 16) Sunucuda yapay zekâ yoksa düğme görünmez
  {
    const { page, ctx } = await open('2026-11-10', {});
    await page.evaluate(() => App.Review.open('2026-11')); await page.waitForTimeout(150);
    eq('eşitleme yok: düğme gizli', await page.evaluate(() => document.getElementById('revAiBtn').hidden), true);
    await ctx.close();
  }
  // 17) Sabit gider kısma önerisine girmez: kira her ay 22.000, Eylül'ün kira kaydı eksik → ortalama 14.666,67, Ekim +7.333,33 görünür.
  // "Kirayı ortalamaya indir" denmez; gözden geçir listesinde "zam mı, çift kayıt mı, eksik kayıt mı" diye çıkar. Eğlence (istek) sapması öneri olur
  {
    const hist = [tx('2026-07-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-07-06', 'expense', 22000, 'Kira', 'Kira'), tx('2026-07-12', 'expense', 1000, 'Eğlence', 'Sinema'),
      tx('2026-08-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-08-06', 'expense', 22000, 'Kira', 'Kira'), tx('2026-08-12', 'expense', 1000, 'Eğlence', 'Sinema'),
      tx('2026-09-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-09-12', 'expense', 1000, 'Eğlence', 'Sinema'),
      tx('2026-10-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-10-06', 'expense', 22000, 'Kira', 'Kira'), tx('2026-10-12', 'expense', 3500, 'Eğlence', 'Konser')];
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(100000)], pf_t: hist });
    const r = await page.evaluate(() => App.Review.compute('2026-10'));
    eq('kira sapması sabit gider olarak işaretlenir', r.spikes.map(x => [x.cat, x.diff, x.fixed]), [['Kira', 7333.33, true], ['Eğlence', 2500, false]]);
    eq('kısma önerilerinde kira yok, eğlence var', r.cuts.map(c => [c.title.replace(/<[^>]+>/g, '').split(' son ')[0], c.save]), [["Eğlence'yi", 2500]]);
    eq('gözden geçir: kontrol et uyarısı', r.review.filter(x => /^Kira/.test(x.text.replace(/<[^>]+>/g, ''))).map(x => /Sabit bir gider: zam mı, iki kez mi kaydedildi, yoksa önceki bir ayın kaydı mı eksik/.test(x.text)), [true]);
    // Sabit sapma işyerisiz gider; "Konser" tanınan bir zincir değil, dışarı adı gitmez
    eq('dışarı giden özette sabit işareti, işyeri yok', await page.evaluate(() => App.Review.facts('2026-10').spikes.map(x => [x.cat, x.fixed, x.places ? x.places.length : null])), [['Kira', true, null], ['Eğlence', false, 0]]);
    await ctx.close();
  }
  // 18) /review düzeltmeleri: birimli küçük sayı ve "bin" denetlenir; %99,9 bütçe "aşıldı" sayılmaz; yapay zekâ sonucu başka ayın penceresine yazılmaz,
  // ay başına tek istek gider ve hazır PDF yenilenir; bozuk saklı kayıt raporu düşürmez; D&R gibi adlar HTML varlığıyla gitmez
  {
    const hist = [];
    ['2026-07', '2026-08', '2026-09'].forEach(m => hist.push(tx(m + '-05', 'income', 40000, 'Maaş', 'Maaş'), tx(m + '-10', 'expense', 6000, 'Market', 'Migros')));
    const ekim = [tx('2026-10-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-10-08', 'expense', 7995, 'Market', 'Migros')];
    for (let i = 0; i < 4; i++) ekim.push(tx('2026-10-' + String(11 + i).padStart(2, '0'), 'expense', 300, 'Eğlence', 'D&R'));
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(100000)], pf_t: hist.concat(ekim), pf_b: { Market: 8000 } });
    eq('birimli küçük sayılar ve "bin" kabul edilmez, birimsiz adet geçer', await page.evaluate(() => { const f = App.Review.facts('2026-10'), c = s => App.Review.check(s, f); return [c('Bu ay ₺25 tasarruf edebilirsin.'), c('Market harcaman %17 arttı.'), c('Ayda 18 TL kazanırsın.'), c('Markete 5 bin harcadın.'), c('D&R: ayda 4 kez.'), c('Market ₺7.995 oldu.')]; }), [false, false, false, false, true, true]);
    eq('%99,9 dolan bütçe aşıldı sayılmaz', await page.evaluate(() => { const r = App.Review.compute('2026-10'); return [r.budget[0].pct, r.findings.filter(x => /bütçesi/.test(x.text)).length, /hiçbiri aşılmadı/.test(App.Review.summary(r))]; }), [100, 0, true]);
    eq('dışarı giden öneri başlığında HTML varlığı yok', await page.evaluate(() => { const t = JSON.stringify(App.Review.facts('2026-10').cuts); return [t.includes('D&R'), t.includes('&amp;')]; }), [true, false]);
    // Yarış: Ekim isteği sürerken pencere kapatılıp Eylül açılır; cevap Eylül'ün penceresine yazılmaz, aynı ay için ikinci istek gitmez
    await page.route('https://sync.test/v1/config', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviewAI: true }) }));
    await page.evaluate(() => {
      window.__n = 0; window.__go = null; localStorage.setItem('ft_review_ai_ok', '1');
      App.Sync.configured = () => true; App.Sync.cfg = () => ({ url: 'https://sync.test', vault: 'v', key: 'k' });
      App.Sync.api = (c, m, p) => { if (p !== '/review') return Promise.resolve({ status: 404, body: {} }); window.__n++; return new Promise(res => { window.__go = () => res({ status: 200, body: { summary: "Ekim'de ₺40.000 geldi.", budget: '', mistakes: [], review: [], cuts: [] } }); }); };
      App.Report.open('2026-10'); App.Review.open('2026-10'); App.Review.aiWrite('2026-10'); App.Review.aiWrite('2026-10');
      App.UI.closeModal('revHolder'); App.Review.open('2026-09'); App.Review.aiWrite('2026-10');
    });
    await page.waitForTimeout(100);
    const prep = await page.evaluate(() => { let n = 0; const o = App.Report.prepare; App.Report.prepare = function () { n++; return o.apply(this, arguments); }; window.__prepN = () => n; return true; });
    await page.evaluate(() => window.__go()); await page.waitForTimeout(150);
    eq('ay başına tek istek; Eylül penceresine Ekim yazılmaz; hazır PDF yenilenir', await page.evaluate(() => [window.__n, document.getElementById('revHolder').getAttribute('data-month'), /Ekim'de ₺40\.000 geldi/.test(document.getElementById('revAi').textContent), !!localStorage.getItem('ft_rev_ai_2026-10'), window.__prepN() >= 1]), [1, '2026-09', false, true, prep]);
    // Bozuk saklı kayıt (imzası tutuyor ama listeler yanlış türde) raporu düşürmez
    eq('bozuk saklı kayıt: rapor yine oluşur', await page.evaluate(() => { const k = 'ft_rev_ai_2026-10', o = JSON.parse(localStorage.getItem(k)); o.r.cuts = 'bozuk'; o.r.review = [{ x: 1 }]; localStorage.setItem(k, JSON.stringify(o)); const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); return [/Ayın değerlendirmesi/.test(d.textContent), /\[object Object\]/.test(d.textContent)]; }), [true, false]);
    await ctx.close();
  }
  // 19) /review kararları: (D4) dışarı giden özette kişi adı, zincir olmayan işyeri adı ve uzun numara yok; (D5) yapay zekâ sabit gideri kısma önerisi
  // olarak yazamaz; (D6) kredi faizi ve "ev masrafı" banka ücreti sayılmaz, EFT masrafı sayılır; (D7) PDF'te öneri bir kez çıkar
  {
    const hist = [];
    ['2026-07', '2026-08', '2026-09'].forEach(m => hist.push(tx(m + '-05', 'income', 60000, 'Maaş', 'Maaş'), tx(m + '-10', 'expense', 6000, 'Market', 'Migros'), tx(m + '-12', 'expense', 1000, 'Yiyecek', 'Restoran')));
    hist.push(tx('2026-07-06', 'expense', 22000, 'Kira', 'Kira'), tx('2026-08-06', 'expense', 22000, 'Kira', 'Kira'));
    const ekim = [tx('2026-10-05', 'income', 60000, 'Maaş', 'Maaş'), tx('2026-10-06', 'expense', 22000, 'Kira', 'Kira'), tx('2026-10-08', 'expense', 6000, 'Market', 'Migros'),
      tx('2026-10-09', 'expense', 3000, 'Market', 'GİDEN FAST AHMET YILMAZ'), tx('2026-10-16', 'expense', 2000, 'Diğer', 'Giden para: Faiz Kaya'),
      tx('2026-10-17', 'expense', 50, 'Diğer', 'Hesap işletim ücreti TR12 0006 4000 0011 2345 6789 01'), tx('2026-10-18', 'expense', 12, 'Diğer', 'EFT masrafı'), tx('2026-10-19', 'expense', 400, 'Diğer', 'Ev masrafı'),
      tx('2026-10-10', 'expense', 16000, 'Kredi Ödemesi', 'Kredi taksidi · Akbank', { id: 'kr10' })];
    for (let i = 0; i < 5; i++) ekim.push(tx('2026-10-' + String(20 + i), 'expense', 300, 'Yiyecek', 'Köfteci Yusuf'));
    for (let i = 0; i < 4; i++) ekim.push(tx('2026-10-' + String(25 + i), 'expense', 150, 'Yiyecek', 'Fast Food Corner'));   // "FAST" havalesi değil
    const loan = { id: 'ln1', name: 'Taşıt', kind: 'tasit', principal: 300000, term: 24, first: '2026-08-10', installment: 16000, rate: 3, tax: true, accountId: 'b', prepay: [], closed: null, ts: at('2026-07-01') };
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(100000)], pf_t: hist.concat(ekim), pf_l: [loan] });
    await page.evaluate(() => App.Transactions.splitLoan('kr10'));
    const fx = await page.evaluate(() => JSON.stringify(App.Review.facts('2026-10')));
    eq('D4: özette kişi adı, zincir olmayan işyeri ve hesap numarası yok', ['Faiz Kaya', 'AHMET', 'Köfteci', 'TR12', '0006 4000'].filter(w => fx.includes(w)), []);
    eq('D4: zincir adı ve ücret etiketi özette kalır', [fx.includes('Migros'), fx.includes('Hesap işletim ücreti')], [true, true]);
    eq('D4: ekranda tam adlar görünmeye devam eder', await page.evaluate(() => App.Review.compute('2026-10').frequent.map(x => x.name)), ['Köfteci Yusuf', 'Fast Food Corner']);
    const r = await page.evaluate(() => { const x = App.Review.compute('2026-10'); return { leaks: x.leaks.total, items: x.leaks.items.map(i => i.amount).sort((a, b) => a - b) }; });
    eq('D6: yalnız gerçek banka ücretleri (hesap işletim 50 + EFT masrafı 12); kredi faizi, ev masrafı ve kişiye havale yok', r, { leaks: 62, items: [12, 50] });
    eq('D5: sabit sapma özete farksız gider', await page.evaluate(() => App.Review.facts('2026-10').spikes.filter(x => x.fixed).map(x => [x.cat, 'diff' in x, 'avg' in x])), [['Kira', false, false]]);
    eq('D5: yapay zekânın sabit gider kısma önerisi atılır', await page.evaluate(() => { const f = App.Review.facts('2026-10'), a = App.Review.accept({ summary: "Ekim'de ₺60.000 geldi.", cuts: ["Kira'yı ₺22.000'den aşağı çek.", 'Faturalarda tasarruf yap.', "Yiyecek'i azalt."] }, f); return [a.r.cuts, a.dropped]; }), [["Yiyecek'i azalt."], 2]);
    // D7: yapay zekâ değerlendirmesi varsa PDF'te yalnız onun önerileri
    const pdf = await page.evaluate(() => { const m = '2026-10', f = App.Review.facts(m), a = App.Review.accept({ summary: "Ekim'de ₺60.000 geldi.", cuts: ["Yiyecek'i azalt."] }, f); localStorage.setItem('ft_rev_ai_' + m, JSON.stringify({ sig: App.Review._sig(f), at: Date.now(), r: a.r, dropped: 0 })); const d = document.createElement('div'); d.innerHTML = App.Report.build(m); const sec = [...d.querySelectorAll('.pr-sec')].find(x => /Ayın değerlendirmesi/.test(x.textContent)); return [...sec.querySelectorAll('.pr-rv .pr-st')].map(x => x.textContent); });
    eq('D7: PDF yalnız yapay zekânın önerisini ve gözden geçirilecekleri yazar', [pdf.filter(x => /Öneri/.test(x)).length, pdf.filter(x => /Kısılabilir/.test(x)).length, pdf.some(x => /Gözden geçir/.test(x))], [1, 0, true]);
    await ctx.close();
  }
  // 20) Banka hareketini ekle: aile üyesine giden para "Aktarım" seçili gelir; üyenin tek kişisel hesabı varsa karşı hesap o olur.
  // Bulunamazsa karşı hesap alanı "Aktarım değil" demez (Tür ile çelişmesin), "Karşı hesabı seçin" der
  {
    const accs = [bank(50000), bank(8000, 'e', { owner: 'personal', userId: 'u_b', name: 'Ece Vadesiz' }), bank(3000, 'd2', { owner: 'personal', userId: 'u_a', name: 'Deniz Birikim' })];
    const q = (id, text) => ({ id, text, label: 'u_a', receivedAt: at('2026-11-10'), reason: 'Aile içi ya da kendi hesaplarınız arası aktarım olabilir: karşı hesap uygulamadaysa Ekle > Aktarım seçin', p: { type: 'expense', amount: 2000, date: '2026-11-10', note: 'Giden para', category: 'Diğer', accountId: 'b' }, ts: 1 });
    const { page, ctx } = await open('2026-11-10', { pf_a: accs, pf_sq: [q('sq1', 'Hesabinizdan ECE YILMAZ adina 2.000,00 TL FAST ile gonderilmistir.'), q('sq2', 'Hesabinizdan AYSE YILMAZ adina 2.000,00 TL FAST ile gonderilmistir.')] });
    const dlg = id => page.evaluate(id => { App.BankSms.accept(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(), t = m.querySelector('[data-pkey="to"]'), r = [m.querySelector('[data-pkey="type"]').value, t.value, t.options[0].textContent]; App.UI.closeModal && [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="cancel"]').click(); return r; }, id);
    eq('aile üyesine giden para: karşı hesap üyenin hesabı', await dlg('sq1'), ['move', 'e', '— Karşı hesabı seçin —']);
    eq('hesabı bulunamayan kişi: alan "Karşı hesabı seçin" der', await dlg('sq2'), ['move', '', '— Karşı hesabı seçin —']);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
