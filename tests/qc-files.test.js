// Usage: node tests/qc-files.test.js
// Ekstre yüklemede hatalı dosyalar: bozuk PDF, boş CSV, eski Excel (.xls), Word belgesi (.docx, zip), resim, 15 MB üstü, yalnız başlık
// satırı olan CSV. Her birinde anlaşılır hata ve mevcut kayıtlar/bakiye değişmez. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const today = new Date().toISOString().slice(0, 10);

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(d => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now()));
    localStorage.setItem('pf_a', JSON.stringify([{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 5000, openingBalance: 5100, ts: 1 }]));
    localStorage.setItem('pf_t', JSON.stringify([{ id: 't1', type: 'expense', amount: 100, category: 'Market', date: d, note: 'Mevcut', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true }]));
    localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() })); }, today);
  await page.reload(); await page.waitForTimeout(400);
  await page.evaluate(() => App.UI.nav('islemler'));
  const snap = () => page.evaluate(() => JSON.stringify([S.txns(), S.accounts()]));
  const before = await snap();
  async function tryFile(name, mime, buf) {
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.setInputFiles('#stmtFile', { name, mimeType: mime, buffer: buf });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).filter(t => !/okunuyor/.test(t)).join(' | '), preview: !!document.querySelector('#stmtList') }));
    await page.evaluate(() => { if (App.Statement && App.Statement.close) App.Statement.close(); });
    return r;
  }
  const zip = Buffer.from('504b0304' + '00'.repeat(60), 'hex');
  const cases = [
    ['bozuk.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n' + 'x'.repeat(500)), /okunamadı|bozuk|geçersiz|PDF/i],
    ['bos.csv', 'text/csv', Buffer.from(''), /işlem satırı bulunamadı/],
    ['baslik.csv', 'text/csv', Buffer.from('Tarih;Açıklama;Tutar\r\n'), /işlem satırı bulunamadı/],
    ['eski.xls', 'application/vnd.ms-excel', Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(200)]), /eski Excel \(\.xls\)/],
    ['belge.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip, /okunamadı|Excel|işlem satırı/],
    ['foto.jpg', 'image/jpeg', Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), Buffer.alloc(300)]), /işlem satırı bulunamadı|okunamadı/]
  ];
  for (const [name, mime, buf, re] of cases) {
    const r = await tryFile(name, mime, buf);
    eq(name + ': anlaşılır hata, önizleme açılmaz', [re.test(r.toast), r.preview], [true, false]);
    if (!re.test(r.toast)) console.log('   mesaj: ' + r.toast);
  }
  const big = await tryFile('cok-buyuk.csv', 'text/csv', Buffer.alloc(16 * 1024 * 1024, 0x41));
  eq('16 MB dosya: "çok büyük" hatası', /çok büyük/.test(big.toast), true);
  eq('hatalı dosyaların hiçbiri mevcut kayıtları/bakiyeyi değiştirmedi', await snap() === before, true);
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
