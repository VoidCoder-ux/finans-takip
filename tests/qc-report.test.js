// Usage: node tests/qc-report.test.js
// Aylık rapor:
//  - Ana ekrana eklenmiş uygulamada (iPhone'da window.print() sessizce çalışmaz) gerçek bir PDF hazırlanır ve paylaşılır;
//    paylaşım yoksa indirilir. Tarayıcıda "PDF İndir" ve "Yazdır" ikisi de çalışır.
//  - PDF geçerlidir: ayrı bir okuyucuyla (pdf.js) açılır, sayfaları vardır.
//  - Her kalemin altında kısa açıklama: değerler elle hesaplanmış beklenenlerle karşılaştırılır.
// Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Mart 2027, bugün 20 Mart. Elle: gelir 30.000; gider 1.200 + 800 + 1.000 (1. taksit) − 200 iade = 2.800.
// Market 2.000 / limit 1.500 → 500 aşıldı. Vadesiz 10.000 + 30.000 − 1.500 = 38.500. Kart −1.200 −800 +200 +1.500 −1.000 = −1.300.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const A = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 10000, ts: 1 }, { id: 'c', name: 'Kart', type: 'card', owner: 'shared', limit: 20000, balance: 0, openingBalance: 0, ts: 2 }];
const T = [
  { id: 't1', type: 'income', amount: 30000, category: 'Maaş', date: '2027-03-01', note: 'Maaş', accountId: 'b', userId: 'u_b', src: 'sms' },
  { id: 't2', type: 'expense', amount: 1200, category: 'Market', date: '2027-03-05', note: 'Migros', accountId: 'c', userId: 'u_a' },
  { id: 't3', type: 'expense', amount: 800, category: 'Market', date: '2027-03-10', note: 'A101', accountId: 'c', userId: 'u_a' },
  { id: 't4', type: 'income', amount: 200, category: 'İade', date: '2027-03-12', note: 'İade: A101', accountId: 'c', userId: 'u_a' },
  { id: 't5', type: 'expense', amount: 1500, category: 'Transfer', date: '2027-03-15', note: 'Kart borcu ödemesi: Kart', accountId: 'b', userId: 'u_a', transferId: 'tr1' },
  { id: 't6', type: 'income', amount: 1500, category: 'Transfer', date: '2027-03-15', note: 'Kart borcu ödemesi: Kart', accountId: 'c', userId: 'u_a', transferId: 'tr1' },
  { id: 't7', type: 'expense', amount: 500, category: 'Sağlık', date: '2027-03-28', note: 'Diş kontrolü', accountId: 'b', userId: 'u_a', balanceApplied: false }
].concat([0, 1, 2].map(i => ({ id: 'ti' + i, type: 'expense', amount: 1000, category: 'Giyim', date: '2027-0' + (3 + i) + '-16', note: 'Mont (' + (i + 1) + '/3)', accountId: 'c', userId: 'u_a', balanceApplied: i === 0, installment: { planId: 'p1', index: i + 1, total: 3, totalAmount: 3000, name: 'Mont', startDate: '2027-03-16' } })))
  .map((t, i) => Object.assign({ ts: i + 1, balanceApplied: true }, t));
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T, pf_b: { Market: 1500 } };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  // mode: 'browser' | 'app' (ana ekrandan açılmış); share: paylaşım destekli mi
  async function open(mode, share) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(([mode, share]) => {
      window.__log = { print: 0, shared: [], downloads: [] };
      window.print = () => { window.__log.print++; };
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: mode === 'app', media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q);
      if (share) { navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = d => { window.__log.shared.push(d.files[0]); return Promise.resolve(); }; }
      else { delete Navigator.prototype.canShare; delete Navigator.prototype.share; }
      const blobs = new Map(), cou = URL.createObjectURL; URL.createObjectURL = b => { const u = cou(b); blobs.set(u, b); return u; };
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__log.downloads.push({ name: this.download, blob: blobs.get(this.href) }); };
    }, [mode, share]);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2027-03-20T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const btns = p => p.evaluate(() => [...document.querySelectorAll('#rapHolder .modal-actions button')].map(b => b.textContent + (b.disabled ? ' (kapalı)' : '')));
  const waitReady = p => p.waitForFunction(() => { const b = document.getElementById('rapGo'); return b && !b.disabled; }, null, { timeout: 30000 });
  // PDF'i ayrı bir okuyucuyla (pdf.js) açar: sayfa sayısı ve ilk sayfanın boyutu (A4 = 595×842 pt)
  async function readPdf(ctx, bytes) {
    const v = await ctx.newPage(); await v.goto(base.replace('index.html', 'tests/fixtures/')).catch(() => {});
    const r = await v.evaluate(async ({ data, lib, wk }) => { const pdfjs = await import(lib); pdfjs.GlobalWorkerOptions.workerSrc = wk; const d = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise; const pg = await d.getPage(1); const vp = pg.getViewport({ scale: 1 }); return [d.numPages, Math.round(vp.width), Math.round(vp.height)]; },
      { data: bytes, lib: base.replace('index.html', 'vendor/pdfjs/pdf.min.js'), wk: base.replace('index.html', 'vendor/pdfjs/pdf.worker.min.js') });
    await v.close(); return r;
  }
  const fileBytes = (p, expr) => p.evaluate(async e => { const f = eval(e); return f ? { name: f.name, type: f.type, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) } : null; }, expr);
  const head = b => Buffer.from(b.slice(0, 5)).toString('latin1'), tail = b => Buffer.from(b.slice(-6)).toString('latin1').trim();

  // 1) Rapor içeriği: her kalemin açıklaması, elle hesaplanmış değerlerle
  {
    const { page, ctx } = await open('browser', true);
    const txt = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-03'); return d.textContent.replace(/\s+/g, ' '); });
    const has = s => txt.includes(s);
    eq('nasıl okunur kutusu ve özet açıklamaları', [has('Bu rapor nasıl okunur?'), has('Bu ay hesaplara giren para'), has('₺200,00 iade düşüldü'), has('Gelirden harcamalar çıktıktan sonra kalan para')], [true, true, true, true]);
    eq('özet tutarları: gelir +₺30.000,00, gider -₺2.800,00, net +₺27.200,00', [has('+₺30.000,00'), has('-₺2.800,00'), has('+₺27.200,00')], [true, true, true]);
    eq('bütçe satırı: Market limiti ₺500,00 aşıldı', has('Limit ₺500,00 aşıldı.'), true);
    eq('gider kategorisi açıklaması: işlem sayısı ve en büyük kalem', has('2 işlem · en büyük: Migros ₺1.200,00 (05 Mart 2027)'), true);
    eq('iade satırı: giderden düşüldüğü yazar', has('İade: giderden düşüldü'), true);
    eq('kart borcu ödemesi: iki bacak da "gider sayılmaz"', [has('Aktarım çıkışı (Kart hesabına) · kart borcu ödemesi; gider sayılmaz'), has('Aktarım girişi (Vadesiz hesabından) · kart borcu ödemesi; gider sayılmaz')], [true, true]);
    eq('taksit ve planlı kayıt açıklaması', [has('taksit 1/3 (toplam ₺3.000,00)'), has('planlı: günü gelmedi, toplamlara girmedi'), has('bankanın SMS\'inden')], [true, true, true]);
    eq('hesaplar: Vadesiz bugün ₺38.500,00; kart güncel borç ₺1.300,00', [has('₺38.500,00'), has('Güncel borç ₺1.300,00.')], [true, true]);
    eq('üye açıklaması: Deniz en çok Market', has('en çok Market (₺2.000,00)'), true);
    // 2) Tarayıcıda: "Yazdır" yazdırma ekranını açar, "PDF İndir" PDF dosyası indirir
    await page.evaluate(() => App.Report.open('2027-03'));
    eq('tarayıcıda düğmeler', await btns(page), ['Vazgeç', '🖨 Yazdır', '📄 PDF İndir']);
    await page.evaluate(() => App.Report.print()); await page.waitForTimeout(300);
    eq('Yazdır → yazdırma ekranı', await page.evaluate(() => window.__log.print), 1);
    await page.evaluate(() => { App.Report.open('2027-03'); App.Report.generate(); });
    await page.waitForFunction(() => window.__log.downloads.length > 0, null, { timeout: 30000 });
    const d = await fileBytes(page, 'window.__log.downloads[0].blob');
    const dn = await page.evaluate(() => window.__log.downloads[0].name);
    eq('PDF İndir → geçerli PDF dosyası indirilir', [dn, head(d.bytes), tail(d.bytes)], ['Aile-Kasasi-Rapor-2027-03.pdf', '%PDF-', '%%EOF']);
    const info = await readPdf(ctx, d.bytes);
    eq('PDF ayrı bir okuyucuyla açılır: en az 2 sayfa, A4', [info[0] >= 2, info[1], info[2]], [true, 595, 842]);
    await ctx.close();
  }
  // 3) Ana ekran uygulaması: PDF hazırlanır, düğme açılınca paylaşılır; yazdırma çağrılmaz
  {
    const { page, ctx } = await open('app', true);
    await page.evaluate(() => document.querySelector('.qrep').click());
    eq('açılınca düğme "Hazırlanıyor…" (kapalı)', await btns(page), ['Vazgeç', '⏳ Hazırlanıyor… (kapalı)']);
    await waitReady(page);
    eq('PDF hazır olunca "PDF\'i Paylaş"', await btns(page), ['Vazgeç', '📤 PDF\'i Paylaş']);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForTimeout(200);
    const f = await fileBytes(page, 'window.__log.shared[0]');
    eq('paylaşılan dosya PDF (ad, tür, başlangıç/bitiş), yazdırma yok', f && [f.name, f.type, head(f.bytes), tail(f.bytes), await page.evaluate(() => window.__log.print)], ['Aile-Kasasi-Rapor-' + '2027-03' + '.pdf', 'application/pdf', '%PDF-', '%%EOF', 0]);
    eq('paylaşılan PDF açılır', (await readPdf(ctx, f.bytes))[0] >= 2, true);
    eq('pencere kapanır', await page.evaluate(() => !!document.getElementById('rapHolder')), false);
    // İstatistikler › Seçili Ay PDF Raporu: aynı pencere, seçili ay ile
    await page.evaluate(() => { App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2027-02'; App.Charts.report(); });
    eq('İstatistikler düğmesi pencereyi seçili ayla açar', await page.evaluate(() => document.getElementById('rapMonth').value), '2027-02');
    await waitReady(page);
    await page.evaluate(() => { window.__log.shared = []; document.getElementById('rapGo').click(); }); await page.waitForTimeout(200);
    eq('seçili ayın PDF\'i paylaşılır', await page.evaluate(() => window.__log.shared.map(x => x.name)), ['Aile-Kasasi-Rapor-2027-02.pdf']);
    await ctx.close();
  }
  // 4) Paylaşım desteklenmiyorsa PDF indirilir
  {
    const { page, ctx } = await open('app', false);
    await page.evaluate(() => App.Report.open()); await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForTimeout(300);
    eq('paylaşım yoksa PDF indirilir ve söylenir', await page.evaluate(() => [window.__log.downloads.map(x => x.name), [...document.querySelectorAll('.toast')].some(t => /indirildi/.test(t.textContent))]), [['Aile-Kasasi-Rapor-2027-03.pdf'], true]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
