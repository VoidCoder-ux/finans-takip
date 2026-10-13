// Usage: node tests/qc-stmt-format.test.js
// Kart ekstresi PDF biçimleri: ay adıyla tarih ("02 Eylül 2026", "12 EYLÜL 2026"), tutardan sonra puan sütunu, "+" ile yazılan kart
// ödemesi ("ÖDEME-İNTERNET BANKACILIĞI +3.500,00"), alt satırda taksit bilgisi ("600,00 TL'lik işlemin 3 / 3 taksidi"), önceki dönemden
// kalan taksidin kesim gününe yazılması, "kalan tutar / taksit" sütununun bakiye sanılmaması, sayfa altı yazısına yapışmış işlem satırı.
// Satırlar PDF'ten okunan biçimde (sütunlar " | "); tamamı kurmaca (DENİZ YILMAZ, kurmaca kart ve tutarlar). Sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

const NOW = '2026-10-13T21:00:00';
const SEED = { pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() },
  pf_a: [{ id: 'c', name: 'Yapı Kredi World', type: 'card', owner: 'shared', balance: -5000, openingBalance: -5000, ts: 1, last4: '4321' },
    { id: 'b', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 1 }], pf_t: [] };
// Kurmaca ekstre: önceki borç 5.000 + harcamalar 1.800 − ödeme 3.500 = dönem borcu 3.300
const LINES = ['HESAP BİLGİLERİ', 'Hesap Kesim Tarihi | :27 Eylül 2026', 'Son Ödeme Tarihi | : 7 Ekim 2026', 'Dönem Borcu | : 3.300,00 TL',
  'Önceki Dönem Hesap Özeti Borcu | : 5.000,00 TL | Sn. DENİZ YILMAZ', 'Dönem İçi Harcamalar | : 1.800,00 TL', 'Dönem İçi Ödemeler | : +3.500,00 TL',
  'Bir Sonraki Ay Hesap Kesim Tarihi | : 26 Ekim 2026', 'Kart Numarası | : 4000 12** **** 4321',
  'İşlem Tarihi | İşlemler | Tutar(TL) | Kalan Tutar/Taksit | Puan', 'ÖNCEKİ DÖNEM HESAP ÖZETİ BORCU | 5.000,00',
  '02 Eylül 2026 | ÖDEME-İNTERNET BANKACILIĞI | +3.500,00', '05 Eylül 2026 | MIGROS KADIKOY ISTANBUL TR | 450,00 | 9',
  '12 EYLÜL 2026 | KIRTASIYE DUNYASI | ISTANBUL | TR | 1.000,00 | 120', '27 Eylül 2026 | DÖNEM FAİZİ | 50,00',
  '21 Temmuz 2026 ORNEK MAGAZA ISTANBUL TR | 200,00', "600,00 TL'lik işlemin 3 / 3 taksidi",
  '16 Eylül 2026 | KITAP EVI ISTANBUL TR | 50,00 | 50,00 / 1 | 5', "100,00 TL'lik işlemin 1 / 2 taksidi", 'TOPLAM | 1.750,00 | 134',
  'Dijital Kart Numarası | : 400012** ****9876', 'İşlem Tarihi | İşlemler | Tutar(TL) Kalan Tutar/Taksit | Puan',
  'ÖRNEK BANKASI A.Ş. Büyük Mükellefler V.D. / 1234567890 Sıra No: 1 Seri No: 1 Düzenlenme Tarihi: 27.09.202628 Ağustos 2026 ORNEK PAZARYERI ISTANBUL TR | 50,00 | 1',
  'TOPLAM | 50,00 | 1', 'Son Ödeme Tarihi: 7 Ekim 2026', '1 / 3'];

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(250);

  const r = await page.evaluate(lines => { const x = App.Statement._load('ekstre.pdf', { lines }); App.Statement.open(); return { meta: x.meta, rows: x.rows.map(r => [r.date, r.orig || '', r.desc, r.type, r.amount, r.balance, r.on, r.cardpay]) }; }, LINES);
  eq('kart ekstresi tanındı, kart son 4 haneyle seçildi', [r.meta.isCardDoc, r.meta.accountId], [true, 'c']);
  eq('işlem satırları: ay adıyla tarih, puan tutar sanılmaz, "+" ödeme giren, alt satırdaki taksit, önceki dönem taksidi kesim gününe, yapışık satır',
    r.rows, [
      ['2026-09-02', '', 'ÖDEME-İNTERNET BANKACILIĞI', 'income', 3500, null, true, true],
      ['2026-09-05', '', 'MIGROS KADIKOY ISTANBUL TR', 'expense', 450, null, true, false],
      ['2026-09-12', '', 'KIRTASIYE DUNYASI ISTANBUL TR', 'expense', 1000, null, true, false],
      ['2026-09-27', '', 'DÖNEM FAİZİ', 'expense', 50, null, true, false],
      ['2026-09-27', '2026-07-21', 'ORNEK MAGAZA ISTANBUL TR (3/3 taksit)', 'expense', 200, null, true, false],
      ['2026-09-16', '', 'KITAP EVI ISTANBUL TR (1/2 taksit)', 'expense', 50, null, true, false],
      ['2026-08-28', '', 'ORNEK PAZARYERI ISTANBUL TR', 'expense', 50, null, true, false]]);
  eq('önizleme toplamı ekstreyle aynı: harcama 1.800, ödeme aktarım', await page.evaluate(() => document.getElementById('stmtSum').textContent), '7 / 7 seçili · +₺0,00 · −₺1.800,00 · ↔ 1 aktarım (gelir/gider değil)');
  await page.evaluate(() => App.Statement.commit()); await page.waitForTimeout(100);
  eq('eklendi: kart borcu −5.000 − 1.800 + 3.500 = −3.300 (ekstredeki dönem borcu), eylül gideri 1.750 (3/3 taksit dahil), ağustos 50, temmuz 0',
    await page.evaluate(() => [App.Accounts.get('c').balance, App.Transactions.monthTotals('2026-09').expense, App.Transactions.monthTotals('2026-08').expense, App.Transactions.monthTotals('2026-07').expense]), [-3300, 1750, 50, 0]);
  eq('ödeme gelir değil (aktarım)', await page.evaluate(() => App.Transactions.monthTotals('2026-09').income), 0);
  eq('aynı ekstre yeniden yüklenirse hepsi "zaten var"', await page.evaluate(lines => App.Statement._load('ekstre.pdf', { lines }).rows.map(r => r.dupe), LINES), [true, true, true, true, true, true, true]);
  // Gelecek ayın ekstresi: aynı alışverişin 2/2 taksidi yine alışveriş günüyle (16 Eylül) yazılır → kesim gününe (26 Ekim) gelir, eylüldeki 1/2 ile karışmaz
  const nxt = await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Hesap Kesim Tarihi | :26 Ekim 2026', 'Kart Numarası | : 4000 12** **** 4321', 'İşlem Tarihi | İşlemler | Tutar(TL) | Kalan Tutar/Taksit | Puan', '16 Eylül 2026 KITAP EVI ISTANBUL TR | 50,00', "100,00 TL'lik işlemin 2 / 2 taksidi"] }).rows.map(r => [r.date, r.dupe, r.on]));
  eq('sonraki ekstrede 2/2 taksit: ekim kesim gününe yazılır, 1/2 ile karışmaz (eklenir)', nxt, [['2026-10-26', false, true]]);
  // Eski biçimler bozulmadı: rakamlı tarih, eksiyle yazılmış ödeme
  const old = await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Akbank Kredi Kartı Hesap Özeti', '28.09.2026 MIGROS KADIKOY 245,50', '29.09.2026 ÖDEME - TEŞEKKÜR EDERİZ -5.000,00'] }).rows.map(r => [r.date, r.type, r.amount]));
  eq('eski biçim: rakamlı tarih, eksiyle ödeme', old, [['2026-09-28', 'expense', 245.5], ['2026-09-29', 'income', 5000]]);
  eq('sözcükle ay: kısaltma ve büyük harf', await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Kredi Kartı Hesap Özeti', '3 EYL 2026 ORNEK KAFE 80,00', '4 Ağu 2026 ORNEK FIRIN 20,00', '5 Kasım 2026 ORNEK EV 1.000,00'] }).rows.map(r => r.date)), ['2026-09-03', '2026-08-04', '2026-11-05']);
  eq('etiket satırları işlem sayılmaz (son ödeme tarihi, kısa önek)', await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Kredi Kartı Hesap Özeti', 'Son ödeme 07.10.2026 Asgari 1.000,00', '12.09.2026 ORNEK KAFE 80,00'] }).rows.map(r => r.desc)), ['ORNEK KAFE']);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
