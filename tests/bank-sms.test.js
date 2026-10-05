// Usage: node tests/bank-sms.test.js [http://127.0.0.1:8787]
// Banka SMS'i → işlem: çözümleme (Yapı Kredi / Akbank kalıpları), hesap eşleme, mükerrer/maaş kontrolü, onay listesi.
// Banka e-postası (Gmail betiği) aynı kurallarla işlenir; aynı hareket hem SMS hem e-postayla gelirse tek kayıt olur.
// Eşitleme sunucusu çalışıyorsa (wrangler dev) Kestirme / Gmail bağlantısı → gelen kutusu → uygulama akışı da uçtan uca sınanır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const now = new Date(), today = iso(now), dmy = d => d.split('-').reverse().join('.');
const yest = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
function seed() {
  return {
    pf_a: [
      { id: 'a_ykb', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'personal', userId: 'u_self', balance: 10000, openingBalance: 10000, ts: 1 },
      { id: 'a_world', name: 'World Kart', type: 'card', owner: 'personal', userId: 'u_self', balance: 0, openingBalance: 0, ts: 2 },
      { id: 'a_akb', name: 'Akbank Maaş Hesabı', type: 'bank', owner: 'personal', userId: 'u_partner', balance: 5000, openingBalance: 5000, ts: 3 },
      { id: 'a_axess', name: 'Akbank Axess', type: 'card', owner: 'personal', userId: 'u_partner', balance: 0, openingBalance: 0, ts: 4 },
      { id: 'a_cash', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 500, openingBalance: 500, ts: 5 }
    ],
    pf_t: [{ id: 't_manual', type: 'expense', amount: 312.75, category: 'Market', date: yest, note: 'A101 elle girildi', accountId: 'a_axess', userId: 'u_partner', ts: 1, balanceApplied: true }],
    pf_r: [{ id: 'r_sal', type: 'income', amount: 45000, category: 'Maaş', day: 1, note: 'Maaşım', accountId: 'a_ykb', userId: 'u_self', active: true, ts: 1 },
      { id: 'r_sal2', type: 'income', amount: 38000, category: 'Maaş', day: 15, note: 'Eşimin maaşı', accountId: 'a_akb', userId: 'u_partner', active: true, ts: 2 }],
    pf_ru: [{ id: 'ru1', field: 'note', value: 'trendyol', category: 'Giyim', active: true, ts: 1 }],
    pf_s: { onboarded: true, theme: 'dark', users: [{ id: 'u_self', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Ayşe', emoji: '👩', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() }
  };
}
const L = 'abcd1234_u_self', LP = 'efgh5678_u_partner';
let nid = 100;
const item = (text, label = L) => ({ id: nid++, label, text, receivedAt: now.getTime() });

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
    await page.reload(); await page.waitForTimeout(400);
    const P = t => page.evaluate(t => { const x = App.BankSms.parse(t, Date.now()); return [x.kind, x.type || '', x.amount, x.merchant || x.party || '', x.last4, x.bank]; }, t);

    // --- Çözümleme ---
    eq('YKB card spend (isyerinden, limit ignored)', await P('1234 ile biten kredi kartinizla ' + dmy(today) + ' 14:32 tarihinde MIGROS TIC. A.S. isyerinden 245,50 TL tutarinda harcama yapilmistir. Kullanilabilir limitiniz 12.345,67 TL. Yapi Kredi'), ['expense', 'expense', 245.5, 'MIGROS', '1234', 'Yapı Kredi']);
    eq('World card, puan amount ignored', await P('World kartinizdan OPET PETROLCULUK A.S. isyerinde 1.250,00 TL harcama yapildi. 12,50 TL Worldpuan kazandiniz.'), ['expense', 'expense', 1250, 'OPET PETROLCULUK', '', 'Yapı Kredi']);
    eq('salary into account', await P('YKB: 5678 nolu hesabiniza 45.000,00 TL maas odemesi yatirilmistir.'), ['income', 'income', 45000, '', '5678', 'Yapı Kredi']);
    eq('Akbank spend with time suffix and Turkish letters', await P("Değerli müşterimiz, 9876 ile biten Axess kartınızla ŞOK MARKETLER'den 87,40 TL tutarında alışveriş yaptınız."), ['expense', 'expense', 87.4, 'ŞOK MARKETLER', '9876', 'Akbank']);
    eq('incoming EFT with sender', await P('Akbank: Hesabiniza AHMET DEMIR tarafindan 750,00 TL EFT gelmistir.'), ['income', 'income', 750, 'AHMET DEMIR', '', 'Akbank']);
    eq('outgoing FAST', await P('Hesabinizdan MEHMET KAYA adina 2.000,00 TL FAST ile gonderilmistir. Yapi Kredi'), ['expense', 'expense', 2000, 'MEHMET KAYA', '', 'Yapı Kredi']);
    eq('refund is income', await P('Yapi Kredi: MIGROS isyerinden yaptiginiz 245,50 TL tutarindaki islem iade edilmistir.'), ['income', 'income', 245.5, 'MIGROS', '', 'Yapı Kredi']);
    eq('declined transaction ignored', (await P('Yapi Kredi kartinizla yapilmak istenen 1.500,00 TL tutarindaki islem yetersiz limit nedeniyle gerceklestirilemedi.'))[0], 'ignore');
    eq('OTP ignored', (await P('Akbank dogrulama kodunuz: 482913. 245,50 TL islem icin.'))[0], 'ignore');
    eq('only limit info ignored', (await P('Yapi Kredi kartinizin kullanilabilir limiti 8.000,00 TL olmustur.'))[0], 'ignore');
    eq('limit line with colon is not a payment', (await P('Yapi Kredi: Kullanilabilir limitiniz: 8.000,00 TL.'))[0], 'ignore');
    eq('card bill payment → review', (await P('Kredi kartiniza 5.000,00 TL odeme yapilmistir. Yapi Kredi'))[0], 'review');
    eq('ATM withdrawal → review', (await P("ATM'den 1.000,00 TL nakit cekilmistir. Yapi Kredi"))[0], 'review');
    eq('foreign currency → review', (await P('Akbank: ****9876 kartinizla USD 25,00 tutarinda NETFLIX.COM harcamasi yapilmistir.')).slice(0, 4), ['review', 'expense', 25, 'NETFLIX.COM']);
    eq('masked card number last4', (await P('4321****1234 nolu kartinizla TRENDYOL\'dan 899,90 TL tutarinda 3 taksitli islem yapilmistir. Yapi Kredi')).slice(3, 5), ['TRENDYOL', '1234']);
    eq('thousands formats', await page.evaluate(() => ['1.234,56 TL', 'TL 1.500', '1,234.50 TL', '99 TL', '12.345.678,9 TL'].map(t => App.BankSms.parse('Kartinizdan ' + t + ' harcama', Date.now()).amount)), [1234.56, 1500, 1234.5, 99, 12345678.9]);

    // --- İşleme ---
    await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_world').last4 = '1234'; S.saveAccounts(a); });
    const batch = [
      item('1234 ile biten kredi kartinizla ' + dmy(today) + ' MIGROS TIC. A.S. isyerinden 245,50 TL tutarinda harcama yapilmistir. Yapi Kredi'),
      item('Axess kartinizdan STARBUCKS\'ta 145,00 TL harcama yapilmistir.', LP),
      item('4321****1234 nolu kartinizla TRENDYOL\'dan 899,90 TL tutarinda islem yapilmistir. Yapi Kredi'),
      item('Akbank Kredi Kartinizla ' + dmy(today) + ' A101 YENI MAGAZACILIK\'tan 312,75 TL harcama yapildi.', LP),
      item('YKB: hesabiniza ' + dmy(today) + ' tarihinde 45.000,00 TL maas odemesi yatirilmistir.'),
      item('Hesabinizdan AYSE YILMAZ adina 2.000,00 TL FAST ile gonderilmistir. Yapi Kredi'),
      item('Kartinizdan 59,90 TL harcama yapildi.'),
      item('Akbank dogrulama kodunuz: 482913.')
    ];
    const r1 = await page.evaluate(items => App.BankSms.ingest(items), batch);
    eq('ingest summary (3 added, 1 dupe of manual entry, salary linked, 2 to review, 1 ignored)', r1, { added: 4, updated: 0, dupes: 1, queued: 2, ignored: 1, test: 0 });
    const tx = await page.evaluate(() => S.txns().filter(t => t.src === 'sms').map(t => [t.amount, t.type, t.category, t.note, t.accountId, t.userId, t.recurringId || '']).sort((a, b) => a[0] - b[0]));
    eq('added transactions: category from brand / rule / salary, account by last4 / bank name, owner from label', tx, [
      [145, 'expense', 'Yiyecek', 'Starbucks', 'a_axess', 'u_partner', ''],
      [245.5, 'expense', 'Market', 'Migros', 'a_world', 'u_self', ''],
      [899.9, 'expense', 'Giyim', 'Trendyol', 'a_world', 'u_self', ''],
      [45000, 'income', 'Maaş', 'Maaş', 'a_ykb', 'u_self', 'r_sal']]);
    eq('balances moved (card −1145,40; bank +45000; axess −145)', await page.evaluate(() => ['a_world', 'a_ykb', 'a_axess'].map(id => App.Accounts.get(id).balance)), [-1145.4, 55000, -457.75]);
    eq('salary SMS marks the recurring salary as logged this month', await page.evaluate(() => document.getElementById('ozet-rec').innerText.includes('Maaşım')), false);
    const q = await page.evaluate(() => S.smsQueue().map(x => [x.p.amount, x.reason.slice(0, 14)]));
    eq('review queue: family transfer and unknown account', q, [[2000, 'Aile içi ya da'], [59.9, 'Hangi hesaba a']]);
    eq('review list shown on Özet', await page.evaluate(() => { App.UI.nav('ozet'); return document.querySelectorAll('#ozet-sms .sms-q-item').length; }), 2);
    eq('same inbox items again (other device / retry) change nothing', await page.evaluate(items => { const r = App.BankSms.ingest(items); return [r.added, r.queued, S.txns().filter(t => t.src === 'sms').length, S.smsQueue().length]; }, batch), [0, 0, 4, 2]);

    // Onay: hesap seçilir → eklenir ve kartın son 4 hanesi o hesaba öğrenilir
    await page.evaluate(() => S.saveSmsQueue(S.smsQueue().concat([{ id: 'sqsms999_x', text: '7777 ile biten kartinizdan 120,00 TL harcama yapildi.', label: 'abcd1234_u_self', receivedAt: Date.now(), reason: 'x', p: { type: 'expense', amount: 120, date: '', note: 'Kart harcaması', category: 'Diğer', accountId: '', last4: '7777' }, ts: 1 }])));
    await page.evaluate(() => { App.BankSms.renderQueue(); App.BankSms.accept('sqsms999_x'); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="acc"]').value = 'a_world'; m.querySelector('[data-pkey="date"]').value = td(); m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('accepted item added and removed from queue', await page.evaluate(() => [S.txns().some(t => t.amount === 120 && t.accountId === 'a_world' && t.src === 'sms'), S.smsQueue().some(x => x.id === 'sqsms999_x')]), [true, false]);
    eq('card last4 learned on the chosen account', await page.evaluate(() => App.Accounts.get('a_world').last4), '1234,7777');
    eq('next SMS of that card goes straight in', await page.evaluate(i => App.BankSms.ingest([i]).added, item('7777 ile biten kartinizdan 80,00 TL harcama yapildi.')), 1);
    eq('dismiss removes from queue', await page.evaluate(() => { const id = S.smsQueue()[0].id; App.BankSms.dismiss(id); return S.smsQueue().some(x => x.id === id); }), false);

    // Maaş önceden tekrarlayandan (otomatik) kaydedildiyse SMS onu gerçek tutarla günceller, ikinci kayıt açmaz
    await page.evaluate(() => { const t = S.txns(); t.unshift({ id: 'tr_r_sal2', type: 'income', amount: 38000, category: 'Maaş', date: tm() + '-15', note: 'Eşimin maaşı', accountId: 'a_akb', userId: 'u_partner', ts: 1, balanceApplied: false, recurringId: 'r_sal2' }); S.saveTxns(t); });
    const r2 = await page.evaluate(i => App.BankSms.ingest([i]), item('Maas odemeniz 38.512,40 TL olarak hesabiniza yatirilmistir. Akbank', LP));
    eq('salary SMS updates the planned salary instead of duplicating', [r2.added, r2.updated], [0, 1]);
    eq('planned salary now has SMS amount and date, balance applied', await page.evaluate(() => { const t = S.txns().find(x => x.id === 'tr_r_sal2'); return [t.amount, t.date === td(), t.balanceApplied, App.Accounts.get('a_akb').balance]; }), [38512.4, true, true, 43512.4]);
    eq('balances stay consistent with history', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
    // Elle yapıştırma (eşitleme olmadan da çalışır)
    await page.evaluate(() => { App.UI.nav('aile'); [...document.querySelectorAll('#setSmsCard button')].find(b => b.textContent === 'SMS Yapıştır').click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="t"]').value = '1234 ile biten kartinizla SHELL PETROL isyerinde 1.100,00 TL harcama yapilmistir. Yapi Kredi'; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('pasted SMS added (Shell → Ulaşım, World card)', await page.evaluate(() => { const t = S.txns().find(x => x.amount === 1100); return t ? [t.category, t.accountId, t.src, t.userId] : null; }), ['Ulaşım', 'a_world', 'sms', 'u_self']);
    await page.evaluate(() => { [...document.querySelectorAll('#setSmsCard button')].find(b => b.textContent === 'SMS Yapıştır').click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="t"]').value = '1234 ile biten kartinizla SHELL PETROL isyerinde 1.100,00 TL harcama yapilmistir. Yapi Kredi'; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('pasting the same SMS again adds nothing', await page.evaluate(() => S.txns().filter(x => x.amount === 1100).length), 1);
    // Nakit olarak açılmış "Yapıkredi" hesabı: düzenlemede tür değişir, son 4 hane girilir, SMS ona işlenir
    await page.evaluate(() => { const a = S.accounts(); a.push({ id: 'a_yk_cash', name: 'Yapıkredi', type: 'cash', owner: 'shared', balance: 1000, openingBalance: 1000, ts: 9 }); S.saveAccounts(a); App.Accounts.renderAll(); App.Accounts.edit('a_yk_cash'); });
    await page.waitForTimeout(150);
    eq('edit dialog offers type and last4 for a cash account', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [!!m.querySelector('[data-pkey="type"]'), !!m.querySelector('[data-pkey="last4"]')]; }), [true, true]);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="type"]').value = 'bank'; m.querySelector('[data-pkey="last4"]').value = '5555'; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('type changed, last4 saved, balance kept', await page.evaluate(() => { const a = App.Accounts.get('a_yk_cash'); return [a.type, a.last4, a.balance]; }), ['bank', '5555', 1000]);
    eq('account card shows last4', await page.evaluate(() => { App.UI.nav('hesaplar'); return document.getElementById('accGrid').innerText.includes('…5555'); }), true);
    eq('SMS with that last4 goes to it', await page.evaluate(i => { App.BankSms.ingest([i]); const t = S.txns().find(x => x.amount === 77); return t && t.accountId; }, item('5555 ile biten hesabinizdan 77,00 TL harcama yapildi.')), 'a_yk_cash');
    // Yeni hesap formunda son 4 hane
    await page.evaluate(() => { document.getElementById('accName').value = 'Akbank Kart'; document.getElementById('accType').value = 'card'; App.Accounts.onTypeChange(); document.getElementById('accLast4').value = '4444'; App.Accounts.add(); });
    eq('add form saves last4', await page.evaluate(() => (S.accounts().find(a => a.name === 'Akbank Kart') || {}).last4), '4444');
    // --- Özellikler arası: SMS + elle giriş + fiş + aktarım + ikramiyeli maaş ---
    await page.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); });
    const before = await page.evaluate(() => S.txns().length);
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType && App.UI.setType('expense'); document.getElementById('txnAmt').value = '245,50'; document.getElementById('txnDate').value = td(); document.getElementById('txnAccount').value = 'a_world'; App.Transactions.add(); });
    await page.waitForTimeout(150);
    eq('manual entry of an amount the SMS already added → asks first, adds nothing yet', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [!!m && /zaten kayıtlı/.test(m.textContent), S.txns().length]; }), [true, before]);
    await page.evaluate(() => { [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('"Yine de Ekle" adds it once', await page.evaluate(() => S.txns().length), before + 1);
    await page.evaluate(() => { const t = S.txns().find(x => x.amount === 245.5 && !x.src); App.Transactions.purge ? App.Transactions.purge(t.id) : null; });
    // Fiş: aynı tutar SMS'le zaten eklenmiş → mevcut kaydı güncelle
    await page.evaluate(() => App.Receipt.review({ total: 145, date: td(), merchant: 'Starbucks', category: 'Yiyecek', items: [] }, 'ocr'));
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = document.getElementById('rcpReview'); m.querySelector('[data-rk="accountId"]').value = 'a_axess'; m.querySelector('[data-rk="note"]').value = 'Starbucks Bağdat Cad. — fiş'; m.querySelector('[data-rk="category"]').value = 'Yiyecek'; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('receipt for an SMS-added purchase offers update instead of a second record', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [...m.querySelectorAll('button')].map(b => b.textContent); }), ['Vazgeç', 'Ayrı Kayıt Ekle', 'Mevcut Kaydı Güncelle']);
    const n145 = await page.evaluate(() => S.txns().filter(t => t.amount === 145).length);
    await page.evaluate(() => { [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('update keeps one record, takes the receipt note', await page.evaluate(() => { const l = S.txns().filter(t => t.amount === 145); return [l.length, l[0].note, l[0].src]; }), [n145, 'Starbucks Bağdat Cad. — fiş', 'sms']);
    // Kendi hesaplarınız arası: giden + gelen SMS → tek transfer (gelir/gider sayılmaz)
    await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_akb').last4 = '3333'; a.find(x => x.id === 'a_ykb').last4 = '2222'; S.saveAccounts(a); });
    const incBefore = await page.evaluate(() => App.Transactions.monthTotals ? JSON.stringify(App.Transactions.monthTotals(tm())) : '');
    await page.evaluate(i => App.BankSms.ingest([i]), item('2222 nolu hesabinizdan MEHMET KAYA adina 3.000,00 TL FAST ile gonderilmistir. Yapi Kredi'));
    const r3 = await page.evaluate(i => App.BankSms.ingest([i]), item('Akbank: 3333 nolu hesabiniza MEHMET KAYA tarafindan 3.000,00 TL FAST gelmistir.', LP));
    eq('outgoing + incoming same amount between own accounts → paired as transfer', [r3.transfers, await page.evaluate(() => S.txns().filter(t => t.amount === 3000).map(t => [t.type, t.category, !!t.transferId, t.accountId]).sort())], [1, [['expense', 'Transfer', true, 'a_ykb'], ['income', 'Transfer', true, 'a_akb']]]);
    eq('transfer does not change month income/expense totals', await page.evaluate(() => App.Transactions.monthTotals ? JSON.stringify(App.Transactions.monthTotals(tm())) : ''), incBefore);
    // İkramiyeli maaş: planlı 38.000 yerine 52.000 gelirse yine aynı kayıt güncellenir
    // Kayıt yeniden "bankayla henüz eşleşmemiş planlı maaş" durumuna getirilir (eşleşmiş maaş ikinci kez eşleşmez)
    await page.evaluate(() => { const t = S.txns(); const x = t.find(y => y.id === 'tr_r_sal2'); App.Transactions.patch(x.id, { amount: 38000, date: tm() + '-15' }); const t2 = S.txns(); delete t2.find(y => y.id === 'tr_r_sal2').src; S.saveTxns(t2); });
    const r4 = await page.evaluate(i => App.BankSms.ingest([i]), item('Maas odemeniz 52.000,00 TL olarak hesabiniza yatirilmistir. Akbank', LP));
    eq('salary with bonus (+37%) updates the planned salary, no second salary', [r4.added, r4.updated, await page.evaluate(() => S.txns().filter(t => t.type === 'income' && t.category === 'Maaş' && t.userId === 'u_partner').length)], [0, 1, 1]);
    // Maaş SMS'i tekrarlayana bağlanamadıysa (tutar farklı), Özet'te "Kaydet" ikinci maaş açmaz: eşleştirir
    await page.evaluate(() => { const r = S.recurring(); r.push({ id: 'r_bonus', type: 'income', amount: 10000, category: 'Maaş', day: 28, note: 'Ek iş', accountId: 'a_ykb', userId: 'u_self', active: true, ts: 3 }); S.saveRecurring(r); const t = S.txns(); t.unshift({ id: 'sms_extra', type: 'income', amount: 11500, category: 'Maaş', date: td(), note: 'Maaş', accountId: 'a_ykb', userId: 'u_self', ts: 1, balanceApplied: true, src: 'sms' }); S.saveTxns(t); App.Accounts.reconcileAccountBalances(true); App.Recurring.log('r_bonus'); });
    await page.waitForTimeout(150);
    eq('recurring "Kaydet" offers to match the bank record', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [...m.querySelectorAll('button')].map(b => b.textContent); }), ['Vazgeç', 'Ayrı Kaydet', 'Eşleştir']);
    await page.evaluate(() => { [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    eq('matched: no new record, recurring counts as logged', await page.evaluate(() => [S.txns().filter(t => t.recurringId === 'r_bonus').map(t => t.id), S.txns().filter(t => t.amount === 10000).length]), [['sms_extra'], 0]);
    eq('transaction list shows source tag and last4 on account tag', await page.evaluate(() => { App.UI.nav('islemler'); App.Transactions.renderList(); const h = document.getElementById('txnList') ? document.getElementById('txnList').innerText : document.body.innerText; return [h.includes('🏦 SMS'), /World Kart …1234/.test(h)]; }), [true, true]);
    eq('balances still consistent', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
    // --- Banka e-postası (Gmail betiğinden): aynı kurallar; SMS'le de gelen aynı hareket ikinci kez eklenmez ---
    await page.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); const a = S.accounts(); a.find(x => x.id === 'a_axess').last4 = '1483'; S.saveAccounts(a); });
    const mailTxt = 'Akbank\nKredi Kartı Harcama Bilgilendirmesi\nKredi kartınızla aşağıdaki işlem gerçekleşmiştir.\nKart No: 5571 **** **** 1483\nİşlem Tarihi: ' + dmy(today) + ' 14:32\nİşyeri: MİGROS KADIKÖY\nTutar: 245,50 TL\nKullanılabilir Limit: 12.345,67 TL';
    eq('e-mail text parsed (amount, merchant, card, bank; limit ignored)', await P(mailTxt), ['expense', 'expense', 245.5, 'MİGROS KADIKÖY', '1483', 'Akbank']);
    eq('e-mail item added', (await page.evaluate(t => App.BankSms.ingest([{ id: 5001, label: 'gmailbox_u_partner', text: t, receivedAt: Date.now() }]), mailTxt)).added, 1);
    eq('e-mail transaction: e-mail source, owner from link, card by last4, Migros → Market', await page.evaluate(() => { const t = S.txns().find(x => x.id.startsWith('sms5001_')); return t && [t.src, t.via, t.userId, t.accountId, t.category, t.note]; }), ['sms', 'email', 'u_partner', 'a_axess', 'Market', 'Migros']);
    const rsm = await page.evaluate(i => App.BankSms.ingest([i]), item('Akbank: 1483 ile biten kartinizla MIGROS KADIKOY isyerinden 245,50 TL harcama yapilmistir.', LP));
    eq('same purchase also arriving by SMS → not added twice', [rsm.added, rsm.dupes, await page.evaluate(() => S.txns().filter(t => t.amount === 245.5 && t.accountId === 'a_axess').length)], [0, 1, 1]);
    eq('transaction list tags it as e-mail', await page.evaluate(() => { App.UI.nav('islemler'); App.Transactions.renderList(); return document.getElementById('txnList').innerText.includes('📧 E-posta'); }), true);
    await page.evaluate(() => App.BankSms.ingest([{ id: 5002, label: 'gmailbox_u_self', text: 'Hesap Hareketi\nKartınızdan 64,00 TL harcama yapılmıştır.', receivedAt: Date.now() }]));
    eq('e-mail without a known account waits for approval, marked as e-mail', await page.evaluate(() => { App.BankSms.renderQueue(); const x = S.smsQueue().find(y => /^sqsms5002_/.test(y.id)); return [!!x, [...document.querySelectorAll('#ozet-sms .sms-q-item')].some(e => e.textContent.includes('📧') && e.textContent.includes('64,00'))]; }), [true, true]);
    await page.evaluate(() => App.BankSms.accept(S.smsQueue().find(y => /^sqsms5002_/.test(y.id)).id));
    await page.waitForTimeout(150);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="acc"]').value = 'a_cash'; m.querySelector('[data-pkey="date"]').value = td(); m.querySelector('[data-pkey="note"]').value = ''; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('accepted e-mail item is recorded as e-mail', await page.evaluate(() => { const t = S.txns().find(x => x.amount === 64); return t && [t.via, t.note, t.accountId, t.userId]; }), ['email', 'Banka e-postası', 'a_cash', 'u_self']);
    // Gerçek Akbank e-postası (sunucunun sakladığı biçim; ad ve kart numarası değiştirildi): işyeri yok, tutar 1,426.78, kalan limit sayılmaz, tarih e-postanın geldiği gün
    const akbTxt = 'Akbank\nKredi kartı harcamanız\n6262 ile biten Axess Asıl kartınızla 1,426.78 TL tutarında KREDI KARTI harcaması yapılmıştır. 2,961.82 TL limitiniz kalmıştır.\nE-posta tarihi: ' + dmy(yest) + ' 23:58';
    eq('real Akbank e-mail: English amount format, remaining limit ignored, date from the e-mail', await page.evaluate(t => { const p = App.BankSms.parse(t, Date.now()); return [p.kind, p.amount, p.last4, p.bank, p.merchant, p.date]; }, akbTxt), ['expense', 1426.78, '6262', 'Akbank', '', yest]);
    eq('real Akbank e-mail recorded with a clear note (the e-mail names no shop)', await page.evaluate(t => { App.BankSms.ingest([{ id: 5004, label: 'gmailbox_u_partner', text: t, receivedAt: Date.now() }]); const x = S.txns().find(y => y.amount === 1426.78); return x && [x.note, x.category, x.accountId, x.date, x.via]; }, akbTxt), ['Akbank kart harcaması', 'Diğer', 'a_axess', yest, 'email']);
    eq('Gmail test message counted on its own', await page.evaluate(() => App.BankSms.ingest([{ id: 5003, label: 'gmailbox_u_self', text: 'AILEKASASI-TEST 1,00 TL 1759480000000', receivedAt: Date.now() }])), { added: 0, updated: 0, dupes: 0, queued: 0, ignored: 0, test: 0, testMail: 1 });
    await page.reload(); await page.waitForTimeout(400);
    eq('e-mail source survives reload (kept in storage and sync)', await page.evaluate(() => S.txns().filter(t => t.via === 'email').map(t => t.amount).sort((a, b) => a - b)), [64, 245.5, 1426.78]);
    eq('balances consistent after e-mail records', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
    eq('settings card asks to enable sync first', await page.evaluate(() => { App.UI.nav('aile'); return document.getElementById('setSmsCard').innerText.includes('eşitlemeyi açın'); }), true);
    await ctx.close();
  }

  // --- Uçtan uca: sunucu (wrangler dev) varsa ---
  let cfg = null; try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) {}
  if (!cfg || !cfg.smsInbox) console.log('Eşitleme sunucusu yok (' + BASE + '); uçtan uca SMS akışı atlandı.');
  else {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('e2e ' + e.message));
    await page.goto(BASE + '/index.html');
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
    await page.reload(); await page.waitForTimeout(400);
    eq('sync started', await page.evaluate(b => App.Sync.start(b), BASE), true);
    eq('SMS link created for this phone', await page.evaluate(() => App.BankSms.setup()), true);
    const url = await page.evaluate(() => App.BankSms.url());
    eq('link shape', /\/v1\/sms\/[A-Za-z0-9_-]{43}$/.test(url), true);
    eq('guide shows the link', await page.evaluate(() => document.getElementById('smsUrlTxt').value === App.BankSms.url()), true);
    // Kestirme gibi: düz JSON POST
    const post = async text => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).json();
    eq('shortcut POST stored', await post('1234 ile biten kartinizla MIGROS isyerinden 245,50 TL harcama yapilmistir. Yapi Kredi'), { stored: true });
    await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_world').last4 = '1234'; S.saveAccounts(a); });
    const res = await page.evaluate(() => App.BankSms.pull({ force: true }));
    eq('app pulled and added it', [res && res.added, await page.evaluate(() => S.txns().filter(t => t.src === 'sms').length)], [1, 1]);
    // İkinci cihaz: onay listesi, son 4 hane ve SMS etiketi eşitlenir; orada onaylanan öğe ilk cihazdan da kalkar
    await page.evaluate(() => App.BankSms.ingest([{ id: 990001, label: 'abcd1234_u_self', text: 'Kartinizdan 59,90 TL harcama yapildi.', receivedAt: Date.now() }]));
    await page.evaluate(() => App.Sync.syncNow({ quiet: true }));
    const code = await page.evaluate(() => App.Sync.codeOf(App.Sync.cfg()));
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const pageB = await ctxB.newPage(); pageB.on('pageerror', e => errors.push('B ' + e.message));
    await pageB.goto(BASE + '/index.html'); await pageB.evaluate(() => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); }); await pageB.reload(); await pageB.waitForTimeout(300);
    eq('device B joins', await pageB.evaluate(c => App.Sync.join(c), code), true);
    await pageB.waitForTimeout(300);
    eq('B sees queue, last4 and SMS source', await pageB.evaluate(() => [S.smsQueue().length, App.Accounts.get('a_world').last4, S.txns().some(t => t.src === 'sms')]), [1, '1234', true]);
    await pageB.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); App.BankSms.accept(S.smsQueue()[0].id); });
    await pageB.waitForTimeout(150);
    await pageB.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="acc"]').value = 'a_world'; m.querySelector('[data-act="ok"]').click(); });
    await pageB.waitForTimeout(200);
    await pageB.evaluate(() => App.Sync.syncNow({ quiet: true })); await page.evaluate(() => App.Sync.syncNow({ quiet: true }));
    eq('accepted on B → gone from A, transaction on A, same balance', await Promise.all([page.evaluate(() => [S.smsQueue().length, S.txns().some(t => t.amount === 59.9), App.Accounts.get('a_world').balance]), pageB.evaluate(() => App.Accounts.get('a_world').balance)]).then(([a, b]) => [a[0], a[1], a[2] === b]), [0, true, true]);
    await ctxB.close();
    eq('inbox emptied on server', await page.evaluate(() => App.Sync.api(App.Sync.cfg(), 'GET', '/inbox').then(r => r.body.items.length)), 0);
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    await page.evaluate(() => App.BankSms.pull({ force: true })); await page.evaluate(() => App.UI.nav('aile'));
    eq('settings shows diagnosis of the last shortcut call (empty body)', await page.evaluate(() => (document.getElementById('smsLast') || {}).textContent || ''), 'Son SMS: az önce · ⚠ boş geldi: Kestirme\'de "text" alanının değeri Kestirme Girişi olmalı');
    eq('test button round-trip', await page.evaluate(async () => { const toasts = []; const o = App.UI.toast; App.UI.toast = (m) => { toasts.push(m); }; App.BankSms.test(); await new Promise(r => setTimeout(r, 1500)); App.UI.toast = o; return toasts.some(t => /çalışıyor/.test(t)); }), true);
    // Canlı bağlantı: SMS gelince açık uygulama hemen çeker
    await page.evaluate(() => App.Sync.connectLive()); await page.waitForTimeout(800);
    if (await page.evaluate(() => App.Sync.live())) {
      await post('Kartinizla STARBUCKS\'ta 145,00 TL harcama yapildi. 1234 ile biten. Yapi Kredi');
      await page.waitForTimeout(1500);
      eq('live push: new SMS appears without reopening the app', await page.evaluate(() => S.txns().some(t => t.amount === 145 && t.src === 'sms')), true);
    }
    // --- Gmail: bağlantı, betik, e-posta akışı, başka cihaz, yenileme, kapatma ---
    eq('Gmail link created', await page.evaluate(() => App.BankSms.mailSetup()), true);
    const murl = await page.evaluate(() => App.BankSms.mailUrl());
    eq('Gmail link is separate from the SMS link', [/\/v1\/sms\/[A-Za-z0-9_-]{43}$/.test(murl), murl !== url], [true, true]);
    eq('guide shows the manifest (read-only Gmail) and the script with the link inside', await page.evaluate(u => { const m = JSON.parse(document.getElementById('mailManifestTxt').value), c = document.getElementById('mailCodeTxt').value; return [m.oauthScopes.includes('https://www.googleapis.com/auth/gmail.readonly'), m.oauthScopes.some(x => /mail\.google\.com|gmail\.modify|gmail\.send/.test(x)), c.includes("var BAGLANTI = '" + u + "'"), /function kur\(\)/.test(c)]; }, murl), [true, false, true, true]);
    await page.evaluate(() => App.UI.closeModal('mailGuideHolder'));
    eq('card shows Gmail on, no e-mail yet', await page.evaluate(() => { App.UI.nav('aile'); return [(document.getElementById('mailLast') || {}).textContent || '', /Betik ve Adımlar/.test(document.getElementById('setSmsCard').innerText)]; }), ['Henüz e-posta gelmedi: Google\'da "kur" çalıştırılınca burada "✓ alındı" görünür.', true]);
    const mpost = async body => (await fetch(murl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    eq('script test message ("kur") stored', await mpost({ text: 'AILEKASASI-TEST 1,00 TL ' + Date.now() }), { stored: true });
    eq('app says the Gmail link works', await page.evaluate(async () => { const t = []; const o = App.UI.toast; App.UI.toast = m => t.push(m); await App.BankSms.pull({ force: true }); App.UI.toast = o; return t.some(x => /Gmail bağlantısı çalışıyor/.test(x)); }), true);
    const html = 'Akbank <bilgilendirme@akbank.com>\nKredi Kartı Harcama Bilgilendirmesi\n<html><body><table><tr><td>Sayın AYSE Y.,</td></tr><tr><td>Kredi kartınızla aşağıdaki işlem gerçekleşmiştir.</td></tr><tr><td>Kart No</td><td>5571 **** **** 1483</td></tr><tr><td>İşlem Tarihi</td><td>' + dmy(today) + ' 14:32</td></tr><tr><td>İşyeri</td><td>ŞOK MARKETLER</td></tr><tr><td>Tutar</td><td>87,40 TL</td></tr></table><p>Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.</p></body></html>';
    eq('e-mail POST stored', await mpost({ text: html, source: 'email', id: 'g1' }), { stored: true });
    await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_axess').last4 = '1483'; S.saveAccounts(a); });
    const rmail = await page.evaluate(() => App.BankSms.pull({ force: true }));
    eq('app pulled the e-mail and added it as e-mail', [rmail && rmail.added, await page.evaluate(() => { const t = S.txns().find(x => x.amount === 87.4); return t && [t.via, t.accountId, t.userId, t.note]; })], [1, ['email', 'a_axess', 'u_self', 'ŞOK']]);
    eq('settings shows the last e-mail result', await page.evaluate(() => (document.getElementById('mailLast') || {}).textContent || ''), 'Son e-posta: az önce · ✓ alındı');
    eq('other device sees Gmail on (status from server) without the script', await page.evaluate(() => { const keep = localStorage.getItem('ft_mail'); localStorage.removeItem('ft_mail'); App.BankSms.renderCard(); const h = document.getElementById('setSmsCard').innerText; localStorage.setItem('ft_mail', keep); App.BankSms.renderCard(); return [/betik başka bir cihazda/.test(h), /Yeni Betik Oluştur/.test(h), /Betik ve Adımlar/.test(h), /Son e-posta: az önce/.test(h)]; }), [true, true, false, true]);
    // Başka cihazda yeni betik oluşturuldu: bu cihazdaki eski kod artık gösterilmez
    await page.evaluate(async () => { const k = 'Z'.repeat(43); const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ft-sms|' + k)))].map(b => b.toString(16).padStart(2, '0')).join(''); await App.Sync.api(App.Sync.cfg(), 'PUT', '/sms-key/gmailbox_u_self', { keyHash: h }); await App.BankSms.pull({ force: true }); });
    eq('key replaced elsewhere → old script no longer offered here', await page.evaluate(() => [App.BankSms.mailUrl(), /Yeni Betik Oluştur/.test(document.getElementById('setSmsCard').innerText)]), ['', true]);
    eq('old Gmail link refused', (await fetch(murl, { method: 'POST', body: JSON.stringify({ text: html, source: 'email', id: 'g2' }) })).status, 404);
    await page.evaluate(() => { App.BankSms.mailSetup(true); }); await page.waitForTimeout(150);
    await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click()); await page.waitForTimeout(700);
    const murl2 = await page.evaluate(() => App.BankSms.mailUrl());
    eq('"Yeni Betik Oluştur" makes a new working link; an e-mail already received is still not added twice', [!!murl2 && murl2 !== murl, await (await fetch(murl2, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: html, source: 'email', id: 'g1' }) })).json()], [true, { stored: false, reason: 'duplicate' }]);
    await page.evaluate(() => App.UI.closeModal('mailGuideHolder'));
    eq('Gmail disable revokes the link', await page.evaluate(async () => { App.BankSms.mailDisable(); await new Promise(r => setTimeout(r, 100)); [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); await new Promise(r => setTimeout(r, 600)); return [App.BankSms.mailUrl(), /Gmail'den Al/.test(document.getElementById('setSmsCard').innerText)]; }), ['', true]);
    eq('Gmail link refused after disable', (await fetch(murl2, { method: 'POST', body: JSON.stringify({ text: 'Kartinizdan 10,00 TL harcama' }) })).status, 404);
    eq('disable revokes the link', await page.evaluate(async () => { App.BankSms.disable(); await new Promise(r => setTimeout(r, 100)); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('.btn-danger,.btn-primary,[data-act="ok"]').click(); await new Promise(r => setTimeout(r, 600)); return App.BankSms.url(); }), '');
    eq('old link refused after disable', (await fetch(url, { method: 'POST', body: JSON.stringify({ text: 'Kartinizdan 10,00 TL harcama' }) })).status, 404);
    await page.evaluate(() => App.Sync.api(App.Sync.cfg(), 'DELETE', ''));
    await ctx.close();
  }
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
