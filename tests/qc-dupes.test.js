// Usage: node tests/qc-dupes.test.js
// Çift kayıtlar: eşleşmiş aktarımın aynı yarısı başka kanaldan (SMS/e-posta/bildirim) yeniden gelir; aynı SMS iki telefondan gelir;
// onay bekleyen hareket iki kanaldan gelir; elle girilen aktarım bankadan gelmiş yarısına bağlanır; borç tahsilatı/ödemesi bankadan
// gelmiş kayda bağlanır; ekstredeki taksit satırı uygulamadaki taksitle eşleşir; elle "Kredi Kartı Ödemesi" karta aktarım olur;
// kart ödemesinin çıktığı hesap tahminse sorulur. Kurmaca veri (Deniz ve Ece; DENİZ YILMAZ kurmaca bankada görünen ad); sunucu gerekmez.
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
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6', bankNames: ['DENİZ YILMAZ'] }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const ACC = () => [{ id: 'yk', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', balance: 150000, openingBalance: 150000, ts: 1, last4: '2222' },
  { id: 'ak', name: 'Akbank Vadesiz', type: 'bank', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 1, last4: '3333' },
  { id: 'ykc', name: 'Yapı Kredi World', type: 'card', owner: 'shared', balance: -8000, openingBalance: -8000, ts: 1, last4: '9999', limit: 60000, statementDay: 5, dueOffset: 10 },
  { id: 'n', name: 'Nakit', type: 'cash', owner: 'shared', balance: 3000, openingBalance: 3000, ts: 1 }];
const seed = o => Object.assign({ pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: ACC(), pf_t: [], pf_sq: [], pf_d: [] }, o || {});
const IN_OWN = 'Sayın DENİZ Y.,\nAkbank 3333 nolu hesabınıza 20.10.2027 tarihinde DENİZ YILMAZ tarafından 100.000,00 TL FAST gelmiştir.';
const OUT_OWN = '2222 nolu hesabinizdan DENIZ YILMAZ adina 100.000,00 TL FAST ile gonderilmistir. Yapi Kredi';
const PUSH_IN = 'Akbank: 3333 nolu hesabınıza DENİZ YILMAZ tarafından 100.000,00 TL FAST gelmiştir.';
const MIG = '9999 ile biten kartinizla 20.10.2027 tarihinde MIGROS isyerinde 1.250,00 TL tutarinda harcama yapilmistir. Yapi Kredi';
const IN_FROM = (who, amt) => 'Akbank 3333 nolu hesabınıza 20.10.2027 tarihinde ' + who + ' tarafından ' + amt + ' TL FAST gelmiştir.';
const SMS = (id, text, u, dev) => ({ id, text, label: (dev || 'abcdefgh') + '_' + (u || 'u_a'), receivedAt: RECV });
const MAIL = (id, text, u) => ({ id, text, label: 'gmailbox_' + (u || 'u_a'), receivedAt: RECV });
const PUSH = (id, text, u) => ({ id, text, label: 'bildirim_' + (u || 'u_a'), receivedAt: RECV });

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(base);
  const load = async sd => { await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd); await page.reload(); await page.waitForTimeout(250); };
  const snap = () => page.evaluate(() => ({ bal: Object.fromEntries(S.accounts().map(a => [a.id, a.balance])), tot: App.Transactions.monthTotals('2027-10'), txns: S.txns().map(t => [t.type, t.amount, t.category, t.accountId, !!t.transferId]).sort(), q: S.smsQueue().length }));
  const ING = items => page.evaluate(items => App.BankSms.ingest(items), items);
  const hasToast = m => page.evaluate(m => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes(m)), m);
  const closeAll = () => page.evaluate(() => document.querySelectorAll('.app-dialog-holder').forEach(d => d.remove()));
  const form = (type, o) => page.evaluate(([type, o]) => { App.UI.nav('islemler'); App.UI.setType(type); if (type === 'transfer') { document.getElementById('txnAccount').value = o.from; document.getElementById('txnToAccount').value = o.to; } else { const ch = document.querySelector('#txnPayChips [data-acc="' + o.acc + '"]'); if (ch) ch.click(); document.getElementById('txnCat').value = o.cat; } document.getElementById('txnAmt').value = o.amt; document.getElementById('txnDate').value = '2027-10-20'; document.getElementById('txnNote').value = o.note || ''; App.Transactions.add(); }, [type, o]);
  const dlgTitle = () => page.evaluate(() => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); return d ? d.querySelector('.modal-title').textContent : null; });
  const click = act => page.evaluate(a => { [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-act="' + a + '"]').click(); }, act);

  // 1) Eşleşmiş aktarımın gelen yarısı bildirimle bir daha gelir: ikinci kez eklenmez (eskiden 100.000 gelir yazılıyordu)
  await load(seed());
  await ING([SMS('s1', OUT_OWN)]); await ING([MAIL('m1', IN_OWN)]);
  const paired = { bal: { yk: 50000, ak: 120000, ykc: -8000, n: 3000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['expense', 100000, 'Transfer', 'yk', true], ['income', 100000, 'Transfer', 'ak', true]], q: 0 };
  eq('giden SMS + gelen e-posta eşleşti', await snap(), paired);
  const r1 = await ING([PUSH('p1', PUSH_IN)]);
  eq('aynı gelen para bildirimle yeniden gelir → tekrar sayılır, eklenmez', [r1.dupes, r1.added, r1.own || 0, await snap()], [1, 0, 0, paired]);
  // Bankada görünen ad girilmemiş olsa da (kişiden gelen para): eşleşmiş aktarım yine tekrar sayılır
  await load(seed({ pf_s: { onboarded: true, users: U.map(u => ({ id: u.id, name: u.name, emoji: u.emoji, color: u.color })), activeUser: 'u_a', lastBackupAt: Date.now() } }));
  await ING([SMS('s1', OUT_OWN)]); await ING([MAIL('m1', IN_OWN)]);
  const r1b = await ING([PUSH('p1', PUSH_IN), MAIL('m2', 'Yapı Kredi: 2222 nolu hesabınızdan DENİZ YILMAZ adına 100.000,00 TL FAST gönderilmiştir.')]);
  eq('ad girilmemişken de: iki yarı başka kanaldan yeniden gelir → ikisi de tekrar', [r1b.dupes, (await snap()).bal, (await snap()).tot], [2, paired.bal, paired.tot]);

  // 2) Aynı SMS iki telefondan (ortak hesap): bir kez; aynı telefondan iki aynı mesaj iki harcamadır
  await load(seed());
  const r2 = await ING([SMS('a1', MIG, 'u_a', 'aaaa1111'), SMS('b1', MIG, 'u_b', 'bbbb2222')]);
  eq('aynı SMS iki telefonda: 1 eklendi, 1 tekrar', [r2.added, r2.dupes, (await snap()).bal.ykc, (await snap()).tot.expense], [1, 1, -9250, 1250]);
  const r2b = await ING([SMS('a2', MIG, 'u_a', 'aaaa1111')]);
  eq('aynı telefondan ikinci aynı mesaj: ayrı harcama (iki kahve)', [r2b.added, (await snap()).tot.expense], [1, 2500]);
  const r2c = await ING([SMS('b2', MIG, 'u_b', 'bbbb2222')]);
  eq('öbür telefonun ikinci kopyası sonra gelir: tekrar', [r2c.dupes, r2c.added, (await snap()).tot.expense], [1, 0, 2500]);
  eq('metin özeti kaydedilir, yeniden yüklemede (eşitleme) kalır', await page.evaluate(() => { S.load(); return S.txns().map(t => [/^[a-z0-9]{1,8}$/.test(t.sh), /^[a-z0-9]{1,8}$/.test(t.sp)]); }), [[true, true], [true, true]]);

  // 3) Onay bekleyen hareket iki telefondan ve iki kanaldan gelir: bir kez sorulur; eklenince sonraki kopya tekrar sayılır
  await load(seed());
  const ATM = '2222 nolu hesabinizdan 20.10.2027 tarihinde ATM\'den 2.000,00 TL nakit cekilmistir. Yapi Kredi';
  const r3 = await ING([SMS('a1', ATM, 'u_a', 'aaaa1111'), SMS('b1', ATM, 'u_b', 'bbbb2222'), MAIL('m1', 'Yapı Kredi: 2222 nolu hesabınızdan 20.10.2027 tarihinde ATM\'den 2.000,00 TL para çekilmiştir.')]);
  eq('ATM: iki telefon + e-posta → 1 onay bekliyor, 2 tekrar', [r3.queued, r3.dupes, (await snap()).q], [1, 2, 1]);
  await page.evaluate(() => App.BankSms.accept(S.smsQueue()[0].id));
  eq('onay: nakite aktarım önerilir', await page.evaluate(() => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); return [d.querySelector('[data-pkey="type"]').value, d.querySelector('[data-pkey="to"]').value]; }), ['move', 'n']);
  await click('ok'); await page.waitForTimeout(100);
  const r3b = await ING([PUSH('p1', 'Yapı Kredi: 2222 nolu hesabınızdan ATM\'den 2.000,00 TL para çekildi.')]);
  eq('eklendikten sonra bildirim kopyası: tekrar; banka −2.000, nakit +2.000, gider yok', [r3b.dupes, r3b.queued, await snap()], [1, 0, { bal: { yk: 148000, ak: 20000, ykc: -8000, n: 5000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['expense', 2000, 'Transfer', 'yk', true], ['income', 2000, 'Transfer', 'n', true]], q: 0 }]);

  // 4) Önce elle aktarım, sonra bankanın mesajları: mesajlar tekrar sayılır
  await load(seed());
  await form('transfer', { from: 'yk', to: 'ak', amt: '100000' });
  const r4 = await ING([MAIL('m1', IN_OWN), SMS('s1', OUT_OWN)]);
  eq('elle aktarım sonra iki banka mesajı: ikisi de tekrar', [r4.dupes, r4.own || 0, r4.transfers || 0, await snap()], [2, 0, 0, paired]);

  // 5) Önce bankanın mesajı (karşı hesabı bekleyen aktarım), sonra elle aktarım: ona bağlanır
  await load(seed());
  await ING([MAIL('m1', IN_OWN)]);
  await form('transfer', { from: 'yk', to: 'ak', amt: '100000' });
  eq('elle aktarım bankadan gelmiş yarısına bağlandı (Akbank iki kez artmadı)', [await snap(), await hasToast('Bankadan gelen kayıtla eşleşti')], [paired, true]);

  // 6) Bankadan gelir yazılmış para (bankada görünen ad girilmemiş, uygulamadaki ad "Ben") + elle aktarım: sorulur
  const IN_ECE = IN_FROM('DENİZ YILMAZ', '7.500,00'), NONAME = seed({ pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Eş', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() } });
  await load(NONAME);
  await ING([MAIL('m1', IN_ECE)]);
  eq('kendi adınızdan gelen para gelir sayıldı (bankada görünen ad girilmemiş)', (await snap()).tot.income, 7500);
  await form('transfer', { from: 'yk', to: 'ak', amt: '7500' });
  eq('elle aktarımda soru: bu para bankadan zaten kayıtlı', [await dlgTitle(), await page.evaluate(() => [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-act="extra"]').textContent)], ['Bu para bankadan zaten kayıtlı', 'Ayrı aktarım ekle']);
  await click('ok'); await page.waitForTimeout(100);
  eq('"Aynı hareket": gelir aktarıma çevrildi, Yapı Kredi düştü, Akbank bir kez arttı', await snap(), { bal: { yk: 142500, ak: 27500, ykc: -8000, n: 3000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['expense', 7500, 'Transfer', 'yk', true], ['income', 7500, 'Transfer', 'ak', true]], q: 0 });
  await load(NONAME);
  await ING([MAIL('m1', IN_ECE)]);
  await form('transfer', { from: 'yk', to: 'ak', amt: '7500' });
  await click('extra'); await page.waitForTimeout(100);
  eq('"Ayrı aktarım ekle": ayrı aktarım eklendi, gelir kaldı', [(await snap()).bal, (await snap()).tot.income], [{ yk: 142500, ak: 35000, ykc: -8000, n: 3000 }, 7500]);

  // 7) Borç: tahsilat bankadan gelmiş kayda bağlanır (gelir ve bakiye iki kez artmaz); silinince kayıt eski hâline döner
  await load(seed({ pf_d: [{ id: 'd1', direction: 'lent', person: 'Ali Veli', amount: 5000, date: '2027-09-01', hasDue: false, dueDate: '', note: '', accountId: 'ak', txnId: '', payments: [], settled: false, ts: 1 },
    { id: 'd2', direction: 'lent', person: 'Ayşe Kara', amount: 3000, date: '2027-09-01', hasDue: false, dueDate: '', note: '', accountId: 'ak', txnId: '', payments: [], settled: false, ts: 2 }] }));
  await ING([MAIL('m1', IN_FROM('ALI VELI', '5.000,00'))]);
  eq('bankadan gelen para önce gelir', [(await snap()).tot.income, (await snap()).bal.ak], [5000, 25000]);
  const pay = (id, amt) => page.evaluate(([id, amt]) => { App.UI.nav('borclar'); document.getElementById('pay_amt_' + id).value = amt; document.getElementById('pay_date_' + id).value = '2027-10-20'; App.Debts.addPayment(id); }, [id, amt]);
  await pay('d1', '5000');
  const bid = await page.evaluate(() => S.debts().find(d => d.id === 'd1').payments[0].txnId);
  eq('borç tahsilatı banka kaydına bağlandı: gelir 0, Akbank bir kez arttı, yeni hareket yok', [await page.evaluate(id => { const t = S.txns().find(x => x.id === id), d = S.debts().find(x => x.id === 'd1'); return [t.src, t.category, t.note, d.settled, d.payments[0].bank]; }, bid), (await snap()).tot.income, (await snap()).bal.ak, (await snap()).txns.length, await hasToast('Bankadan gelen kayıtla eşleşti')],
    [['sms', 'Transfer', 'Borç tahsilatı: Ali Veli', true, { cat: 'Diğer', note: 'Gelen para: Ali Veli', xfer: true }], 0, 25000, 1, true]);
  await page.evaluate(id => App.Transactions.edit(id), bid);
  eq('borca bağlı kayıt düzenlenirken borç ekranına yönlendirir (yalnız not)', await dlgTitle(), 'Hareketi Düzenle');
  await closeAll();
  eq('eşitleme/yeniden yükleme: ödemenin banka bilgisi kalır', await page.evaluate(() => { S.load(); return S.debts().find(d => d.id === 'd1').payments[0].bank; }), { cat: 'Diğer', note: 'Gelen para: Ali Veli', xfer: true });
  await page.evaluate(() => { const d = S.debts().find(x => x.id === 'd1'); App.Debts.removePayment('d1', d.payments[0].id); });
  eq('Borçlar\'da ödeme silinince banka kaydı silinmez, yeniden gelir olur', [await page.evaluate(id => { const t = S.txns().find(x => x.id === id); return t && [t.category, t.note, !!t.xfer]; }, bid), (await snap()).tot.income, (await snap()).bal.ak, await page.evaluate(() => S.debts().find(d => d.id === 'd1').settled)], [['Diğer', 'Gelen para: Ali Veli', true], 5000, 25000, false]);
  await pay('d1', '5000');
  await page.evaluate(id => App.Transactions.remove(id), bid); await click('ok'); await page.waitForTimeout(100);
  eq('İşlemler\'den silinirse kayıt da ödeme de silinir', [await page.evaluate(id => S.txns().some(x => x.id === id), bid), (await snap()).bal.ak, await page.evaluate(() => S.debts().find(d => d.id === 'd1').payments.length)], [false, 20000, 0]);
  // Önce borç ödemesi (hesaba işlenmiş), sonra bankanın mesajı: mesaj tekrar sayılır
  await pay('d2', '3000');
  const r7 = await ING([MAIL('m2', IN_FROM('AYSE KARA', '3.000,00'))]);
  eq('önce Borçlar\'da tahsilat, sonra banka mesajı: tekrar, Akbank bir kez arttı', [r7.dupes, r7.added, (await snap()).bal.ak, (await snap()).tot.income], [1, 0, 23000, 0]);
  // Alınan borç: bankadan gelmiş para borç olarak eklenir; borç silinince kayıt kalır
  await ING([MAIL('m3', IN_FROM('VELI CAN', '10.000,00'))]);
  await page.evaluate(() => { App.UI.nav('borclar'); document.getElementById('debtDir').value = 'borrowed'; document.getElementById('debtPerson').value = 'Veli Can'; document.getElementById('debtAmt').value = '10000'; document.getElementById('debtDate').value = '2027-10-20'; document.getElementById('debtAccount').value = 'ak'; App.Debts.add(); });
  const d3 = await page.evaluate(() => { const d = S.debts().find(x => x.person === 'Veli Can'), t = S.txns().find(x => x.id === d.txnId); return [t.src, t.category, t.note, d.bank]; });
  eq('alınan borç bankadan gelmiş kayda bağlandı', [d3, (await snap()).tot.income, (await snap()).bal.ak], [['sms', 'Transfer', 'Borç alındı: Veli Can', { cat: 'Diğer', note: 'Gelen para: Veli Can', xfer: true }], 0, 33000]);
  await page.evaluate(() => App.Debts.remove(S.debts().find(x => x.person === 'Veli Can').id));
  eq('borcu silme sorusu banka kaydının kalacağını söyler', await page.evaluate(() => /Bankadan gelen 1 hareket silinmez/.test([...document.querySelectorAll('.app-dialog-holder')].pop().textContent)), true);
  await click('ok'); await page.waitForTimeout(100);
  eq('borç silindi, banka kaydı gelir olarak kaldı', [(await snap()).tot.income, (await snap()).bal.ak], [10000, 33000]);
  // Banka kaydındaki kişi borçlu değilse bağlanmaz (aynı hafta aynı tutar başka kişiden gelmiş olabilir)
  await ING([MAIL('m4', IN_FROM('MEHMET OZ', '4.000,00'))]);
  await page.evaluate(() => { const a = S.debts(); a.push({ id: 'd4', direction: 'lent', person: 'Zeynep Ak', amount: 4000, date: '2027-09-01', hasDue: false, dueDate: '', note: '', accountId: 'ak', txnId: '', payments: [], settled: false, ts: 4 }); S.saveDebts(a); });
  await pay('d4', '4000');
  eq('başka kişiden gelen aynı tutar bağlanmaz: tahsilat ayrı hareket', await page.evaluate(() => { const p = S.debts().find(d => d.id === 'd4').payments[0], t = S.txns().find(x => x.id === p.txnId); return [!!p.bank, t.src || '', t.note]; }), [false, '', 'Borç tahsilatı: Zeynep Ak']);

  // 8) Ekstredeki taksit satırı: uygulamadaki aynı taksitle eşleşir (ekstre günüyle ya da alışveriş günüyle yazılmış olsun)
  await load(seed());
  await page.evaluate(() => App.BankSms.ingest([{ id: 'i1', text: '9999 ile biten kartinizla 15.08.2027 tarihinde MEDIAMARKT isyerinde 12.000,00 TL tutarinda 6 taksitli harcama yapilmistir. Yapi Kredi', label: 'abcdefgh_u_a', receivedAt: new Date('2027-08-15T12:00:00').getTime() }]));
  const st = await page.evaluate(() => { const x = App.Statement._load('kart.xlsx', { rows: [['İşlem Tarihi', 'Açıklama', 'Tutar'], ['05.10.2027', 'MEDIAMARKT 3/6 TAKSIT', '2.000,00'], ['15.08.2027', 'MEDIAMARKT 15/08 4/6 TAKSİT', '2.000,00'], ['12.10.2027', 'TEKNOSA 2/3 TAKSIT', '1.500,00'], ['16.10.2027', 'MIGROS', '450,00']] });
    return x.rows.map(r => { const t = r.hitId && S.txns().find(y => y.id === r.hitId); return [r.desc, r.dupe, r.on, t ? t.installment.index : 0]; }); });
  eq('taksit satırları: 3/6 ve 4/6 uygulamadaki taksitle eşleşti (eklenmez); planı olmayan taksit ve normal harcama eklenir', st,
    [['MEDIAMARKT 3/6 TAKSIT', true, false, 3], ['MEDIAMARKT 15/08 4/6 TAKSİT', true, false, 4], ['TEKNOSA 2/3 TAKSIT', false, true, 0], ['MIGROS', false, true, 0]]);

  // 9) Elle "Kredi Kartı Ödemesi" gideri: kart uygulamadaysa karta aktarım olarak yazılır (kartın harcamaları zaten gider)
  await load(seed());
  await form('expense', { acc: 'yk', cat: 'Kredi Kartı Ödemesi', amt: '8000' });
  eq('kart ödemesi soruluyor: tek kart seçili, "kart uygulamada yok" seçeneği var', [await dlgTitle(), await page.evaluate(() => { const s = [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-pkey="card"]'); return [s.value, [...s.options].map(o => o.value)]; })], ['Kart Borcu Ödemesi', ['ykc', ['', 'ykc', '__exp']]]);
  await click('ok'); await page.waitForTimeout(100);
  eq('aktarım: Yapı Kredi −8.000, kart borcu 0, gider yok; ödeme hesabı hatırlandı', [await snap(), await page.evaluate(() => App.Accounts.get('ykc').payFrom)], [{ bal: { yk: 142000, ak: 20000, ykc: 0, n: 3000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['expense', 8000, 'Transfer', 'yk', true], ['income', 8000, 'Transfer', 'ykc', true]], q: 0 }, 'yk']);
  await form('expense', { acc: 'yk', cat: 'Kredi Kartı Ödemesi', amt: '8000' });
  await click('ok'); await page.waitForTimeout(100);
  eq('aynı ödeme yeniden girilirse eklenmez, uyarılır', [await hasToast('aynı tutarda bir ödeme zaten kayıtlı'), (await snap()).txns.length], [true, 2]);
  await closeAll();
  await form('expense', { acc: 'yk', cat: 'Kredi Kartı Ödemesi', amt: '300' });
  await page.evaluate(() => { [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-pkey="card"]').value = '__exp'; }); await click('ok'); await page.waitForTimeout(100);
  eq('"Kart uygulamada yok": gider olarak eklenir', [(await snap()).tot.expense, (await snap()).bal.yk], [300, 141700]);
  eq('uyarı: kart ödemesi gider sayılmış', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => /Kart ödemesi/.test(w.title)).map(w => [w.level, w.title, /Kendi hesaplarınız arası aktarım mı/.test(w.text)])), [['yellow', 'Kart ödemesi gider sayılmış', true]]);

  // 10) Kart ödemesi: kaynağı tahminse onaya düşer; hesap tarafının mesajı gelince aktarım yazılır ve bekleyen kart mesajı kalkar
  await load(seed());
  const r10 = await ING([SMS('c1', 'Yapi Kredi: 9999 ile biten kredi kartiniza 20.10.2027 tarihinde 5.000,00 TL odeme yapilmistir.')]);
  eq('kart tarafı: hesap tahmin (aynı bankanın tek hesabı) → onaya, öneri Yapı Kredi', [r10.queued, r10.transfers || 0, await page.evaluate(() => [S.smsQueue()[0].p.accountId, S.smsQueue()[0].p.to, /hangi hesabınızdan/.test(S.smsQueue()[0].reason)])], [1, 0, ['ykc', 'yk', true]]);
  const r10b = await ING([SMS('c2', '2222 nolu hesabinizdan kredi karti borcunuza 5.000,00 TL odeme yapilmistir. Yapi Kredi')]);
  eq('hesap tarafı: aktarım yazıldı, bekleyen kart mesajı kalktı', [r10b.transfers, await snap()], [1, { bal: { yk: 145000, ak: 20000, ykc: -3000, n: 3000 }, tot: { income: 0, expense: 0, count: 0 }, txns: [['expense', 5000, 'Transfer', 'yk', true], ['income', 5000, 'Transfer', 'ykc', true]], q: 0 }]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
