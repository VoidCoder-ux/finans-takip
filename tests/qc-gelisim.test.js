// Usage: node tests/qc-gelisim.test.js
// Kasım 2026 geliştirmeleri (beklenen değerler elle hesaplandı):
//  1) Ay kontrolü: rapor manşetini değiştirebilecek kayıtlar yakalanır, sıradan kayıt yakalanmaz; hiçbir kayıt kendiliğinden değişmez.
//  2) Düzenli hareket önerisi: abonelik ve maaş bulunur, market ve değişken tutar önerilmez; onaysız kayıt eklenmez.
//  3) Maaşa kadar güvenli tutar: yalnız maaştan önceki ödemeler düşülür, birikim hesabı sayılmaz, para en dibe indiği an ölçülür.
//  4) İşlemler'de ay başlıkları ve toplamları.  5) "Bunu alırsam ne olur?" kaydetmeden hesaplar.  6) Anonim mesaj örneği.
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
const USERS = () => ({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6', bankNames: ['Deniz Kaya'] }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() });
const at = iso => new Date(iso + 'T10:00:00').getTime();
const bank = (balance, id = 'b') => ({ id, name: 'Vadesiz', type: 'bank', owner: 'shared', balance, openingBalance: balance, ts: at('2025-01-01') });
const card = (balance = -1000) => ({ id: 'k', name: 'World Kart', type: 'card', owner: 'shared', last4: '1234', balance, openingBalance: balance, limit: 30000, statementDay: 20, dueOffset: 10, ts: at('2025-01-01') });
let tn = 1;
const tx = (date, type, amount, category, note, accountId = 'b', x = {}) => Object.assign({ id: 't' + tn++, type, amount, category, date, note, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, x);
const rec = (id, type, amount, category, day, note, x = {}) => Object.assign({ id, type, amount, category, day, note, accountId: 'b', userId: '', active: true, autoLog: false, autoFrom: '', autoDone: '', ts: at('2026-01-01') }, x);

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
  const kinds = p => p.evaluate(() => App.MonthCheck.issues('2026-10').map(x => x.id.split(':')[0]).sort());
  const ok = p => p.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });

  // 1) Ay kontrolü: Ekim raporundaki gerçek sorunların kurmaca karşılıkları
  {
    const adios = { id: 'y', name: 'Adios', type: 'card', owner: 'shared', balance: -569.98, openingBalance: -284.99, ts: at('2026-10-05') };
    const txns = [
      tx('2026-10-13', 'expense', 33000, 'Kredi Kartı Ödemesi', 'Para Gönder GİDEN FAST - Deniz Kaya'),
      tx('2026-10-14', 'expense', 2834, 'Kredi Kartı Ödemesi', 'Üyelik Ücreti', 'k'),
      tx('2026-10-29', 'expense', 5580, 'Ulaşım', 'Araç Kiralama', 'k'),
      tx('2026-10-30', 'expense', 5580, 'Ulaşım', 'Araç Kiralama', 'k'),
      tx('2026-10-20', 'expense', 284.99, 'Yemek', 'Uber Eats', 'y'),
      tx('2026-10-05', 'income', 86600, 'Maaş', 'Maaş'),
      tx('2026-10-08', 'expense', 450, 'Market', 'Migros', 'k'),
      tx('2026-10-09', 'expense', 450, 'Market', 'A101', 'k'),
    ];
    const { page, ctx } = await open('2026-11-03', { pf_a: [bank(50000), card(-13414), adios], pf_t: txns, pf_r: [rec('r1', 'expense', 22000, 'Kira', 15, 'Kira')] });
    eq('beş sorun bulundu: kart ödemesi, ücret, çift harcama, kart borcu, eksik kira', await kinds(page), ['cp', 'fee', 'op', 'rec', 'two']);
    eq('33.000 ₺ kart ödemesi olarak bildirildi', await page.evaluate(() => App.MonthCheck.issues('2026-10').find(x => x.id.startsWith('cp:')).text.includes('33.000')), true);
    const before = await page.evaluate(() => JSON.stringify(S.txns()) + JSON.stringify(S.accounts()));
    eq('özet kartı konu sayısını gösterir (5 kayıt + 3 hesap)', await page.textContent('#ozet-monthchk'), '✅ Ekim kontrolüRapordan önce bakılacak 8 konu var.BaşlaGeç');
    await page.click('#ozet-monthchk .btn-primary'); await page.waitForTimeout(100);
    eq('kontrol sayfası açıldı, 8 konu', await page.textContent('.mck-sum'), '8 konu kaldı');
    eq('tarama hiçbir kaydı değiştirmedi', await page.evaluate(b => JSON.stringify(S.txns()) + JSON.stringify(S.accounts()) === b, before), true);
    await page.click('.mck-row.red .btn-primary'); await page.waitForTimeout(100);
    await page.evaluate(() => { const m = document.querySelector('.modal-bd.show'); m.querySelector('[data-pkey="xfer"]').value = 'k'; }); await ok(page); await page.waitForTimeout(150);
    eq('kart ödemesi aktarıma çevrilince sorun kapandı, sayfa yenilendi', [await kinds(page), await page.textContent('.mck-sum')], [['fee', 'op', 'rec', 'two'], '7 konu kaldı']);
    await page.evaluate(() => App.MonthCheck.pass(App.MonthCheck.issues('2026-10').find(x => x.id.startsWith('two:')).id));
    await page.reload(); await page.waitForTimeout(250);
    eq('"Sorun yok" sayfa yenilenince de hatırlandı', await kinds(page), ['fee', 'op', 'rec']);
    await page.evaluate(() => App.MonthCheck.open()); await page.waitForTimeout(80);
    await page.evaluate(() => App.MonthCheck.reset());
    eq('geri getirilebilir', await kinds(page), ['fee', 'op', 'rec', 'two']);
    // Bankayla karşılaştırma: Adios borcu 284,99 ise fark düzelir, sorun kapanır ve hesap tamamlanır
    await page.evaluate(() => App.Accounts.reconcile('y')); await page.waitForTimeout(80);
    await page.fill('.modal-bd.show [data-pkey="bank"]', '-284,99'); await ok(page); await page.waitForTimeout(120); await ok(page); await page.waitForTimeout(150);
    eq('Adios bankayla eşitlendi', await page.evaluate(() => [App.Accounts.get('y').balance, App.Accounts.get('y').openingBalance]), [-284.99, 0]);
    eq('kart borcu uyarısı kapandı, hesap tamamlandı', [await kinds(page), await page.evaluate(() => App.MonthCheck.accounts('2026-10').filter(x => x.done).map(x => x.a.id))], [['fee', 'rec', 'two'], ['y']]);
    await page.evaluate(() => App.MonthCheck.issues('2026-10').find(x => x.id.startsWith('rec:')).btn[1]).then(c => page.evaluate(c)); await page.waitForTimeout(150);
    eq('eksik kira kaydedildi ve bakiyeden düştü', [await page.evaluate(() => S.txns().filter(t => t.recurringId === 'r1').map(t => [t.date, t.amount])), await page.evaluate(() => App.Accounts.get('b').balance)], [[['2026-10-15', 22000]], 81600]);
    await page.evaluate(() => App.Report.open('2026-10')); await page.waitForTimeout(150);
    eq('rapor penceresi açık kaydı söyler', /2 şüpheli kayıt/.test(await page.textContent('#rapChk')), true);
    await page.evaluate(() => App.Report.open && App.Report.close());
    await page.evaluate(() => App.MonthCheck.skip());
    eq('"Geç" özet kartını kaldırır', await page.textContent('#ozet-monthchk'), '');
    await ctx.close();
  }
  // 1b) Temiz ay ve ay ortası
  {
    const { page, ctx } = await open('2026-11-20', { pf_t: [tx('2026-10-05', 'income', 40000, 'Maaş', 'Maaş'), tx('2026-10-07', 'expense', 1500, 'Market', 'Migros')] });
    eq('temiz ayda sorun yok', await kinds(page), []);
    eq('ayın 15\'inden sonra özet kartı çıkmaz', await page.textContent('#ozet-monthchk'), '');
    await ctx.close();
    const c = await open('2026-11-03', { pf_t: [tx('2026-10-07', 'expense', 1500, 'Market', 'Migros')] });
    eq('gelirsiz ay bildirilir', await kinds(c.page), ['inc']);
    await c.ctx.close();
  }
  // 2) Düzenli hareket önerisi
  {
    const ay = ['2026-08', '2026-09', '2026-10'];
    const txns = [];
    ay.forEach((m, i) => {
      txns.push(tx(m + '-12', 'expense', 229.99, 'Eğlence', 'Netflix', 'k'));
      txns.push(tx(m + '-03', 'expense', 500 + i * 400, 'Eğlence', 'Sinema Bileti', 'k'));   // tutar değişken
      [5, 12, 19].forEach(d => txns.push(tx(m + '-' + String(d).padStart(2, '0'), 'expense', 800, 'Market', 'Migros', 'k')));   // ayda çok kez
    });
    txns.push(tx('2026-10-07', 'income', 42000, 'Maaş', 'Maaş'));
    txns.push(tx('2026-10-02', 'expense', 3000, 'Giyim', 'Tek Seferlik Mağaza', 'k'));
    txns.push(tx('2026-09-15', 'expense', 1200, 'Sağlık', 'Dis Hekimi', 'k')); txns.push(tx('2026-10-15', 'expense', 1300, 'Sağlık', 'Dis Hekimi', 'k'));   // iki ay, tutar %8 farklı
    const { page, ctx } = await open('2026-10-20', { pf_a: [bank(50000), card()], pf_t: txns });
    const S2 = () => page.evaluate(() => App.Recurring.suggestions().map(x => [x.note, x.amount, x.day, x.months, x.sub]));
    eq('yalnız maaş ve Netflix önerildi', await S2(), [['Maaş', 42000, 7, 1, false], ['Netflix', 229.99, 12, 3, true]]);
    eq('öneri Özet\'te görünür, kayıt eklenmedi', [(await page.textContent('#ozet-recsug')).includes('Netflix'), await page.evaluate(() => S.recurring().length)], [true, 0]);
    await page.evaluate(() => App.Recurring.suggestNo(App.Recurring.suggestions()[1].key));
    eq('"Hayır" denilen bir daha sorulmaz', (await S2()).map(x => x[0]), ['Maaş']);
    await page.reload(); await page.waitForTimeout(250);
    eq('sayfa yenilenince de sorulmaz', (await S2()).map(x => x[0]), ['Maaş']);
    await page.evaluate(() => App.Recurring.suggestAdd(App.Recurring.suggestions()[0].key)); await page.waitForTimeout(80);
    await page.fill('.modal-bd.show [data-pkey="amount"]', '43000'); await ok(page); await page.waitForTimeout(120);
    eq('onaylanan eklendi', await page.evaluate(() => S.recurring().map(r => [r.type, r.amount, r.category, r.day, r.accountId, r.userId, r.autoLog])), [['income', 43000, 'Maaş', 7, 'b', 'u_a', false]]);
    eq('bu ayki maaş tekrarlayana bağlandı, tahminde ikinci kez yok', await page.evaluate(() => [S.txns().filter(t => t.recurringId).length, App.Cashflow.items(10).filter(x => x.type === 'income').length]), [1, 0]);
    eq('eklenince öneri kalkar', await S2(), []);
    await ctx.close();
    // Bitmiş abonelik (45 günden eski) ve tanımlı tekrarlayan önerilmez
    const b = await open('2026-12-20', { pf_a: [bank(50000), card()], pf_t: ['2026-08', '2026-09', '2026-10'].map(m => tx(m + '-12', 'expense', 229.99, 'Eğlence', 'Netflix', 'k')) });
    eq('bırakılmış abonelik önerilmez', await b.page.evaluate(() => App.Recurring.suggestions().length), 0);
    await b.ctx.close();
    const c = await open('2026-10-20', { pf_a: [bank(50000), card()], pf_r: [rec('rn', 'expense', 229.99, 'Eğlence', 12, 'Netflix aboneliği')], pf_t: ['2026-08', '2026-09', '2026-10'].map(m => tx(m + '-12', 'expense', 229.99, 'Eğlence', 'Netflix', 'k')) });
    eq('tanımlı tekrarlayan önerilmez', await c.page.evaluate(() => App.Recurring.suggestions().length), 0);
    await c.ctx.close();
  }
  // 3) Maaşa kadar güvenli tutar
  {
    const sav = { id: 's', name: 'Birikim', type: 'savings', owner: 'shared', balance: 100000, openingBalance: 100000, ts: at('2025-01-01') };
    const R3 = [rec('sal', 'income', 40000, 'Maaş', 5, 'Maaş'), rec('kira', 'expense', 6000, 'Kira', 4, 'Kira'), rec('elk', 'expense', 900, 'Faturalar', 8, 'Elektrik')];
    let { page, ctx } = await open('2026-11-03', { pf_a: [bank(10000), sav], pf_r: R3 });
    // 10.000 − 6.000 (4 Kas kira) = 4.000; elektrik maaştan sonra; 2 gün, günde 2.000; birikim sayılmaz
    eq('maaşa kadar', await page.evaluate(() => { const s = App.Payday.safe(); return [s.amount, s.days, s.perDay, s.until, s.salary]; }), [4000, 2, 2000, '2026-11-05', true]);
    eq('Maaş Planı kartında görünür', /Maaşa kadar \(05 Kas.*\) güvenle harcanabilir₺4\.000/.test((await page.textContent('.pd-safe')).replace(/\s+/g, ' ')), true);
    await ctx.close();
    // Ara gelirle en dip: 3.000 − 2.500 (4 Kas) = 500; 6 Kas +1.000 = 1.500; 7 Kas −1.200 = 300 → en dip 300
    ({ page, ctx } = await open('2026-11-03', { pf_a: [bank(3000)], pf_r: [rec('sal', 'income', 40000, 'Maaş', 10, 'Maaş'), rec('a', 'expense', 2500, 'Kira', 4, 'Kira'), rec('e', 'income', 1000, 'Diğer Gelir', 6, 'Kira geliri'), rec('c', 'expense', 1200, 'Faturalar', 7, 'Aidat')] }));
    eq('para en dibe indiği an ölçülür, ara gelir maaş sayılmaz', await page.evaluate(() => { const s = App.Payday.safe(); return [s.amount, s.until]; }), [300, '2026-11-10']);
    await ctx.close();
    // Beklenen maaş yok: ay sonuna (28 gün) kadar; 8.000 − 6.000 = 2.000
    ({ page, ctx } = await open('2026-11-03', { pf_a: [bank(8000)], pf_r: [rec('kira', 'expense', 6000, 'Kira', 20, 'Kira')] }));
    eq('maaş yoksa ay sonuna kadar', await page.evaluate(() => { const s = App.Payday.safe(); return [s.amount, s.days, s.until, s.salary]; }), [2000, 28, '2026-11-30', false]);
    eq('tutar Harcanabilir ile aynıysa ikinci kutu yok, maaşı eklemesi söylenir', [await page.$('.pd-safe') === null, (await page.textContent('#ozet-payday')).includes('Maaşınızı Tekrarlayan\'a eklerseniz')], [true, true]);
    await ctx.close();
    // Ödemeye yetmiyor
    ({ page, ctx } = await open('2026-11-03', { pf_a: [bank(1000)], pf_r: [rec('sal', 'income', 40000, 'Maaş', 25, 'Maaş'), rec('kira', 'expense', 6000, 'Kira', 10, 'Kira')] }));
    eq('açık negatif gösterilir, günlük tutar 0', await page.evaluate(() => { const s = App.Payday.safe(); return [s.amount, s.perDay]; }), [-5000, 0]);
    eq('kartta açık yazar', (await page.textContent('.pd-safe')).includes('yetmiyor'), true);
    await ctx.close();
  }
  // 4) İşlemler'de ay başlıkları
  {
    const txns = [tx('2026-11-02', 'expense', 100, 'Market', 'Migros'), tx('2026-11-01', 'income', 1000, 'Maaş', 'Maaş'), tx('2026-10-20', 'expense', 300, 'Market', 'A101'), tx('2026-10-15', 'expense', 50, 'Transfer', 'Aktarım', 'b', { xfer: true }),
      tx('2026-10-10', 'income', 40, 'İade', 'İade')];
    const { page, ctx } = await open('2026-11-03', { pf_t: txns });
    await page.evaluate(() => App.UI.nav('islemler')); await page.waitForTimeout(100);
    const H = () => page.$$eval('#txnList .txn-mh', l => l.map(x => x.textContent));
    eq('her ay için başlık; aktarım sayılmaz, iade giderden düşer', await H(), ['Kasım 2026Gelir ₺1.000,00 · Gider ₺100,00', 'Ekim 2026Gelir ₺0,00 · Gider ₺260,00']);
    eq('başlıklar doğru sırada', await page.$$eval('#txnList > *', l => l.map(x => x.className.split(' ')[0])), ['txn-mh', 'ti', 'ti', 'txn-mh', 'ti', 'ti', 'ti']);
    await page.selectOption('#fMonth', '2026-10'); await page.waitForTimeout(80);
    eq('tek ay seçilince başlık yok', await H(), []);
    await page.selectOption('#fMonth', ''); await page.selectOption('#fCat', 'Market'); await page.waitForTimeout(80);
    eq('filtreye uyan kayıtların toplamı', await H(), ['Kasım 2026Gelir ₺0,00 · Gider ₺100,00', 'Ekim 2026Gelir ₺0,00 · Gider ₺300,00']);
    await ctx.close();
  }
  // 5) Bunu alırsam ne olur
  {
    const R5 = [rec('sal', 'income', 40000, 'Maaş', 25, 'Maaş'), rec('kira', 'expense', 6000, 'Kira', 10, 'Kira')];
    const { page, ctx } = await open('2026-11-03', { pf_a: [bank(10000), card(-1000)], pf_r: R5 });
    const W = o => page.evaluate(o => { const r = App.WhatIf.compute(o); return { lvl: r.level, safe: [r.safeBefore.amount, r.safeAfter.amount], cap: [r.capBefore, r.capAfter], per: r.per, msg: r.msg }; }, o);
    const count = () => page.evaluate(() => [S.txns().length, JSON.stringify(S.accounts())]);
    const c0 = await count();
    // Kartın 1.000 borcunun son ödemesi geçti: bugün ödenecek sayılır (10.000 − 1.000 − 6.000 = 3.000). Yeni 1.800 harcama 30 Kas'ta, maaştan sonra
    let r = await W({ amount: 1800, accId: 'k', date: '2026-11-03', inst: 1 });
    eq('kartla alışveriş maaştan önce hesabı değiştirmez, limit düşer', [r.lvl, r.safe, r.cap], ['green', [3000, 3000], [29000, 27200]]);
    r = await W({ amount: 3000, accId: 'b', date: '2026-11-04', inst: 1 });
    eq('hesaptan alışveriş', [r.lvl, r.safe], ['green', [3000, 0]]);
    r = await W({ amount: 5000, accId: 'b', date: '2026-11-03', inst: 1 });
    eq('maaştan önce eksiye düşürürse kırmızı', [r.lvl, r.safe, r.msg], ['red', [3000, -2000], '10 Kasım 2026 günü hesaplar ₺2.000,00 eksiye düşer.']);
    r = await W({ amount: 30000, accId: 'k', date: '2026-11-03', inst: 1 });
    eq('limit aşılırsa kırmızı', [r.lvl, r.cap, r.msg], ['red', [29000, -1000], 'Kart limiti ₺1.000,00 aşılır.']);
    // 1.000 ₺ üç taksit, hesaptan: 333,33 · 333,33 · 333,34. Maaştan (25 Kas) önce yalnız ilki düşer; 90 günde üçü de düşer
    const inst = await page.evaluate(() => { const r = App.WhatIf.compute({ amount: 1000, accId: 'b', date: '2026-11-03', inst: 3 }); return [r.per, r.safeAfter.amount, Math.round((r.before.end - r.after.end) * 100) / 100]; });
    eq('taksit: maaşa kadar ilk taksit, 90 günde toplam tutar', inst, [333.33, 2666.67, 1000]);
    r = await W({ amount: 500, accId: 'b', date: '2026-01-01', inst: 1 });
    eq('geçmiş tarih bugüne çekilir', r.safe, [3000, 2500]);
    eq('hesaplama hiçbir şey kaydetmedi', await count(), c0);
    await page.click('.pd-card .pd-wi'); await page.waitForTimeout(120);
    await page.fill('#wiAmt', '5000'); await page.selectOption('#wiAcc', 'b'); await page.waitForTimeout(80);
    const res = await page.textContent('#wiRes');
    eq('pencere sonucu gösterir', [res.includes('eksiye düşer'), res.includes('₺3.000,00 → −₺2.000,00')], [true, true]);
    await page.fill('#wiAmt', ''); await page.waitForTimeout(50);
    eq('tutar silinince sonuç temizlenir', await page.textContent('#wiRes'), '');
    await ctx.close();
  }
  // 6) Anonim mesaj örneği
  {
    const { page, ctx } = await open('2026-11-03', { pf_sq: [{ id: 'sq1', text: 'Sayin DENIZ KAYA 1234 kartinizla 1.250,75 TL harcama yapilmistir.', label: 'abcd1234_u_a', receivedAt: Date.now(), reason: 'x', p: { type: 'expense', amount: 1250.75, note: '', date: '2026-11-03' } }] });
    const M = t => page.evaluate(t => App.BankSms.mask(t), t);
    eq('ad, kart ve tutar gizlenir, kalıp kalır', await M('Sayin DENIZ KAYA 1234 kartinizla 1.250,75 TL harcama yapilmistir.'), 'Sayin AD SOYAD 0000 kartinizla 1.111,11 TL harcama yapilmistir.');
    eq('kişi adı küçük harfle de gizlenir, tarih ve saat kalır', await M('Deniz, 12.10.2026 14:35 tarihinde 250 TL odeme yapildi'), 'AD, 12.10.2026 14:35 tarihinde 111 TL odeme yapildi');
    eq('IBAN, e-posta ve karşı taraf gizlenir', await M('TR12 0006 2000 1234 5678 9012 34 hesabina Gonderen: Ali Veli 5.000,00 TL. bilgi@ornek.net'), 'TR00 0000 0000 0000 0000 0000 00 hesabina Gonderen: AD SOYAD 1.111,11 TL. ad@ornek.com');
    eq('FAST karşı adı gizlenir', await M('GIDEN FAST - OSMAN ORNEK 33.000,00 TL'), 'GIDEN FAST - AD SOYAD 11.111,11 TL');
    await page.evaluate(() => App.BankSms.maskOpen()); await page.waitForTimeout(100);
    const out = await page.inputValue('#smsMaskOut');
    eq('onay kuyruğundaki mesaj gelir, nasıl okunduğu yazılır', [out.includes('1.111,11 TL'), out.includes('[Uygulama: gider okundu]'), /DENIZ|1\.250|Kaya/.test(out)], [true, true, false]);
    await page.fill('#smsMaskIn', 'Mesaj bir 100,00 TL harcama\n\nMesaj iki 200,00 TL harcama'); await page.waitForTimeout(60);
    eq('boş satır mesajları ayırır', (await page.inputValue('#smsMaskOut')).split('[Uygulama').length - 1, 2);
    await ctx.close();
  }
  // 7) Gerçek reklam SMS'leri (kullanıcının telefonundan, kişisel bilgi içermez): hiçbiri gider ya da onay kaydı olmaz
  {
    const ADS = [
      'Teknosa\'da Muhteşem Kasım! Herkesten önce TeknoClub üyelerine Samsung 55LS03H 55" 139 Ekran 4K UHD Frame Neo QLED TV 70.589TL yerine 59.999TL. Stok: 200. Son gün: 31 Ekim. Detaylar: Teknosa Mağazalarında, https://tknsa.co/JBPeJYEmN, 08502225599. SMS iptal için TSA RET yazıp 7889\'a ücretsiz gönderebilirsiniz. Mersis:0836014439357137 B001',
      '30 Ekim-1 Kasım\'da TÜMM Makyaj, Cilt Bakım ürünleri, Sebamed, Restorex ve Bioxcin\'de net %50 İNDİRİM! Bepanthol hariçtir. 250 TL ve üzeri alışverişlerde TÜM Cosmetica üyelerine özel. Hemen alışverişe başla! RET:CSM RET yaz 3172\'ye gönder.Mersis:0582046328600015 B002',
      'Evidea magazalari ve evidea.com\'dan 3.000 TL uzeri alisveriste 300 TL az ode! https://bit.ly/4sOz1YJ Sms ret icin ZBZ RET yaz 4933\'e gonder. MN:0999110559200001 B002 B002',
      'Tamadres.com\'dan 1.500 TL ve uzeri kitap alisverisinde 150 TL daha az ode! https://lnq.com.tr/9ONXZK Sms ret: ZBZ RET yaz 4933\'e gonder.MN:0999110559200001 B002 B002',
      'Premium\'a özel Huawei tablet sepette 1 TL\'ye TIKLA KAZAN\'da! https://app.hb.biz/NEWJ5 Ret için HBSMS yaz 3172\'ye ilet. Mersis:0265017991000011 B016',
      'adidas\'ta %15 NET İNDİRİM! Tıkla, efsane fırsatı yakala! https://app.hb.biz/uGzBX Ret için HBSMS yaz 3172\'ye ilet. Mersis:0265017991000011 B016',
      'AXESS ile size ozel 300 TL chip-para hediye. 31 Ekim tarihine kadar AXESS ile yapacaginiz toplam 25000 TL tutarinda harcamanizdan 300 TL chip-para kazanmak icin CPSON yazip 4566\'ya gonderebilir veya hemen Juzdan\'dan kampanyaya katilabilirsiniz: www.juzdan.com.tr/9y7l Ucretsiz SMS almak istemiyorsaniz',
      'Degerli Akbankli, tasarruflariniz icin %38,25 faiz orani Akbank\'ta sizi bekliyor. 32-40 gun vadedeki 10.000 TL - 10.000.000 TL\'ye kadar olan birikimlerinize %38,25 faiz firsati ile deger katabilirsiniz. Ucretsiz SMS almak istemiyorsaniz \'smsistemiyorum\' yazip 8885\'e gonderebilirsiniz.',
      'Kasim cekilisine katilin, 1.000 TL hediye ceki kazanin!',
      '5.000 TL alisveris yapin, 500 TL kazanin!',
    ];
    const u = Object.assign(USERS(), { smsDefaults: { u_a: 'b' } });
    const { page, ctx } = await open('2026-11-03', { pf_s: u, pf_a: [bank(5000)] });
    const P = t => page.evaluate(t => { const x = App.BankSms.parse(t, Date.now()); return [x.kind, x.amount]; }, t);
    eq('reklamların hepsi yok sayılır', await Promise.all(ADS.map(async t => (await P(t))[0])), ADS.map(() => 'ignore'));
    await page.evaluate(ADS => App.BankSms.ingest(ADS.map((text, i) => ({ id: 700 + i, label: 'abcd1234_u_a', text, receivedAt: Date.now() }))), ADS);
    eq('varsayılan hesapta da kayıt ve onay yok, bakiye aynı', await page.evaluate(() => [S.txns().length, S.smsQueue().length, App.Accounts.get('b').balance]), [0, 0, 5000]);
    // Reklam satırı olsa da gerçek işlem okunur
    eq('ret satırlı gerçek harcama', await P('Akbank: 1234 kartinizla MIGROS isyerinden 750,00 TL harcama yapilmistir. Sms ret icin AKB RET yaz 4566\'ya gonder.'), ['expense', 750]);
    eq('ret satırlı gelen para', await P('Hesabiniza 2.500,00 TL yatirilmistir. SMS almak istemiyorsaniz RET yazin.'), ['income', 2500]);
    eq('ATM çekimi reklam sayılmaz', (await P('Hesabinizdan ATM ile 1.000,00 TL cekildi.'))[1], 1000);
    await ctx.close();
  }
  // Kötü niyetli içerik yeni sayfalarda çalışmaz
  {
    const evil = '"><img src=x onerror=window.__x=1>';
    const txns = [tx('2026-10-05', 'expense', 33000, 'Kredi Kartı Ödemesi', evil, 'k'), tx('2026-09-12', 'expense', 229.99, 'Eğlence', evil, 'k'), tx('2026-10-12', 'expense', 229.99, 'Eğlence', evil, 'k')];
    const { page, ctx } = await open('2026-11-03', { pf_a: [bank(1000), Object.assign(card(), { name: evil })], pf_t: txns });
    await page.evaluate(() => App.MonthCheck.open()); await page.waitForTimeout(150);
    eq('metin kaçışlı', await page.evaluate(() => window.__x || 0), 0);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
