// Usage: node tests/qc-moves.test.js
// Gelir ya da gider olmayan banka hareketleri: kredi kullanımı (gelir değil, borç), yatırım alım-satımı (fon/altın/döviz; gelir-gider
// değil), mevduat faizi (gelir), nakit avans (karttan nakde aktarım), kredi taksidi (Krediler'deki planla eşleşirse faiz gider, anapara
// borç ödemesi). Banka mesajı, elle giriş ve ekstre; "Gelen para nereye gitti" dökümü ve uyarılar. Kurmaca veri; sunucu gerekmez.
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
// Kurmaca kredi: 120.000 TL, 12 ay, taksit 11.500 TL, ilk taksit 15 Eylül 2027, Yapı Kredi hesabından
const LOAN = { id: 'ln1', name: 'İhtiyaç Kredisi', kind: 'ihtiyac', principal: 120000, term: 12, first: '2027-09-15', installment: 11500, rate: 0, tax: true, accountId: 'yk', prepay: [], closed: null, ts: 1 };
const seed = o => Object.assign({ pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: ACC(), pf_t: [], pf_sq: [], pf_l: [LOAN] }, o || {});
const SMS = (id, text) => ({ id, text, label: 'abcdefgh_u_a', receivedAt: RECV });
const MAIL = (id, text) => ({ id, text, label: 'gmailbox_u_a', receivedAt: RECV });

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(base);
  const load = async sd => { await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd); await page.reload(); await page.waitForTimeout(250); };
  const bal = () => page.evaluate(() => Object.fromEntries(S.accounts().map(a => [a.id, a.balance])));
  const tot = (m = '2027-10') => page.evaluate(m => { const t = App.Transactions.monthTotals(m); return [t.income, t.expense]; }, m);
  const ING = items => page.evaluate(items => App.BankSms.ingest(items), items);
  const txns = () => page.evaluate(() => S.txns().map(t => [t.type, t.amount, t.category, t.accountId, t.note, t.bk || '', !!t.xext, !!t.lp]).sort());
  const hasToast = m => page.evaluate(m => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes(m)), m);
  const dlgTitle = () => page.evaluate(() => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); return d ? d.querySelector('.modal-title').textContent : null; });
  const click = act => page.evaluate(a => { [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-act="' + a + '"]').click(); }, act);
  const warns = (re, m = '2027-10') => page.evaluate(([re, m]) => App.Insights.compute(m).warnings.filter(w => new RegExp(re).test(w.title)).map(w => [w.level, w.title]), [re, m]);
  const sched = await (async () => { await load(seed()); return page.evaluate(() => App.Loans.schedule(S.loans()[0]).slice(0, 2).map(x => [x.date, x.pay, x.interest, x.principal])); })();
  const [I1, I2] = [sched[0][2], sched[1][2]], P = 11500;
  eq('kurmaca kredinin ilk iki taksidi (plan): 11.500 TL, faiz + anapara', [sched[0][0], sched[0][1], sched[1][0], sched[1][1], Math.round((sched[0][2] + sched[0][3]) * 100) / 100], ['2027-09-15', 11500, '2027-10-15', 11500, 11500]);

  // 1) Kredi kullanımı: hesaba girer ama gelir değil (borç)
  await load(seed());
  const r1 = await ING([SMS('s1', 'Ihtiyac krediniz kullandirilmistir. 300.000,00 TL 2222 nolu hesabiniza yatirilmistir. Yapi Kredi')]);
  eq('kredi kullanımı: gelir değil, Yapı Kredi +300.000', [r1.loanIn, r1.added, (await bal()).yk, await tot(), await txns()], [1, 0, 450000, [0, 0], [['income', 300000, 'Transfer', 'yk', 'Kredi kullanımı · Yapı Kredi (gelir değil)', 'loanIn', true, false]]]);
  eq('bildirim metni', await page.evaluate(r => App.BankSms.summary(r), r1), '1 kredi kullanımı gelir sayılmadı');
  eq('uyarı: kullanılan kredi Krediler\'de yok (120.000\'lik kredi bu değil)', await warns('Kullanılan kredi'), [['info', 'Kullanılan kredi Krediler\'de yok']]);
  eq('"Gelen para nereye gitti": kullanılan kredi ayrı satır', await page.evaluate(() => { const f = App.Transactions.moneyFlow('2027-10'); return [f.loanIn, f.income, f.other]; }), [300000, 0, 0]);

  // 2) Yatırım alım-satımı: fon, altın, döviz gelir-gider değil
  await load(seed());
  const r2 = await ING([SMS('s1', 'Hesabinizdan 10.000,00 TL tutarinda yatirim fonu alimi gerceklesmistir. Akbank'), SMS('s2', 'Yapi Kredi: 2222 nolu hesabinizdan 25.000,00 TL tutarinda altin alimi yapilmistir.'),
    SMS('s3', 'Hesabinizdan 34.000,00 TL karsiligi 1.000 USD alinmistir. Yapi Kredi'), SMS('s4', 'Akbank: 3333 nolu hesabiniza 15.000,00 TL fon satisi tutari yatirilmistir.')]);
  eq('yatırım: 4 hareket gelir-gider değil, bakiyeler değişti', [r2.invest, r2.added, await bal(), await tot()], [4, 0, { yk: 91000, ak: 25000, ykc: -8000, n: 3000 }, [0, 0]]);
  eq('yatırım notları', (await txns()).map(t => t[4]), ['Yatırım alımı: fon · Akbank (gider değil)', 'Yatırım alımı: altın · Yapı Kredi (gider değil)', 'Yatırım alımı: döviz · Yapı Kredi (gider değil)', 'Yatırım satışı: fon · Akbank (gelir değil)']);
  eq('"Gelen para nereye gitti": yatırıma giden net −54.000', await page.evaluate(() => App.Transactions.moneyFlow('2027-10').invest), -54000);
  eq('kart harcaması "ALTINBAS" yatırım sayılmaz', await page.evaluate(() => App.BankSms.parse('9999 ile biten kartinizla ALTINBAS isyerinde 5.000,00 TL tutarinda alisveris yapilmistir. Yapi Kredi', Date.now()).bk || ''), '');

  // 3) Mevduat faizi gelir; ek hesap (KMH) faizi gider
  await load(seed());
  await ING([SMS('s1', 'Akbank: Vadeli mevduat hesabiniza net 1.234,56 TL faiz yatirilmistir.'), SMS('s2', 'Vadeli hesabiniza 21.10.2027 tarihinde net 1.234,56 TL faiz tahakkuk etmistir. Akbank'), SMS('s3', 'KMH hesabinizdan 312,40 TL faiz tahsil edilmistir. Yapi Kredi')]);
  eq('mevduat faizi gelir (Yatırım), KMH faizi gider', await page.evaluate(() => S.txns().map(t => [t.type, t.amount, t.category, t.note]).sort()),
    [['expense', 312.4, 'Diğer', 'Yapı Kredi hesabından ödeme'], ['income', 1234.56, 'Yatırım', 'Mevduat faizi · Akbank'], ['income', 1234.56, 'Yatırım', 'Mevduat faizi · Akbank']]);

  // 4) Nakit avans: karttan nakde aktarım, gider değil
  await load(seed());
  const r4 = await ING([SMS('s1', '9999 ile biten kartinizdan 5.000,00 TL nakit avans cekilmistir. Yapi Kredi')]);
  await page.evaluate(() => App.BankSms.accept(S.smsQueue()[0].id));
  eq('nakit avans: onaya düşer, aktarım ve nakit önerilir', [r4.queued, await page.evaluate(() => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); return [d.querySelector('[data-pkey="type"]').value, d.querySelector('[data-pkey="to"]').value, d.querySelector('[data-pkey="acc"]').value]; })], [1, ['move', 'n', 'ykc']]);
  await click('ok'); await page.waitForTimeout(100);
  eq('kart borcu +5.000, nakit +5.000, gider yok', [await bal(), await tot()], [{ yk: 150000, ak: 20000, ykc: -13000, n: 8000 }, [0, 0]]);

  // 5) Kredi taksidi (banka mesajı): Krediler'deki planla eşleşir → faiz gider, anapara borç ödemesi
  await load(seed());
  const r5 = await ING([SMS('s1', '2222 nolu hesabinizdan 11.500,00 TL kredi taksit odemesi tahsil edilmistir. Yapi Kredi')]);
  eq('taksit bölündü: faiz gider, anapara aktarım; Yapı Kredi −11.500', [r5.added, r5.loanSplit, (await bal()).yk, await tot(), await page.evaluate(() => S.txns().map(t => [t.amount, t.category, t.note, t.lk]).sort((a, b) => a[0] - b[0]))],
    [1, 1, 138500, [0, I2], [[I2, 'Kredi Ödemesi', 'İhtiyaç Kredisi 2. taksit: faiz', 2], [Math.round((P - I2) * 100) / 100, 'Transfer', 'İhtiyaç Kredisi 2. taksit: anapara (borç ödemesi, gider değil)', 2]].sort((a, b) => a[0] - b[0])]);
  eq('bildirim metni', await page.evaluate(r => App.BankSms.summary(r), r5), '1 banka hareketi eklendi · 1 kredi taksidi faiz ve anapara olarak ayrıldı');
  eq('"Gelen para nereye gitti": kredi anaparası ayrı satır', await page.evaluate(() => { const f = App.Transactions.moneyFlow('2027-10'); return [f.loanPay, f.spend, f.other]; }), [Math.round((P - I2) * 100) / 100, I2, 0]);
  eq('Özet dökümünde "Kredi anaparası" satırı', await page.evaluate(() => { App.UI.nav('ozet'); renderAllViews(); return [...document.querySelectorAll('#mCards .mf-row span')].some(s => /Kredi anaparası/.test(s.textContent)); }), true);
  const r5b = await ING([MAIL('m1', 'Yapı Kredi: hesabınızdan 11.500,00 TL kredi taksit ödemesi tahsil edilmiştir.')]);
  eq('aynı taksit e-postayla da gelir: tekrar (toplamıyla eşleşir)', [r5b.dupes, r5b.added, (await bal()).yk], [1, 0, 138500]);
  const fid = await page.evaluate(() => S.txns().find(t => t.category === 'Kredi Ödemesi').id);
  await page.evaluate(id => App.Transactions.edit(id), fid);
  eq('düzenleme: Kredi Taksidi penceresi', await dlgTitle(), 'Kredi Taksidi');
  await page.evaluate(() => { [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-pkey="mode"]').value = 'one'; }); await click('ok'); await page.waitForTimeout(100);
  eq('"Tümü gider": tek kayıt, toplam ve bakiye aynı', [await page.evaluate(() => S.txns().map(t => [t.amount, t.category, !!t.lp])), (await bal()).yk, await tot()], [[[P, 'Kredi Ödemesi', false]], 138500, [0, P]]);
  eq('uyarı: anapara gider sayılıyor', await warns('anaparası gider'), [['info', 'Kredi taksidinin anaparası gider sayılıyor']]);
  await page.evaluate(id => App.Transactions.edit(id), fid); await click('ok'); await page.waitForTimeout(100);
  eq('kaydedince yeniden bölünür', [await page.evaluate(() => S.txns().length), await tot(), await hasToast('Kredi taksidi: faiz'), await warns('anaparası gider')], [2, [0, I2], true, []]);
  await page.evaluate(id => App.Transactions.remove(id), fid); await page.waitForTimeout(100);
  eq('silinince ikisi birlikte silinir, para hesaba döner', [await page.evaluate(() => S.txns().length), (await bal()).yk], [0, 150000]);
  eq('eşitleme/yeniden yükleme: işaretler kalır', await page.evaluate(() => { App.BankSms.ingest([{ id: 's9', text: '2222 nolu hesabinizdan 11.500,00 TL kredi taksit odemesi tahsil edilmistir. Yapi Kredi', label: 'abcdefgh_u_a', receivedAt: Date.now() }]); S.load(); return S.txns().map(t => [!!t.lp, t.loanId, t.lk]); }), [[true, 'ln1', 2], [true, 'ln1', 2]]);

  // 6) Elle "Kredi Ödemesi" (geçmiş taksit): aynı bölme
  await load(seed());
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="yk"]').click(); document.getElementById('txnAmt').value = '11500'; document.getElementById('txnDate').value = '2027-09-15'; document.getElementById('txnCat').value = 'Kredi Ödemesi'; App.Transactions.add(); });
  eq('elle 1. taksit: faiz gider (eylül), anapara borç ödemesi', [await tot('2027-09'), (await bal()).yk, await hasToast('Kredi taksidi kaydedildi'), await page.evaluate(() => S.txns().map(t => t.lk))], [[0, I1], 138500, true, [1, 1]]);
  // Kredi planında olmayan tutar bölünmez
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="yk"]').click(); document.getElementById('txnAmt').value = '3000'; document.getElementById('txnDate').value = '2027-10-15'; document.getElementById('txnCat').value = 'Kredi Ödemesi'; App.Transactions.add(); });
  eq('planda olmayan tutar: tek gider kalır', await page.evaluate(() => S.txns().filter(t => t.amount === 3000).map(t => [t.category, !!t.lp])), [['Kredi Ödemesi', false]]);

  // 6b) Tekrarlayan "Kredi Ödemesi": kendiliğinden kaydedilince bölünür; bankadan gelmiş bölünmüş taksit "bu ay geldi" sayılır
  const REC = { id: 'r1', type: 'expense', amount: 11500, category: 'Kredi Ödemesi', day: 15, note: 'Kredi taksidi', accountId: 'yk', userId: 'u_a', isSubscription: false, active: true, autoLog: true, autoFrom: '2027-10', autoDone: '', ts: 1 };
  await load(seed({ pf_r: [REC] }));
  await page.evaluate(() => App.Recurring.autoRun());
  eq('tekrarlayan taksit kendiliğinden kaydedildi ve bölündü', [await tot(), await page.evaluate(() => S.txns().map(t => [t.category, t.lk, !!t.recurringId]).sort())], [[0, I2], [['Kredi Ödemesi', 2, true], ['Transfer', 2, false]]]);
  await load(seed({ pf_r: [Object.assign({}, REC, { autoLog: false })] }));
  await ING([SMS('s1', '2222 nolu hesabinizdan 11.500,00 TL kredi taksit odemesi tahsil edilmistir. Yapi Kredi')]);
  await page.evaluate(() => App.Recurring.log('r1'));
  eq('"Kaydet": bankadan gelmiş bölünmüş taksit tanınır (11.500), yeni kayıt açılmaz', [await dlgTitle(), await page.evaluate(() => /₺11\.500,00/.test([...document.querySelectorAll('.app-dialog-holder')].pop().textContent))], ['Bu ay bankadan zaten geldi', true]);
  await click('ok'); await page.waitForTimeout(100);
  eq('eşleşti: iki kayıt, gider yalnız faiz', [await page.evaluate(() => S.txns().length), await tot(), (await bal()).yk], [2, [0, I2], 138500]);

  // 7) Ekstre: kredi taksidi, fon alışı, kredi kullanımı, mevduat faizi
  await load(seed());
  const st = await page.evaluate(() => { const x = App.Statement._load('hesap.xlsx', { rows: [['Tarih', 'Açıklama', 'Tutar'], ['15.10.2027', 'KREDI TAKSIT TAHSILATI', '-11.500,00'], ['16.10.2027', 'FON ALIS', '-5.000,00'], ['17.10.2027', 'KREDI KULLANDIRIM', '50.000,00'], ['18.10.2027', 'VADELI HESAP FAIZI', '250,00']] });
    App.Statement.open(); App.Statement.setAccount('yk'); return x.rows.map(r => [r.desc, r.type, r.category]); });
  eq('ekstre kategorileri', st, [['KREDI TAKSIT TAHSILATI', 'expense', 'Kredi Ödemesi'], ['FON ALIS', 'expense', 'Transfer'], ['KREDI KULLANDIRIM', 'income', 'Transfer'], ['VADELI HESAP FAIZI', 'income', 'Yatırım']]);
  await page.evaluate(() => App.Statement.commit()); await page.waitForTimeout(100);
  eq('ekstre eklendi: taksit bölündü, fon ve kredi gelir-gider değil, faiz gelir', [(await bal()).yk, await tot(), await page.evaluate(() => S.txns().map(t => [t.amount, t.category, t.bk || '', !!t.xext, !!t.xfer, t.lk || 0]).sort((a, b) => a[0] - b[0])), await hasToast('1 kredi taksidi faiz ve anapara olarak ayrıldı')],
    [183750, [250, I2], [[I2, 'Kredi Ödemesi', '', false, false, 2], [250, 'Yatırım', '', false, false, 0], [5000, 'Transfer', 'invest', true, false, 0], [Math.round((P - I2) * 100) / 100, 'Transfer', '', false, false, 2], [50000, 'Transfer', 'loanIn', true, false, 0]].sort((a, b) => a[0] - b[0]), true]);
  eq('aynı ekstre yeniden yüklenirse hepsi "zaten var"', await page.evaluate(() => App.Statement._load('hesap.xlsx', { rows: [['Tarih', 'Açıklama', 'Tutar'], ['15.10.2027', 'KREDI TAKSIT TAHSILATI', '-11.500,00'], ['16.10.2027', 'FON ALIS', '-5.000,00'], ['17.10.2027', 'KREDI KULLANDIRIM', '50.000,00'], ['18.10.2027', 'VADELI HESAP FAIZI', '250,00']] }).rows.map(r => r.dupe)), [true, true, true, true]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
