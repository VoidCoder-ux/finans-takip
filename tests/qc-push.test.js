// Usage: node tests/qc-push.test.js [http://127.0.0.1:8787]
// Banka uygulamasının bildirimleri (iPhone iOS 27+, Kestirmeler "Bildirim" otomasyonu) → uygulama:
//  - Akbank bildirimi: İngilizce tutar biçimi (237.50, 1,250.00), kalan limit sayılmaz, "GIDA VE MARKET" işyeri değil harcama grubu → kategori
//  - ATM'ye nakit yatırma gelir sayılmaz: onaya düşer, Ekle varsayılanı nakitten bankaya aktarım
//  - Bildirim ayrı kanal: aynı harcama e-posta ya da SMS ile de gelirse tek kayıt; aynı kanaldan iki harcama iki kayıt
//  - Kaynak etiketi (🔔 Bildirim), rapor açıklaması, onay listesi simgesi; ekstre zenginleştirme bildirim kaydını da tanır
//  - Sunucu çalışıyorsa: bildirim bağlantısı kur → Kestirme gibi POST → uygulama çeker → tanı satırı → dene → kapat
// Örnek metinler kurmacadır (kart son 4 hanesi, tutar, hesap numarası uydurma). Sunucusuz kısım her zaman çalışır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };
const ACCS = [{ id: 'c', name: 'Akbank Axess', type: 'card', owner: 'shared', last4: '4821', balance: 0, openingBalance: 0, ts: 1 },
  { id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: 2 },
  { id: 'k', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 3 }];
// Kurmaca bildirim metinleri (gerçek biçimler, uydurma değerler)
const PUSH1 = '4821 ile biten Axess Asıl kartinizla 237.50 TL tutarinda GIDA VE MARKET harcamasi temassiz yapilmistir.KalanLimit:3,912.40 TL';
const PUSH2 = '4821 ile biten Axess Asıl kartinizla 1,250.00 TL tutarinda AKARYAKIT harcamasi yapilmistir.KalanLimit:2,662.40 TL';
const ATM = "ATM'mizden 31***772 numaralı hesabınıza 12.500,00 TL yatırılmıştır. Kullanılabilir bakiyeniz 18.230,15 TL. 07/10/2026 16:12:08 ATM No: 204517";
const MAIL = 'Akbank\nKredi kartı harcamanız\n4821 ile biten Axess Asıl kartınızla 237.50 TL tutarında KREDI KARTI harcaması yapılmıştır. 3,912.40 TL limitiniz kalmıştır.';

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data, fixed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (fixed) await page.clock.setFixedTime(new Date('2026-10-08T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS, pf_a: ACCS, pf_t: [] }, data || {}));
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  let nid = 500;
  const item = (text, label) => ({ id: nid++, label: label || 'bildirim_u_a', text, receivedAt: Date.now() });
  const ingest = (page, items) => page.evaluate(items => App.BankSms.ingest(items.map(i => Object.assign(i, { receivedAt: Date.now() }))), items);

  // 1) Okuma: Akbank bildirimi, binlikli tutar, e-posta biçimi değişmedi, ATM'ye yatırma
  {
    const { page, ctx } = await open(null, true);
    const P = t => page.evaluate(t => { const p = App.BankSms.parse(t, Date.now()); return [p.kind, p.type, p.amount, p.last4, p.bank, p.group, p.merchant, p.date]; }, t);
    eq('Akbank bildirimi: gider 237,50 (İngilizce biçim), kart …4821, kalan limit sayılmaz, grup işyeri sanılmaz', await P(PUSH1), ['expense', 'expense', 237.5, '4821', 'Akbank', 'GIDA VE MARKET', '', '2026-10-08']);
    eq('binlikli tutar 1,250.00 → 1.250', await P(PUSH2), ['expense', 'expense', 1250, '4821', 'Akbank', 'AKARYAKIT', '', '2026-10-08']);
    eq('başlık + metin birlikte gelse de aynı', await P('Kredi Kart İşlemleri\n' + PUSH1), ['expense', 'expense', 237.5, '4821', 'Akbank', 'GIDA VE MARKET', '', '2026-10-08']);
    eq('Akbank e-postası ("KREDI KARTI harcaması") grup sayılmaz (eskisi gibi)', await P(MAIL), ['expense', 'expense', 237.5, '4821', 'Akbank', '', '', '2026-10-08']);
    eq('ATM\'ye nakit yatırma: gelir değil, onaya (tarih metinden)', await page.evaluate(t => { const p = App.BankSms.parse(t, Date.now()); return [p.kind, p.type, p.amount, p.date, /ATM'ye nakit yatırma/.test(p.reason)]; }, ATM), ['review', 'income', 12500, '2026-10-07', true]);
    eq('maaş yatırılması ATM sayılmaz (gelir kalır)', await page.evaluate(() => { const p = App.BankSms.parse('Hesabiniza 01.10.2026 tarihinde 45.000,00 TL maas odemesi yatirilmistir. Akbank', Date.now()); return [p.kind, p.salary]; }), ['income', true]);
    eq('ATM\'den para çekme eskisi gibi onaya (aktarım olabilir)', await page.evaluate(() => { const p = App.BankSms.parse("ATM'mizden 31***772 numaralı hesabınızdan 2.000,00 TL çekilmiştir.", Date.now()); return [p.kind, p.type, /ATM nakit çekimi/.test(p.reason)]; }), ['review', 'expense', true]);
    await ctx.close();
  }
  // 2) Kayıt: kategori, not, kanal; aynı harcama e-posta/SMS ile de gelirse tek kayıt; iki harcama iki kayıt
  {
    const { page, ctx } = await open(null, true);
    const r1 = await ingest(page, [item(PUSH1), item(PUSH2)]);
    const rows = () => page.evaluate(() => S.txns().filter(t => t.src === 'sms').sort((a, b) => a.amount - b.amount).map(t => [t.amount, t.category, t.note, t.accountId, t.via || '', t.date]));
    eq('iki bildirim iki kayıt: Market / Ulaşım, not "Akbank kart harcaması · …", kanal bildirim', [r1.added, await rows()], [2, [[237.5, 'Market', 'Akbank kart harcaması · Gıda ve market', 'c', 'push', '2026-10-08'], [1250, 'Ulaşım', 'Akbank kart harcaması · Akaryakıt', 'c', 'push', '2026-10-08']]]);
    eq('kart borcu 237,50 + 1.250 = 1.487,50', await page.evaluate(() => App.Accounts.get('c').balance), -1487.5);
    const r2 = await ingest(page, [item(MAIL, 'gmailbox_u_a')]);
    eq('aynı harcamanın e-postası sonradan gelir: eklenmez (tek kayıt)', [r2.added, r2.dupes, (await rows()).length], [0, 1, 2]);
    const r3 = await ingest(page, [item('Akbank: 4821 ile biten kartinizla 1.250,00 TL harcama yapilmistir.', 'abcd1234_u_a')]);
    eq('aynı harcamanın SMS\'i de gelirse eklenmez', [r3.added, r3.dupes, (await rows()).length], [0, 1, 2]);
    eq('işlem listesinde 🔔 Bildirim etiketi', await page.evaluate(() => { App.UI.nav('islemler'); App.Transactions.renderList(); return [...document.querySelectorAll('#txnList .ti')].filter(x => /🔔 Bildirim/.test(x.textContent)).length; }), 2);
    eq('rapor açıklaması kaynağı söyler', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); return [...d.querySelectorAll('.pr-txns tr')].filter(r => /banka uygulamasının bildiriminden/.test(r.textContent)).length; }), 2);
    await page.reload(); await page.waitForTimeout(300);
    eq('yeniden yüklemede kanal korunur', await page.evaluate(() => S.txns().filter(t => t.via === 'push').length), 2);
    // Ekstre: işyeri adı bildirim kaydına eklenir, kategori (Market) korunur
    await page.evaluate(() => { App.Statement._load('ekstre.pdf', { lines: ['Akbank Kredi Kartı Hesap Özeti', '08.10.2026 MIGROS KADIKOY 237,50'] }); App.Statement.open(); App.Statement.setAccount('c'); App.Statement.commit(); });
    await page.waitForTimeout(200);
    eq('ekstreden işyeri adı eklendi, kategori Market kaldı, tutar/bakiye aynı', await page.evaluate(() => { const t = S.txns().find(x => x.amount === 237.5); return [t.note, t.category, S.txns().length, App.Accounts.get('c').balance]; }), ['MIGROS KADIKOY', 'Market', 2, -1487.5]);
    await ctx.close();
  }
  // 3) ATM'ye yatırma: onay → varsayılan aktarım (Cüzdan → Vadesiz), gelir sayılmaz
  {
    const { page, ctx } = await open(null, true);
    const r = await ingest(page, [item(ATM, 'abcd1234_u_a')]);
    eq('onaya düştü, bakiye değişmedi', [r.queued, await page.evaluate(() => [App.Accounts.get('b').balance, App.Accounts.get('k').balance])], [1, [10000, 20000]]);
    eq('onay listesinde neden yazılı', await page.evaluate(() => { App.UI.nav('ozet'); App.BankSms.renderQueue(); return /ATM'ye nakit yatırma/.test(document.getElementById('ozet-sms').textContent); }), true);
    const dlg = await page.evaluate(() => { App.BankSms.accept(S.smsQueue()[0].id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [m.querySelector('[data-pkey="type"]').value, m.querySelector('[data-pkey="to"]').value]; });
    eq('Ekle penceresi: tür "Aktarım", karşı hesap Cüzdan', dlg, ['move', 'k']);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="acc"]').value = 'b'; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(200);
    // Vadesiz 10.000 + 12.500 = 22.500; Cüzdan 20.000 − 12.500 = 7.500; gelir 0
    eq('aktarım: Vadesiz 22.500, Cüzdan 7.500, ekim geliri 0', await page.evaluate(() => [App.Accounts.get('b').balance, App.Accounts.get('k').balance, App.Transactions.monthTotals('2026-10').income, S.smsQueue().length]), [22500, 7500, 0, 0]);
    await ctx.close();
  }
  // 4) Onay listesinde bildirim simgesi; elle seçilen hesapla eklenen kayıt da bildirim kanalında kalır
  {
    const { page, ctx } = await open({ pf_a: ACCS.map(a => Object.assign({}, a, { last4: undefined })) }, true);
    await ingest(page, [item('Kartinizla 99,90 TL harcama yapildi.')]);
    eq('hesap bulunamayan bildirim onayda, 🔔 simgesiyle', await page.evaluate(() => { App.UI.nav('ozet'); App.BankSms.renderQueue(); return [S.smsQueue().length, /🔔/.test(document.getElementById('ozet-sms').innerHTML)]; }), [1, true]);
    await page.evaluate(() => { App.BankSms.accept(S.smsQueue()[0].id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="acc"]').value = 'c'; m.querySelector('[data-pkey="note"]').value = ''; m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(200);
    eq('onaylanan kayıt: kanal bildirim, not "Banka bildirimi"', await page.evaluate(() => { const t = S.txns().find(x => x.amount === 99.9); return t && [t.via, t.note, t.accountId]; }), ['push', 'Banka bildirimi', 'c']);
    await ctx.close();
  }
  // 5) Uçtan uca (sunucu varsa): bağlantı kur → Kestirme gibi POST → çek → tanı → dene → kapat
  let cfg = null; try { cfg = await (await fetch(BASE + '/v1/config')).json(); } catch (e) {}
  if (!cfg || !cfg.smsInbox) console.log('Eşitleme sunucusu yok (' + BASE + '); uçtan uca bildirim akışı atlandı.');
  else {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('e2e ' + e.message));
    await page.goto(BASE + '/index.html');
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, { pf_s: USERS, pf_a: ACCS, pf_t: [] });
    await page.reload(); await page.waitForTimeout(400);
    eq('eşitleme açıldı', await page.evaluate(b => App.Sync.start(b), BASE), true);
    eq('ayarlar kartında "Bildirimden Al"', await page.evaluate(() => { App.UI.nav('aile'); App.BankSms.renderCard(); return /🔔 Bildirimden Al/.test(document.getElementById('setSmsCard').innerText); }), true);
    eq('bildirim bağlantısı kuruldu', await page.evaluate(() => App.BankSms.pushSetup()), true);
    const url = await page.evaluate(() => App.BankSms.pushUrl());
    eq('bağlantı biçimi; kurulum penceresi bağlantıyı ve adımları gösterir', [/\/v1\/sms\/[A-Za-z0-9_-]{43}$/.test(url), await page.evaluate(() => [document.getElementById('pushUrlTxt').value === App.BankSms.pushUrl(), /Otomasyon/.test(document.getElementById('pushGuideHolder').innerText), /Bildirim/.test(document.getElementById('pushGuideHolder').innerText)])], [true, [true, true, true]]);
    await page.evaluate(() => App.UI.closeModal('pushGuideHolder'));
    eq('kart: açık, henüz bildirim yok', await page.evaluate(() => { App.BankSms.renderCard(); return document.getElementById('pushLast').textContent; }), 'Henüz bildirim gelmedi: banka uygulamasından ilk bildirim gelince burada "✓ alındı" görünür.');
    const post = async text => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).json();
    eq('Kestirme POST\'u saklandı', await post(PUSH1), { stored: true });
    const res = await page.evaluate(() => App.BankSms.pull({ force: true }));
    eq('uygulama çekti, bildirim kanalıyla ekledi', [res && res.added, await page.evaluate(() => { const t = S.txns().find(x => x.amount === 237.5); return t && [t.via, t.accountId, t.userId, t.category]; })], [1, ['push', 'c', 'u_a', 'Market']]);
    eq('tanı satırı', await page.evaluate(() => { App.BankSms.renderCard(); return document.getElementById('pushLast').textContent; }), 'Son bildirim: az önce · ✓ alındı');
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '' }) });
    await page.evaluate(() => App.BankSms.pull({ force: true }));
    eq('boş gelirse ne yapılacağını söyler', await page.evaluate(() => { App.BankSms.renderCard(); return document.getElementById('pushLast').textContent; }), 'Son bildirim: az önce · ⚠ boş geldi: Kestirme\'de "text" değeri Kestirme Girişi olmalı (bildirimin metni)');
    eq('Bağlantıyı Dene: "bildirim bağlantısı çalışıyor"', await page.evaluate(async () => { const t = []; const o = App.UI.toast; App.UI.toast = m => t.push(m); App.BankSms.pushTest(); await new Promise(r => setTimeout(r, 1500)); App.UI.toast = o; return t.some(x => /Bildirim bağlantısı çalışıyor/.test(x)); }), true);
    eq('SMS ve Gmail bağlantılarından ayrı, onları etkilemez', await page.evaluate(() => [App.BankSms.url(), App.BankSms.mailUrl()]), ['', '']);
    eq('kapatınca bağlantı geçersiz', await page.evaluate(async () => { App.BankSms.pushDisable(); await new Promise(r => setTimeout(r, 100)); [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); await new Promise(r => setTimeout(r, 600)); return [App.BankSms.pushUrl(), /🔔 Bildirimden Al/.test(document.getElementById('setSmsCard').innerText)]; }), ['', true]);
    eq('kapatılan bağlantı reddedilir', (await fetch(url, { method: 'POST', body: JSON.stringify({ text: PUSH2 }) })).status, 404);
    await page.evaluate(() => App.Sync.api(App.Sync.cfg(), 'DELETE', ''));
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
