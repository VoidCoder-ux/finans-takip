// Usage: node tests/qc-report.test.js
// Aylık rapor (1. sayfa bir bakışta, sonra ayrıntılar, isteğe bağlı ek: ayın işlemleri):
//  - İçerik: rakamlar elle hesaplanmış beklenenlerle karşılaştırılır; tablolarda tutar başlığı tutarlarla aynı hizada.
//  - Telefona eklenmiş uygulamada (iPhone'da window.print() sessizce çalışmaz) PDF paylaş ekranıyla verilir, paylaşım yoksa indirilir.
//    Bilgisayarda (tarayıcı ya da bilgisayara kurulan uygulama) "PDF'i Kaydet" (Farklı kaydet penceresi, yoksa indirme) ve "Yazdır".
//  - "Ayın bütün işlemlerini sona ekle" seçeneği: kapalıysa ek yok; seçim bu cihazda hatırlanır.
//  - PDF geçerlidir: ayrı bir okuyucuyla (pdf.js) açılır, A4; sayfa sınırında yazı kesilmez, tablo başlığı yeni sayfada tekrarlanır.
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
// Market 2.000 / limit 1.500 → 500 aşıldı. Vadesiz 10.000 + 25.000 (Mart 2026) − 1.600 (Şubat) + 30.000 − 1.500 = 61.900.
// Kart −1.200 −800 +200 +1.500 −1.000 = −1.300. Günlük ortalama 2.800 / 20 gün = 140. Şubat gideri 1.600 → fark 1.200.
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
,
  { id: 'tf', type: 'expense', amount: 1600, category: 'Market', date: '2027-02-20', note: 'Migros', accountId: 'b', userId: 'u_a' },
  { id: 'ty', type: 'income', amount: 25000, category: 'Maaş', date: '2026-03-01', note: 'Maaş', accountId: 'b', userId: 'u_b' }
].concat([0, 1, 2].map(i => ({ id: 'ti' + i, type: 'expense', amount: 1000, category: 'Giyim', date: '2027-0' + (3 + i) + '-16', note: 'Mont (' + (i + 1) + '/3)', accountId: 'c', userId: 'u_a', balanceApplied: i === 0, installment: { planId: 'p1', index: i + 1, total: 3, totalAmount: 3000, name: 'Mont', startDate: '2027-03-16' } })))
  .map((t, i) => Object.assign({ ts: i + 1, balanceApplied: true }, t));
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T, pf_b: { Market: 1500 } };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  // o.mode: 'browser' | 'app' (ana ekrandan/kurulu açılmış); o.touch: telefon (dokunmatik); o.share: paylaşım destekli mi;
  // o.picker: 'ok' | 'cancel' | 'none' (Farklı kaydet penceresi: kaydedilir, vazgeçilir, tarayıcıda yok)
  async function open(o) {
    const ctx = await browser.newContext({ viewport: o.touch ? { width: 390, height: 844 } : { width: 1280, height: 860 }, hasTouch: !!o.touch, serviceWorkers: 'block' });
    await ctx.addInitScript(o => {
      window.__log = { print: 0, shared: [], downloads: [], saved: [], picker: [] };
      window.print = () => { window.__log.print++; };
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? { matches: o.mode === 'app', media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q);
      if (o.share) { navigator.canShare = d => !!(d && d.files && d.files.length); navigator.share = d => { window.__log.shared.push(d.files[0]); return Promise.resolve(); }; }
      else { delete Navigator.prototype.canShare; delete Navigator.prototype.share; }
      delete Window.prototype.showSaveFilePicker; delete window.showSaveFilePicker;
      if (o.picker !== 'none') window.showSaveFilePicker = opts => { window.__log.picker.push(opts); if (o.picker === 'cancel') return Promise.reject(new DOMException('Vazgeçildi', 'AbortError'));
        return Promise.resolve({ createWritable: () => Promise.resolve({ write: b => { window.__log.saved.push(b); return Promise.resolve(); }, close: () => Promise.resolve() }) }); };
      const blobs = new Map(), cou = URL.createObjectURL; URL.createObjectURL = b => { const u = cou(b); blobs.set(u, b); return u; };
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__log.downloads.push({ name: this.download, blob: blobs.get(this.href) }); };
    }, o);
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

  // 1) Rapor içeriği: elle hesaplanmış değerler (bugün 20 Mart; geçen ay aynı günleriyle, 1–20 Şubat)
  {
    const { page, ctx } = await open({ mode: 'browser', share: true, picker: 'ok' });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-03');
      const sp = s => s.replace(/\s+/g, ' ').trim(), tx = (el, s) => sp(((s ? el.querySelector(s) : el) || {}).textContent || '');
      const rows = s => [...d.querySelectorAll(s + ' tbody tr')].map(r => [...r.cells].map(c => tx(c)));
      const cardRows = d => [...d.querySelectorAll('.pr-cards tbody tr')].map(r => [...r.cells].map(c => c.querySelector('.pr-who') ? [...c.querySelectorAll('.pr-who')].map(w => [...w.children].map(x => tx(x)).join(' ')).join(' | ') : [...c.childNodes].map(n => sp(n.textContent)).filter(Boolean).join(' / ')));
      return { title: tx(d, '.pr-title'), chip: tx(d, '.pr-chip'), who: tx(d, '.pr-meta > div'), story: tx(d, '.pr-story'),
        kpi: [...d.querySelectorAll('.pr-kpi')].map(k => [...k.children].map(c => tx(c))), note: tx(d, '.pr-kpis + .pr-note'),
        pos: [...d.querySelectorAll('.pr-pos > div')].map(x => [...x.children].map(c => tx(c)).join(' ')), legend: [...d.querySelectorAll('.pr-legend > div')].map(x => tx(x)),
        flow: rows('.pr-flow'), flowNote: tx(d, '.pr-flow + .pr-note'),
        alerts: [...d.querySelectorAll('.pr-al')].map(x => [tx(x, '.pr-st'), tx(x, 'b')]), alert2: tx(d.querySelectorAll('.pr-al')[1] || d, 'div'), more: tx(d, '.pr-alerts + .pr-note'),
        fwd: rows('.pr-fwd'), catHead: [...d.querySelectorAll('.pr-cats th')].map(x => tx(x)), cats: rows('.pr-cats'), catNote: tx(d, '.pr-cats + .pr-note'),
        cardHead: [...d.querySelectorAll('.pr-cards th')].map(x => tx(x)), cards: cardRows(d), cardNote: tx(d, '.pr-cards + .pr-note'), accHead: [...d.querySelectorAll('.pr-accs th')].map(x => tx(x)), accs: rows('.pr-accs'),
        cols: [...d.querySelectorAll('.pr-col')].map(x => tx(x)), colx: [...d.querySelectorAll('.pr-colx span')].map(x => x.textContent),
        ek: sp(d.querySelector('.pr-break + .pr-sec .pr-h2').firstChild.textContent), txns: rows('.pr-txns'),
        guide: [...d.querySelectorAll('.pr-gl > div')].map(x => tx(x, 'b')), people: rows('.pr-two .pr-tbl:not(.x)').slice(0, 2) };
    });
    eq('başlık: ay, durum etiketi (20/31 gün), aile', [r.title, r.chip, /^Deniz ve Ece · Oluşturuldu \d\d\.\d\d\.\d{4}$/.test(r.who)], ['Mart 2027 Raporu', 'Ay devam ediyor · 20/31 gün', true]);
    // "Gelir − gider" elde kalan para değildir: cümle kart borcuna ödeneni ve hesaplardaki parayı söyler
    eq('özet cümlesi: gelir 30.000, gider 1.200 + 800 + 1.000 − 200 iade = 2.800; karta 1.500 ödendi; Vadesiz 61.900; en çok Market (2.000 / 3.000)', r.story, 'Mart\'ın ilk 20 gününde ₺30.000 geldi, ₺2.800 harcandı. Kart borçlarına ₺1.500 ödendi. Hesaplarda şu an ₺61.900 var. En çok harcanan: Market (%67).');
    eq('gelir/gider/kalan kutuları: geçen ayın aynı günleri (1–20 Şubat: gider 1.600) ile fark; ay sonu tahmini 2.800 / 20 × 31 = 4.340, günlük 140', r.kpi, [
      ['Gelir', '₺30.000', '▲ ₺30.000 fazla geçen ayın aynı günlerine göre'],
      ['Gider', '₺2.800', '▲ ₺1.200 fazla (%75) geçen ayın aynı günlerine göre', 'Ay sonu tahmini ~₺4.340 · günde ortalama ₺140'],
      ['Gelir − gider', '+₺27.200', 'Harcanmayan pay: %91', 'Elde kalan para değil: hesaplarda şu an ₺61.900']]);
    eq('planlı kayıt (28 Mart) toplamlara girmez', r.note, 'Tarihi gelmemiş 1 planlı kayıt toplamlara girmedi; günü gelince eklenir.');
    eq('para durumu: hesaplarda 61.900, kart borcu 1.300, borç düşülünce +60.600', r.pos, ['Hesaplarda (bugün) ₺61.900', 'Kart borcu ₺1.300', 'Borç düşülünce +₺60.600']);
    eq('harcamanın dağılımı: yalnız kategoriler ("Kalan" dilimi yok)', r.legend, ['Market ₺2.000', 'Giyim ₺1.000']);
    // Vadesiz ay başında 10.000 + 25.000 (Mart 2026) − 1.600 (Şubat) = 33.400; + 30.000 maaş − 1.500 kart ödemesi = 61.900 (28 Mart planlı, sayılmaz)
    eq('gelen para nereye gitti: ay başı + gelir − kart borcuna ödenen = şu an; kartla harcanan ayrı not', [r.flow, r.flowNote], [[['Ay başında hesaplarda', '₺33.400'], ['+ Gelir', '+₺30.000'], ['− Kart borcuna ödenen · gider sayılmaz; harcama kartla yapıldığı gün yazıldı', '−₺1.500'], ['= Şu an hesaplarda', '₺61.900']],
      'Kartla yapılan ₺2.800 harcama bu dökümde yok: kart borcuna eklendi, ekstre gününde ödenir.']);
    eq('dikkat: en önemli dört not (acil, dikkat, iyi), kalanı sayılır', [r.alerts, r.more], [[['!Acil', 'Harcama temposu yüksek.'], ['!Acil', 'Market bütçesi aşıldı.'], ['!Dikkat', 'Giyim bu ay yeni.'], ['✓İyi', 'İyi gidiyor.']], 've 3 not daha (İstatistikler sayfasında).']);
    eq('bütçe uyarısı kuruşsuz: 2.000 / 1.500 (%133)', r.alert2, 'Market bütçesi aşıldı. ₺2.000 / ₺1.500 (%133)');
    eq('önümüzdeki 30 gün: kesim günü olmayan kart borcu bugünden düşülür; planlı ödeme ve taksit sırayla', r.fwd, [
      ['Bugün', 'Hesaplardaki para (kesim günü girilmemiş kart borcu ₺1.300 düşüldü)', '', '₺60.600'],
      ['28 Mar', 'Sağlık · Planlı', '−₺500', '₺60.100'], ['16 Nis', 'Mont · Taksit', '−₺1.000', '₺59.100']]);
    eq('kategoriler: tutar, pay, 1–20 Şubat, fark, bütçe doluluğu; kategorisiz iade ayrı satır; toplam 2.800', [r.catHead, r.cats], [['Kategori', 'Pay', 'Tutar', '%', '1–20 Şub', 'Fark', 'Bütçe'], [
      ['🛒 Market', '', '₺2.000', '66,7', '₺1.600', '▲ %25', 'aşıldı'], ['👕 Giyim', '', '₺1.000', '33,3', '—', 'yeni', '—'],
      ['↩️ Kategorisiz iade', '', '−₺200', '—', '', '', ''], ['Toplam gider', '', '₺2.800', '', '₺1.600', '▲ %75', '']]]);
    eq('kategori notu: iade ve bütçe toplamı', r.catNote, 'Kategorisiz iade: kategorisi seçilmediği ya da o kategoride bu ay harcama olmadığı için yalnız toplamdan düşüldü. Bütçe: limit koyduğunuz kategorilerde ₺2.000 / ₺1.500 (%133).');
    eq('kim ne harcadı (getirdi / harcadı ayrı)', r.people, [['🙋 Deniz', '—', '₺2.800'], ['💑 Ece', '₺30.000', '₺0']]);
    // Kart: 1.300 borç + 2.000 gelecek taksit limitten düşer → %17 (16,5), 16.700 boş; kesim günü yok
    // Kartla Mart'ta Deniz harcadı: 1.200 + 800 + 1.000 − 200 iade = 2.800. Kullanılabilir: 20.000 − 1.300 − 2.000 gelecek taksit = 16.700
    eq('kredi kartı: kim harcadı, borç, limit, kullanılabilir limit, son ödeme', [r.cardHead, r.cards], [['Kart', 'Mart\'ta kim harcadı', 'Borç', 'Limit', 'Kullanılabilir', 'Son ödeme', 'Asgari'],
      [['💳 Kart', '🙋 Deniz ₺2.800', '₺1.300', '₺20.000', '₺16.700', 'kesim günü yok', '—']]]);
    eq('kart notu: ödeme gider değil; kartla harcanan 1.200 + 800 − 200 + 1.000; kullanılabilir neyin düşülmesiyle bulundu', r.cardNote, 'Bu ay kartlara ₺1.500 ödendi; gider sayılmadı, harcamalar kartla yapıldıkları gün yazıldı. Bu ay kartla harcanan: ₺2.800 (gidere dahil). Kullanılabilir: limitten kart borcu ve ekstreye henüz gelmemiş taksitler düşülünce kalan (bugün).');
    // Vadesiz: 10.000 + 25.000 (Mart 2026) − 1.600 (Şubat) = 33.400; + 30.000 − 1.500 = 61.900. Kart: 0 + 200 + 1.500 − 3.000 = −1.300
    eq('hesaplar: ay başında + giren − çıkan = bugün', [r.accHead, r.accs], [['Hesap', 'Ay başında', 'Giren', 'Çıkan', 'Bugün'], [['🏦 Vadesiz', '₺33.400', '+₺30.000', '−₺1.500', '₺61.900'], ['💳 Kart', '₺0', '+₺1.700', '−₺3.000', '−₺1.300']]]);
    eq('her ay ne kadar kaldı: Şubat −1.600, Mart 27.200 (ay devam ediyor)', [r.cols, r.colx], [['−₺1,6 bin', '₺27,2 bin'], ['Şub', 'Mar*']]);
    eq('ek: işlemler son günden ilk güne, kart ödemesi tek satır, kaynak ve planlı açıklaması', [r.ek, r.txns], ['Ek: Mart\'ın bütün işlemleri (7)', [
      ['28 Mart Pazar'], ['Diş kontrolü · planlı, toplamlara girmedi', 'Sağlık', 'Vadesiz', '🙋 Deniz', '−₺500'],
      ['16 Mart Salı'], ['Mont (1/3) · taksit 1/3', 'Giyim', 'Kart', '🙋 Deniz', '−₺1.000'],
      ['15 Mart Pazartesi'], ['↔ Kart borcu ödemesi · gider sayılmaz', 'Aktarım', 'Vadesiz → Kart', '🙋 Deniz', '₺1.500'],
      ['12 Mart Cuma'], ['İade: A101 · iade · giderden düştü', 'İade', 'Kart', '🙋 Deniz', '+₺200'],
      ['10 Mart Çarşamba'], ['A101', 'Market', 'Kart', '🙋 Deniz', '−₺800'],
      ['5 Mart Cuma'], ['Migros', 'Market', 'Kart', '🙋 Deniz', '−₺1.200'],
      ['1 Mart Pazartesi'], ['Maaş · SMS\'ten', 'Maaş', 'Vadesiz', '💑 Ece', '+₺30.000']]]);
    eq('okuma rehberi: yalnız raporda geçen kavramlar ("Gelir − gider" elde kalan para değildir)', r.guide, ['Gelir − gider:', 'Gelir:', 'Gider:', 'Kart borcu ödemesi:', 'İade:', 'Karta yazılır:', 'Tahmini:', 'Planlı:']);
    eq('işlemsiz rapor: ek yok', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-03', { txns: false }); return [!!d.querySelector('.pr-txns'), /Ek: /.test(d.textContent), !!d.querySelector('.pr-guide')]; }), [false, false, true]);
    // Hizalama: sağa yaslı başlığın yazısı, sütundaki tutarların yazısıyla aynı sağ kenarda (yazdırma görünümü)
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => App.Report.printMonth('2027-03', { txns: true })); await page.waitForTimeout(300);
    const al = await page.evaluate(() => {
      const right = el => { const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect().right; };
      let worst = 0, n = 0, left = 0;
      document.querySelectorAll('#printHolder table').forEach(tb => { const hs = [...tb.querySelectorAll('thead th')];
        hs.forEach((th, i) => { if (!th.textContent.trim()) return; const isR = th.classList.contains('pr-r');
          tb.querySelectorAll('tbody tr').forEach(tr => { if (tr.cells.length !== hs.length) return; const td = tr.cells[i]; if (!td.textContent.trim()) return;
            if (isR) { n++; worst = Math.max(worst, Math.abs(right(td) - right(th))); } else if (td.classList.contains('pr-r')) left++; }); }); });
      return [n, Math.round(worst * 10) / 10, left];
    });
    await page.emulateMedia({ media: 'screen' });
    eq('tablolarda tutar başlıkları tutarlarla aynı hizada (sağ kenar farkı ≤ 1 px, sola yaslı başlıkta tutar yok)', [al[0] >= 40, al[1] <= 1, al[2]], [true, true, 0]);
    await ctx.close();
  }
  // 2) Bilgisayarda (tarayıcı): Yazdır ve PDF'i Kaydet ("Farklı kaydet" penceresi)
  {
    const { page, ctx } = await open({ mode: 'browser', share: true, picker: 'ok' });
    await page.evaluate(() => App.Report.open('2027-03'));
    eq('açılınca: Vazgeç, Yazdır, "Hazırlanıyor…" (kapalı); işlemler seçeneği açık', [await btns(page), await page.evaluate(() => document.getElementById('rapTxns').checked)], [['Vazgeç', '🖨 Yazdır', '⏳ Hazırlanıyor… (kapalı)'], true]);
    await waitReady(page);
    eq('PDF hazır olunca "PDF\'i Kaydet"', await btns(page), ['Vazgeç', '🖨 Yazdır', '💾 PDF\'i Kaydet']);
    await page.evaluate(() => App.Report.print()); await page.waitForTimeout(300);
    eq('Yazdır → yazdırma ekranı, rapor işlemlerle', await page.evaluate(() => [window.__log.print, !!document.querySelector('#printHolder .pr-txns')]), [1, true]);
    await page.evaluate(() => App.Report.open('2027-03')); await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForFunction(() => window.__log.saved.length > 0, null, { timeout: 10000 });
    const sv = await fileBytes(page, 'window.__log.saved[0]');
    eq('PDF\'i Kaydet → "Farklı kaydet" penceresi (önerilen ad, PDF türü); dosya yazılır, pencere kapanır, paylaşım/indirme yok', [await page.evaluate(() => { const o = window.__log.picker[0]; return [o.suggestedName, Object.keys(o.types[0].accept)[0], o.types[0].accept['application/pdf'][0]]; }), head(sv.bytes), tail(sv.bytes),
      await page.evaluate(() => [!!document.getElementById('rapHolder'), window.__log.shared.length, window.__log.downloads.length, [...document.querySelectorAll('.toast')].some(t => /Rapor kaydedildi: Aile-Kasasi-Rapor-2027-03\.pdf/.test(t.textContent))])],
      [['Aile-Kasasi-Rapor-2027-03.pdf', 'application/pdf', '.pdf'], '%PDF-', '%%EOF', [false, 0, 0, true]]);
    const info = await readPdf(ctx, sv.bytes);
    eq('PDF ayrı bir okuyucuyla açılır: en az 2 sayfa, A4', [info[0] >= 2, info[1], info[2]], [true, 595, 842]);
    eq('sayfalar paletli ve sıkıştırılmış (yazı keskin, dosya küçük: sayfa başına 150 KB altı)', [Buffer.from(sv.bytes).toString('latin1').includes('/Indexed /DeviceRGB'), sv.bytes.length / info[0] < 150 * 1024], [true, true]);
    // İşlemler seçeneği kapatılır: PDF yeniden hazırlanır, seçim hatırlanır, yazdırmada da ek yok
    await page.evaluate(() => { window.__log.saved = []; App.Report.open('2027-03'); });
    await waitReady(page);
    await page.evaluate(() => { const c = document.getElementById('rapTxns'); c.checked = false; c.dispatchEvent(new Event('change')); });
    eq('seçenek değişince PDF yeniden hazırlanır', await btns(page), ['Vazgeç', '🖨 Yazdır', '⏳ Hazırlanıyor… (kapalı)']);
    await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForFunction(() => window.__log.saved.length > 0, null, { timeout: 10000 });
    const sv2 = await fileBytes(page, 'window.__log.saved[0]');
    eq('işlemsiz PDF daha kısa (ek yok)', (await readPdf(ctx, sv2.bytes))[0] < info[0], true);
    await page.evaluate(() => App.Report.open('2027-03'));
    eq('seçim hatırlanır (bu cihazda)', await page.evaluate(() => [localStorage.getItem('ft_rep_txns'), document.getElementById('rapTxns').checked]), ['0', false]);
    await page.evaluate(() => App.Report.print()); await page.waitForTimeout(300);
    eq('yazdırmada da ek yok', await page.evaluate(() => [!!document.querySelector('#printHolder .pr-txns'), !!document.querySelector('#printHolder .pr-kpis')]), [false, true]);
    await ctx.close();
  }
  // 3) Bilgisayarda: pencere kapatılırsa (vazgeçildi) hiçbir şey olmaz; "Farklı kaydet" olmayan tarayıcıda dosya iner
  {
    const { page, ctx } = await open({ mode: 'browser', share: true, picker: 'cancel' });
    await page.evaluate(() => App.Report.open('2027-03')); await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForTimeout(400);
    eq('kaydetmekten vazgeçildi: rapor penceresi açık kalır, indirme/hata yok', await page.evaluate(() => [window.__log.picker.length, !!document.getElementById('rapHolder'), window.__log.downloads.length, [...document.querySelectorAll('.toast')].some(t => /hazırlanamadı/.test(t.textContent))]), [1, true, 0, false]);
    await ctx.close();
  }
  {
    const { page, ctx } = await open({ mode: 'browser', share: false, picker: 'none' });
    await page.evaluate(() => App.Report.open('2027-03')); await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForFunction(() => window.__log.downloads.length > 0, null, { timeout: 10000 });
    const d = await fileBytes(page, 'window.__log.downloads[0].blob');
    eq('"Farklı kaydet" yoksa PDF indirilir ve söylenir', [await page.evaluate(() => [window.__log.downloads[0].name, [...document.querySelectorAll('.toast')].some(t => /indirildi/.test(t.textContent))]), head(d.bytes), tail(d.bytes)], [['Aile-Kasasi-Rapor-2027-03.pdf', true], '%PDF-', '%%EOF']);
    await ctx.close();
  }
  // 4) Bilgisayara kurulan uygulama (pencerede açılır, dokunmatik değil): paylaş ekranı değil, Kaydet ve Yazdır
  {
    const { page, ctx } = await open({ mode: 'app', share: true, picker: 'ok' });
    await page.evaluate(() => document.querySelector('.qrep').click()); await waitReady(page);
    eq('kurulu uygulama, bilgisayar: Yazdır ve PDF\'i Kaydet', [await page.evaluate(() => App.Report.fileMode()), await btns(page)], [false, ['Vazgeç', '🖨 Yazdır', '💾 PDF\'i Kaydet']]);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForFunction(() => window.__log.saved.length > 0, null, { timeout: 10000 });
    eq('kaydedilir; paylaş ekranı açılmaz', await page.evaluate(() => [window.__log.saved[0].name, window.__log.shared.length]), ['Aile-Kasasi-Rapor-2027-03.pdf', 0]);
    await ctx.close();
  }
  // 5) Telefona eklenmiş uygulama: PDF hazırlanır, düğme açılınca paylaşılır; yazdırma çağrılmaz
  {
    const { page, ctx } = await open({ mode: 'app', touch: true, share: true, picker: 'ok' });
    await page.evaluate(() => document.querySelector('.qrep').click());
    eq('açılınca düğme "Hazırlanıyor…" (kapalı), Yazdır yok', await btns(page), ['Vazgeç', '⏳ Hazırlanıyor… (kapalı)']);
    await waitReady(page);
    eq('PDF hazır olunca "PDF\'i Paylaş"', await btns(page), ['Vazgeç', '📤 PDF\'i Paylaş']);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForTimeout(200);
    const f = await fileBytes(page, 'window.__log.shared[0]');
    eq('paylaşılan dosya PDF (ad, tür, başlangıç/bitiş), yazdırma ve kaydetme penceresi yok', f && [f.name, f.type, head(f.bytes), tail(f.bytes), await page.evaluate(() => [window.__log.print, window.__log.picker.length])], ['Aile-Kasasi-Rapor-2027-03.pdf', 'application/pdf', '%PDF-', '%%EOF', [0, 0]]);
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
  // 6) Telefonda paylaşım desteklenmiyorsa PDF indirilir
  {
    const { page, ctx } = await open({ mode: 'app', touch: true, share: false, picker: 'none' });
    await page.evaluate(() => App.Report.open()); await waitReady(page);
    await page.evaluate(() => document.getElementById('rapGo').click()); await page.waitForTimeout(300);
    eq('paylaşım yoksa PDF indirilir ve söylenir', await page.evaluate(() => [window.__log.downloads.map(x => x.name), [...document.querySelectorAll('.toast')].some(t => /indirildi/.test(t.textContent))]), [['Aile-Kasasi-Rapor-2027-03.pdf'], true]);
    await ctx.close();
  }
  // 7) Kalabalık ay: sayfa sınırında yazı kesilmez, tablo başlığı tekrarlanır, ek yeni sayfada başlar (ya da önceki sayfa çok boşsa aynı sayfada)
  {
    const { page, ctx } = await open({ mode: 'browser', share: false, picker: 'none' });
    const r = await page.evaluate(() => {
      const t = S.txns(); for (let i = 0; i < 160; i++) t.push({ id: 'k' + i, type: 'expense', amount: 10 + i, category: ['Market', 'Yiyecek', 'Ulaşım', 'Eğlence', 'Sağlık', 'Faturalar', 'Eğitim', 'Diğer'][i % 8], date: '2027-03-' + String(1 + i % 20).padStart(2, '0'), note: 'Kurmaca işyeri ' + i, accountId: 'b', userId: i % 2 ? 'u_a' : 'u_b', ts: 1000 + i, balanceApplied: true });
      S.saveTxns(t); S.load();
      const L = App.Report._dbg.layout('2027-03', { txns: true }), P = App.Report._dbg.pages(L), ch = 1123 - 2 * 38, b = L.breaks[0], pb = P.find(p => p.start <= b && b <= p.end + 1);
      return { pages: P.length, cut: L.ops.filter(o => o.k === 't' && !P.some(p => o.top >= p.start - 1 && o.bot <= p.end + 1)).map(o => o.s), heads: P.filter(p => p.table).length,
        tall: P.filter(p => p.end - p.start + (p.table ? p.table.hH : 0) > ch + 1).length, ek: Math.abs(pb.start - b) < 1 || b - pb.start < ch * 0.35, fold: (() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-03'); return [...d.querySelectorAll('.pr-cats tbody tr')].map(x => x.cells[0].textContent.trim()).filter(x => /^Diğer \d+ kalem$/.test(x)); })() };
    });
    eq('9 kategori: ilk altısı renkli, kalan üçü "Diğer 3 kalem" satırında', r.fold, ['Diğer 3 kalem']);
    eq('çok sayfalı rapor: kesilen yazı yok, sayfa taşmıyor, ek sayfa başında, tablo başlığı tekrarlanıyor', [r.pages >= 5, r.cut, r.tall, r.ek, r.heads >= 3], [true, [], 0, true, true]);
    await ctx.close();
  }
  // 8) Kredi kartları: her kartta kim harcadı ve kullanılabilir limit; ortak limitli kartlar yan yana, kullanılabilir tutar ortak.
  // Kurmaca: Axess (limit 30.000) ve Wings (Axess'in limitini kullanır), Ece'nin kişisel Bonus kartı (harcama yok),
  // Maximum (limit 5.000, açılış borcu 5.000 + kişisi seçilmemiş 400 → 400 aşıldı), limiti girilmemiş Kart.
  {
    const { page, ctx } = await open({ mode: 'browser', share: false, picker: 'none' });
    const r = await page.evaluate(() => {
      const ac = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 50000, ts: 1 },
        { id: 'k1', name: 'Axess', type: 'card', owner: 'shared', limit: 30000, last4: '1111', balance: -7400, openingBalance: 0, ts: 2 },
        { id: 'k3', name: 'Bonus', type: 'card', owner: 'personal', userId: 'u_b', limit: 10000, balance: 0, openingBalance: 0, ts: 3 },
        { id: 'k2', name: 'Wings', type: 'card', owner: 'shared', limitWith: 'k1', last4: '2222', balance: -1800, openingBalance: 0, ts: 4 },
        { id: 'k4', name: 'Maximum', type: 'card', owner: 'shared', limit: 5000, balance: -5400, openingBalance: -5000, ts: 5 },
        { id: 'k5', name: 'Kart', type: 'card', owner: 'shared', balance: 0, openingBalance: 0, ts: 6 }];
      const x = (id, amount, date, note, accountId, userId, type) => ({ id, type: type || 'expense', amount, category: type === 'income' ? 'İade' : 'Market', date, note, accountId, userId, ts: 1, balanceApplied: true });
      S.saveAccounts(ac); S.saveTxns([x('a1', 4000, '2027-03-03', 'Migros', 'k1', 'u_a'), x('a2', 2500, '2027-03-06', 'Zara', 'k1', 'u_b'), x('a3', 1500, '2027-03-08', 'Trendyol', 'k2', 'u_b'),
        x('a4', 500, '2027-03-09', 'BİM', 'k2', 'u_a'), x('a5', 200, '2027-03-11', 'İade: BİM', 'k2', 'u_a', 'income'), x('a6', 400, '2027-03-12', 'Shell', 'k4', null),
        x('a7', 900, '2027-02-20', 'Şubat harcaması', 'k1', 'u_a'), x('a8', 700, '2027-03-25', 'Planlı', 'k3', 'u_b')].map(t => t.id === 'a8' ? Object.assign(t, { balanceApplied: false }) : t));
      S.load();
      const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-03');
      const sp = s => s.replace(/\s+/g, ' ').trim(), tx = (el, s) => sp(((s ? el.querySelector(s) : el) || {}).textContent || '');
      const cardRows = d => [...d.querySelectorAll('.pr-cards tbody tr')].map(r => [...r.cells].map(c => c.querySelector('.pr-who') ? [...c.querySelectorAll('.pr-who')].map(w => [...w.children].map(x => tx(x)).join(' ')).join(' | ') : [...c.childNodes].map(n => sp(n.textContent)).filter(Boolean).join(' / ')));
      const d2 = document.createElement('div'); d2.innerHTML = App.Report.build('2027-01');
      return { rows: cardRows(d), note: tx(d, '.pr-cards + .pr-note'), bars: [...d.querySelectorAll('.pr-cards .pr-cmt i')].map(i => i.style.width), old: !!d2.querySelector('.pr-cards') };
    });
    // Axess borcu 4.000 + 2.500 + 900 (Şubat) = 7.400; Wings 1.500 + 500 − 200 = 1.800 → kullanılabilir 30.000 − 9.200 = 20.800 (ikisi için ortak)
    // Wings'te Deniz 500 − 200 iade = 300; Şubat harcaması (900) Mart'ın "kim harcadı"sında yok, borçta var; 25 Mart planlı harcama yok
    eq('kart tablosu: kişi başı Mart harcaması, borç, limit, kullanılabilir; ortak limitli kartlar yan yana', r.rows, [
      ['💳 Axess …1111', '🙋 Deniz ₺4.000 | 💑 Ece ₺2.500', '₺7.400', '₺30.000 / ortak limit', '₺20.800', 'kesim günü yok', '—'],
      ['💳 Wings …2222', '💑 Ece ₺1.500 | 🙋 Deniz ₺300', '₺1.800', '₺30.000 / ortak limit', '₺20.800', 'kesim günü yok', '—'],
      ['💳 Bonus', '💑 Ece / harcama yok', '₺0', '₺10.000', '₺10.000', '—', '—'],
      ['💳 Maximum', 'Belirtilmemiş ₺400', '₺5.400', '₺5.000', '₺400 aşıldı', 'kesim günü yok', '—'],
      ['💳 Kart', 'harcama yok', '₺0', 'girilmemiş', '—', '—', '—']]);
    eq('doluluk çubuğu: Axess/Wings 9.200 / 30.000 = %31, Bonus boş (en az %2), Maximum %100', r.bars, ['31%', '31%', '2%', '100%']);
    eq('kart notu: kullanılabilir nasıl bulundu; ortak limit toplanmaz', r.note, 'Bu ay kartla harcanan: ₺8.700 (gidere dahil). Kullanılabilir: limitten kart borcu düşülünce kalan (bugün). Axess …1111 ve Wings …2222 aynı limiti kullanır; kullanılabilir tutar ikisi için ortaktır, toplanmaz.');
    eq('eski ayın raporunda kart tablosu yok (limit bugünkü durum)', r.old, false);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
