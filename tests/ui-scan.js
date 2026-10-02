// Usage: node tests/ui-scan.js [ekran-görüntüsü-klasörü]
// Tüm sayfaları telefon/tablet/masaüstü × koyu/açık temada gezer: konsol hatası, yatay taşma, küçük dokunma alanı,
// WCAG AA kontrast, adsız düğme, etiketsiz alan, yinelenen id, modal sığması; ICS/rapor/CSV/mutabakat/çevrimdışı.
// Sorun bulursa 1 ile çıkar. Playwright yoksa atlanır.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; UI taraması atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });

function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function seed() {
  const now = new Date(), A = 'a1700000000000_bank', C = 'a1700000000000_card', V = 'a1700000000000_save', P = 'a1700000000000_pers';
  const accs = [
    { id: A, name: 'Ziraat Bankası Vadesiz', type: 'bank', owner: 'shared', balance: 48250.75, openingBalance: 0, ts: 1 },
    { id: C, name: 'Bonus Platinum Kredi Kartı', type: 'card', owner: 'shared', statementDay: 15, balance: -12840.5, openingBalance: 0, ts: 2 },
    { id: V, name: 'Birikim', type: 'savings', owner: 'shared', balance: 150000, openingBalance: 0, ts: 3 },
    { id: P, name: 'Ayşe Nakit Cep Harçlığı ve Market Alışverişleri Hesabı Uzun', type: 'cash', owner: 'personal', userId: 'u_partner', balance: 1250, openingBalance: 0, ts: 4 }
  ];
  const cats = ['Market', 'Yiyecek', 'Ulaşım', 'Faturalar', 'Eğlence', 'Sağlık', 'Giyim', 'Eğitim'];
  const t = []; let k = 0;
  for (let m = 5; m >= 0; m--) {
    const d0 = new Date(now.getFullYear(), now.getMonth() - m, 1);
    t.push({ id: 't1700000000000_s' + (k++), type: 'income', amount: 85000, category: 'Maaş', date: iso(new Date(d0.getFullYear(), d0.getMonth(), 1)), note: 'Maaş', accountId: A, userId: 'u_self', ts: k, balanceApplied: true });
    for (let i = 0; i < 18; i++) {
      const day = 1 + ((i * 7 + m) % 27); const dt = new Date(d0.getFullYear(), d0.getMonth(), day); if (dt > now) continue;
      t.push({ id: 't1700000000000_e' + (k++), type: 'expense', amount: Math.round((150 + (i * 397 + m * 131) % 4200) * 100) / 100, category: cats[(i + m) % cats.length], date: iso(dt), note: i % 3 ? 'Migros Kadıköy şubesi uzun açıklama metni' : '', accountId: i % 2 ? C : A, userId: i % 4 ? 'u_self' : 'u_partner', ts: k, balanceApplied: true });
    }
  }
  const plan = 'p1700000000000_plan';
  for (let i = 0; i < 6; i++) { const dt = new Date(now.getFullYear(), now.getMonth() - 2 + i, 10); t.push({ id: 't1700000000000_i' + i, type: 'expense', amount: 2500, category: 'Giyim', date: iso(dt), note: 'Laptop (' + (i + 1) + '/6)', accountId: C, userId: 'u_self', ts: 900 + i, balanceApplied: dt <= now, installment: { planId: plan, index: i + 1, total: 6, totalAmount: 15000, name: 'Laptop', startDate: iso(new Date(now.getFullYear(), now.getMonth() - 2, 10)), balanceApplied: dt <= now } }); }
  t.push({ id: 't1700000000000_tro', type: 'expense', amount: 10000, category: 'Transfer', date: iso(now), note: 'Kart ödemesi', accountId: A, userId: 'u_self', ts: 999, balanceApplied: true, transferId: 'tr1700000000000_aaaa' });
  t.push({ id: 't1700000000000_tri', type: 'income', amount: 10000, category: 'Transfer', date: iso(now), note: 'Kart ödemesi', accountId: C, userId: 'u_self', ts: 1000, balanceApplied: true, transferId: 'tr1700000000000_aaaa' });
  return {
    pf_a: accs, pf_t: t,
    pf_s: { onboarded: true, theme: 'dark', rates: { USD: 41.2, EUR: 48.1, GBP: 55.3, GOLD_GRAM: 4350, GOLD_QUARTER: 7100, GOLD_FULL: 28300, FUND: 1, updated: Date.now(), provider: 'Test' }, portfolioTargets: { USD: 30, GOLD_GRAM: 50, FUND: 20 }, users: [{ id: 'u_self', name: 'Osman', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Ayşe', emoji: '👩‍👧', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() },
    pf_b: { Market: 12000, Yiyecek: 5000, Eğlence: 1500, Faturalar: 4000 },
    pf_bm: { Eğlence: { carryOver: true, carryStart: iso(new Date(now.getFullYear(), now.getMonth() - 3, 1)).slice(0, 7) } },
    pf_r: [
      { id: 'r1700000000000_r001', type: 'expense', amount: 449.9, category: 'Faturalar', day: 5, note: 'Türk Telekom Fiber İnternet', accountId: C, userId: 'u_self', isSubscription: false, active: true, autoLog: true, autoFrom: iso(now).slice(0, 7), ts: 1 },
      { id: 'r1700000000000_r002', type: 'expense', amount: 229.99, category: 'Eğlence', day: 12, note: 'Netflix', accountId: C, userId: 'u_partner', isSubscription: true, active: true, ts: 2 },
      { id: 'r1700000000000_r003', type: 'expense', amount: 17500, category: 'Faturalar', day: 1, note: 'Kira', accountId: A, userId: 'u_self', isSubscription: false, active: false, ts: 3 }
    ],
    pf_d: [
      { id: 'd1700000000000_d001', direction: 'lent', person: 'Çağrıhan Gökçe Özdemiroğlu (Mehmet Yılmaz’ın kardeşi)', amount: 1234567.89, date: iso(new Date(now.getFullYear(), now.getMonth() - 1, 3)), hasDue: true, dueDate: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12)), note: 'Araba tamiri', payments: [{ id: 'p1700000000000_p001', amount: 2500, date: iso(now) }], settled: false, ts: 1 },
      { id: 'd1700000000000_d002', direction: 'borrowed', person: 'Kardeşim', amount: 3000, date: iso(new Date(now.getFullYear(), now.getMonth() - 3, 3)), note: '', payments: [{ id: 'p1700000000000_p002', amount: 3000, date: iso(new Date(now.getFullYear(), now.getMonth() - 1, 3)) }], settled: true, ts: 2 }
    ],
    pf_g: [{ id: 'g1700000000000_g001', name: 'Yaz Tatili — Kaş, Kalkan ve Fethiye Tekne Turu Dahil', target: 60000, emoji: '🏖️', accountId: V, txnMode: 'none', contributions: [{ id: 'c1700000000000_c001', amount: 22000, date: iso(now), note: '' }], done: null, ts: 1 }],
    pf_f: [{ id: 'yf1700000000000_f001', name: 'Kasko', amount: 24000, dueMonth: ((now.getMonth() + 3) % 12) + 1, contributed: 8000, ts: 1 }, { id: 'yf1700000000000_f002', name: 'MTV', amount: 6800, dueMonth: 7, contributed: 0, ts: 2 }],
    pf_p: [{ id: 'pa1700000000000_p001', type: 'USD', qty: 1500, cost: 33.5, currentPrice: 0, label: '', ts: 1 }, { id: 'pa1700000000000_p002', type: 'GOLD_GRAM', qty: 42.5, cost: 2900, currentPrice: 0, label: 'Düğün', ts: 2 }, { id: 'pa1700000000000_p003', type: 'FUND', qty: 25431.123456, cost: 0.9, currentPrice: 1.184523, label: 'TTE Fon', ts: 3 }],
    pf_ru: [{ id: 'ru1700000000000_r001', field: 'note', value: 'migros', category: 'Market', active: true, ts: 1 }],
    pf_sq: [{ id: 'sqsms1_a', text: 'Hesabinizdan AYSE YILMAZ adina 2.000,00 TL FAST ile gonderilmistir. Yapi Kredi', label: 'abcd1234_u_self', receivedAt: Date.now(), reason: 'Aile içi ya da kendi hesaplarınız arası aktarım olabilir; aktarımsa Yoksay deyin', p: { type: 'expense', amount: 2000, date: iso(now), note: 'Giden para: Ayse Yılmaz', category: 'Diğer', accountId: '', last4: '' }, ts: 1 }],
    pf_nw: [{ month: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)).slice(0, 7), total: 210000 }, { month: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7), total: 225000 }]
  };
}

// Sayfa içinde çalışır: görünür öğeler için taşma, dokunma alanı, kontrast, erişilebilir ad, etiket
function audit(opts) {
  const vw = innerWidth, out = { overflowX: document.documentElement.scrollWidth - vw, wide: [], small: [], contrast: [], noName: [], noLabel: [], dupIds: [] };
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],.sec-collapsed,.page:not(.active)'); };
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30).replace(/\s+/g, ' ') + '"';
  const scope = document.querySelector('.page.active') ? [document.querySelector('.page.active'), document.querySelector('.bottom-nav'), document.querySelector('.sidebar'), ...document.querySelectorAll('.modal-bd.show')] : [document.body];
  const all = []; scope.forEach(s => s && s.querySelectorAll('*').forEach(e => all.push(e)));
  all.forEach(el => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !el.closest('.stats-table-wrap,.sub-tabs,.import-preview,canvas') && getComputedStyle(el).position !== 'fixed') out.wide.push(desc(el) + ' right=' + Math.round(r.right));
    const interactive = el.matches('button,a,[role=button],select,input:not([type=hidden]),textarea');
    if (interactive && opts.mobile && (r.height < 32 || r.width < 32) && !el.matches('input[type=checkbox],input[type=radio]')) out.small.push(desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.matches('button,[role=button]')) { const name = (el.innerText || '').replace(/[\s✕✎▸▾⏸▶×＋−+]/g, '') || el.getAttribute('aria-label') || el.getAttribute('title'); if (!name && !(el.innerText || '').trim()) out.noName.push(desc(el)); else if (!(el.getAttribute('aria-label') || el.getAttribute('title')) && /^[\s✕✎▸▾⏸▶×]+$/.test(el.innerText || '')) out.noName.push(desc(el)); }
    if (el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) { const lab = (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('placeholder'); if (!lab) out.noLabel.push(desc(el)); }
    // kontrast: doğrudan metin taşıyan öğeler
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own && !el.closest('canvas')) {
      const cs = getComputedStyle(el); const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      let fg = parse(cs.color); if (!fg) return;
      let bg = null, n = el, layers = [];
      while (n && n.nodeType === 1) { const b = getComputedStyle(n); if (b.backgroundImage && b.backgroundImage !== 'none') { bg = 'img'; break; } const c = parse(b.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; } n = n.parentElement; }
      if (bg === 'img') return;
      let base = { r: 255, g: 255, b: 255 }; const bodyBg = parse(getComputedStyle(document.body).backgroundColor); if (bodyBg) base = bodyBg;
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; base = { r: L.r * L.a + base.r * (1 - L.a), g: L.g * L.a + base.g * (1 - L.a), b: L.b * L.a + base.b * (1 - L.a) }; }
      let op = 1; for (let q = el; q && q.nodeType === 1; q = q.parentElement) op *= parseFloat(getComputedStyle(q).opacity);
      fg = { r: fg.r * fg.a * op + base.r * (1 - fg.a * op), g: fg.g * fg.a * op + base.g * (1 - fg.a * op), b: fg.b * fg.a * op + base.b * (1 - fg.a * op) };
      const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const L1 = lum(fg), L2 = lum(base), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700, large = size >= 24 || (bold && size >= 18.66);
      if (ratio < (large ? 3 : 4.5)) out.contrast.push(desc(el) + ' ' + ratio.toFixed(2) + ':1 ' + cs.color + ' ' + Math.round(size) + 'px');
    }
  });
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); out.dupIds = Object.keys(ids).filter(k => ids[k] > 1);
  ['wide', 'small', 'contrast', 'noName', 'noLabel'].forEach(k => { out[k] = Array.from(new Set(out[k])); });
  return out;
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const report = { errors: [], pages: {}, modals: {}, functional: [] };
  const views = [['mobile', 390, 844], ['tablet', 768, 1024], ['desktop', 1280, 900]];
  const pages = ['ozet', 'hesaplar', 'aile', 'islemler', 'tekrarlayan', 'taksitler', 'borclar', 'butce', 'portfoy', 'istatistikler', 'hedefler', 'ayarlar'];
  for (const [vname, w, h] of views) for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', isMobile: vname === 'mobile', hasTouch: vname !== 'desktop' });
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(vname + '/' + theme + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(vname + '/' + theme + ' console: ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400) report.errors.push(vname + '/' + theme + ' http ' + r.status() + ': ' + r.url()); });
    page.on('requestfailed', r => { if (!/truncgil|frankfurter|deepseek/.test(r.url())) report.errors.push(vname + '/' + theme + ' requestfailed: ' + r.url()); });
    await page.goto(base);
    const sd = seed(); sd.pf_s.theme = theme;
    await page.evaluate(sd => { localStorage.clear(); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd);
    await page.route(/truncgil|frankfurter/, r => r.abort());
    await page.reload(); await page.waitForTimeout(500);
    await page.evaluate(() => { window.print = () => {}; });
    for (const pg of pages) {
      await page.evaluate(pg => { document.querySelectorAll('.toast').forEach(t => t.remove()); App.UI.nav(pg); window.scrollTo(0, 0); }, pg);
      if (pg === 'butce') await page.evaluate(() => App.UI.subTab('butce', 'limits'));
      await page.waitForTimeout(pg === 'istatistikler' ? 600 : 150);
      const a = await page.evaluate(audit, { mobile: vname === 'mobile' });
      report.pages[vname + '/' + theme + '/' + pg] = a;
      if (theme === 'dark' || vname === 'mobile') OUT && await page.screenshot({ path: OUT + '/scan-' + vname + '-' + theme + '-' + pg + '.png', fullPage: true });
    }
    // Modallar
    const modals = {
      more: 'App.UI.moreMenu()', backup: 'App.Backup.open()', setup: 'App.Onboarding.open()', cash: 'App.Cashflow.open()', report: 'App.Report.open()',
      editTxn: 'App.Transactions.edit(S.txns().find(t=>!t.transferId&&!t.installment).id)', editInst: 'App.Transactions.edit(S.txns().find(t=>t.installment).id)',
      editTrf: 'App.Transactions.edit(S.txns().find(t=>t.transferId).id)', sell: "App.Portfolio.sell('pa1700000000000_p001')", targets: 'App.Portfolio.editTargets()',
      fundPaid: "App.YearlyFund.markPaid('yf1700000000000_f001')", recEdit: "App.Recurring.edit('r1700000000000_r001')", debtEdit: "App.Debts.edit('d1700000000000_d001')",
      smsAccept: "App.BankSms.accept('sqsms1_a')",
      statement: "App.Statement._load('ekstre.pdf',{lines:['Akbank Kredi Kartı Hesap Özeti','28.09.2026 MIGROS KADIKOY 245,50','29.09.2026 ÖDEME - TEŞEKKÜR EDERİZ -5.000,00','30.09.2026 ÇOK UZUN BİR İŞYERİ ADI OLAN MAĞAZA TİCARET ANONİM ŞİRKETİ İSTANBUL 1.234,56']});App.Statement.open()"
    };
    for (const [name, code] of Object.entries(modals)) {
      await page.evaluate(code => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); eval(code); }, code);
      await page.waitForTimeout(120);
      const m = await page.evaluate(() => { const md = [...document.querySelectorAll('.modal-bd.show .modal')].pop(); if (!md) return { missing: true }; const r = md.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth, scroll: md.scrollHeight > md.clientHeight + 2 }; });
      const a = await page.evaluate(audit, { mobile: vname === 'mobile' });
      report.modals[vname + '/' + theme + '/' + name] = { box: m, small: a.small, contrast: a.contrast, noName: a.noName, noLabel: a.noLabel, wide: a.wide };
      if (OUT && theme === 'dark' && vname === 'mobile') await page.screenshot({ path: OUT + '/scanm-' + name + '.png' });
      await page.keyboard.press('Escape');
    }
    await ctx.close();
  }
  // Dokunma engeli: görünen her düğme/alan ekranın ortasına kaydırılır ve ortasına dokunulunca gerçekten kendisi mi yakalıyor bakılır.
  // Yüksek çözünürlüklü telefon (dpr 3) + yeni kullanıcı verisi (grafik yerine mesaj çizilir) + sayfalar arası birkaç gidiş-dönüş.
  report.blocked = [];
  {
    const fresh = () => { const sd = seed(); sd.pf_t = []; sd.pf_nw = []; sd.pf_p = []; sd.pf_d = []; sd.pf_g = [];
      sd.pf_r = [{ id: 'r1700000000000_s001', type: 'income', amount: 60000, category: 'Maaş', day: 15, note: 'Maaşım', accountId: 'a1700000000000_bank', userId: 'u_self', active: true, ts: 1 },
        { id: 'r1700000000000_s002', type: 'income', amount: 45000, category: 'Maaş', day: 20, note: 'Eşimin maaşı', accountId: 'a1700000000000_bank', userId: 'u_partner', active: true, ts: 2 }]; return sd; };
    for (const [dname, dev] of [['iphone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desktop2x', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }]])
      for (const [sname, sd] of [['dolu', seed()], ['yeni', fresh()]]) {
        const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, dev)); const page = await ctx.newPage();
        page.on('pageerror', e => report.errors.push(dname + '/' + sname + ' pageerror: ' + e.message));
        await page.route(/truncgil|frankfurter/, r => r.abort());
        await page.goto(base); await page.evaluate(sd => { localStorage.clear(); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd);
        await page.reload(); await page.waitForTimeout(500);
        for (let round = 0; round < 2; round++) for (const pg of pages) {
          await page.evaluate(pg => { document.querySelectorAll('.toast').forEach(t => t.remove()); App.UI.nav(pg); if (pg === 'ozet') App.Inflation.setMode(App.Inflation.getMode()); }, pg);
          await page.waitForTimeout(pg === 'istatistikler' ? 500 : 120);
          if (round === 0) continue;
          const bad = await page.evaluate(() => {
            const out = [], root = document.querySelector('.page.active');
            const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24).replace(/\s+/g, ' ') + '"';
            root.querySelectorAll('button,a,[onclick],select,input:not([type=hidden]),textarea').forEach(el => {
              if (el.closest('[hidden],.sec-collapsed') || el.disabled) return;
              const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return;
              el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
              const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
              const hit = document.elementFromPoint(x, y);
              if (!hit || hit === el || el.contains(hit) || hit.contains(el) && hit.tagName === 'LABEL' || (el.labels && [...el.labels].some(l => l.contains(hit)))) return;
              if (hit.closest('.bottom-nav,.fab,.mob-header,.topbar')) return; // sabit gezinme çubukları (kaydırılabilir alanın kenarı)
              out.push(desc(el) + ' ⟵ ' + desc(hit));
            });
            window.scrollTo(0, 0); return out;
          });
          bad.forEach(b => report.blocked.push(dname + '/' + sname + '/' + pg + ': ' + b));
        }
        await ctx.close();
      }
  }
  // İşlevsel: ICS, rapor HTML, CSV gidiş-dönüş, çevrimdışı açılış
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push('func pageerror: ' + e.message));
    await page.goto(base); await page.evaluate(sd => { localStorage.clear(); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
    await page.reload(); await page.waitForTimeout(800);
    const ics = await page.evaluate(() => App.ICS.buildCalendar(12));
    const icsLines = ics.ics.split('\r\n'); const begins = icsLines.filter(l => l === 'BEGIN:VEVENT').length, ends = icsLines.filter(l => l === 'END:VEVENT').length;
    const uids = icsLines.filter(l => l.startsWith('UID:')); report.functional.push('ICS: ' + ics.count + ' etkinlik, BEGIN/END ' + begins + '/' + ends + ', tekil UID ' + new Set(uids).size + '/' + uids.length + ', 75+ karakter satır: ' + icsLines.filter(l => new TextEncoder().encode(l).length > 75).length);
    const rep = await page.evaluate(() => { window.print = () => {}; App.Report.generateMonth(tm()); const h = document.getElementById('printHolder'); return { len: h.innerHTML.length, rows: h.querySelectorAll('.pr-txns tbody tr, .pr-txns tr').length }; });
    report.functional.push('Rapor: ' + JSON.stringify(rep));
    const csv = await page.evaluate(async () => { let out = null; const o = URL.createObjectURL; URL.createObjectURL = b => { out = b; return o.call(URL, b); }; App.Transactions.exportCSV(); URL.createObjectURL = o; const text = await out.text(); const rows = parseCSVText(text); return { rows: rows.length, cols: rows[0].length, txns: S.txns().length, badAmt: rows.slice(1).filter(r => csvAmount(r[3]) === null).length, badDate: rows.slice(1).filter(r => !csvDate(r[0])).length }; });
    report.functional.push('CSV dışa aktarım yeniden okunuyor: ' + JSON.stringify(csv));
    const nw = await page.evaluate(() => { const n = App.NetWorth.compute(); const acc = S.accounts().reduce((s, a) => s + a.balance, 0); return { total: Math.round(n.total * 100) / 100, parts: Math.round((n.accounts + n.portfolio + n.lent - n.borrowed) * 100) / 100, acc: Math.round(acc * 100) / 100, accMatch: Math.round(n.accounts * 100) === Math.round(acc * 100) }; });
    report.functional.push('Net servet tutarlılığı: ' + JSON.stringify(nw));
    const recon = await page.evaluate(() => { const today = td(); return S.accounts().map(a => { let c = a.openingBalance; S.txns().forEach(t => { if (t.accountId === a.id && isBalanceApplied(t, today)) c += t.type === 'income' ? t.amount : -t.amount; }); return [a.name, Math.round((a.balance - c) * 100) / 100]; }); });
    report.functional.push('Bakiye mutabakatı (fark): ' + JSON.stringify(recon));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base); await page.waitForTimeout(1500);
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
    await page.reload(); await page.waitForTimeout(800);
    await ctx.setOffline(true);
    let offlineOk = false; try { await page.reload(); await page.waitForFunction(() => window.App && App.UI, null, { timeout: 5000 }); offlineOk = true; } catch (e) {}
    const chart = offlineOk ? await page.evaluate(() => !!window.Chart) : false;
    report.functional.push('Service worker kayıtlı: ' + sw + ' · çevrimdışı açılış: ' + offlineOk + ' · grafik kütüphanesi çevrimdışı: ' + chart);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (OUT) fs.writeFileSync(OUT + '/scan-report.json', JSON.stringify(report, null, 1));
  // Özet
  const agg = k => { const m = {}; Object.entries(report.pages).forEach(([key, v]) => v[k].forEach(x => { (m[x] = m[x] || []).push(key); })); return m; };
  console.log('ERRORS', report.errors.length, report.errors.slice(0, 15));
  const ox = Object.entries(report.pages).filter(([k, v]) => v.overflowX > 1).map(([k, v]) => k + ' +' + v.overflowX); console.log('OVERFLOW-X', ox);
  for (const k of ['wide', 'noName', 'noLabel', 'dupIds']) { const m = k === 'dupIds' ? (() => { const r = {}; Object.entries(report.pages).forEach(([key, v]) => v.dupIds.forEach(x => (r[x] = r[x] || []).push(key))); return r; })() : agg(k); console.log(k.toUpperCase(), Object.keys(m).length); Object.entries(m).slice(0, 25).forEach(([x, ks]) => console.log('  ', x, '×' + ks.length, ks[0])); }
  const sm = agg('small'); console.log('SMALL (mobile)', Object.keys(sm).length); Object.entries(sm).slice(0, 40).forEach(([x, ks]) => console.log('  ', x, '×' + ks.length, ks[0]));
  const ct = agg('contrast'); console.log('CONTRAST', Object.keys(ct).length); Object.entries(ct).sort((a, b) => b[1].length - a[1].length).slice(0, 40).forEach(([x, ks]) => console.log('  ', x, '×' + ks.length, ks[0]));
  console.log('MODALS'); Object.entries(report.modals).forEach(([k, v]) => { const b = v.box; const bad = b.missing || b.top < -1 || b.bottom > b.vh + 1 || b.left < -1 || b.right > b.vw + 1; if (bad || v.noName.length || v.noLabel.length || v.wide.length) console.log('  ', k, JSON.stringify(b), v.noName.slice(0, 3), v.noLabel.slice(0, 3), v.wide.slice(0, 3)); });
  console.log('BLOCKED (dokunulamayan)', report.blocked.length); report.blocked.slice(0, 40).forEach(x => console.log('  ', x));
  console.log('FUNCTIONAL'); report.functional.forEach(x => console.log('  ', x));
  const issues = report.errors.length + report.blocked.length + Object.values(report.pages).reduce((n, v) => n + (v.overflowX > 1 ? 1 : 0) + v.wide.length + v.small.length + v.contrast.length + v.noName.length + v.noLabel.length + v.dupIds.length, 0)
    + Object.values(report.modals).filter(v => { const b = v.box; return b.missing || b.top < -1 || b.bottom > b.vh + 1 || b.left < -1 || b.right > b.vw + 1 || v.noName.length || v.noLabel.length || v.wide.length; }).length;
  console.log('\n' + (issues ? issues + ' sorun bulundu' : 'Sorun bulunmadı'));
  process.exit(issues ? 1 : 0);
});
