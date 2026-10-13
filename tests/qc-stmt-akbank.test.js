// Usage: node tests/qc-stmt-akbank.test.js
// Akbank (Axess) kart ekstresi PDF biçimi: yazı tipinde Unicode tablosu olmadığı için PDF'ten metin EBCDIC kodlu gelir (boşluk "@",
// rakamlar "ð…ù"); Türkçe harfler yazı tipinin kendi kodlarında. Tutarlar İngilizce biçimde (1,234.50), ödeme "(-)" ekiyle, harcamadan
// sonra Chip-para sütunu, açıklama tarihe bitişik olabilir. Parçalar pdf.js'in verdiği biçimde (str, transform, width) kurulur;
// tamamı kurmaca (DENİZ YILMAZ, kurmaca kart, işyeri ve tutarlar). Sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// EBCDIC (cp037) kodlayıcı; Türkçe harfler bu PDF'lerin yazı tipindeki kodlarda (ı B2, ğ B1, ş AA, İ AC, Ş BC)
const CP = { ' ': 0x40, '.': 0x4B, '(': 0x4D, '+': 0x4E, '*': 0x5C, ')': 0x5D, '-': 0x60, '/': 0x61, ',': 0x6B, ':': 0x7A, "'": 0x7D,
  'Ö': 0xEC, 'ö': 0xCC, 'Ü': 0xFC, 'ü': 0xDC, 'Ç': 0x68, 'ç': 0x48, 'ı': 0xB2, 'ğ': 0xB1, 'ş': 0xAA, 'İ': 0xAC, 'Ş': 0xBC };
function ebc(s) { return [...s].map(c => { let b = CP[c];
  if (b == null) { const o = c.charCodeAt(0);
    if (c >= '0' && c <= '9') b = 0xF0 + o - 48; else if (c >= 'a' && c <= 'i') b = 0x81 + o - 97; else if (c >= 'j' && c <= 'r') b = 0x91 + o - 106; else if (c >= 's' && c <= 'z') b = 0xA2 + o - 115;
    else if (c >= 'A' && c <= 'I') b = 0xC1 + o - 65; else if (c >= 'J' && c <= 'R') b = 0xD1 + o - 74; else if (c >= 'S' && c <= 'Z') b = 0xE2 + o - 83; else throw new Error('kodlanamadı: ' + c); }
  return String.fromCharCode(b); }).join(''); }
// Bir satır: [x, metin] parçaları; parçalar pdf.js gibi küçük bölünür (tutar "1,234" "." "50" ayrı parçalar), genişlik harf başına 5
function row(y, parts, plain) { return parts.map(([x, t]) => ({ str: plain ? t : ebc(t), transform: [1, 0, 0, 1, x, y], width: t.length * 5 })); }
function amt(x, y, s) { const out = []; let at = x; s.match(/\d+|[^\d]+/g).forEach(p => { out.push({ str: ebc(p), transform: [1, 0, 0, 1, at, y], width: p.length * 5 }); at += p.length * 5; }); return out; }
// Kurmaca ekstre: önceki bakiye 300.00 − ödemeler 250.00 + harcamalar 1,779.50 = dönem borcu 1,829.50
const PAGE = [].concat(
  row(800, [[40, 'Axess Gold Hesap Özeti']]),
  row(780, [[40, 'Kart Numarası'], [200, '5000 12** **** 7788']]),
  row(770, [[40, 'Dönem Borcu'], [200, '1,829.50 TL']]),
  row(760, [[40, 'Son Ödeme Tarihi'], [200, '22/10/2026']]),
  row(750, [[40, 'Hesap Kesim Tarihi'], [200, '12/10/2026']]),
  row(740, [[40, 'Kullanılabilir Kart Limiti'], [200, '18.18 (-) TL']]),
  row(720, [[40, 'İşlem Tarihi'], [120, 'Dönem İçi İşlemler'], [400, 'Borç Tutarı (TL)'], [500, 'Chip-para']]),
  row(710, [[40, 'Önceki Dönem Hesap Özeti Bakiyesi'], [400, '300.00']]),
  // Açıklama tarihe bitişik (date: 40 + 10×5 = 90), ödeme "(-)" ekiyle
  row(700, [[40, '15/09/2026'], [90, 'İNTERNET Şb-Ödemeniz için Teşekkürler']]), amt(400, 700, '250.00(-)'),
  row(690, [[40, '**** **** **** 7788 DENİZ YILMAZ Harcamaları']]),
  row(680, [[40, '14/09/2026'], [92, 'ORNEK MARKET ANKARA TR']]), amt(400, 680, '1,234.50'), amt(500, 680, '0.12'),
  row(670, [[40, '20/09/2026'], [92, 'ORNEK KAFE ÇANKAYA']]), amt(400, 670, '45.00'),
  row(660, [[40, '12/10/2026'], [92, 'Üyelik Ücreti']]), amt(400, 660, '500.00'),
  row(650, [[40, 'Genel Toplam'], [400, '1,829.50'], [500, '0.12']]),
  row(640, [[40, 'Sayfa 1 / 1']], true));   // aynı sayfada düz yazılmış parça: çözülmez

const NOW = '2026-10-13T21:00:00';
const SEED = { pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() },
  pf_a: [{ id: 'c', name: 'Axess', type: 'card', owner: 'shared', balance: -300, openingBalance: -300, ts: 1, last4: '7788' },
    { id: 'b', name: 'Akbank Vadesiz', type: 'bank', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 1 }], pf_t: [] };

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

  const lines = await page.evaluate(items => App.Statement._pageLines(items), PAGE);
  eq('EBCDIC metin çözüldü (Türkçe harfler, bitişik tarih, bölünmüş tutar, sütun ayracı; düz parça olduğu gibi)', lines, [
    'Axess Gold Hesap Özeti', 'Kart Numarası | 5000 12** **** 7788', 'Dönem Borcu | 1,829.50 TL', 'Son Ödeme Tarihi | 22/10/2026',
    'Hesap Kesim Tarihi | 12/10/2026', 'Kullanılabilir Kart Limiti | 18.18 (-) TL', 'İşlem Tarihi | Dönem İçi İşlemler | Borç Tutarı (TL) | Chip-para',
    'Önceki Dönem Hesap Özeti Bakiyesi | 300.00', '15/09/2026İNTERNET Şb-Ödemeniz için Teşekkürler | 250.00(-)',
    '**** **** **** 7788 DENİZ YILMAZ Harcamaları', '14/09/2026 ORNEK MARKET ANKARA TR | 1,234.50 | 0.12', '20/09/2026 ORNEK KAFE ÇANKAYA | 45.00',
    '12/10/2026 Üyelik Ücreti | 500.00', 'Genel Toplam | 1,829.50 | 0.12', 'Sayfa 1 / 1']);
  eq('düz (EBCDIC olmayan) sayfa değişmez', await page.evaluate(() => App.Statement._pageLines([
    { str: '12.09.2026', transform: [1, 0, 0, 1, 40, 700], width: 50 }, { str: 'MİGROS ÇANKAYA', transform: [1, 0, 0, 1, 92, 700], width: 70 },
    { str: '1.234,56', transform: [1, 0, 0, 1, 400, 700], width: 40 }])), ['12.09.2026 MİGROS ÇANKAYA | 1.234,56']);

  const r = await page.evaluate(lines => { const x = App.Statement._load('ekstre.pdf', { lines }); App.Statement.open(); return { meta: x.meta, rows: x.rows.map(r => [r.date, r.desc, r.type, r.amount, r.balance, r.on, r.cardpay]) }; }, lines);
  eq('kart ekstresi tanındı, kart son 4 haneyle seçildi', [r.meta.isCardDoc, r.meta.accountId], [true, 'c']);
  eq('satırlar: "(-)" ödeme giren (aktarım), İngilizce tutar, Chip-para bakiye sanılmaz, önceki bakiye/toplam satır değil', r.rows, [
    ['2026-09-15', 'İNTERNET Şb-Ödemeniz için Teşekkürler', 'income', 250, null, true, true],
    ['2026-09-14', 'ORNEK MARKET ANKARA TR', 'expense', 1234.5, null, true, false],
    ['2026-09-20', 'ORNEK KAFE ÇANKAYA', 'expense', 45, null, true, false],
    ['2026-10-12', 'Üyelik Ücreti', 'expense', 500, null, true, false]]);
  eq('önizleme toplamı ekstreyle aynı: harcama 1.779,50, ödeme aktarım', await page.evaluate(() => document.getElementById('stmtSum').textContent), '4 / 4 seçili · +₺0,00 · −₺1.779,50 · ↔ 1 aktarım (gelir/gider değil)');
  await page.evaluate(() => App.Statement.commit()); await page.waitForTimeout(100);
  eq('eklendi: kart borcu −300 + 250 − 1.779,50 = −1.829,50 (ekstredeki dönem borcu), gelir yok',
    await page.evaluate(() => [App.Accounts.get('c').balance, App.Transactions.monthTotals('2026-09').expense, App.Transactions.monthTotals('2026-10').expense, App.Transactions.monthTotals('2026-09').income]), [-1829.5, 1279.5, 500, 0]);

  // "ş" harfi yazı tipinden düşmüş ödeme satırı ("Te ekkürler") yine kart ödemesi; "(-)" Türkçe biçimde de
  const lost = await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Kredi Kartı Hesap Özeti', '15/09/2026 İNTERNET Şb-Ödemeniz için Te ekkürler | 1.000,00(-)', '16/09/2026 ORNEK FIRIN | 20,00'] }).rows.map(r => [r.type, r.amount, r.cardpay]));
  eq('ş düşmüş ödeme satırı kart ödemesi; Türkçe tutarda "(-)"', lost, [['income', 1000, true], ['expense', 20, false]]);
  // Türkçe biçimli belgede saat gibi "21.30" tutar sayılmaz (belgede Türkçe tutarlar çok)
  const tr = await page.evaluate(() => App.Statement._load('ekstre.pdf', { lines: ['Kredi Kartı Hesap Özeti', '12.09.2026 ORNEK KAFE SAAT 21.30 | 80,00', '13.09.2026 ORNEK EV | 1.250,00'] }).rows.map(r => [r.desc, r.amount]));
  eq('Türkçe belgede İngilizce biçim aranmaz', tr, [['ORNEK KAFE SAAT 21.30', 80], ['ORNEK EV', 1250]]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
