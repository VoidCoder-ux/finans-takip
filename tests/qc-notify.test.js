// Usage: node tests/qc-notify.test.js
// Bildirim izni daha önce reddedilmiş telefon: "Bildirimleri Aç" sessizce çalışmıyor görünmemeli; nasıl açılacağı söylenmeli.
// İzin verilen telefonda düğme "açık" durumuna geçer. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(perm, answer) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    // Tarayıcının izin durumu taklit edilir (Playwright'ta gerçek izin penceresi yok)
    await ctx.addInitScript(([perm, answer]) => { let p = perm; Object.defineProperty(Notification, 'permission', { get: () => p, configurable: true }); Notification.requestPermission = () => { if (p === 'default') p = answer; return Promise.resolve(p); }; }, [perm, answer]);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() })); });
    await page.reload(); await page.waitForTimeout(300);
    await page.evaluate(() => App.UI.nav('ayarlar'));
    return { ctx, page };
  }
  const state = p => p.evaluate(() => ({ sub: document.getElementById('notifSub').textContent, btn: document.getElementById('notifBtn').hidden ? '' : document.getElementById('notifBtn').textContent }));
  const tap = async p => { await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); App.Notifications.toggle(); }); await p.waitForTimeout(200); return p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')); };
  {
    const { page, ctx } = await open('denied');
    const s = await state(page);
    eq('izin reddedilmiş: ayar kartı nasıl açılacağını söyler', /izni kapalı.*Ayarlar/.test(s.sub), true);
    eq('düğmeye basınca sessiz kalmaz, yol gösterir', /izni kapalı/.test(await tap(page)), true);
    await ctx.close();
  }
  {
    const { page, ctx } = await open('default', 'denied');
    eq('izin penceresinde "İzin verme" seçilirse açıklama gösterilir', /izni kapalı/.test(await tap(page)), true);
    eq('ardından ayar kartı da açıklamayı gösterir', /izni kapalı/.test((await state(page)).sub), true);
    await ctx.close();
  }
  {
    const { page, ctx } = await open('default', 'granted');
    eq('izin verilirse "Bildirim açıldı"', /Bildirim açıldı/.test(await tap(page)), true);
    eq('ayar kartı açık durumu gösterir', /hatırlatılıyor/.test((await state(page)).sub), true);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
