// Usage: node tests/text-overlap.test.js [ekran-görüntüsü-klasörü]
// Yazı kesilmesi ve üst üste binme taraması. Tüm sayfalar, alt sekmeler ve pencereler; telefon (320/375/393/430),
// tablet, masaüstü; normal/büyük/çok büyük yazı; üç veri durumu:
//   yoğun   — ui-scan.js'teki kurmaca veri (6 ay, uzun adlar, büyük tutarlar)
//   ilk-ay  — yeni başlayan aile: yalnız bu ayın kayıtları, çok kart, reel (TÜFE) görünüm, onay bekleyen SMS
//   boş     — kurulum bitmiş ama hiç hesap/işlem yok (boş durum yazıları)
// Denetimler (görünür her metin satırı için):
//   kesik    — satır, taşmayı kırpan (overflow: hidden/clip) bir kapsayıcının dışına taşıyor (bilinçli "…" kısaltma hariç)
//   çakışma  — iki ayrı metin satırı üst üste biniyor (aynı katmanda; sabit alt menü sayfa akışıyla karşılaştırılmaz)
//   tuval    — tuvale yazılan mesaj ("Grafik gelecek ay oluşacak" gibi) kapsayıcısının dışında kalıyor
//   kaydırma — telefonda tablo/liste ekrana sığmıyor, sağdaki sütunlar yana kaydırmadan görünmüyor
//   kısaltma — "…" ile kısaltılan metin 5 harf genişliğinden dar görünüyor (ör. "Çağr…")
// Sorun yoksa çıkış kodu 0. Playwright yoksa atlanır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const src = fs.readFileSync(path.join(__dirname, 'ui-scan.js'), 'utf8');
const grab = name => { const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) break; } return src.slice(i, j + 1); };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const denseSeed = new Function('iso', 'now', grab('seed') + '; return seed();');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });

// Yeni başlayan aile: kayıtlar yalnız bu ay (Net Servet grafiği henüz yok), çok sayıda kart ve ortak limit
function firstMonthSeed() {
  const now = new Date(), d = n => iso(new Date(now.getFullYear(), now.getMonth(), Math.min(n, now.getDate()))), ts = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const U = [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Eş', emoji: '💑', color: '#ec4899' }];
  const A = [
    { id: 'a_b', name: 'Yapıkredi TLCARD', type: 'bank', owner: 'shared', last4: '4359', balance: 0, openingBalance: 2000, ts },
    { id: 'a_c1', name: 'Yapıkredi Platinum', type: 'card', owner: 'shared', last4: '2947', limit: 51800, limitGroup: 'yk', statementDay: 4, balance: 0, openingBalance: -42258.72, ts: ts + 1 },
    { id: 'a_c2', name: 'Yapıkredi Adios', type: 'card', owner: 'shared', last4: '7448', limit: 51800, limitGroup: 'yk', statementDay: 4, balance: 0, openingBalance: 0, ts: ts + 2 },
    { id: 'a_c3', name: 'Yapıkredi Hepsiburada', type: 'card', owner: 'shared', last4: '8191', limit: 51800, limitGroup: 'yk', statementDay: 4, balance: 0, openingBalance: -7670.71, ts: ts + 3 },
    { id: 'a_c4', name: 'Akbank Axess Gold', type: 'card', owner: 'shared', last4: '1483', limit: 25000, limitGroup: 'ak', statementDay: 12, balance: 0, openingBalance: -10041.41, ts: ts + 4 },
    { id: 'a_c5', name: 'Akbank platin', type: 'card', owner: 'shared', last4: '7524', limit: 25000, limitGroup: 'ak', statementDay: 11, balance: 0, openingBalance: -10469.99, ts: ts + 5 },
    { id: 'a_k', name: 'Cüzdan', type: 'cash', owner: 'personal', userId: 'u_b', balance: 0, openingBalance: 450, ts: ts + 6 }
  ];
  let k = 0; const t = o => Object.assign({ id: 'tf' + (++k), userId: 'u_a', ts: k, balanceApplied: true }, o);
  const T = [
    t({ type: 'income', amount: 33300, category: 'Maaş', date: d(1), note: 'Maaş', accountId: 'a_b', userId: 'u_b', src: 'sms' }),
    t({ type: 'income', amount: 5900, category: 'Freelance', date: d(2), note: 'Ek iş', accountId: 'a_b' }),
    t({ type: 'expense', amount: 1102.5, category: 'Market', date: d(3), note: 'Bım Bım-T377-Karacaoglan', accountId: 'a_c3', src: 'sms' }),
    t({ type: 'expense', amount: 1426.78, category: 'Market', date: d(3), note: 'Akbank kart harcaması', accountId: 'a_c4', src: 'sms', via: 'email' }),
    t({ type: 'expense', amount: 16400, category: 'Transfer', date: d(4), note: 'Kart borcu ödemesi: Yapıkredi Platinum', accountId: 'a_b', transferId: 'trf1' }),
    t({ type: 'income', amount: 16400, category: 'Transfer', date: d(4), note: 'Kart borcu ödemesi: Yapıkredi Platinum', accountId: 'a_c1', transferId: 'trf1' }),
    t({ type: 'expense', amount: 2800, category: 'Transfer', date: d(4), note: 'Kart borcu ödemesi: Yapıkredi Hepsiburada', accountId: 'a_b', transferId: 'trf2' }),
    t({ type: 'income', amount: 2800, category: 'Transfer', date: d(4), note: 'Kart borcu ödemesi: Yapıkredi Hepsiburada', accountId: 'a_c3', transferId: 'trf2' }),
    t({ type: 'expense', amount: 721, category: 'Yiyecek', date: d(5), note: 'Simit Sarayı', accountId: 'a_k', userId: 'u_b' })
  ];
  return {
    pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T,
    pf_sq: [{ id: 'sqsms_f1', text: 'Kredi karti borcunuza 5.000,00 TL odeme yapilmistir. Yapi Kredi', label: 'abcd1234_u_a', receivedAt: Date.now(), reason: 'Kredi kartı borç ödemesi (hesaplar arası aktarım olabilir)', p: { type: 'expense', amount: 5000, date: d(6), note: 'Kart ödemesi', category: 'Diğer', accountId: 'a_b', last4: '' }, ts: 1 }]
  };
}
const emptySeed = () => ({ pf_s: { onboarded: true, users: [{ id: 'u_a', name: 'Ben', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() } });

// Sayfa içinde çalışır. Açık pencere varsa yalnız o, yoksa tüm görünür arayüz taranır.
function textAudit(opts) {
  opts = opts || {};
  const tol = 1.5, out = { kesik: [], cakisma: [], tuval: [], kaydirma: [], kisaltma: [] };
  const modal = [...document.querySelectorAll('.modal-bd.show')].pop();
  const root = modal || document.body;
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const hiddenUp = el => !!el.closest('[hidden],.sec-collapsed,.page:not(.active),.modal-bd:not(.show),template,script,style,noscript,option,title');
  const visible = el => { let op = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.display === 'none') return false; op *= parseFloat(cs.opacity); } return op > 0.1; };
  // Katman: sabit (fixed) ya da yapışkan (sticky) bir ata içindeki metin, sayfa akışıyla aynı düzlemde karşılaştırılmaz
  // (alt menü, pencerenin alt düğme çubuğu: altlarından kayan içerik onların opak zemini arkasında kalır)
  const layer = el => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  // Kırpan atalar. Kaydırılabilen (auto/scroll) bir kapsayıcıdan sonrakiler o eksende denetlenmez: içerik kaydırılarak görülebilir
  const clipBoxes = el => { const res = []; let sx = false, sy = false; for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a), ox = cs.overflowX, oy = cs.overflowY;
      if (ox !== 'visible' || oy !== 'visible') { const r = a.getBoundingClientRect(), scX = ox === 'auto' || ox === 'scroll', scY = oy === 'auto' || oy === 'scroll';
        res.push({ el: a, l: r.left + a.clientLeft, t: r.top + a.clientTop, r: r.left + a.clientLeft + a.clientWidth, b: r.top + a.clientTop + a.clientHeight,
          x: !sx && ox !== 'visible' && !scX, y: !sy && oy !== 'visible' && !scY, vx: ox !== 'visible', vy: oy !== 'visible' });
        if (scX) sx = true; if (scY) sy = true; }
      if (cs.position === 'fixed') break; } return res; };
  // Bilinçli kısaltma ("…" ya da satır sınırı) olan öğe: yatay/dikey kırpma beklenen davranış
  const intended = (el, stop) => { const r = { x: false, y: false }; for (let a = el; a && a !== stop.parentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.textOverflow === 'ellipsis') r.x = true; if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') r.y = true; } return r; };
  // Satırın ekranda gerçekten görünen kısmı (kırpan atalarla kesişimi); tamamen gizliyse null
  const visiblePart = (r, boxes) => { let l = r.left, t = r.top, rr = r.right, b = r.bottom; for (const x of boxes) { if (x.vx) { l = Math.max(l, x.l); rr = Math.min(rr, x.r); } if (x.vy) { t = Math.max(t, x.t); b = Math.min(b, x.b); } } return rr - l > 0.5 && b - t > 0.5 ? { left: l, top: t, right: rr, bottom: b } : null; };
  const lines = [], tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rg = document.createRange(); let n, seg = 0;
  while ((n = tw.nextNode())) {
    if (!/\S/.test(n.nodeValue)) continue; const el = n.parentElement; if (!el || hiddenUp(el) || !visible(el)) continue;
    rg.selectNodeContents(n); const rs = [...rg.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5); if (!rs.length) continue;
    const txt = n.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 40), ly = layer(el), id = seg++, boxes = clipBoxes(el);
    for (const box of boxes) {
      if (!box.x && !box.y) continue; const it = intended(el, box.el);
      for (const r of rs) {
        const dy = box.y && !it.y ? Math.max(box.t - r.top, r.bottom - box.b) : 0, dx = box.x && !it.x ? Math.max(box.l - r.left, r.right - box.r) : 0;
        if (dy > tol || dx > tol) { out.kesik.push('"' + txt + '" ' + desc(el) + ' → ' + desc(box.el) + ' içinde ' + Math.round(Math.max(dx, dy)) + 'px kesik'); break; }
      }
    }
    rs.forEach(r => { const v = visiblePart(r, boxes); if (v) lines.push({ r: v, id, ly, el, txt }); });
  }
  lines.sort((a, b) => a.r.top - b.r.top);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length && lines[j].r.top < lines[i].r.bottom; j++) {
    const a = lines[i], b = lines[j]; if (a.id === b.id || a.ly !== b.ly) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 3) out.cakisma.push('"' + a.txt + '" (' + desc(a.el) + ') ↔ "' + b.txt + '" (' + desc(b.el) + ') ' + Math.round(w) + '×' + Math.round(h) + 'px');
  }
  // Tuvale yazılan mesajlar tuvalin ortasına çizilir: tuval kapsayıcısından taşarsa mesaj kesilir ya da görünmez
  root.querySelectorAll('canvas').forEach(c => { if (hiddenUp(c) || !visible(c)) return; const r = c.getBoundingClientRect(); if (!r.width || !r.height) return;
    for (const box of clipBoxes(c.parentElement).filter(x => x.x || x.y)) { const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
      if ((box.y && (r.bottom > box.b + tol || r.top < box.t - tol)) || (box.x && (r.right > box.r + tol || r.left < box.l - tol)) || cy > box.b || cy < box.t || cx > box.r || cx < box.l) { out.tuval.push(desc(c) + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' → ' + desc(box.el) + ' ' + Math.round(box.r - box.l) + '×' + Math.round(box.b - box.t)); break; } } });
  // Telefonda yana kaydırma gerektiren tablo/liste: sağdaki sütunlar ekran dışında kalır, kesik görünür
  if (opts.mobile) root.querySelectorAll('*').forEach(el => { if (hiddenUp(el) || el.closest('.sub-tabs,.chip-row,.cat-chips,.pay-chips,.import-preview')) return; const cs = getComputedStyle(el);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && visible(el) && /\S/.test(el.textContent)) out.kaydirma.push(desc(el) + ' ' + (el.scrollWidth - el.clientWidth) + 'px yana taşıyor'); });
  // Aşırı kısaltma: "…" ile kısaltılmış metinden 5 harf genişliğinden az görünüyor (ör. "Çağr…")
  root.querySelectorAll('*').forEach(el => { if (hiddenUp(el)) return; const cs = getComputedStyle(el); if (cs.textOverflow !== 'ellipsis' || el.scrollWidth <= el.clientWidth + 1 || !el.clientWidth || !visible(el)) return;
    const fsz = parseFloat(cs.fontSize); if (el.clientWidth < fsz * 5) out.kisaltma.push('"' + el.textContent.trim().slice(0, 30) + '" ' + desc(el) + ' yalnız ' + Math.round(el.clientWidth) + 'px görünüyor'); });
  Object.keys(out).forEach(k => { out[k] = [...new Set(out[k])]; });
  return out;
}

const pages = ['ozet', 'hesaplar', 'aile', 'islemler', 'tekrarlayan', 'taksitler', 'borclar', 'butce', 'portfoy', 'istatistikler', 'hedefler', 'hedefler/fund', 'ayarlar'];
const configs = [['320-çokbüyük', 320, 568, 'xl', true], ['375-büyük', 375, 667, 'l', true], ['393-çokbüyük', 393, 852, 'xl', true], ['430-normal', 430, 932, 'n', true], ['tablet-büyük', 768, 1024, 'l', false], ['masaüstü', 1280, 800, 'n', false]];
const commonModals = { more: 'App.UI.moreMenu()', backup: 'App.Backup.open()', setup: 'App.Onboarding.open()', report: 'App.Report.open()', cash: 'App.Cashflow.open()' };
const denseModals = Object.assign({}, commonModals, {
  editTxn: 'App.Transactions.edit(S.txns().find(t=>!t.transferId&&!t.installment).id)', editInst: 'App.Transactions.edit(S.txns().find(t=>t.installment).id)',
  editTrf: 'App.Transactions.edit(S.txns().find(t=>t.transferId).id)', sell: "App.Portfolio.sell('pa1700000000000_p001')", targets: 'App.Portfolio.editTargets()',
  fundPaid: "App.YearlyFund.markPaid('yf1700000000000_f001')", recEdit: "App.Recurring.edit('r1700000000000_r001')", debtEdit: "App.Debts.edit('d1700000000000_d001')",
  smsAccept: "App.BankSms.accept('sqsms1_a')", accEdit: "App.Accounts.edit('a1700000000000_card')"
});
const firstModals = Object.assign({}, commonModals, { smsAccept: "App.BankSms.accept('sqsms_f1')", accEdit: "App.Accounts.edit('a_c1')", editTrf: 'App.Transactions.edit(S.txns().find(t=>t.transferId).id)' });
const datasets = [['yoğun', () => denseSeed(iso, new Date()), denseModals, false], ['ilk-ay', firstMonthSeed, firstModals, true], ['boş', emptySeed, commonModals, false]];

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const found = {}, errors = []; let screens = 0;
  const note = (where, a) => { ['kesik', 'cakisma', 'tuval', 'kaydirma', 'kisaltma'].forEach(k => a[k].forEach(m => { const key = k + ' ' + m; (found[key] = found[key] || []).push(where); })); };
  // Öz-sınama: denetim bilerek bozulmuş örnekleri yakalıyor mu (yakalamıyorsa tarama "temiz" dese de güvenilmez)
  {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, emptySeed());
    await page.reload(); await page.waitForTimeout(300);
    await page.addScriptTag({ content: textAudit.toString() });
    const got = await page.evaluate(() => {
      const d = document.createElement('div'); d.id = 'selftest';
      d.innerHTML = '<div style="position:relative;height:40px"><span style="position:absolute;left:0;top:0">ÜSTÜSTE-BİR</span><span style="position:absolute;left:4px;top:2px">ÜSTÜSTE-İKİ</span></div>' +
        '<div style="height:12px;overflow:hidden;font-size:16px;line-height:30px">KESİK-YAZI satırın yarısı görünür</div>' +
        '<div style="height:30px;overflow:hidden;position:relative"><canvas width="100" height="200" style="width:100px;height:200px"></canvas></div>' +
        '<div style="overflow-x:auto;width:200px"><table><tr><td style="white-space:nowrap">YANA-TAŞAN-TABLO-SÜTUNU bir iki üç dört beş altı yedi sekiz dokuz on</td></tr></table></div>' +
        '<div style="width:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px">AŞIRI-KISALTILMIŞ uzun ad</div>';
      document.querySelector('.page.active').prepend(d);
      const a = textAudit({ mobile: true }); d.remove();
      const has = (k, m) => a[k].some(x => x.includes(m) || (k === 'tuval' && x.includes('canvas')));
      return [has('cakisma', 'ÜSTÜSTE'), has('kesik', 'KESİK-YAZI'), has('tuval', ''), a.kaydirma.length > 0, has('kisaltma', 'AŞIRI-KISALTILMIŞ')];
    });
    const ok = got.every(Boolean);
    console.log((ok ? '✓' : '✗') + ' öz-sınama: çakışma, kesik, tuval, yana taşma, aşırı kısaltma yakalanıyor => ' + JSON.stringify(got));
    if (!ok) errors.push('öz-sınama başarısız: ' + JSON.stringify(got));
    await ctx.close();
  }
  for (const [dname, mk, modals, realMode] of datasets) for (const [cname, w, h, fs_, mobile] of configs) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(dname + '/' + cname + ': ' + e.message));
    await page.route(/truncgil|frankfurter|deepseek|tefas|evds/, r => r.abort());
    await page.goto(base);
    await page.evaluate(({ sd, fs_ }) => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); if (fs_ !== 'n') localStorage.setItem('ft_fs', fs_); }, { sd: mk(), fs_ });
    await page.reload(); await page.waitForTimeout(400);
    if (realMode) await page.evaluate(() => App.Inflation.setMode('real'));
    await page.addScriptTag({ content: textAudit.toString() });
    for (const pg of pages) {
      const [p, sub] = pg.split('/');
      await page.evaluate(([p, sub]) => { document.querySelectorAll('.toast').forEach(t => t.remove()); App.UI.nav(p); if (sub) App.UI.subTab(p, sub); window.scrollTo(0, 0); }, [p, sub]);
      await page.waitForTimeout(p === 'istatistikler' || p === 'ozet' ? 500 : 150);
      note(dname + '/' + cname + '/' + pg, await page.evaluate(m => textAudit({ mobile: m }), mobile)); screens++;
      if (OUT && cname === '393-çokbüyük') await page.screenshot({ path: path.join(OUT, 't-' + dname + '-' + pg.replace('/', '-') + '.png'), fullPage: true });
    }
    await page.evaluate(() => App.UI.nav('ozet'));
    for (const [mname, code] of Object.entries(modals)) {
      const ok = await page.evaluate(code => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); try { (0, eval)(code); return true; } catch (e) { return String(e); } }, code);
      await page.waitForTimeout(mname === 'report' ? 300 : 200);
      if (ok !== true) { errors.push(dname + '/' + cname + '/' + mname + ': pencere açılamadı: ' + ok); continue; }
      note(dname + '/' + cname + '/pencere:' + mname, await page.evaluate(m => textAudit({ mobile: m }), mobile)); screens++;
      await page.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); });
    }
    await ctx.close();
  }
  const keys = Object.keys(found);
  keys.forEach(k => console.log('✗ ' + k + '\n     ' + found[k].length + ' ekranda, ör. ' + found[k].slice(0, 3).join(', ')));
  errors.forEach(e => console.log('✗ hata ' + e));
  const fail = keys.length + errors.length;
  console.log('\n' + (screens - (fail ? 1 : 0) * 0) + ' ekran tarandı. ' + (fail ? fail + ' sorun.' : 'Sorun bulunmadı.'));
  console.log((fail ? 0 : 1) + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
