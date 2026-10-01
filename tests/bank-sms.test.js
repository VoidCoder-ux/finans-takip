// Usage: node tests/bank-sms.test.js [http://127.0.0.1:8787]
// Banka SMS'i → işlem: çözümleme (Yapı Kredi / Akbank kalıpları), hesap eşleme, mükerrer/maaş kontrolü, onay listesi.
// Eşitleme sunucusu çalışıyorsa (wrangler dev) Kestirme bağlantısı → gelen kutusu → uygulama akışı da uçtan uca sınanır.
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
    pf_s: { onboarded: true, theme: 'dark', users: [{ id: 'u_self', name: 'Osman', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Ayşe', emoji: '👩', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() }
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
    eq('inbox emptied on server', await page.evaluate(() => App.Sync.api(App.Sync.cfg(), 'GET', '/inbox').then(r => r.body.items.length)), 0);
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    await page.evaluate(() => App.BankSms.pull({ force: true })); await page.evaluate(() => App.UI.nav('aile'));
    eq('settings shows diagnosis of the last shortcut call (empty body)', await page.evaluate(() => (document.getElementById('smsLast') || {}).textContent || ''), 'Son SMS: az önce · ⚠ boş geldi: Kestirme\'de "text" alanının değeri Kestirme Girdisi olmalı');
    eq('test button round-trip', await page.evaluate(async () => { const toasts = []; const o = App.UI.toast; App.UI.toast = (m) => { toasts.push(m); }; App.BankSms.test(); await new Promise(r => setTimeout(r, 1500)); App.UI.toast = o; return toasts.some(t => /çalışıyor/.test(t)); }), true);
    // Canlı bağlantı: SMS gelince açık uygulama hemen çeker
    await page.evaluate(() => App.Sync.connectLive()); await page.waitForTimeout(800);
    if (await page.evaluate(() => App.Sync.live())) {
      await post('Kartinizla STARBUCKS\'ta 145,00 TL harcama yapildi. 1234 ile biten. Yapi Kredi');
      await page.waitForTimeout(1500);
      eq('live push: new SMS appears without reopening the app', await page.evaluate(() => S.txns().some(t => t.amount === 145 && t.src === 'sms')), true);
    }
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
