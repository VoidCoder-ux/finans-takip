// Usage: node tests/qc-ios.test.js
// iPhone hissi (1. aşama):
//  1) Tema "Sistemle aynı": telefonun koyu/açık ayarını izler, ayar değişince sayfa yenilenmeden döner. Seçilmemişse eskisi gibi koyu.
//  2) Kayıtlı tema ilk çizimden önce uygulanır (açık tema kullanan bir an koyu görmez).
//  3) Açılış ekranı (apple-touch-startup-image): her iPhone boyu için doğru piksel ölçüsünde görsel.
//  4) Dokunmatikte basılan düğme hafifçe küçülür ve solar; düğme yazısı uzun basınca seçilmez.
//  5) "Hareketi Azalt" açıksa geçiş ve animasyonlar kapanır.
// Kurmaca veri, sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const S = theme => Object.assign({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() }, theme ? { theme } : {});
// Ekranın ilk çizildiği andaki tema: <body> belgeye girdiği an okunur (uygulama kodu henüz çalışmamıştır)
const FIRST = () => { window.__first = null; new MutationObserver((l, o) => { if (document.body) { window.__first = document.documentElement.getAttribute('data-theme'); o.disconnect(); } }).observe(document, { childList: true, subtree: true }); };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(pf_s, ctxOpts, scheme) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }, ctxOpts || {}));
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (scheme) await page.emulateMedia({ colorScheme: scheme });
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); localStorage.setItem('pf_s', JSON.stringify(sd)); }, pf_s);
    await page.addInitScript(FIRST);
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  const theme = p => p.evaluate(() => document.documentElement.getAttribute('data-theme'));

  // 1) Tema
  {
    const { page, ctx } = await open(S(), null, 'light');
    eq('tema seçilmemiş: eskisi gibi koyu (telefon açık modda olsa da)', await theme(page), 'dark');
    await ctx.close();
  }
  {
    const { page, ctx } = await open(S('auto'), null, 'light');
    eq('Sistemle aynı + telefon açık: açık tema, ilk çizimden itibaren', [await theme(page), await page.evaluate(() => window.__first)], ['light', 'light']);
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(150);
    eq('telefon koyuya geçince sayfa yenilenmeden koyu olur', await theme(page), 'dark');
    // Ayarlar: üç seçenek; seçim kaydedilir ve işaretlenir
    await page.evaluate(() => App.UI.nav('ayarlar')); await page.waitForTimeout(150);
    eq('Ayarlar\'da üç tema seçeneği, "Sistemle aynı" işaretli', await page.evaluate(() => [...document.querySelectorAll('#themePick .fs-opt')].map(b => [b.textContent.trim(), b.getAttribute('aria-checked')])), [['Koyu', 'false'], ['Açık', 'false'], ['Sistemle aynı', 'true']]);
    await page.evaluate(() => document.querySelector('#themePick [data-theme-opt="light"]').click()); await page.waitForTimeout(100);
    eq('Açık seçilince kaydedilir; telefon koyu olsa da açık kalır', [await theme(page), await page.evaluate(() => S.settings().theme)], ['light', 'light']);
    // Kenar çubuğundaki düğme Sistem'deyken basılırsa görünen temanın tersine geçer ve elle seçilmiş sayılır
    await page.evaluate(() => App.UI.setTheme('auto')); await page.evaluate(() => App.UI.toggleTheme());
    eq('Sistem (koyu) iken tema düğmesi: açığa geçer, elle seçim olur', [await theme(page), await page.evaluate(() => S.settings().theme)], ['light', 'light']);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(S('light'), null, 'dark');
    eq('kayıtlı açık tema ilk çizimden önce uygulanır', await page.evaluate(() => window.__first), 'light');
    await ctx.close();
  }

  // 2) Açılış ekranları: her bağlantının görseli var ve ölçüsü cihazın piksel boyuyla aynı
  {
    const { page, ctx } = await open(S());
    const links = await page.evaluate(() => [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map(l => [l.getAttribute('media'), l.getAttribute('href')]));
    const png = f => { const b = fs.readFileSync(path.join(R, f)); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
    const wrong = links.filter(([m, h]) => { const w = +/device-width:\s*(\d+)px/.exec(m)[1], hh = +/device-height:\s*(\d+)px/.exec(m)[1], r = +/pixel-ratio:\s*(\d)/.exec(m)[1]; return !fs.existsSync(path.join(R, h)) || JSON.stringify(png(h)) !== JSON.stringify([w * r, hh * r]) || !/portrait/.test(m); });
    eq('açılış ekranları: en az 12 iPhone boyu, hepsi doğru ölçüde', [links.length >= 12, wrong], [true, []]);
    eq('yaygın iPhone boyları var (SE, 13/14, 15/16, Pro Max, 16/17 Pro Max)', ['375px) and (device-height: 667', '390px) and (device-height: 844', '393px) and (device-height: 852', '430px) and (device-height: 932', '440px) and (device-height: 956'].map(k => links.some(([m]) => m.includes(k))), [true, true, true, true, true]);
    await ctx.close();
  }

  // 3) Basılma hissi (dokunmatik) ve 4) Hareketi Azalt
  {
    const { page, ctx } = await open(S(), { hasTouch: true, isMobile: true });
    const cdp = await ctx.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.bnav-item[data-nav="islemler"]' });
    const look = () => page.evaluate(() => { const b = document.querySelector('.bnav-item[data-nav="islemler"]'), c = getComputedStyle(b); return [c.scale, +(+c.opacity).toFixed(2), c.userSelect || c.webkitUserSelect]; });
    eq('basılmamış düğme: tam boy; yazısı seçilmez', await look(), ['none', 1, 'none']);
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] }); await page.waitForTimeout(250);
    const pressed = await look();
    eq('basılı düğme hafifçe küçülür ve solar', [pressed[0] !== 'none' && +pressed[0] < 1, pressed[1] < 1], [true, true]);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(S());
    const dur = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.btn')).transitionDuration));
    eq('normalde geçiş var', (await dur()) > 0.05, true);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(50);
    eq('Hareketi Azalt: geçiş kapanır', (await dur()) < 0.01, true);
    await ctx.close();
  }

  // 5) "+" düğmesi aşağı kaydırırken gizlenir (kartlardaki düğmelerin üstüne binmesin), yukarı kaydırınca ve sayfa değişince geri gelir
  {
    const T = [];
    for (let i = 0; i < 60; i++) T.push({ id: 't' + i, type: 'expense', amount: 100 + i, category: 'Market', date: '2026-11-' + String(1 + (i % 20)).padStart(2, '0'), note: 'Market ' + i, accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true });
    const { page, ctx } = await open(S(), { hasTouch: true, isMobile: true });
    await page.evaluate(t => { localStorage.setItem('pf_a', JSON.stringify([{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 9000, openingBalance: 9000, ts: 1 }])); localStorage.setItem('pf_t', JSON.stringify(t)); }, T);
    await page.reload(); await page.waitForTimeout(250);
    await page.evaluate(() => App.UI.nav('islemler')); await page.waitForTimeout(200);
    const scrollBy = dy => page.evaluate(dy => { const c = document.querySelector('.content'), el = c && c.scrollHeight > c.clientHeight + 5 && getComputedStyle(c).overflowY !== 'visible' ? c : document.scrollingElement; el.scrollTop += dy; }, dy).then(() => page.waitForTimeout(120));
    const hidden = () => page.evaluate(() => document.getElementById('fabAdd').classList.contains('fab-hide'));
    await scrollBy(600); const down = await hidden();
    await scrollBy(-150); const up = await hidden();
    await scrollBy(600); await page.evaluate(() => App.UI.nav('ozet')); await page.waitForTimeout(150); const nav = await hidden();
    eq('"+" aşağı kaydırınca gizlenir, yukarıda ve sayfa değişince görünür', [down, up, nav], [true, false, false]);
    await ctx.close();
  }

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
