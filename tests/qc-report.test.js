// Usage: node tests/qc-report.test.js
// Aylık rapor: tarayıcıda yazdırma ekranı açılır. Ana ekrana eklenmiş uygulamada (iPhone'da window.print() sessizce çalışmaz)
// rapor dosya olarak paylaşılır; paylaşım yoksa indirilir. Kurmaca veri; sunucu gerekmez.
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
  // mode: 'browser' | 'app' (ana ekrandan açılmış) ; share: paylaşım destekli mi
  async function open(mode, share) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([mode, share]) => {
      window.__log = { print: 0, shared: [], downloads: [] };
      window.print = () => { window.__log.print++; };
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: mode === 'app', media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q);
      if (share) { navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = d => { window.__log.shared.push(d.files[0]); return Promise.resolve(); }; }
      else { delete Navigator.prototype.canShare; delete Navigator.prototype.share; }
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__log.downloads.push(this.download); };
    }, [mode, share]);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2027-03-15T10:00:00'));
    await page.goto(base);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now()));
      localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() }));
      localStorage.setItem('pf_a', JSON.stringify([{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 9500, openingBalance: 10000, ts: 1 }]));
      localStorage.setItem('pf_t', JSON.stringify([{ id: 't1', type: 'expense', amount: 500, category: 'Market', date: '2027-03-10', note: 'Haftalık market', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true }])); });
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  // Özet'teki "Rapor" düğmesi → pencere → ana düğme
  const run = async p => { await p.evaluate(() => { document.querySelector('.qrep').click(); }); await p.waitForTimeout(150);
    const btn = await p.evaluate(() => document.querySelector('#rapHolder .btn-primary').textContent);
    await p.evaluate(() => document.querySelector('#rapHolder .btn-primary').click()); await p.waitForTimeout(400);
    return btn; };
  {
    const { page, ctx } = await open('browser', true);
    const btn = await run(page);
    eq('tarayıcıda: "PDF Oluştur" yazdırma ekranını açar, dosya paylaşılmaz', [btn, await page.evaluate(() => [window.__log.print, window.__log.shared.length])], ['📄 PDF Oluştur', [1, 0]]);
    await ctx.close();
  }
  {
    const { page, ctx } = await open('app', true);
    const btn = await run(page);
    const f = await page.evaluate(async () => { const x = window.__log.shared[0]; return x ? { name: x.name, type: x.type, text: await x.text(), print: window.__log.print } : null; });
    eq('ana ekrandan açılmış uygulamada düğme "Raporu Paylaş"', btn, '📤 Raporu Paylaş');
    eq('rapor dosya olarak paylaşılır, yazdırma çağrılmaz', f && [f.name, f.type, f.print], ['Aile-Kasasi-Rapor-2027-03.html', 'text/html', 0]);
    eq('dosya raporun kendisi: başlık, ay, harcama ve biçim (yazdırma stilleri) içinde', f && [/Aile Kasası — Aylık Rapor/.test(f.text), /Mart 2027/.test(f.text), /Haftalık market/.test(f.text), /500,00/.test(f.text), /\.pr-title/.test(f.text), /<meta charset="utf-8">/.test(f.text)], [true, true, true, true, true, true]);
    eq('pencere kapanır', await page.evaluate(() => !!document.getElementById('rapHolder')), false);
    // İstatistikler'deki "Seçili Ay PDF Raporu" da aynı yolu kullanır
    await page.evaluate(() => { window.__log.shared = []; App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2027-03'; App.Charts.report(); }); await page.waitForTimeout(300);
    eq('İstatistikler › Seçili Ay PDF Raporu da paylaşılır', await page.evaluate(() => window.__log.shared.map(x => x.name)), ['Aile-Kasasi-Rapor-2027-03.html']);
    await ctx.close();
  }
  {
    const { page, ctx } = await open('app', false);
    await run(page);
    eq('paylaşım desteklenmiyorsa dosya indirilir ve söylenir', await page.evaluate(() => [window.__log.downloads, window.__log.print, [...document.querySelectorAll('.toast')].some(t => /indirildi/.test(t.textContent))]), [['Aile-Kasasi-Rapor-2027-03.html'], 0, true]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
