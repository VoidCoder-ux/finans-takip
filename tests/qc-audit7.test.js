// Usage: node tests/qc-audit7.test.js
// Denetim 7 düzeltmeleri ve eklenenler (beklenen değerler elle hesaplandı; bugün 17 Ekim 2026 sabit; kurmaca veri, sunucu gerekmez):
//  1) Erken kapama: ihtiyaç/taşıt kredisinde erken ödeme ücreti yok; konutta kalan vade ≤36 ay %1, >36 ay %2
//  2) Hedefte "birikim hesabından gider olarak düş" seçeneği yok; katkı hesaptan para düşürmez
//  3) Kart ödemesi "Transfer ile girin" ipucu yalnız kart ödemesi gider olarak girildiyse
//  4) Tekrarlayan: haftalık, 3 ayda bir, yıllık (vadeler, otomatik kayıt, nakit akışı, liste, abonelik toplamı, düzenleme)
//  5) Hazır kategoriler (Kira, Aidat…), özel kategoriyi yeniden adlandırma ve birleştirme
//  6) Hesaplar sayfasında toplamlar
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const at = iso => new Date(iso + 'T09:00:00').getTime();
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now(),
  customCats: [{ name: 'Kira', emoji: '🏡', type: 'expense' }, { name: 'Evcil Hayvan', emoji: '🐾', type: 'expense' }] };
const ACC = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 50000, openingBalance: 50000, ts: at('2026-01-01') },
  { id: 'sv', name: 'Birikim', type: 'savings', owner: 'shared', balance: 20000, openingBalance: 20000, ts: at('2026-01-01') },
  { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: -3000, openingBalance: -3000, ts: at('2026-01-01'), statementDay: 5, dueOffset: 10, limit: 20000 }];
const TODAY = '2026-10-17';

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data, day) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date((day || TODAY) + 'T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS, pf_a: ACC, pf_t: [] }, data || {}));
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();

  // 1) Erken kapama ücreti
  {
    // Konut: 1.200.000, 120 ay, aylık %2 (vergisiz), ilk taksit 15 Ekim 2022 → 49 taksit ödendi, kalan 71 ay > 36 → %2
    // Konut 2: 400.000, 48 ay, aylık %2, ilk taksit 15 Mart 2024 → 32 ödendi, kalan 16 ≤ 36 → %1. İhtiyaç: ücret yok
    const L = [{ id: 'k1', name: 'Konut', kind: 'konut', principal: 1200000, term: 120, first: '2022-10-15', installment: 0, rate: 2, tax: false, accountId: '', prepay: [], closed: null, ts: 1 },
      { id: 'k2', name: 'Konut 2', kind: 'konut', principal: 400000, term: 48, first: '2024-03-15', installment: 0, rate: 2, tax: false, accountId: '', prepay: [], closed: null, ts: 1 },
      { id: 'i1', name: 'İhtiyaç', kind: 'ihtiyac', principal: 100000, term: 24, first: '2026-03-15', installment: 0, rate: 3, tax: true, accountId: '', prepay: [], closed: null, ts: 1 }];
    const { page, ctx } = await open({ pf_l: L });
    const r = await page.evaluate(() => S.loans().map(l => { const p = App.Loans.payoff(l); return [l.id, p.left, p.feeRate, Math.abs(p.fee - Math.round(p.bal * p.feeRate * 100) / 100) < 0.01, Math.abs(p.total - (p.bal + p.accrued + p.fee)) < 0.02]; }));
    eq('ücret: konut kalan 71 ay %2, konut kalan 16 ay %1, ihtiyaç 0', r, [['k1', 71, 0.02, true, true], ['k2', 16, 0.01, true, true], ['i1', 16, 0, true, true]]);
    await ctx.close();
  }

  // 2) Hedef katkı türleri: gider seçeneği yok; "sadece hedefe yaz" bakiye değiştirmez, transfer bakiyeyi taşır
  {
    const { page, ctx } = await open();
    const opts = await page.evaluate(() => [...document.querySelectorAll('#gTxnMode option')].map(o => o.value));
    eq('katkı türleri: yalnız "sadece hedefe yaz" ve transfer', opts, ['none', 'transfer']);
    await page.evaluate(() => { App.UI.nav('hedefler'); const set = (id, v) => { document.getElementById(id).value = v; };
      set('gName', 'Tatil'); set('gTarget', '30000'); set('gAccount', 'sv'); set('gTxnMode', 'none'); App.Goals.add(); });
    const r = await page.evaluate(() => { const g = S.goals()[0]; App.Goals.contribute(g.id, 2500, '2026-10-17', ''); return [App.Goals.total(S.goals()[0]), S.accounts().find(a => a.id === 'sv').balance, S.txns().length, App.Transactions.monthTotals('2026-10').expense]; });
    eq('sadece hedefe yaz: hedef 2.500, birikim hesabı 20.000 (değişmez), işlem yok, gider yok', r, [2500, 20000, 0, 0]);
    await ctx.close();
  }

  // 3) Kart ödemesi ipucu
  {
    const T = [{ id: 'x1', type: 'expense', amount: 500, category: 'Market', date: '2026-10-10', note: 'Migros', accountId: 'c', userId: 'u_a', ts: 1, balanceApplied: true }];
    const card = async (page) => (await page.evaluate(() => App.Insights.compute('2026-10').warnings.filter(w => w.title === 'Kredi kartı borcu').map(w => w.text)))[0];
    let o = await open({ pf_t: T });
    eq('kart ödemesini transfer ile giren aileye ipucu yok', await card(o.page), '₺3.500,00 kart borcu var; hesaplarda ₺70.000,00.');
    await o.ctx.close();
    o = await open({ pf_t: T.concat([{ id: 'x2', type: 'expense', amount: 2000, category: 'Kredi Kartı Ödemesi', date: '2026-09-15', note: 'Kart ödemesi', accountId: 'b', userId: 'u_a', ts: 2, balanceApplied: true }]) });
    eq('kart ödemesi gider olarak girildiyse ipucu var', await card(o.page), '₺3.500,00 kart borcu var; hesaplarda ₺68.000,00. Kart ödemesini "↔ Transfer" ile girin; "Kredi Kartı Ödemesi" gideri olarak girilince harcama iki kez gider sayılır.');
    await o.ctx.close();
  }

  // 4) Tekrarlayan sıklıkları
  {
    // Haftalık: Cumartesi 5 Eylül'den, 300 TL Pazar (Market, nakit gibi bankadan), otomatik; 3 ayda bir: 10 Ağustos'tan aidat 4.500;
    // yıllık: 20 Mart 2026 sigorta 12.000 (abonelik değil); yıllık abonelik 1.200 (1 Kasım 2025)
    const REC = [
      { id: 'rw', type: 'expense', amount: 300, category: 'Market', day: 5, freq: 'week', start: '2026-09-05', note: 'Semt pazarı', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: true, autoFrom: '2026-09', autoDone: '', ts: at('2026-09-01') },
      { id: 'rq', type: 'expense', amount: 4500, category: 'Aidat', day: 10, freq: 'q', start: '2026-08-10', note: 'Site aidatı (3 aylık)', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: true, autoFrom: '2026-08', autoDone: '', ts: at('2026-08-01') },
      { id: 'ry', type: 'expense', amount: 12000, category: 'Sigorta', day: 20, freq: 'y', start: '2026-03-20', note: 'Konut sigortası', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: at('2026-03-01') },
      { id: 'rs', type: 'expense', amount: 1200, category: 'Eğlence', day: 1, freq: 'y', start: '2025-11-01', note: 'Müzik (yıllık)', accountId: 'c', userId: 'u_a', isSubscription: true, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: at('2025-11-01') },
      { id: 'rm', type: 'expense', amount: 300, category: 'Eğlence', day: 3, note: 'Dizi', accountId: 'c', userId: 'u_a', isSubscription: true, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: at('2026-01-01') }];
    const { page, ctx } = await open({ pf_r: REC });
    eq('vadeler: haftalık (Eylül–Ekim Cumartesileri), 3 aylık (Ağu, Kas, Şub), yıllık (20 Mart)', await page.evaluate(() => { const r = id => S.recurring().find(x => x.id === id); return [App.Recurring.occ(r('rw'), '2026-09-01', '2026-10-17'), App.Recurring.occ(r('rq'), '2026-07-01', '2027-03-31'), App.Recurring.occ(r('ry'), '2026-01-01', '2027-12-31')]; }),
      [['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17'], ['2026-08-10', '2026-11-10', '2027-02-10'], ['2026-03-20', '2027-03-20']]);
    // Otomatik kayıt (açılışta): haftalık 7 kez (5 Eylül – 17 Ekim), 3 aylık 1 kez (10 Ağustos); yıllık otomatik değil
    eq('otomatik kayıt: pazar 7 × 300, aidat 10 Ağustos', await page.evaluate(() => [S.txns().filter(t => t.recurringId === 'rw').map(t => t.date).sort(), S.txns().filter(t => t.recurringId === 'rq').map(t => [t.date, t.amount, t.category]), S.txns().filter(t => t.recurringId === 'ry').length, S.accounts().find(a => a.id === 'b').balance]),
      [['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17'], [['2026-08-10', 4500, 'Aidat']], 0, 50000 - 2100 - 4500]);
    eq('yeniden açılınca ikinci kez yazılmaz', await (async () => { await page.reload(); await page.waitForTimeout(250); return page.evaluate(() => [S.txns().filter(t => t.recurringId === 'rw').length, S.txns().filter(t => t.recurringId === 'rq').length]); })(), [7, 1]);
    // Nakit akışı (60 gün, 16 Aralık'a kadar): pazar 24 Ekim … 12 Aralık (8 kez), aidat 10 Kasım, yıllık abonelik 1 Kasım (karta); sigorta yok (Mart)
    const cf = await page.evaluate(() => App.Cashflow.items(60).filter(x => /Tekrarlayan|Abonelik/.test(x.src)).map(x => [x.date, x.label, x.amount]));
    eq('nakit akışı: haftalık 8, 3 aylık 10 Kasım, yıllık abonelik 1 Kasım, aylık dizi 3 Kasım ve 3 Aralık', [cf.filter(x => x[1] === 'Semt pazarı').length, cf.filter(x => x[1] !== 'Semt pazarı')],
      [8, [['2026-11-01', 'Müzik (yıllık)', 1200], ['2026-11-03', 'Dizi', 300], ['2026-11-10', 'Site aidatı (3 aylık)', 4500], ['2026-12-03', 'Dizi', 300]]]);
    // Liste: kutu ve açıklama
    await page.evaluate(() => App.UI.nav('tekrarlayan')); await page.waitForTimeout(150);
    const li = await page.evaluate(() => [...document.querySelectorAll('#recList .rec-item')].map(x => [x.querySelector('.rec-day').innerText.replace(/\s+/g, ' ').trim(), x.querySelector('.rec-meta').innerText.replace(/\s+/g, ' ').trim()]));
    eq('liste: sıklık kutusu ve açıklaması', li, [['Her Cmt', 'Market · Her Cumartesi · Vadesiz'], ['3 ayda 10', 'Aidat · 3 ayda bir · 10 Ağu, Kas, Şub, May · Vadesiz'], ['Yılda 20', 'Sigorta · Her yıl 20 Mart · Vadesiz'], ['Yılda 1', 'Eğlence · Her yıl 1 Kasım · Kart'], ['Her 3', 'Eğlence · Her ayın 3. günü · Kart']]);
    eq('durum: haftalık son vade kayıtlı, sonraki vade', await page.evaluate(() => document.querySelector('#recList .rec-item').innerText.replace(/\s+/g, ' ')).then(t => [/Son vade kaydedildi \(17 Ekim 2026/.test(t), /Sonraki: 24 Ekim 2026/.test(t)]), [true, true]);
    // Abonelik toplamı: aylık 300 + yıllık 1.200 / 12 = 400
    eq('abonelik: aylık karşılık 400, yıllık 4.800', await page.evaluate(() => [...document.querySelectorAll('#subSummary .ss-val')].map(x => x.textContent)), ['₺400,00', '₺4.800,00']);
    // Formdan yıllık ekleme
    const add = await page.evaluate(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      set('recType', 'expense'); set('recCat', 'Vergi ve Harç'); set('recAmt', '6500'); set('recFreq', 'y'); const vis = [document.getElementById('recDayWrap').style.display, document.getElementById('recStartWrap').style.display];
      set('recStart', '2027-01-25'); set('recNote', 'MTV'); App.Recurring.add(); const r = S.recurring().find(x => x.note === 'MTV'); return [vis, r.freq, r.start, r.day, App.Recurring.when(r)]; });
    eq('form: yıllıkta gün yerine tarih; kayıt', add, [['none', ''], 'y', '2027-01-25', 25, 'Her yıl 25 Ocak']);
    // Düzenle: aylığa dön
    await page.evaluate(() => { const r = S.recurring().find(x => x.note === 'MTV'); App.Recurring.edit(r.id); }); await page.waitForTimeout(100);
    await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-pkey="freq"]').value = 'month'; h.querySelector('[data-pkey="day"]').value = '7'; h.querySelector('[data-act="ok"]').click(); });
    eq('düzenle: aylığa döner, başlangıç silinir', await page.evaluate(() => { const r = S.recurring().find(x => x.note === 'MTV'); return [r.freq || 'month', r.start || '', r.day, App.Recurring.when(r)]; }), ['month', '', 7, 'Her ayın 7. günü']);
    // Kaydet: yıllık sigortanın son vadesi (20 Mart) kaydedilmemiş → o tarihle
    await page.evaluate(() => App.Recurring.log('ry'));
    eq('yıllık "Kaydet": 20 Mart vadesi', await page.evaluate(() => S.txns().filter(t => t.recurringId === 'ry').map(t => [t.date, t.amount])), [['2026-03-20', 12000]]);
    await ctx.close();
  }

  // 5) Kategoriler: hazırlar, adlandırma, birleştirme
  {
    const T = [{ id: 'k1', type: 'expense', amount: 800, category: 'Evcil Hayvan', date: '2026-10-02', note: 'Mama', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: true },
      { id: 'k2', type: 'income', amount: 100, category: 'İade', refCat: 'Evcil Hayvan', date: '2026-10-03', note: 'İade', accountId: 'b', userId: 'u_a', ts: 2, balanceApplied: true },
      { id: 'k3', type: 'expense', amount: 1500, category: 'Aidat', date: '2026-10-05', note: 'Aidat', accountId: 'b', userId: 'u_a', ts: 3, balanceApplied: true },
      { id: 'k4', type: 'expense', amount: 20000, category: 'Kira', date: '2026-10-05', note: 'Kira', accountId: 'b', userId: 'u_a', ts: 4, balanceApplied: true }];
    const REC = [{ id: 'r1', type: 'expense', amount: 800, category: 'Evcil Hayvan', day: 2, note: 'Mama', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: false, autoFrom: '', autoDone: '', ts: 1 }];
    const RU = [{ id: 'ru1', field: 'note', value: 'mama', category: 'Evcil Hayvan', active: true, ts: 1 }];
    const { page, ctx } = await open({ pf_t: T, pf_r: REC, pf_ru: RU, pf_b: { 'Evcil Hayvan': 1000, Aidat: 2000 } });
    eq('hazır gider kategorileri', await page.evaluate(() => EC.slice(0, 18)), ['Yiyecek', 'Market', 'Ulaşım', 'Kira', 'Aidat', 'Faturalar', 'Eğlence', 'Sağlık', 'Giyim', 'Eğitim', 'Çocuk', 'Sigorta', 'Vergi ve Harç', 'Ev ve Bakım', 'Kredi Ödemesi', 'Kredi Kartı Ödemesi', 'Borç Ödemesi', 'Diğer']);
    eq('eski özel "Kira" hazır kategoriye karıştı (tek), 50/30/20 grupları ihtiyaç', await page.evaluate(() => [EC.filter(c => c === 'Kira').length, (S.settings().customCats || []).map(c => c.name), ['Kira', 'Aidat', 'Çocuk', 'Sigorta', 'Vergi ve Harç', 'Ev ve Bakım'].map(c => App.Split.groupOf(c))]),
      [1, ['Evcil Hayvan'], ['need', 'need', 'need', 'need', 'need', 'need']]);
    await page.evaluate(() => { App.UI.nav('ayarlar'); App.Categories.render(); }); await page.waitForTimeout(100);
    eq('düzenle düğmesi: özel anlamlı kategorilerde yok', await page.evaluate(() => { const has = n => [...document.querySelectorAll('#catList .cat-chip')].some(c => c.textContent.indexOf(n) >= 0 && c.querySelector('[aria-label="Kategoriyi düzenle ya da birleştir"]')); return ['Evcil Hayvan', 'Aidat', 'Kredi Kartı Ödemesi', 'İade', 'Maaş'].map(has); }), [true, true, false, false, false]);
    // Adını değiştir: Evcil Hayvan → Kedi
    await page.evaluate(() => App.Categories.edit('Evcil Hayvan'));
    await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-pkey="mode"]').value = 'rename'; h.querySelector('[data-pkey="name"]').value = 'Kedi'; h.querySelector('[data-act="ok"]').click(); });
    eq('yeniden adlandır: işlem, iade, tekrarlayan, kural, bütçe', await page.evaluate(() => [S.txns().find(t => t.id === 'k1').category, S.txns().find(t => t.id === 'k2').refCat, S.recurring()[0].category, S.rules()[0].category, S.budgets().Kedi, 'Evcil Hayvan' in S.budgets(), (S.settings().customCats || []).map(c => c.name), EC.indexOf('Kedi') >= 0]),
      ['Kedi', 'Kedi', 'Kedi', 'Kedi', 1000, false, ['Kedi'], true]);
    // Var olan ada yeniden adlandırılamaz
    await page.evaluate(() => App.Categories.edit('Kedi'));
    const err = await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-pkey="mode"]').value = 'rename'; h.querySelector('[data-pkey="name"]').value = 'Market'; h.querySelector('[data-act="ok"]').click(); return [document.querySelectorAll('.app-dialog-holder .modal-bd.show').length > 0, [...document.querySelectorAll('.toast')].map(t => t.textContent).pop()]; });
    eq('var olan ada adlandırma: uyarı, pencere açık', [err[0], /zaten var/.test(err[1])], [true, true]);
    await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-act="cancel"]').click(); });
    // Hazır kategoriyi birleştir: Aidat → Faturalar (Aidat listede kalır, işlem taşınır; Faturalar'da bütçe yok → limit taşınır)
    await page.evaluate(() => App.Categories.edit('Aidat'));
    const fields = await page.evaluate(() => [...[...document.querySelectorAll('.app-dialog-holder')].pop().querySelectorAll('[data-pkey]')].map(x => x.getAttribute('data-pkey')));
    eq('hazır kategoride yalnız birleştirme seçeneği', fields, ['target']);
    await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-pkey="target"]').value = 'Faturalar'; h.querySelector('[data-act="ok"]').click(); });
    eq('birleştir: işlem Faturalar\'a, bütçe taşındı, Aidat hazır listede kalır', await page.evaluate(() => [S.txns().find(t => t.id === 'k3').category, S.budgets().Faturalar, 'Aidat' in S.budgets(), EC.indexOf('Aidat') >= 0, App.Transactions.catTotals('2026-10').Faturalar]), ['Faturalar', 2000, false, true, 1500]);
    // Özel kategoriyi birleştir: Kedi → Diğer; özel kategori silinir
    await page.evaluate(() => App.Categories.edit('Kedi'));
    await page.evaluate(() => { const h = [...document.querySelectorAll('.app-dialog-holder')].pop(); h.querySelector('[data-pkey="mode"]').value = 'merge'; h.querySelector('[data-pkey="target"]').value = 'Diğer'; h.querySelector('[data-act="ok"]').click(); });
    eq('özel kategoriyi birleştir: silinir, iade de taşınır', await page.evaluate(() => [(S.settings().customCats || []).length, EC.indexOf('Kedi'), S.txns().find(t => t.id === 'k1').category, S.txns().find(t => t.id === 'k2').refCat, S.budgets().Diğer]), [0, -1, 'Diğer', 'Diğer', 1000]);
    await ctx.close();
  }

  // 6) Hesaplar sayfası toplamları: banka 50.000 + birikim 20.000 = 70.000; kart borcu 3.000; borç düşünce 67.000
  {
    const { page, ctx } = await open();
    await page.evaluate(() => App.UI.nav('hesaplar')); await page.waitForTimeout(150);
    eq('Hesaplar: toplam, kart borcu, borç düşünce', await page.evaluate(() => [...document.querySelectorAll('#accTotals .mc')].map(c => c.innerText.replace(/\s+/g, ' ').trim())),
      ['🏦 ₺70.000,00 Hesaplardaki para · 2 hesap', '💳 −₺3.000,00 Kart borcu · 1 kart', '⚖️ ₺67.000,00 Kart borcu düşünce']);
    await ctx.close();
  }

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
