// Usage: node tests/qc-hayat.test.js
// Gerçek kullanım denetiminde bulunan hatalar (beklenen değerler elle hesaplandı):
//  1) Otomatik tekrarlayan yalnız aynı ödemeyle eşleşir; alakasız benzer tutarlı harcama kaydı engellemez.
//  2) Şifre, kampanya ve ekstre hatırlatması harcama değildir; iade kalıpları ve mevduat faizi doğru okunur.
//  3) Silinen harcamanın iade mesajı parayı ikinci kez eklemez. Uygulama açıkken gün dönünce tarih ve planlı kayıtlar yenilenir.
//  4) Kredi ara ödemesi ve kapaması hesaptan düşer, anapara gider sayılmaz; silinince kredideki kaydı da kalkar.
//  5) Depolama dolu, .txt ekstre, olmayan hesap, kategori silme, kısa kural, büyük tutar, aynı ad, karttaki alacak.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };
const at = iso => new Date(iso + 'T10:00:00').getTime();
const ACCS = () => [{ id: 'b', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', balance: 50000, openingBalance: 50000, ts: at('2025-01-01') }, { id: 'k', name: 'World Kart', type: 'card', owner: 'shared', last4: '1234', balance: -1000, openingBalance: -1000, limit: 30000, statementDay: 20, dueOffset: 10, ts: at('2025-01-01') }];
let nid = 100;

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(today, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(today + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS, pf_a: ACCS(), pf_t: [] }, data || {}));
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  const say = (p, text) => p.evaluate(({ text, id }) => App.BankSms.ingest([{ id, label: 'abcd1234_u_a', text, receivedAt: Date.now() }]), { text, id: nid++ });
  const bal = (p, id) => p.evaluate(i => App.Accounts.get(i).balance, id);
  const ok = p => p.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
  const clock = (p, d) => p.clock.setFixedTime(new Date(d + 'T12:00:00'));

  // 1) Otomatik tekrarlayan: kira ve abonelik alakasız harcamayla eşleşmez; bankadan gelen gerçek ödeme eşleşir
  {
    const rec = (id, amount, category, note) => ({ id, type: 'expense', amount, category, day: 15, note, accountId: 'b', userId: '', active: true, autoLog: true, autoFrom: '2026-11', autoDone: '', ts: at('2026-11-01') });
    const { page, ctx } = await open('2026-11-03', { pf_r: [rec('r1', 22000, 'Kira', 'Kira'), rec('r2', 229.99, 'Eğlence', 'Netflix'), rec('r3', 800, 'Faturalar', 'Elektrik')] });
    await say(page, 'Yapi Kredi: 1234 ile biten kartinizla ARAC KIRALAMA isyerinden 20.000,00 TL harcama yapilmistir.');
    await say(page, 'Yapi Kredi: 1234 ile biten kartinizla A101 isyerinden 250,00 TL harcama yapilmistir.');
    await say(page, 'Yapi Kredi: Hesabinizdan 790,00 TL elektrik faturasi odemesi yapildi.');
    await clock(page, '2026-11-16'); await page.reload(); await page.waitForTimeout(250);
    const t = await page.evaluate(() => S.txns().map(x => [x.category, x.amount, x.recurringId || '']));
    eq('kira ve Netflix ayrı kaydedildi; elektrik banka kaydıyla eşleşti', [t.filter(x => x[0] === 'Kira').length, t.filter(x => x[1] === 229.99).length, t.filter(x => x[2] === 'r3').map(x => x[1]), t.filter(x => x[1] === 800).length], [1, 1, [790], 0]);
    await ctx.close();
  }
  // 2) Mesaj okuma
  {
    const { page, ctx } = await open('2026-11-02');
    const P = t => page.evaluate(t => { const x = App.BankSms.parse(t, Date.now()); return [x.kind, x.type || '', x.amount]; }, t);
    eq('3D şifre', (await P('Akbank: Internet alisverisi icin sifreniz 482913. 1.250,00 TL tutarindaki islem icin kimseyle paylasmayin.'))[0], 'ignore');
    eq('gerçek harcamada "sifre" geçse de yazılır', await P('Akbank: 1234 kartinizla 300,00 TL harcama yapilmistir. Sifrenizi kimseyle paylasmayin 1234.'), ['expense', 'expense', 300]);
    eq('kampanya', (await P("Kasim ayinda Migros'ta 1.000 TL harcamaniza 100 TL chip para! Katilim icin KATIL yazin."))[0], 'ignore');
    eq('ekstre hatırlatması', (await P("Yapi Kredi: Son odeme tarihi 05/12/2026 olan 12.429,22 TL ekstre borcunuzun asgari tutari 2.485,84 TL'dir."))[0], 'ignore');
    eq('ekstre hatırlatması 2', (await P('Garanti BBVA Bonus kartinizin 15.000 TL ekstre borcu icin son odeme tarihi 20.11.2026.'))[0], 'ignore');
    eq('geri yansıtıldı iadedir', await P('Kart aidati 1.329,50 TL geri yansitilmistir.'), ['income', 'income', 1329.5]);
    eq('geri ödendi iadedir', await P('Kart aidati 1.329,50 TL geri odenmistir.'), ['income', 'income', 1329.5]);
    eq('karta geri yatırıldı iadedir', await P('Kart ucreti 500,00 TL kartiniza geri yatirilmistir.'), ['income', 'income', 500]);
    eq('cashback gelirdir', await P('Kartiniza 75,00 TL cashback yatirilmistir.'), ['income', 'income', 75]);
    eq('mevduat faizi yok sayılmaz', await P('Vadeli hesabinizin faizi 1.234,56 TL hesabiniza yatirilmistir.'), ['income', 'income', 1234.56]);
    eq('aidat kesintisi hâlâ gider', await P('Yapi Kredi: Kartiniza 1.329,50 TL kart aidati yansitilmistir.'), ['expense', 'expense', 1329.5]);
    await ctx.close();
  }
  // 3) Silinen harcama + iade mesajı; geri alınınca iade normal işlenir
  {
    const { page, ctx } = await open('2026-11-02');
    const FEE = 'Yapi Kredi: 1234 ile biten kartiniza 1.329,50 TL kart aidati yansitilmistir.', REF = 'Yapi Kredi: 1234 ile biten kartiniza 1.329,50 TL kart aidati iade edilmistir.';
    await say(page, FEE); await page.evaluate(() => App.Transactions.remove(S.txns()[0].id)); await page.waitForTimeout(80);
    await say(page, REF);
    eq('iade onaya düştü, bakiye değişmedi', [await bal(page, 'k'), await page.evaluate(() => S.txns().length), await page.evaluate(() => /silmiştiniz/.test(S.smsQueue()[0].reason))], [-1000, 0, true]);
    await page.evaluate(() => { S.saveSmsQueue([]); document.querySelector('#toasts .toast-act').click(); }); await page.waitForTimeout(80);
    eq('geri alındı', await bal(page, 'k'), -2329.5);
    await say(page, REF); eq('geri alınan harcamanın iadesi otomatik işlenir', await bal(page, 'k'), -1000);
    await ctx.close();
  }
  // 4) Gün dönümü: uygulama arka planda açık kalır
  {
    const { page, ctx } = await open('2026-11-10', { pf_t: [{ id: 'p1', type: 'expense', amount: 77, category: 'Market', date: '2026-11-11', note: 'planlı', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: false }] });
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); });
    await clock(page, '2026-11-11');
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(100);
    eq('bakiye, başlık ve form yeni güne geçti', [await bal(page, 'b'), await page.evaluate(() => document.getElementById('todayDate').textContent.slice(0, 9)), await page.evaluate(() => document.getElementById('txnDate').value)], [49923, '11 Kasım ', '2026-11-11']);
    await ctx.close();
  }
  // 5) Kredi ara ödeme ve kapama
  {
    const l = { id: 'ln1', name: 'İhtiyaç', kind: 'ihtiyac', principal: 100000, term: 12, first: '2026-10-15', installment: 10989.84, rate: 3.49, tax: true, accountId: 'b', prepay: [], closed: null, ts: at('2026-09-01') };
    const { page, ctx } = await open('2026-11-02', { pf_l: [l] });
    const nw = () => page.evaluate(() => App.NetWorth.compute().total), n0 = await nw();
    await page.evaluate(() => App.Loans.prepay('ln1')); await page.waitForTimeout(80);
    await page.evaluate(() => { document.querySelector('.modal-bd.show [data-pkey="amount"]').value = '20.000'; }); await ok(page); await page.waitForTimeout(100);
    eq('ara ödeme: banka düştü, gider yok, net servet aynı', [await bal(page, 'b'), await page.evaluate(() => App.Transactions.monthTotals('2026-11').expense), Math.abs(await nw() - n0) < 1], [30000, 0, true]);
    eq('döküm: kredi anaparası', await page.evaluate(() => App.Transactions.moneyFlow('2026-11').loanPay), 20000);
    await page.reload(); await page.waitForTimeout(250);
    const id = await page.evaluate(() => S.txns()[0].id); eq('yenileme sonrası bağlantı duruyor', await page.evaluate(i => [S.txns()[0].lpre, S.loans()[0].prepay[0].txnId === i], id), ['ln1', true]);
    await page.evaluate(i => App.Transactions.remove(i), id); await page.waitForTimeout(80); await ok(page); await page.waitForTimeout(100);
    eq('işlem silinince ara ödeme de kalktı', [await bal(page, 'b'), await page.evaluate(() => S.loans()[0].prepay.length)], [50000, 0]);
    await page.evaluate(() => App.Loans.close('ln1')); await page.waitForTimeout(80); await page.evaluate(() => { document.querySelector('.modal-bd.show [data-pkey="amount"]').value = '100.000'; }); const bl = await page.evaluate(() => App.Loans.state(S.loans()[0]).bal); await ok(page); await page.waitForTimeout(100);
    eq('kapama: anapara gider değil, üstü gider', [await bal(page, 'b'), await page.evaluate(() => App.Transactions.monthTotals('2026-11').expense)], [-50000, Math.round((100000 - bl) * 100) / 100]);
    await page.evaluate(() => App.Loans.reopen('ln1')); await page.waitForTimeout(100); eq('yeniden açınca para döner', [await bal(page, 'b'), await page.evaluate(() => S.txns().length)], [50000, 0]);
    await ctx.close();
  }
  // 6) Depolama dolu: başarı bildirimi çıkmaz
  {
    const { page, ctx } = await open('2026-11-02');
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/^pf_/.test(k)) throw new DOMException('quota', 'QuotaExceededError'); return o.call(this, k, v); }; App.UI.nav('islemler'); App.UI.setType('expense'); document.getElementById('txnAmt').value = '100'; App.Transactions.add(); });
    await page.waitForTimeout(80); const t = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent));
    eq('tek kırmızı uyarı, "eklendi" yok', [t.length, /kaydedilemedi/.test(t[0] || '')], [1, true]);
    await ctx.close();
  }
  // 7) .txt kart ekstresi
  {
    const { page, ctx } = await open('2026-11-10');
    const f = path.join(os.tmpdir(), 'qc-hayat-kart.txt'); fs.writeFileSync(f, 'KREDI KARTI HESAP OZETI\nSon Ödeme Tarihi 25.11.2026\n01.11.2026 MIGROS 500,00\n03.11.2026 HEPSIBURADA 300,00\n');
    await page.evaluate(() => App.UI.nav('islemler')); await page.setInputFiles('#stmtFile', f); await page.waitForTimeout(300);
    eq('.txt okundu', /2 hareket bulundu/.test(await page.evaluate(() => { const m = document.querySelector('.modal-bd.show'); return m ? m.innerText : ''; })), true);
    fs.unlinkSync(f); await ctx.close();
  }
  // 8) Olmayan hesap, kategori silme, kısa kural, büyük tutar, aynı ad, karttaki alacak, ICS, kuyruk etiketi
  {
    const { page, ctx } = await open('2026-11-02', { pf_t: [{ id: 'o1', type: 'expense', amount: 50, category: 'Market', date: '2026-11-01', note: 'x', accountId: 'silinmis', userId: 'u_a', ts: 1, balanceApplied: true }], pf_ru: [{ id: 'ru1', field: 'note', value: 'şok', category: 'Market', active: true, ts: 1 }], pf_s: Object.assign({}, USERS, { customCats: [{ name: 'Hayvan', emoji: '🐶', type: 'expense' }] }), pf_b: { Hayvan: 1000 }, pf_r: [{ id: 'r1', type: 'expense', amount: 100.5, category: 'Hayvan', day: 5, note: 'mama', accountId: 'b', userId: '', active: true, ts: 1 }] });
    eq('olmayan hesaba bağlı kayıt hesapsız kalır', await page.evaluate(() => S.txns()[0].accountId), '');
    await page.evaluate(() => App.Categories.remove('Hayvan')); await page.waitForTimeout(80); await ok(page); await page.waitForTimeout(80);
    eq('kategori silme: limit gider, tekrarlayan Diğer', await page.evaluate(() => [Object.keys(S.budgets()), S.recurring()[0].category]), [[], 'Diğer']);
    eq('kısa kural yalnız tam kelime', await page.evaluate(() => ['ŞOK MARKET', 'şoklama cihazı'].map(n => App.Rules.apply({ type: 'expense', amount: 1, category: 'Diğer', note: n }).category)), ['Market', 'Diğer']);
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.getElementById('txnAmt').value = '999.999.999'; App.Transactions.add(); }); await page.waitForTimeout(80);
    eq('çok büyük tutar sorulur', await page.evaluate(() => [/Tutar çok büyük/.test(document.querySelector('.modal-bd.show').innerText), S.txns().length]), [true, 1]);
    await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show [data-act="cancel"]')].forEach(b => b.click())); await page.waitForTimeout(80);
    await page.evaluate(() => { App.UI.nav('hesaplar'); document.getElementById('accName').value = 'world kart'; document.getElementById('accType').value = 'cash'; App.Accounts.add(); }); await page.waitForTimeout(80);
    eq('aynı ad sorulur', await page.evaluate(() => [/Aynı adda hesap/.test(document.querySelector('.modal-bd.show').innerText), S.accounts().length]), [true, 2]);
    await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show [data-act="cancel"]')].forEach(b => b.click()));
    await page.evaluate(() => { const a = S.accounts(); a[1].balance = 1500; a[1].openingBalance = 1500; S.saveAccounts(a); });
    eq('karttaki alacak kullanılabilir limite eklenir', await page.evaluate(() => App.Cards.info('k').avail), 31500);
    await say(page, 'Yapi Kredi: 1234 ile biten kartiniza 3.000,00 TL odeme yapilmistir. Tesekkur ederiz.'); eq('kuyrukta kart ödemesi etiketi', await page.evaluate(() => S.smsQueue()[0].p.note), 'Kart borcu ödemesi');
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
