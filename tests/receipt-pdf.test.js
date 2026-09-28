// Usage: node tests/receipt-pdf.test.js
// iPhone "Dosyalar > Belgeleri Tara" PDF'leri: yazı katmanlı PDF doğrudan okunur, yalnız görüntü içeren taranmış PDF
// sayfası çizilip yazı tanımayla okunur. PDF'ler test içinde üretilir. Playwright yoksa atlanır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; PDF testi atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, decodeURIComponent(u)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// En küçük geçerli PDF: nesneler + xref tablosu
function pdf(objects) {
  const parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'].map(s => Buffer.from(s, 'latin1')), offs = [];
  let len = parts[0].length;
  objects.forEach((o, i) => { offs.push(len); const b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n', 'latin1'), Buffer.isBuffer(o) ? o : Buffer.from(o, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]); parts.push(b); len += b.length; });
  const xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + len + '\n%%EOF\n';
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}
function stream(dict, data) { return Buffer.concat([Buffer.from('<< ' + dict + ' /Length ' + data.length + ' >>\nstream\n', 'latin1'), data, Buffer.from('\nendstream', 'latin1')]); }
function textPdf(lines) {
  const content = 'BT /F1 11 Tf 14 TL 20 380 Td ' + lines.map(l => '(' + l.replace(/[()\\]/g, '\\$&') + ') Tj T*').join(' ') + ' ET';
  return pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 260 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream('', Buffer.from(content, 'latin1')), '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>']);
}
function imagePdf(jpeg, w, h) {
  const pw = 260, ph = Math.round(260 * h / w);
  return pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    stream('', Buffer.from('q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im1 Do Q', 'latin1')),
    stream('/Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', jpeg)]);
}

srv.listen(0, '127.0.0.1', async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pf_a', JSON.stringify([{ id: 'a1700000000000_aaaa', name: 'Banka', type: 'bank', owner: 'shared', balance: 1000, openingBalance: 1000, ts: 1 }])); localStorage.setItem('pf_s', JSON.stringify({ onboarded: true })); });
  await p.reload(); await p.waitForFunction(() => window.App && App.Receipt);
  const open = async (bytes) => {
    await p.evaluate(b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); App.UI.closeModal('rcpReview'); App.Receipt.onFile({ files: [new File([a], 'tarama.pdf', { type: 'application/pdf' })] }); }, bytes.toString('base64'));
    await p.waitForSelector('#rcpReview', { state: 'attached', timeout: 60000 });
    return p.evaluate(() => { const h = document.getElementById('rcpReview'), g = k => h.querySelector('[data-rk="' + k + '"]').value; return [g('amount'), g('date'), g('note'), h.querySelector('.rcp-src').textContent.slice(0, 2), !!h.querySelector('.rcp-thumb')]; });
  };
  try {
    // 1) Yazı katmanlı PDF (e-Arşiv fatura PDF'i gibi)
    const t = await open(textPdf(['MIGROS TICARET A.S.', 'TARIH: 27.09.2026', 'SUT 1 LT        *34,90', 'EKMEK           *12,50', 'DETERJAN       *249,00', 'TOPKDV          *25,76', 'TOPLAM         *296,40', 'NAKIT          *300,00', 'PARA USTU        *3,60']));
    eq('text PDF read from its text layer', t, ['296,40', '2026-09-27', 'Migros', '📄', true]);
    // 2) Yalnız görüntü içeren taranmış PDF (Dosyalar > Belgeleri Tara)
    const jpeg = Buffer.from(await p.evaluate(async () => {
      const lines = ['ŞOK MARKETLER', 'ÜSKÜDAR', 'TARİH 05.09.2026', 'YUMURTA 30LU  *189,95', 'PEYNİR        *142,50', 'TOPKDV         *14,82', 'TOPLAM        *332,45', 'K.KARTI       *332,45'];
      const c = document.createElement('canvas'); c.width = 600; c.height = 60 + lines.length * 40; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#111'; x.font = '26px monospace'; lines.forEach((l, i) => x.fillText(l, 24, 50 + i * 40));
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return { b64: btoa(s), w: c.width, h: c.height };
    }).then(r => { jpegSize = r; return r.b64; }), 'base64');
    const i = await open(imagePdf(jpeg, jpegSize.w, jpegSize.h));
    eq('scanned image-only PDF read by text recognition', i, ['332,45', '2026-09-05', 'Şok Marketler', '📱', true]);
    // 3) Bozuk dosya
    await p.evaluate(() => { App.UI.closeModal('rcpReview'); window.__t = []; const o = App.UI.toast; App.UI.toast = (m, k) => { window.__t.push(k); o(m, k); }; App.Receipt.onFile({ files: [new File([new Uint8Array([1, 2, 3])], 'bozuk.pdf', { type: 'application/pdf' })] }); });
    await p.waitForFunction(() => window.__t.includes('err'), null, { timeout: 30000 }).catch(() => {});
    eq('broken PDF shows an error, no review', await p.evaluate(() => [window.__t.includes('err'), !!document.getElementById('rcpReview'), !!document.getElementById('rcpBusy')]), [true, false, false]);
    eq('file picker accepts PDF', await p.evaluate(() => document.getElementById('receiptFile').accept.includes('application/pdf')), true);
    eq('no page errors', errs, []);
  } finally { await b.close(); srv.close(); }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
let jpegSize;
