// Usage: node tests/qc-bank.test.js
// Banka SMS / e-posta aktarımı: tekrar denetiminin fazla ve eksik eşleştirmesi, taksitli kart harcaması, kart ödemesinin
// onaydan aktarım olarak eklenmesi, kampanya/OTP/reddedilen işlemler, aynı son 4 hane, yeniden iletilen mesaj.
// Gerçek iPhone/banka yok: metinler kurmaca, gerçek banka biçimlerine benzer. Sunucu gerekmez (ingest doğrudan çağrılır).
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
const now = new Date(), today = iso(now), dmy = d => d.split('-').reverse().join('.');
const L = 'abcd1234_u_a';
let nid = 9000;
const item = (text, label = L, id) => ({ id: id || nid++, label, text, receivedAt: now.getTime() });

function seed() {
  return {
    pf_a: [
      { id: 'b', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', last4: '5555', balance: 20000, openingBalance: 20000, ts: 1 },
      { id: 'c', name: 'Yapı Kredi World', type: 'card', owner: 'shared', last4: '1111', limit: 30000, statementDay: 1, balance: 0, openingBalance: 0, ts: 2 },
      { id: 'k', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 0, openingBalance: 0, ts: 3 },
      { id: 'x1', name: 'Eski Kart', type: 'card', owner: 'shared', last4: '7777', balance: 0, openingBalance: 0, ts: 4 }],
    pf_t: [{ id: 'm1', type: 'expense', amount: 150, category: 'Market', date: today, note: 'Migros', accountId: 'c', userId: 'u_a', ts: 1, balanceApplied: true }],
    pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() }
  };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
  await page.reload(); await page.waitForTimeout(400);
  const ingest = items => page.evaluate(i => App.BankSms.ingest(i), items);
  const bal = () => page.evaluate(() => ({ b: App.Accounts.get('b').balance, c: App.Accounts.get('c').balance, k: App.Accounts.get('k').balance }));

  // 1) Elle "Migros 150" var. SMS: aynı gün ŞOK 150 → farklı işyeri: sessizce atılmaz, onaya düşer
  const r1 = await ingest([item('1111 ile biten kartinizla ' + dmy(today) + ' SOK MARKETLER isyerinden 150,00 TL harcama yapilmistir. Yapi Kredi')]);
  eq('farklı işyeri, aynı tutar: kayıp yok, onaya düşer (açıklamalı)', [r1.added, r1.dupes, r1.queued, await page.evaluate(() => /Aynı tutarda elle girilmiş kayıt var \("Migros"/.test((S.smsQueue()[0] || {}).reason || ''))], [0, 0, 1, true]);
  // 2) Aynı işyeri (Migros) aynı tutar → aynı harcama: eklenmez
  const r2 = await ingest([item('1111 ile biten kartinizla ' + dmy(today) + ' MIGROS TIC. A.S. isyerinden 150,00 TL harcama yapilmistir. Yapi Kredi')]);
  eq('aynı işyeri, aynı tutar: tekrar sayılır, eklenmez', [r2.added, r2.dupes], [0, 1]);
  // 3) Aynı kanaldan aynı tutarda iki ayrı mesaj (iki kahve) → ikisi de eklenir
  const r3 = await ingest([item('1111 ile biten kartinizla STARBUCKS isyerinden 95,00 TL harcama yapilmistir. Yapi Kredi'), item('1111 ile biten kartinizla STARBUCKS isyerinden 95,00 TL harcama yapilmistir. Yapi Kredi')]);
  eq('aynı gün iki gerçek kahve (ayrı mesaj) → iki kayıt', r3.added, 2);
  // 4) Aynı mesaj yeniden iletildi (aynı kutu kimliği) → ikinci kayıt yok
  const same = item('1111 ile biten kartinizla BIM isyerinden 42,50 TL harcama yapilmistir. Yapi Kredi');
  await ingest([same]); const r4 = await ingest([same]);
  eq('aynı mesaj yeniden işlendi → yeni kayıt yok', [r4.added, await page.evaluate(() => S.txns().filter(t => t.amount === 42.5).length)], [0, 1]);
  // 5) Taksitli kart harcaması → taksit planı (borç aylara bölünür, limit tümüyle düşer)
  const before = await bal();
  const inst = item('1111 ile biten kartinizla ' + dmy(today) + ' TEKNOSA isyerinden 3.000,00 TL tutarinda 3 taksitli islem yapilmistir. Yapi Kredi');
  const r5 = await ingest([inst]);
  const plan = await page.evaluate(() => { const l = S.txns().filter(t => t.installment && /Teknosa/i.test(t.note)); return { n: l.length, amts: l.map(t => t.amount), src: l.every(t => t.src === 'sms'), i: App.Cards.info('c') }; });
  eq('SMS taksitli harcama: 3 × 1.000 taksit planı, kart borcu 1.000 artar, 2.000 limitte ayrılır', [r5.added, plan.n, plan.amts, plan.src, Math.round(((await bal()).c - before.c) * 100) / 100, plan.i.blocked], [1, 3, [1000, 1000, 1000], true, -1000, 2000]);
  eq('aynı taksit mesajı yeniden gelirse ikinci plan kurulmaz', await page.evaluate(it => { App.BankSms.ingest([it]); return S.txns().filter(t => t.installment && /Teknosa/i.test(t.note)).length; }, inst), 3);
  // 6) Kart ödemesi mesajı: kart bulunamazsa onaya düşer; "Ekle" aktarım seçili gelir ve gider sayılmaz
  await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'c').last4 = ''; a.find(x => x.id === 'c').name = 'Bonus Kartım'; S.saveAccounts(a); });
  const expBefore = await page.evaluate(() => App.Transactions.monthTotals(tm()).expense);
  const r6 = await ingest([item('5555 nolu hesabinizdan kredi karti borcunuza 2.500,00 TL odeme yapilmistir.')]);
  eq('kart ödemesi, kart belirsiz → onaya düşer', r6.queued, 1);
  const qid = await page.evaluate(() => S.smsQueue().find(x => /Kredi kartı borç ödemesi/.test(x.reason)).id);
  const form = await page.evaluate(id => { App.BankSms.accept(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return { type: m.querySelector('[data-pkey="type"]').value, to: m.querySelector('[data-pkey="to"]').value }; }, qid);
  eq('onay penceresi aktarımı önerir; iki kart olduğu için karşı hesabı kullanıcı seçer', form, { type: 'move', to: '' });
  await page.evaluate(() => { [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-pkey="to"]').value = 'c'; });
  const b6 = await bal();
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  const a6 = await bal();
  eq('aktarım: banka −2.500, kart +2.500, aylık gider değişmez', [a6.b - b6.b, a6.c - b6.c, await page.evaluate(() => App.Transactions.monthTotals(tm()).expense) - expBefore], [-2500, 2500, 0]);
  // 7) Gürültü: kampanya, OTP, reddedilen işlem, yalnız limit bilgisi
  const r7 = await page.evaluate(() => ['Yapi Kredi: Size ozel 50.000 TL\'ye varan ihtiyac kredisi firsati! Hemen basvurun.', 'Akbank: 3D Secure sifreniz 482913. 1.250,00 TL islem icin kimseyle paylasmayin.', 'Kartinizla yapilmak istenen 899,00 TL tutarindaki islem reddedilmistir.', 'Kullanilabilir limitiniz 12.500,00 TL dir. Yapi Kredi'].map(t => App.BankSms.parse(t, Date.now()).kind));
  eq('kampanya / OTP / reddedilen / limit bilgisi → işlem değil', r7, ['ignore', 'ignore', 'ignore', 'ignore']);
  // 8) Aynı son 4 hane iki hesapta → hesap tahmin edilmez, onaya düşer
  await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'x1').last4 = '5555,7777'; S.saveAccounts(a); });
  const r8 = await ingest([item('5555 nolu hesabinizdan 300,00 TL ELEKTRIK faturasi odemesi yapilmistir.')]);
  eq('aynı son 4 hane iki hesapta → onaya düşer (yanlış hesaba yazılmaz)', [r8.added, r8.queued], [0, 1]);
  // 9) Gecikmiş bildirim: metindeki işlem tarihi kullanılır
  const old = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10));
  eq('10 gün gecikmiş mesajda işlem tarihi metinden', await page.evaluate(t => App.BankSms.parse(t, Date.now()).date, dmy(old) + ' tarihinde 1111 ile biten kartinizla A101 isyerinden 77,00 TL harcama yapilmistir.'), old);
  // 10) İade ve iptal: gelir yönünde, kart borcunu azaltır
  eq('iptal / iade → gelir', await page.evaluate(() => ['Yapi Kredi: MIGROS isyerinden yaptiginiz 245,50 TL tutarindaki islem iptal edilmistir.', 'Kartiniza 99,90 TL iade yapilmistir. Akbank'].map(t => { const p = App.BankSms.parse(t, Date.now()); return [p.type, p.refund]; })), [['income', true], ['income', true]]);
  // 11) Yerel kayıt yazılamazsa sunucudaki mesajlar silinmez (pull ack koruması)
  eq('ingest sırasında depolama hatası → ack yapılmaz (kod yolu)', await page.evaluate(() => /if\(window\.__pfStorageError\)return res;/.test(App.BankSms.pull.toString())), true);

  // 12) Aynı ay iki "MAAŞ" mesajı (maaş + ikramiye): ikincisi birincinin üstüne yazılmaz; para kaybolmaz
  const sal = await page.evaluate(() => {
    const r = S.recurring(); r.push({ id: 'r_sal', type: 'income', amount: 45000, category: 'Maaş', day: 1, note: 'Maaşım', accountId: 'b', userId: 'u_a', active: true, autoLog: false, ts: 1 }); S.saveRecurring(r);
    const a = S.accounts(); a.find(x => x.id === 'x1').last4 = '7777'; a.find(x => x.id === 'b').last4 = '5555'; S.saveAccounts(a);
    const b0 = App.Accounts.get('b').balance; App.Recurring.log('r_sal');
    App.BankSms.ingest([{ id: 8801, label: 'abcd1234_u_a', text: '5555 nolu hesabiniza 46.500,00 TL MAAS odemesi yatirilmistir. Yapi Kredi', receivedAt: Date.now() }]);
    App.BankSms.ingest([{ id: 8802, label: 'abcd1234_u_a', text: '5555 nolu hesabiniza 30.000,00 TL MAAS IKRAMIYE odemesi yatirilmistir. Yapi Kredi', receivedAt: Date.now() }]);
    return [App.Accounts.get('b').balance - b0, S.txns().filter(t => t.type === 'income' && t.category === 'Maaş' && t.accountId === 'b').map(t => t.amount).sort()];
  });
  eq('maaş 46.500 sonra ikramiye 30.000: iki kayıt, banka +76.500 (planlı 45.000 gerçek maaşla güncellendi)', sal, [76500, [30000, 46500]]);
  // 13) Ücret / faiz / aidat gider; provizyon onaya; provizyon iptali yoksayılır
  eq('faiz ve aidat gider (kartınıza … yansıtılmıştır), provizyon onaya, iptali yok sayılır', await page.evaluate(() => ['1111 ile biten kartiniza 120,50 TL gecikme faizi yansitilmistir.', 'Kartiniza 250,00 TL yillik kart aidati yansitilmistir. Akbank', 'Hesabinizdan 15,00 TL hesap isletim ucreti tahsil edilmistir.', '1111 ile biten kartinizdan OTEL ABC isyerinde 2.000,00 TL provizyon alinmistir.', 'OTEL ABC isyerinden alinan 2.000,00 TL provizyon iptal edilmistir.'].map(t => { const p = App.BankSms.parse(t, Date.now()); return p.kind + ':' + (p.type || ''); })), ['expense:expense', 'expense:expense', 'expense:expense', 'review:expense', 'ignore:']);

  // 14) Döviz, ATM, tek mesajda kendi hesaplar arası virman, giden FAST alıcısı
  eq('USD harcama ve ATM onaya; "vadesiz hesabınızdan vadeli hesabınıza" gider değil onaya (aktarım); FAST alıcı adı temiz', await page.evaluate(() => {
    const P = t => App.BankSms.parse(t, Date.now());
    const fx = P('Akbank: 1234 ile biten kartinizla AMAZON.COM isyerinde 25,99 USD tutarinda harcama yapilmistir.');
    const atm = P('Akbank: Hesabinizdan ATM\'den 2.000,00 TL nakit cekilmistir.');
    const vir = P('Yapi Kredi: Vadesiz hesabinizdan Vadeli hesabiniza 10.000,00 TL virman yapilmistir.');
    const fast = P('Akbank: Hesabinizdan 750,00 TL tutarinda FAST ile ALI VELI hesabina gonderilmistir.');
    return [[fx.kind, fx.currency, fx.amount], atm.kind, [vir.kind, /aktarım/.test(vir.reason)], [fast.kind, fast.party]];
  }), [['review', 'USD', 25.99], 'review', ['review', true], ['expense', 'ALI VELI']]);

  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
