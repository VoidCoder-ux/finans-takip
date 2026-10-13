// Usage: node tests/qc-transfers.test.js
// Kendi hesaplarınız arası para: bankada görünen ad, aktarım sözcükleri, iki mesajın eşleşmesi (sırası fark etmez), karşı mesajı
// gelmeyen aktarım (gelir/gider sayılmaz), onay ekranı (uygulamada olmayan hesap, var olan karşı kayda bağlanma), düzenlemede
// "Aktarıma çevir", tek taraflı aktarımı düzenleme, uyarılar, ekstrede kendi aktarımı ve kart ödemesi satırları.
// Kurmaca veri (Deniz ve Ece; DENİZ YILMAZ kurmaca bankada görünen ad); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

const NOW = '2027-10-20T15:00:00', RECV = new Date(NOW).getTime();
const U = [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6', bankNames: ['DENİZ YILMAZ'] }, { id: 'u_b', name: 'Eş', emoji: '💑', color: '#ec4899' }];
const ACC = () => [{ id: 'yk', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', balance: 150000, openingBalance: 150000, ts: 1, last4: '2222' },
  { id: 'ak', name: 'Akbank Vadesiz', type: 'bank', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 1, last4: '3333' },
  { id: 'ykc', name: 'Yapı Kredi World', type: 'card', owner: 'shared', balance: -8000, openingBalance: -8000, ts: 1, last4: '9999', limit: 60000, statementDay: 5, dueOffset: 10 }];
const seed = o => Object.assign({ pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: ACC(), pf_t: [], pf_sq: [] }, o || {});
const IN_OWN = 'Sayın DENİZ Y.,\nAkbank 3333 nolu hesabınıza 20.10.2027 tarihinde DENİZ YILMAZ tarafından 100.000,00 TL FAST gelmiştir.';
const OUT_OWN = '2222 nolu hesabinizdan DENIZ YILMAZ adina 100.000,00 TL FAST ile gonderilmistir. Yapi Kredi';
const SMS = (id, text, u) => ({ id, text, label: 'abcdefgh_' + (u || 'u_a'), receivedAt: RECV });
const MAIL = (id, text, u) => ({ id, text, label: 'gmailbox_' + (u || 'u_a'), receivedAt: RECV });

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(base);
  const load = async sd => { await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd); await page.reload(); await page.waitForTimeout(250); };
  const snap = () => page.evaluate(() => ({ bal: Object.fromEntries(S.accounts().map(a => [a.id, a.balance])), tot: App.Transactions.monthTotals('2027-10'), txns: S.txns().map(t => [t.type, t.amount, t.category, t.accountId, t.note, !!t.transferId]).sort(), q: S.smsQueue().length }));
  const ING = items => page.evaluate(items => App.BankSms.ingest(items), items);
  const dlg = () => page.evaluate(() => { const d = document.querySelector('.app-dialog-holder'); return d ? [...d.querySelectorAll('[data-pkey]')].map(x => [x.getAttribute('data-pkey'), x.value]) : null; });
  const opts = key => page.evaluate(k => [...document.querySelectorAll('.app-dialog-holder [data-pkey="' + k + '"] option')].map(o => [o.value, o.textContent]), key);
  const fill = v => page.evaluate(v => { const d = document.querySelector('.app-dialog-holder'); Object.keys(v).forEach(k => { d.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); d.querySelector('[data-act="ok"]').click(); }, v);
  const hasToast = m => page.evaluate(m => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes(m)), m);

  // 1) Ad eşleşmesi
  await load(seed());
  eq('ad eşleşmesi (büyük harf, Türkçe harfsiz, maskeli, ara ad; soyadı farklı/tek sözcük/ters sıra değil)', await page.evaluate(() => [
    nameMatches('DENIZ YILMAZ', 'Deniz Yılmaz'), nameMatches('deniz yılmaz', 'DENİZ YILMAZ'), nameMatches('D**** Y*****', 'Deniz Yılmaz'), nameMatches('ALI DENIZ YILMAZ', 'Deniz Yılmaz'),
    nameMatches('DENIZ YILDIZ', 'Deniz Yılmaz'), nameMatches('DENIZ', 'Deniz Yılmaz'), nameMatches('YILMAZ DENIZ', 'Deniz Yılmaz'), nameMatches('DENIZ Y.', 'Deniz Yılmaz')]), [true, true, true, true, false, false, false, false]);
  eq('üyenin bankadaki adı', await page.evaluate(() => [(App.Users.byBankName('DENIZ YILMAZ') || {}).id, App.Users.byBankName('ALI VELI'), App.Users.byBankName('')]), ['u_a', null, null]);

  // 2) Yalnız gelen mesaj (kendi adınızdan): gelir değil aktarım; Akbank artar, Yapı Kredi değişmez (mesajı gelince eşleşir)
  const r1 = await ING([MAIL('m1', IN_OWN)]);
  eq('kendi adınızdan gelen: aktarım', [r1.own, await snap()], [1, { bal: { yk: 150000, ak: 120000, ykc: -8000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['income', 100000, 'Transfer', 'ak', 'Gelen para: Deniz Yılmaz (kendi hesabınızdan)', false]], q: 0 }]);
  eq('bildirim metni', await page.evaluate(r => App.BankSms.summary(r), r1), '1 kendi hesaplarınız arası para aktarım sayıldı (gelir/gider değil)');
  eq('karşı hesabı bekleyen aktarım uyarısı', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => /aktarım/.test(w.title)).map(w => [w.level, w.title, w.text])),
    [['info', 'Karşı hesabı bekleyen aktarım', '20 Ekim 2027 · ₺100.000,00 · Akbank Vadesiz (gelen). Öbür bankanın mesajı gelince kendiliğinden eşleşir; gelmezse İşlemler\'de kaydı açıp karşı hesabı seçin. Gelir-gider sayılmadı.']]);
  const r2 = await ING([SMS('s1', OUT_OWN)]);
  eq('sonra giden mesaj gelir: eşleşir', [r2.transfers, await snap()], [1, { bal: { yk: 50000, ak: 120000, ykc: -8000 }, tot: { income: 0, expense: 0, count: 0 },
    txns: [['expense', 100000, 'Transfer', 'yk', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true], ['income', 100000, 'Transfer', 'ak', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true]], q: 0 }]);

  // 3) Sözcüksüz mesajlar ("para transferi", IBAN'a gönderim) iki yönde de eşleşir; adı bilinmeyen kişi için de
  await load(seed({ pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() } }));
  await ING([SMS('s1', '2222 nolu hesabinizdan TR12 0006 IBAN numarali hesaba 100.000,00 TL gonderilmistir. Yapi Kredi')]);
  const mid = await snap();
  await ING([MAIL('m1', 'Akbank 3333 nolu hesabınıza ALİ VELİ tarafından 100.000,00 TL para transferi gelmiştir.')]);
  eq('sözcüksüz: önce giden (etiket "Giden havale/EFT"), sonra gelen → eşleşir', [mid.txns, await snap().then(s => [s.bal, s.tot.income, s.tot.expense, s.txns.every(t => t[2] === 'Transfer' && t[5])])],
    [[['expense', 100000, 'Diğer', 'yk', 'Giden havale/EFT', false]], [{ yk: 50000, ak: 120000, ykc: -8000 }, 0, 0, true]]);
  eq('parse: kişiden gelen para sözcüksüz de aktarım adayı; hesaptan ödeme kart harcaması diye yazılmaz', await page.evaluate(() => {
    const a = App.BankSms.parse('Hesabiniza DENIZ YILMAZ tarafindan 100.000,00 TL gelmistir. Akbank', Date.now()), b = App.BankSms.parse('2222 nolu hesabinizdan 2.000,00 TL tutarinda fatura odemesi yapilmistir. Yapi Kredi', Date.now()), c = App.BankSms.parse('9999 ile biten World kartinizla MIGROS isyerinde 120,00 TL harcama yapilmistir. Yapi Kredi', Date.now());
    return [a.transfer, a.type, b.transfer, c.transfer]; }), [true, 'income', false, false]);
  await page.evaluate(() => App.BankSms.ingest([{ id: 'f1', text: '2222 nolu hesabinizdan 2.000,00 TL tutarinda fatura odemesi yapilmistir. Yapi Kredi', label: 'abcdefgh_u_a', receivedAt: Date.now() }]));
  eq('hesaptan ödeme etiketi', await page.evaluate(() => S.txns().find(t => t.amount === 2000).note), 'Yapı Kredi hesabından ödeme');

  // 4) Giden kendi adınıza (Yapı Kredi önce), ardından gelen: eşleşir; ad yazımı Deniz (Denız değil)
  await load(seed());
  await ING([SMS('s1', OUT_OWN)]);
  eq('kendi adınıza giden: aktarım (gider değil)', await snap().then(s => [s.bal.yk, s.tot.expense, s.txns]), [50000, 0, [['expense', 100000, 'Transfer', 'yk', 'Giden para: Deniz Yilmaz (kendi hesabınıza)', false]]]);
  await ING([MAIL('m1', IN_OWN)]);
  eq('sonra gelen: eşleşti', await snap().then(s => [s.bal, s.txns.map(t => t[5])]), [{ yk: 50000, ak: 120000, ykc: -8000 }, [true, true]]);

  // 5) Onay ekranı: uygulamada olmayan hesap; var olan karşı kayda bağlanma (ikinci kez yazılmaz)
  await load(seed({ pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() } }));
  await ING([MAIL('m1', 'Akbank 3333 nolu hesabınıza ECE YILMAZ tarafından 15.000,00 TL havale gelmiştir.')]);
  eq('aile üyesinin adı (bankada görünen ad girilmemiş): onaya', await page.evaluate(() => S.smsQueue().map(q => q.reason)), ['Aile içi ya da kendi hesaplarınız arası aktarım olabilir: karşı hesap uygulamadaysa Ekle > Aktarım seçin']);
  await page.evaluate(() => App.BankSms.accept(S.smsQueue()[0].id)); await page.waitForTimeout(50);
  eq('onay ekranında karşı hesap seçenekleri', await opts('to').then(o => o.map(x => x[0])), ['', 'yk', 'ak', 'ykc', '__ext']);
  await fill({ type: 'move', to: '__ext' }); await page.waitForTimeout(80);
  eq('uygulamada olmayan hesabım: tek taraflı aktarım', await snap().then(s => [s.bal.ak, s.tot.income, s.txns, s.q]), [35000, 0, [['income', 15000, 'Transfer', 'ak', 'Gelen para: Ece Yilmaz', false]], 0]);
  await page.evaluate(() => { const t = S.txns(); t.push({ id: 'yo', date: '2027-10-20', type: 'expense', amount: 7000, category: 'Diğer', note: 'Giden para: Deniz Yilmaz', accountId: 'yk', userId: 'u_a', ts: 1, balanceApplied: true, src: 'sms', xfer: true }); S.saveTxns(t); const a = S.accounts(); a.find(x => x.id === 'yk').balance -= 7000; S.saveAccounts(a);
    S.saveSmsQueue([{ id: 'sqx', text: 'Akbank 3333 nolu hesabınıza DENİZ YILMAZ tarafından 7.000,00 TL havale gelmiştir.', label: 'gmailbox_u_a', receivedAt: Date.now(), reason: 'Aile içi ya da kendi hesaplarınız arası aktarım olabilir: karşı hesap uygulamadaysa Ekle > Aktarım seçin', p: { type: 'income', amount: 7000, date: '2027-10-20', note: 'Gelen para: Deniz Yilmaz', category: 'Diğer', accountId: 'ak' }, ts: 1 }]); App.BankSms.accept('sqx'); });
  await page.waitForTimeout(50); await fill({ type: 'move', to: 'yk' }); await page.waitForTimeout(80);
  eq('onaydan aktarım: karşı hesaptaki gidere bağlandı (Yapı Kredi ikinci kez düşmedi)', await snap().then(s => [s.bal.yk, s.bal.ak, s.tot.expense, s.txns.filter(t => t[1] === 7000)]),
    [143000, 42000, 0, [['expense', 7000, 'Transfer', 'yk', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true], ['income', 7000, 'Transfer', 'ak', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true]]]);

  // 6) Düzenlemede "Aktarıma çevir" (eski yanlış kayıt): karşı hesap seçilince karşı bacak eklenir; öbür hesapta varsa ona bağlanır
  await load(seed({ pf_t: [{ id: 'g1', date: '2027-10-20', type: 'income', amount: 100000, category: 'Diğer', note: 'Gelen para: Deniz Yilmaz', accountId: 'ak', userId: 'u_a', ts: 1, balanceApplied: true, src: 'sms' }],
    pf_a: ACC().map(a => a.id === 'ak' ? Object.assign(a, { balance: 120000 }) : a) }));
  eq('uyarı: kendi adınızdan gelen para gelir sayılmış', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => /Kendi adınızdan/.test(w.title)).map(w => w.text)),
    ['20 Ekim 2027 · ₺100.000,00 · Akbank Vadesiz. İşlemler\'de kaydı açıp "Kendi hesaplarınız arası aktarım mı?" sorusunda karşı hesabı seçin; gelir-gider ve iki hesabın bakiyesi düzelir.']);
  await page.evaluate(() => App.Transactions.edit('g1')); await page.waitForTimeout(50);
  eq('düzenlemede aktarım sorusu', await opts('xfer'), [['', 'Hayır'], ['yk', 'Evet, şu hesabımdan geldi: 🏦 Yapı Kredi Vadesiz …2222'], ['ykc', 'Evet, şu hesabımdan geldi: 💳 Yapı Kredi World …9999'], ['__ext', 'Evet, uygulamada olmayan bir hesabım']]);
  await fill({ xfer: 'yk' }); await page.waitForTimeout(80);
  eq('aktarıma çevrildi: Yapı Kredi düştü, gelir 0', await snap().then(s => [s.bal, s.tot, s.txns]), [{ yk: 50000, ak: 120000, ykc: -8000 }, { income: 0, expense: 0, count: 0 },
    [['expense', 100000, 'Transfer', 'yk', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true], ['income', 100000, 'Transfer', 'ak', 'Yapı Kredi Vadesiz → Akbank Vadesiz', true]]]);
  eq('uyarı kalktı', await page.evaluate(() => App.Insights.compute('2027-10').warnings.some(w => /Kendi adınızdan/.test(w.title))), false);
  await load(seed({ pf_t: [{ id: 'g1', date: '2027-10-20', type: 'income', amount: 100000, category: 'Diğer', note: 'Gelen para: Deniz Yilmaz', accountId: 'ak', userId: 'u_a', ts: 1, balanceApplied: true, src: 'sms' },
    { id: 'g2', date: '2027-10-19', type: 'expense', amount: 100000, category: 'Diğer', note: 'Yapı Kredi kart harcaması', accountId: 'yk', userId: 'u_a', ts: 2, balanceApplied: true, src: 'sms' }],
    pf_a: ACC().map(a => a.id === 'ak' ? Object.assign(a, { balance: 120000 }) : a.id === 'yk' ? Object.assign(a, { balance: 50000 }) : a) }));
  await page.evaluate(() => App.Transactions.edit('g1')); await page.waitForTimeout(50); await fill({ xfer: 'yk' }); await page.waitForTimeout(80);
  eq('öbür hesaptaki gidere bağlandı (yeni bacak yok)', await snap().then(s => [s.bal.yk, s.txns.length, s.tot.expense, s.txns.every(t => t[5])]), [50000, 2, 0, true]);
  await page.evaluate(() => { const t = S.txns(); t.push({ id: 'g3', date: '2027-10-20', type: 'income', amount: 500, category: 'Diğer', note: 'x', accountId: 'ak', userId: 'u_a', ts: 3, balanceApplied: true }); S.saveTxns(t); App.Transactions.edit('g3'); }); await page.waitForTimeout(50);
  await fill({ xfer: '__ext' }); await page.waitForTimeout(80);
  eq('uygulamada olmayan hesabım: tek taraflı', await page.evaluate(() => { const t = S.txns().find(x => x.id === 'g3'); return [t.category, !!t.transferId, App.Transactions.monthTotals('2027-10').income]; }), ['Transfer', false, 0]);
  await page.evaluate(() => App.Transactions.edit('g3')); await page.waitForTimeout(50);
  eq('tek taraflı aktarımın düzenleme ekranı', await opts('to').then(o => o.map(x => x[0])), ['', 'yk', 'ykc', '__undo']);
  await fill({ to: '__undo', cat: 'Diğer' }); await page.waitForTimeout(80);
  eq('aktarım değil: yeniden gelir', await page.evaluate(() => [S.txns().find(x => x.id === 'g3').category, App.Transactions.monthTotals('2027-10').income]), ['Diğer', 500]);
  await page.evaluate(() => App.Transactions.edit('g3')); await page.waitForTimeout(50);
  await fill({ accountId: 'yk', xfer: 'yk' }); await page.waitForTimeout(50);
  eq('karşı hesap kaydın hesabıyla aynı olamaz', [await hasToast('karşı hesap ondan farklı olmalı'), !!(await dlg())], [true, true]);
  await page.evaluate(() => document.querySelector('.app-dialog-holder [data-act="cancel"]').click());

  // 7) Bankada görünen ad yokken ipucu; üye düzenlemede ad girilir, eşitlemeye ve kayıt temizliğine girer
  await load(seed({ pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() },
    pf_t: [{ id: 'h1', date: '2027-10-18', type: 'income', amount: 5000, category: 'Diğer', note: 'Gelen para: Ali Veli', accountId: 'ak', userId: 'u_a', ts: 1, balanceApplied: true, src: 'sms', xfer: true }] }));
  eq('ipucu: bankada görünen adınızı girin', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => w.icon === '🪪').map(w => w.title)), ['Bankada görünen adınızı girin']);
  await page.evaluate(() => App.Users.edit('u_a')); await page.waitForTimeout(50);
  await fill({ bank: 'DENİZ YILMAZ, D. YILMAZ, X' }); await page.waitForTimeout(80);
  eq('üye düzenleme: ad kaydedildi (tek sözcük olan atılır), eşitlenir', await page.evaluate(() => [App.Users.get('u_a').bankNames, App.Sync.collect().s.users[0].bankNames]), [['DENİZ YILMAZ', 'D. YILMAZ'], ['DENİZ YILMAZ', 'D. YILMAZ']]);
  eq('kayıt temizliği: ad dizisi ve xfer işareti korunur', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pf_s')); s.users[0].bankNames = ['A B', 'TEK', 5, 'C D E']; localStorage.setItem('pf_s', JSON.stringify(s)); S.load(); return [App.Users.get('u_a').bankNames, S.txns().find(t => t.id === 'h1').xfer]; }), [['A B', '5', 'C D E'].filter(x => x.split(' ').length >= 2), true]);
  await page.evaluate(() => { App.UI.nav('aile'); document.getElementById('userName').value = 'Ece'; document.getElementById('userBankName').value = 'ECE YILMAZ'; App.Users.add(); }); await page.waitForTimeout(50);
  eq('yeni üye: bankada görünen ad', await page.evaluate(() => [App.Users.list().find(u => u.name === 'Ece').bankNames, document.getElementById('userBankName').value]), [['ECE YILMAZ'], '']);

  // 8) Ekstre: kendi hesabınıza giden FAST aktarım olur (Akbank'taki tek taraflı aktarımla eşleşir); kart ödemesi satırı karta aktarım
  await load(seed({ pf_t: [{ id: 'p1', date: '2027-10-20', type: 'income', amount: 100000, category: 'Transfer', note: 'Gelen para: Deniz Yılmaz (kendi hesabınızdan)', accountId: 'ak', userId: 'u_a', ts: 1, balanceApplied: true, src: 'sms', xfer: true }],
    pf_a: ACC().map(a => a.id === 'ak' ? Object.assign(a, { balance: 120000 }) : a) }));
  const rows = await page.evaluate(() => { const x = App.Statement._load('hesap.xlsx', { rows: [['Tarih', 'Açıklama', 'Tutar', 'Bakiye'], ['20.10.2027', 'FAST GIDEN DENIZ YILMAZ AKBANK', '-100.000,00', '50.000,00'], ['19.10.2027', 'KREDI KARTI ODEMESI 9999', '-4.000,00', '150.000,00'], ['18.10.2027', 'MIGROS', '-1.250,00', '154.000,00']] });
    App.Statement.setAccount && (x.meta.accountId = 'yk'); return x.rows.map(r => [r.desc, r.type, r.category, r.on, r.cardpay]); });
  eq('ekstre satırları: kendi aktarımı ve kart ödemesi aktarım, seçili', rows, [['FAST GIDEN DENIZ YILMAZ AKBANK', 'expense', 'Transfer', true, false], ['KREDI KARTI ODEMESI 9999', 'expense', 'Transfer', true, true], ['MIGROS', 'expense', 'Market', true, false]]);
  await page.evaluate(() => { App.Statement.open(); document.getElementById('stmtAcc').value = 'yk'; App.Statement.setAccount('yk'); }); await page.waitForTimeout(80);
  eq('önizleme özeti', await page.evaluate(() => document.getElementById('stmtSum').textContent.replace(/\s+/g, ' ').trim().split(' · ').slice(0, 4)), ['3 / 3 seçili', '+₺0,00', '−₺1.250,00', '↔ 2 aktarım (gelir/gider değil)']);
  await page.evaluate(() => App.Statement.commit()); await page.waitForTimeout(120);
  eq('ekstre aktarımları: Akbank\'la eşleşti, kart borcu düştü, gider yalnız market', await snap().then(s => [s.bal, s.tot.expense, s.txns.filter(t => t[2] === 'Transfer').map(t => [t[0], t[1], t[3], t[5]])]),
    [{ yk: 150000 - 100000 - 4000 - 1250, ak: 120000, ykc: -4000 }, 1250, [['expense', 100000, 'yk', true], ['expense', 4000, 'yk', true], ['income', 100000, 'ak', true], ['income', 4000, 'ykc', true]]]);
  eq('kart uygulamada değilse kart ödemesi gider olarak seçili gelir', await page.evaluate(() => { S.saveAccounts(S.accounts().filter(a => a.type !== 'card')); const x = App.Statement._load('h.xlsx', { rows: [['Tarih', 'Açıklama', 'Tutar', 'Bakiye'], ['02.10.2027', 'KREDI KARTI ODEMESI 9999 IBAN', '-4.000,00', '1.000,00'], ['01.10.2027', 'MAAS', '5.000,00', '5.000,00']] }); return x.rows.map(r => [r.category, r.on]); }), [['Kredi Kartı Ödemesi', true], ['Maaş', true]]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
