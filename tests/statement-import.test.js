// Usage: node tests/statement-import.test.js
// Ekstre içe aktarma: gerçek .xlsx (sıkıştırılmış ZIP), PDF (tarayıcıda üretilir), Excel görünümlü .xls (HTML) ve CSV dosyaları
// üretilip uygulamaya yüklenir; sütun/işaret/bakiye çıkarımı, mükerrer atlama, kart ödemesi, önizleme ve kayıt sınanır.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// --- Küçük bir XLSX yazıcı (ZIP: deflate + stored karışık) ---
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const locals = [], centrals = []; let off = 0;
  files.forEach(([name, text], i) => {
    const raw = Buffer.from(text, 'utf8'), method = i % 2 ? 0 : 8, data = method ? zlib.deflateRawSync(raw) : raw, nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, data); centrals.push(ch, nb); off += 30 + nb.length + data.length;
  });
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function xlsx(rows) {
  const ss = [], idx = s => { let i = ss.indexOf(s); if (i < 0) { ss.push(s); i = ss.length - 1; } return i; };
  const col = i => String.fromCharCode(65 + i);
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
    const ref = col(ci) + (ri + 1);
    if (v === '' || v == null) return '';
    if (typeof v === 'object' && v.date) return '<c r="' + ref + '" s="1"><v>' + v.date + '</v></c>';
    if (typeof v === 'number') return '<c r="' + ref + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="s"><v>' + idx(v) + '</v></c>';
  }).join('') + '</row>').join('') + '</sheetData></worksheet>';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Hareketler" sheetId="1"/></sheets></workbook>'],
    ['xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'],
    ['xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + ss.map(s => '<si><t>' + esc(s) + '</t></si>').join('') + '</sst>'],
    ['xl/worksheets/sheet1.xml', sheet]
  ].map(([n, t]) => [n, n === 'xl/sharedStrings.xml' ? t : t]).sort((a, b) => a[0] === 'xl/sharedStrings.xml' ? 1 : b[0] === 'xl/sharedStrings.xml' ? -1 : 0));
}
const serial = iso => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5) + 25569);

function seed() {
  return {
    pf_a: [
      { id: 'a_ykb', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'personal', userId: 'u_self', balance: 20000, openingBalance: 20000, ts: 1 },
      { id: 'a_axess', name: 'Akbank Axess', type: 'card', owner: 'personal', userId: 'u_partner', last4: '9876', balance: 0, openingBalance: 0, ts: 2 },
      { id: 'a_ortak', name: 'Ortak Hesap', type: 'bank', owner: 'shared', balance: 0, openingBalance: 0, ts: 3 }
    ],
    pf_t: [{ id: 't_sms', type: 'expense', amount: 245.5, category: 'Market', date: '2026-09-28', note: 'Migros', accountId: 'a_axess', userId: 'u_partner', ts: 1, balanceApplied: true, src: 'sms' }],
    pf_s: { onboarded: true, users: [{ id: 'u_self', name: 'Osman', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Ayşe', emoji: '👩', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() }
  };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
  await page.reload(); await page.waitForTimeout(400);
  const load = async (name, buf, mime) => {
    await page.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); document.querySelectorAll('.toast').forEach(x => x.remove()); App.UI.nav('islemler'); });
    await page.setInputFiles('#stmtFile', { name, mimeType: mime, buffer: buf });
    await page.waitForFunction(() => document.getElementById('stmtList') || document.querySelector('.toast.err'), null, { timeout: 15000 }).catch(() => {});
    return page.evaluate(() => { const toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent); const acc = document.getElementById('stmtAcc'); return { acc: acc ? acc.value : null, rows: [...document.querySelectorAll('#stmtList .stmt-row')].map(r => [r.querySelector('input').checked, r.querySelector('.stmt-desc').textContent.trim(), r.querySelector('.stmt-amt').textContent, r.querySelector('select').value]), toasts }; });
  };

  // 1) Yapı Kredi hesap hareketleri (.xlsx): başlıktan önce bilgi satırları, tarih hem Excel gün sayısı hem metin, eksi = çıkan
  const x1 = xlsx([
    ['YAPI KREDİ BANKASI A.Ş.'], ['Hesap Hareketleri', '', 'IBAN: TR00 0006 7010 0000 0000 0000 00'], [],
    ['İşlem Tarihi', 'Açıklama', 'İşlem Tutarı', 'Bakiye'],
    [{ date: serial('2026-09-25') }, 'MAAŞ ÖDEMESİ ACME A.Ş.', 45000, 65000],
    [{ date: serial('2026-09-26') }, 'FAST GİDEN AHMET Y.', -2000, 63000],
    ['27.09.2026', 'MIGROS KADIKOY', '-312,75', '62.687,25'],
    ['28.09.2026', 'KREDİ KARTI ÖDEMESİ', '-5.000,00', '57.687,25'],
    ['', 'Toplam', '', '']
  ]);
  const r1 = await load('hesap_hareketleri.xlsx', x1, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  eq('xlsx: account guessed from bank name (Yapı Kredi, not card)', r1.acc, 'a_ykb');
  eq('xlsx: rows, signs, categories, card payment unchecked', r1.rows, [
    [true, 'MAAŞ ÖDEMESİ ACME A.Ş.', '+₺45.000,00', 'Maaş'],
    [true, 'FAST GİDEN AHMET Y.', '−₺2.000,00', 'Diğer'],
    [true, 'MIGROS KADIKOY', '−₺312,75', 'Market'],
    [false, 'KREDİ KARTI ÖDEMESİ kart ödemesi', '−₺5.000,00', 'Kredi Kartı Ödemesi']]);
  await page.click('#stmtOk'); await page.waitForTimeout(200);
  eq('xlsx: 3 added to the account with src=import, owner = account owner', await page.evaluate(() => S.txns().filter(t => t.src === 'import').map(t => [t.date, t.type, t.amount, t.accountId, t.userId]).sort()), [['2026-09-25', 'income', 45000, 'a_ykb', 'u_self'], ['2026-09-26', 'expense', 2000, 'a_ykb', 'u_self'], ['2026-09-27', 'expense', 312.75, 'a_ykb', 'u_self']]);
  eq('xlsx: balance moved by +42687,25', await page.evaluate(() => App.Accounts.get('a_ykb').balance), 62687.25);
  const again = await load('hesap_hareketleri.xlsx', x1, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  eq('xlsx again: everything already recorded → nothing preselected', again.rows.map(r => r[0]), [false, false, false, false]);
  eq('xlsx again: add button disabled', await page.evaluate(() => document.getElementById('stmtOk').disabled), true);

  // 2) Akbank kart ekstresi (PDF): işaretsiz = harcama, eksi = ödeme; SMS'le eklenmiş harcama atlanır; özet satırları alınmaz
  const pdfPage = await ctx.newPage();
  await pdfPage.setContent('<html><body style="font-family:Arial;font-size:11px"><h3>AKBANK T.A.Ş. Kredi Kartı Hesap Özeti</h3><p>Kart No: 5571 **** **** 9876</p><p>Son Ödeme Tarihi: 10.10.2026 &nbsp; Dönem Borcu: 1.234,00 TL &nbsp; Asgari Ödeme: 400,00 TL</p><table style="border-collapse:collapse" cellpadding="3"><tr><th>İşlem Tarihi</th><th>Açıklama</th><th>Tutar</th><th>Chip-Para</th></tr>' +
    [['20.09.2026', 'ÖNCEKİ DÖNEM BORCU', '5.000,00', ''], ['22.09.2026', 'ÖDEME - TEŞEKKÜR EDERİZ', '-5.000,00', ''], ['28.09.2026', 'MIGROS KADIKOY', '245,50', '2,45'], ['29.09.2026', 'STARBUCKS BAGDAT CAD', '145,00', '1,45'], ['30.09.2026', 'TRENDYOL.COM 2/6 TAKSIT', '300,00', ''], ['01.10.2026', 'IADE - ZARA', '-899,90', '']]
      .map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table></body></html>');
  const pdf = await pdfPage.pdf({ format: 'A4' }); await pdfPage.close();
  const r2 = await load('ekstre.pdf', pdf, 'application/pdf');
  eq('pdf: card account guessed from masked card number', r2.acc, 'a_axess');
  eq('pdf: card statement rows', r2.rows.map(r => [r[0], r[1].replace(/ (zaten kayıtlı|kart ödemesi)$/, ''), r[2], r[3]]), [
    [false, 'ÖDEME - TEŞEKKÜR EDERİZ', '+₺5.000,00', 'Diğer'],
    [false, 'MIGROS KADIKOY', '−₺245,50', 'Market'],
    [true, 'STARBUCKS BAGDAT CAD', '−₺145,00', 'Yiyecek'],
    [true, 'TRENDYOL.COM 2/6 TAKSIT', '−₺300,00', 'Diğer'],
    [true, 'IADE - ZARA', '+₺899,90', 'Diğer']]);
  eq('pdf: SMS-added purchase marked as already recorded', r2.rows[1][1].endsWith('zaten kayıtlı'), true);
  // Kullanıcı düzeltmesi: tutara dokununca gelir/gider değişir, kategori seçilebilir
  await page.evaluate(() => { App.Statement.flip(4); App.Statement.setCat(4, 'Giyim'); });
  eq('flip one row turns refund into expense', await page.evaluate(() => document.querySelectorAll('#stmtList .stmt-amt')[4].textContent), '−₺899,90');
  await page.evaluate(() => App.Statement.flip(4));
  eq('flip back', await page.evaluate(() => document.querySelectorAll('#stmtList .stmt-amt')[4].textContent), '+₺899,90');
  await page.click('#stmtOk'); await page.waitForTimeout(200);
  eq('pdf: 3 added to the card, owner = card owner', await page.evaluate(() => S.txns().filter(t => t.src === 'import' && t.accountId === 'a_axess').map(t => [t.type, t.amount, t.userId]).sort((a, b) => a[1] - b[1])), [['expense', 145, 'u_partner'], ['expense', 300, 'u_partner'], ['income', 899.9, 'u_partner']]);

  // 3) Excel görünümlü .xls (HTML tablo) Borç/Alacak sütunlarıyla
  const html = '<html><body><table><tr><td>Tarih</td><td>Açıklama</td><td>Borç</td><td>Alacak</td><td>Bakiye</td></tr><tr><td>02.10.2026</td><td>ELEKTRİK FATURASI ENERJİSA</td><td>850,40</td><td></td><td>9.149,60</td></tr><tr><td>03.10.2026</td><td>GELEN EFT MEHMET K.</td><td></td><td>1.500,00</td><td>10.649,60</td></tr></table></body></html>';
  const r3 = await load('hareketler.xls', Buffer.from(html, 'utf8'), 'application/vnd.ms-excel');
  eq('html-xls: debit/credit columns', r3.rows.map(r => [r[0], r[2], r[3]]), [[true, '−₺850,40', 'Faturalar'], [true, '+₺1.500,00', 'Diğer']]);
  eq('html-xls: no bank name → account must be chosen, add disabled', [r3.acc, await page.evaluate(() => document.getElementById('stmtOk').disabled)], ['', true]);
  await page.selectOption('#stmtAcc', 'a_ortak');
  eq('choosing the account enables adding', await page.evaluate(() => document.getElementById('stmtOk').disabled), false);
  await page.evaluate(() => App.Statement.close());

  // 4) CSV (Windows-1254, yeniden eskiye, işaretsiz tutar + bakiye) → yön bakiyedeki değişimden
  const csv = 'Tarih;Açıklama;Tutar;Bakiye\r\n05.10.2026;MAAŞ;38.000,00;48.000,00\r\n04.10.2026;ŞOK MARKET;150,00;10.000,00\r\n03.10.2026;KİRA;12.000,00;10.150,00\r\n02.10.2026;AÇILIŞ;0,00;22.150,00\r\n';
  const w1254 = Buffer.from(csv.replace(/Ş/g, 'Þ').replace(/İ/g, 'Ý').replace(/ı/g, 'ý').replace(/ç/g, 'ç').replace(/ş/g, 'þ'), 'latin1');
  const r4 = await load('hareket.csv', w1254, 'text/csv');
  eq('csv windows-1254 + direction from running balance', r4.rows.map(r => [r[1], r[2]]), [['MAAŞ', '+₺38.000,00'], ['ŞOK MARKET', '−₺150,00'], ['KİRA', '−₺12.000,00']]);
  await page.evaluate(() => App.Statement.close());

  // 5) Okunamayan dosyalar anlaşılır mesaj verir
  const r5 = await load('eski.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), 'application/vnd.ms-excel');
  eq('old binary .xls → clear message', r5.toasts.some(t => /PDF ya da yeni Excel/.test(t)), true);
  const r6 = await load('bos.csv', Buffer.from('a;b\r\n1;2\r\n'), 'text/csv');
  eq('file without transactions → clear message', r6.toasts.some(t => /işlem satırı bulunamadı/.test(t)), true);

  eq('balances consistent after imports', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
