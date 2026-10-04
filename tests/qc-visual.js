// Usage: node tests/qc-visual.js [ekran-görüntüsü-klasörü]
// ui-scan.js'in denetimini (taşma, dokunma alanı, kontrast, erişilebilir ad, etiket) ek ekranlarda çalıştırır:
// küçük telefon 320 px + en büyük yazı, 375 px + büyük yazı, 430 px, yatay telefon, ilk açılış (boş veri).
// Veri: ui-scan.js'teki kurmaca yoğun veri (uzun adlar, büyük tutarlar). Sorun yoksa çıkış kodu 0.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const src = fs.readFileSync(path.join(__dirname, 'ui-scan.js'), 'utf8');
const grab = name => { const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) break; } return src.slice(i, j + 1); };
const pre = src.slice(0, src.indexOf('function seed('));
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// ui-scan.js'teki seed() ve audit() aynen kullanılır (iso/now gibi yardımcılarıyla)
const seed = new Function('iso', 'now', grab('seed') + '; return seed();');
const auditSrc = grab('audit');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
const pages = ['ozet', 'hesaplar', 'aile', 'islemler', 'tekrarlayan', 'taksitler', 'borclar', 'butce', 'portfoy', 'istatistikler', 'hedefler', 'ayarlar'];
const configs = [
  ['320-xl', { width: 320, height: 568 }, 'xl', 'dark', true],
  ['320-xl-light', { width: 320, height: 568 }, 'xl', 'light', true],
  ['375-l', { width: 375, height: 667 }, 'l', 'light', true],
  ['430', { width: 430, height: 932 }, 'n', 'dark', true],
  ['yatay', { width: 844, height: 390 }, 'n', 'dark', true],
  ['tablet-xl', { width: 768, height: 1024 }, 'xl', 'light', false]
];
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const issues = [], errors = [];
  const ignoreSmall = s => /input\[type=(date|month)\]/.test(s);
  for (const [name, vp, fs_, theme, mobile] of configs) {
    const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.route(/truncgil|frankfurter|deepseek/, r => r.abort());
    await page.goto(base);
    const sd = seed(iso, new Date()); sd.pf_s.theme = theme;
    await page.evaluate(({ sd, fs_ }) => { localStorage.clear(); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); if (fs_ !== 'n') localStorage.setItem('ft_fs', fs_); }, { sd, fs_ });
    await page.reload(); await page.waitForTimeout(500);
    await page.addScriptTag({ content: auditSrc });
    for (const pg of pages) {
      await page.evaluate(pg => { document.querySelectorAll('.toast').forEach(t => t.remove()); App.UI.nav(pg); window.scrollTo(0, 0); }, pg);
      await page.waitForTimeout(pg === 'istatistikler' ? 600 : 150);
      const a = await page.evaluate(m => audit({ mobile: m }), mobile);
      const small = a.small.filter(s => !ignoreSmall(s));
      if (a.overflowX > 0 || a.wide.length || small.length || a.contrast.length || a.noName.length || a.noLabel.length || a.dupIds.length)
        issues.push({ where: name + '/' + pg, overflowX: a.overflowX, wide: a.wide.slice(0, 4), small: small.slice(0, 4), contrast: a.contrast.slice(0, 4), noName: a.noName.slice(0, 3), noLabel: a.noLabel.slice(0, 3), dupIds: a.dupIds });
      if (OUT && (name === '320-xl' || name === 'yatay')) await page.screenshot({ path: path.join(OUT, 'v-' + name + '-' + pg + '.png'), fullPage: name === '320-xl' });
    }
    await ctx.close();
  }
  // İlk açılış: boş veri, karşılama akışı görünür ve taşmaz
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('ilk-açılış: ' + e.message));
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(600);
    await page.addScriptTag({ content: auditSrc });
    const a = await page.evaluate(() => audit({ mobile: true }));
    const shown = await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show, .onb, #onboarding')].filter(e => e.getBoundingClientRect().height > 0).length);
    if (a.overflowX > 0 || a.wide.length || a.small.length || a.contrast.length) issues.push({ where: 'ilk-açılış', overflowX: a.overflowX, wide: a.wide, small: a.small, contrast: a.contrast });
    console.log('ilk açılışta karşılama penceresi görünür: ' + (shown > 0));
    if (OUT) await page.screenshot({ path: path.join(OUT, 'v-ilk-acilis.png') });
    await ctx.close();
  }
  issues.forEach(i => console.log('✗ ' + JSON.stringify(i)));
  errors.forEach(e => console.log('✗ hata ' + e));
  console.log(issues.length || errors.length ? '\n' + issues.length + ' ekranda sorun, ' + errors.length + ' sayfa hatası' : '\nSorun bulunmadı (' + configs.length * pages.length + ' ekran + ilk açılış)');
  await browser.close(); srv.close(); process.exit(issues.length || errors.length ? 1 : 0);
});
