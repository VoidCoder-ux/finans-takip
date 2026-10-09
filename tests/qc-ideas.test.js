// Usage: node tests/qc-ideas.test.js
// Denetim önerileri (beklenen değerler elle hesaplandı; bugün sabit):
//  1) Yaklaşan Ödemeler "bankada ne kalır": hesaplardaki paradan başlar, kart ekstresi son ödeme gününde düşer, kartla yapılacak
//     harcama "karta yazılır" (o gün hesaptan çıkmaz, ekstresine eklenir); kesim günü olmayan kartın borcu bugünden düşer.
//  2) Ay bitmediyse geçen ay yalnız aynı günleriyle kıyaslanır (İstatistikler, Insights, rapor); planlı kayıt kategoriye girmez.
//  3) Eksiye düşen nakit/banka hesabı: Özet uyarısı, Bakiyeyi Düzelt, KMH için kapatma, hesap kartı ve İstatistikler.
//  4) İade hangi harcamanın iadesiyse o kategoriden (ve bütçesinden) düşer: elle, banka mesajı, ekstre; düzenleme; tahmin.
//  5) Ay başı özeti: Özet kartı (ilk hafta), bildirim planı (ayın 1'i), service worker ayrı bildirim, uygulama içi bildirim.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };
const at = iso => new Date(iso + 'T10:00:00').getTime();
const tx = (id, type, amount, date, accountId, o) => Object.assign({ id, type, amount, category: type === 'income' ? 'Maaş' : 'Market', date, note: id, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, o || {});
const bank = (id, balance, o) => Object.assign({ id, name: 'Vadesiz ' + id, type: 'bank', owner: 'shared', balance, openingBalance: balance, ts: at('2026-08-01') }, o || {});
const card = (id, sd, off, balance, o) => Object.assign({ id, name: 'Kart ' + id, type: 'card', owner: 'shared', statementDay: sd, dueOffset: off, balance, openingBalance: balance, ts: at('2026-08-01') }, o || {});
const rec = (id, amount, day, accountId, o) => Object.assign({ id, type: 'expense', amount, category: 'Faturalar', day, note: id, accountId, userId: 'u_a', active: true, ts: 1 }, o || {});

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data, day, init) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (init) await page.addInitScript(init);
    await page.clock.setFixedTime(new Date((day || '2026-10-08') + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS }, data));
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const flat = s => String(s).replace(/\s+/g, ' ').trim();

  // ---- 1) Yaklaşan Ödemeler: bugün 8 Ekim ----
  // Kart k: kesim 4'ü, son ödeme +10 gün. Son ekstre 4 Ekim (son ödeme 14 Ekim); 6 Ekim'de 1.200 harcama → borç 6.200,
  //   dönem borcu 5.000 (14 Ekim), sonraki ekstreye 1.200 (4 Kasım kesim, 14 Kasım son ödeme).
  // Netflix 230 her ayın 12'si kartla: 12 Ekim harcaması 4 Kasım ekstresine (14 Kasım). Kira 7.500 her ayın 20'si bankadan.
  // 15 Ekim planlı maaş 30.000 bankaya. Kesim günü olmayan kart n: borç 800 bugünden düşer. Banka 20.000.
  {
    const { page, ctx } = await open({
      pf_a: [bank('b', 20000), card('k', 4, 10, -5000), card('n', null, null, -800)],
      pf_t: [tx('c1', 'expense', 1200, '2026-10-06', 'k'), tx('m1', 'income', 30000, '2026-10-15', 'b', { balanceApplied: false })],
      pf_r: [rec('Netflix', 230, 12, 'k', { isSubscription: true, category: 'Eğlence' }), rec('Kira', 7500, 20, 'b')]
    });
    const r = await page.evaluate(() => {
      const it = d => App.Cashflow.items(d).map(x => [x.date, x.label, x.amount, x.type, x.src, x.card || '', x.cardPay || '']);
      const s30 = App.Cashflow.summary(30), s60 = App.Cashflow.summary(60);
      App.UI.nav('ozet'); App.Cashflow.renderMini();
      return { i30: it(30), i60: it(60).filter(x => x[0] > '2026-11-07'), s30: [s30.start, s30.end, s30.min, s30.cardPays, s30.noCutDebt], s60: [s60.end, s60.min], mini: document.getElementById('cashflowMini').innerText.replace(/\s+/g, ' ') };
    });
    eq('30 gün: Netflix karta yazılır, 14 Ekim kart ekstresi 5.000, 15 Ekim maaş, 20 Ekim kira', r.i30, [
      ['2026-10-12', 'Netflix', 230, 'expense', 'Abonelik', 'k', ''],
      ['2026-10-14', '💳 Kart k ekstresi', 5000, 'expense', 'Kart ekstresi', '', 'k'],
      ['2026-10-15', 'Eğlence', 30000, 'income', 'Planlı', '', ''].map((v, i) => i === 1 ? 'Maaş' : v),
      ['2026-10-20', 'Kira', 7500, 'expense', 'Tekrarlayan', '', '']]);
    eq('başlangıç 20.000 − 800 (kesimsiz kart) = 19.200; en düşük 14.200 (14 Ekim); 30 gün sonu 36.700', r.s30, [19200, 36700, 14200, 5000, 800]);
    eq('60 gün: 14 Kasım ekstresi 1.200 + Netflix 230 = 1.430 (tahmini), 20 Kasım kira', r.i60, [
      ['2026-11-12', 'Netflix', 230, 'expense', 'Abonelik', 'k', ''],
      ['2026-11-14', '💳 Kart k ekstresi', 1430, 'expense', 'Kart ekstresi (tahmini)', '', 'k'],
      ['2026-11-20', 'Kira', 7500, 'expense', 'Tekrarlayan', '', '']]);
    eq('60 gün sonu 36.700 − 1.430 − 7.500 = 27.770, en düşük yine 14.200', r.s60, [27770, 14200]);
    eq('Özet notu: ekstreler son ödeme gününde, kesimsiz kart borcu bugünden', [/kart ekstreleri son ödeme gününde düşüldü/.test(r.mini), /Kesim günü girilmemiş kart borcu \(₺800,00\) bugünden düşüldü/.test(r.mini), /karta yazılır/.test(r.mini)], [true, true, true]);
    eq('bildirim planı: kart ekstresi iki kez yazılmaz (yalnız son ödeme hatırlatmasından)', await page.evaluate(() => App.Push.plan().items.filter(x => /Kart k/.test(x.text)).map(x => x.date)), ['2026-10-14', '2026-11-14']);
    await ctx.close();
  }
  // Son ödemesi geçmiş, asgarisi ödenmemiş dönem borcu bugün ödenecek sayılır; asgarisi ödendiyse sonraki ekstreye geçer.
  // Kesim 20 Eylül, son ödeme 30 Eylül. q: dönem borcu 3.500, asgari %20 = 700; 2 Ekim'de 700 ödendi → kalan 2.800 sonraki son ödemeye
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 9000), card('o', 20, 10, -2000, { ts: at('2026-09-01') }), card('q', 20, 10, -2800, { ts: at('2026-09-01'), openingBalance: -3500 })],
      pf_t: [tx('qp_o', 'expense', 700, '2026-10-02', 'b', { category: 'Transfer', transferId: 'qp' }), tx('qp_i', 'income', 700, '2026-10-02', 'q', { category: 'Transfer', transferId: 'qp' })] });
    const r = await page.evaluate(() => App.Cashflow.items(30).filter(x => x.cardPay).map(x => [x.date, x.label, x.amount, x.src]));
    eq('o: 2.000 bugün (son ödeme geçti); q: asgari ödendi, kalan 2.800 sonraki son ödemeye (30 Ekim)', r, [['2026-10-08', '💳 Kart o ekstresi', 2000, 'Kart ekstresi (son ödeme geçti)'], ['2026-10-30', '💳 Kart q ekstresi', 2800, 'Kart ekstresi (tahmini)']]);
    await ctx.close();
  }

  // ---- 2) Aynı günlerle kıyaslama: bugün 8 Ekim ----
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 50000)], pf_t: [
      tx('s0', 'income', 10000, '2026-09-01', 'b'), tx('s1', 'expense', 1000, '2026-09-05', 'b'), tx('s2', 'expense', 4000, '2026-09-20', 'b'),
      tx('o0', 'income', 10000, '2026-10-01', 'b'), tx('o1', 'expense', 1500, '2026-10-03', 'b'), tx('o2', 'expense', 900, '2026-10-25', 'b', { category: 'Giyim', balanceApplied: false })] });
    const r = await page.evaluate(() => {
      App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2026-10'; App.Charts.refresh();
      const title = document.getElementById('cmpTitle').textContent, rows = [...document.querySelectorAll('#cmpContent tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join(' | ')), note = document.getElementById('cmpContent').textContent;
      const an = App.Insights.compute('2026-10').prev, rep = App.Report.build('2026-10').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      document.getElementById('statMonth').value = '2026-09'; App.Charts.refresh();
      return { title, rows, note: /Ay henüz bitmedi: geçen ayın aynı günleriyle \(1–8\) kıyaslandı\. Eylül 2026 tamamında gelir ₺10\.000,00, gider ₺5\.000,00\./.test(note), an: [an.income, an.expense, an.uptoDay],
        rep: [/Ekim'in ilk 8 gününde ₺10\.000 geldi, ₺1\.500 harcandı; ₺8\.500 kaldı\./.test(rep), /▲ ₺500 fazla \(%50\) geçen ayın aynı günlerine göre/.test(rep), /1–8 Eyl Fark .*Market ₺1\.500 100,0 ₺1\.000 ▲ %50/.test(rep), !/Giyim/.test(rep.slice(rep.indexOf('Kategoriler %'), rep.indexOf('Toplam gider')))], past: document.getElementById('cmpTitle').textContent };
    });
    eq('başlık: 1–8 Ekim ile 1–8 Eylül', r.title, 'Aydan Aya Kıyaslama — 1–8 Ekim 2026 vs 1–8 Eylül 2026');
    eq('gider 1.500 / 1.000 (20 Eylül sayılmaz); planlı 25 Ekim Giyim kategoriye girmez', r.rows.filter(x => /Gider|Market|Giyim/.test(x)), ['💸 Gider | ₺1.500,00 | ₺1.000,00 | ▲ %50', '🛒 Market | ₺1.500,00 | ₺1.000,00 | ▲ %50']);
    eq('altında açıklama ve geçen ayın tamamı', r.note, true);
    eq('Insights önceki ay = aynı günler', r.an, [10000, 1000, 8]);
    eq('rapor da aynı günlerle: özet cümlesi, gider farkı (1–8 Eylül), kategori satırı; planlı Giyim kategoriye girmez', r.rep, [true, true, true, true]);
    eq('geçmiş ay seçilince ayların tamamı', r.past, 'Aydan Aya Kıyaslama — Eylül 2026 vs Ağustos 2026');
    await ctx.close();
  }

  // ---- 3) Eksi bakiye ----
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'w', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 100, openingBalance: 100, ts: at('2026-08-01') }, bank('kmh', -500), bank('b', 4000)],
      pf_t: [tx('w1', 'expense', 290, '2026-10-02', 'w')] });
    const r = await page.evaluate(() => {
      App.UI.nav('ozet'); App.Accounts.renderSummary();
      const al = [...document.querySelectorAll('#ozet-neg .cc-alert')].map(e => [e.querySelector('b').textContent, [...e.querySelectorAll('button')].map(b => b.textContent)]);
      App.UI.nav('hesaplar'); const lines = [...document.querySelectorAll('#accGrid .acc-card')].map(c => !!c.querySelector('.cc-due.red'));
      const w = App.Insights.compute('2026-10').warnings.filter(x => /eksiye düştü/.test(x.title)).map(x => [x.level, x.title]);
      return { al, lines, w };
    });
    eq('Özet: cüzdan (−190) ve KMH olabilecek banka (−500) uyarısı', r.al, [['⚠️ Cüzdan eksiye düştü: -₺190,00', ['Bakiyeyi Düzelt', 'Uyarma']], ['⚠️ Vadesiz kmh eksiye düştü: -₺500,00', ['Bakiyeyi Düzelt', 'KMH kullanıyorum']]]);
    eq('Hesaplar kartında satır yalnız eksi hesaplarda', r.lines, [true, true, false]);
    eq('İstatistikler: nakit kırmızı, banka sarı', r.w, [['red', 'Cüzdan eksiye düştü'], ['yellow', 'Vadesiz kmh eksiye düştü']]);
    const after = await page.evaluate(() => {
      App.UI.nav('ozet'); App.Accounts.negOk('kmh');
      const left = [...document.querySelectorAll('#ozet-neg .cc-alert b')].map(b => b.textContent);
      App.Accounts.edit('w'); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="balance"]').value = '50'; m.querySelector('[data-act="ok"]').click();
      const a = App.Accounts.get('w');
      return { left, now: [...document.querySelectorAll('#ozet-neg .cc-alert')].length, bal: [a.balance, a.openingBalance, a.balAt] };
    });
    eq('"KMH kullanıyorum" o hesabın uyarısını kapatır', after.left, ['⚠️ Cüzdan eksiye düştü: -₺190,00']);
    eq('Bakiyeyi Düzelt → 50: uyarı kalkar, açılış 100 + 240 = 340', [after.now, after.bal], [0, [50, 340, '2026-10-08']]);
    await ctx.close();
  }

  // ---- 4) İade → kategori ----
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 10000), card('c', 4, 10, -1000, { last4: '4321' })], pf_b: { Giyim: 2000 },
      pf_t: [tx('g1', 'expense', 1000, '2026-10-02', 'c', { category: 'Giyim', note: 'LC Waikiki Kadıköy' }), tx('e1', 'expense', 100, '2026-10-03', 'b', { category: 'Eğlence', note: 'Sinema' }), tx('mk', 'expense', 300, '2026-10-04', 'c', { note: 'Migros Kadıköy' })] });
    // Elle iade: kategori seçmeden (tahmin: aynı karttan LC Waikiki → Giyim)
    const add = (p, v) => p.evaluate(v => { App.UI.nav('islemler'); App.UI.setType('income'); document.getElementById('txnAmt').value = v.amt; document.getElementById('txnDate').value = v.date; document.getElementById('txnCat').value = 'İade'; App.UI.onCatChange();
      const shown = document.getElementById('txnRefWrap').style.display !== 'none'; document.getElementById('txnRefCat').value = v.ref; document.getElementById('txnNote').value = v.note; App.UI.pickAcc(v.acc); App.Transactions.add(); return shown; }, v);
    eq('Gelir + İade seçilince "Hangi harcamanın iadesi?" açılır', await add(page, { amt: '400', date: '2026-10-05', ref: '', note: 'İade: LC Waikiki', acc: 'c' }), true);
    await add(page, { amt: '250', date: '2026-10-06', ref: 'Eğlence', note: 'Konser iadesi', acc: 'b' });
    await add(page, { amt: '150', date: '2026-10-06', ref: '', note: 'İade: Bilinmeyen', acc: 'b' });
    const r = await page.evaluate(() => {
      const refs = S.txns().filter(t => t.category === 'İade').map(t => [t.amount, t.refCat || '']).sort((a, b) => b[0] - a[0]);
      const n = App.Transactions.catNet('2026-10'), mt = App.Transactions.monthTotals('2026-10');
      App.UI.nav('butce'); const g = [...document.querySelectorAll('#budgetGrid .bc')].find(e => /Giyim/.test(e.textContent)).querySelector('.bc-amounts').textContent;
      App.UI.nav('istatistikler'); document.getElementById('statMonth').value = '2026-10'; App.Charts.refresh(); const note = document.getElementById('statsWhere').textContent.replace(/\s+/g, ' ');
      const rep = App.Report.build('2026-10').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      App.UI.nav('islemler'); const lbl = [...document.querySelectorAll('#txnList .ti')].map(e => e.textContent.replace(/\s+/g, ' ')).find(x => /LC Waikiki/.test(x) && /İade/.test(x)) || '';
      const so = o => Object.keys(o).sort().map(k => [k, o[k]]);
      return { refs, cats: so(n.cats), applied: [n.refunds, n.applied, n.rest, so(n.appliedBy)], exp: mt.expense, g, note, rep: [/₺500 iade kendi kategorisinden düşüldü \(Giyim ₺400, Eğlence ₺100\)\./.test(rep), /Kategorisiz iade −₺300 /.test(rep), /Giyim ₺600 /.test(rep)], lbl: /İade \(Giyim\)/.test(lbl) };
    });
    eq('iadeler: 400 → Giyim (tahmin), 250 → Eğlence (seçildi), 150 → kategorisiz', r.refs, [[400, 'Giyim'], [250, 'Eğlence'], [150, '']]);
    eq('kategoriler: Giyim 600, Eğlence 0 (100 harcama; artan 150 toplamdan), Market 300', r.cats, [['Giyim', 600], ['Market', 300]]);
    eq('iade 800: 500 kategorilerden (Giyim 400, Eğlence 100), 300 yalnız toplamdan', r.applied, [800, 500, 300, [['Eğlence', 100], ['Giyim', 400]]]);
    eq('toplam gider 1.400 − 800 = 600', r.exp, 600);
    eq('Giyim bütçesi: 600 / 2.000', flat(r.g), '₺600,00 / ₺2.000,00');
    eq('İstatistikler notu', /₺800,00 iade giderden düşüldü: ₺500,00 kendi kategorisinden, ₺300,00 yalnız toplamdan\./.test(r.note), true);
    eq('rapor: iadeler kendi kategorisinden (Giyim 400, Eğlence 100), kalan 300 ayrı satır; Giyim 600', r.rep, [true, true, true]);
    eq('işlem listesinde "İade (Giyim)"', r.lbl, true);
    // Düzenleme: kategorisiz iadeyi Market'e bağla
    const ed = await page.evaluate(() => { const t = S.txns().find(x => x.amount === 150 && x.category === 'İade'); App.Transactions.edit(t.id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); const sel = m.querySelector('[data-pkey="refCat"]'); const had = !!sel; sel.value = 'Market'; m.querySelector('[data-act="ok"]').click(); return [had, S.txns().find(x => x.id === t.id).refCat, App.Transactions.catTotals('2026-10').Market]; });
    eq('düzenlemede "İade ise" alanı; Market 300 − 150 = 150', ed, [true, 'Market', 150]);
    // Banka mesajıyla gelen iade: aynı karttan Migros alışverişi → Market
    const sms = await page.evaluate(() => { const r = App.BankSms.ingest([{ id: 9001, label: 'abcd1234_u_a', text: '4321 ile biten kartinizla MIGROS isyerinden yaptiginiz 120,00 TL tutarindaki islem iade edilmistir. Yapi Kredi', receivedAt: Date.now() }]); const t = S.txns().find(x => x.src === 'sms'); return [r.added, t && t.category, t && t.refCat]; });
    eq('banka mesajı iadesi Market\'e bağlandı', sms, [1, 'İade', 'Market']);
    // Yeniden açınca alan korunur
    await page.reload(); await page.waitForTimeout(300);
    eq('yeniden açınca iade kategorileri korunur', await page.evaluate(() => S.txns().filter(t => t.category === 'İade').map(t => t.refCat || '').sort()), ['Eğlence', 'Giyim', 'Market', 'Market']);
    await ctx.close();
  }
  // Ekstreden iade: aynı ekstredeki alışverişe bağlanır
  {
    const { page, ctx } = await open({ pf_a: [card('c', 4, 10, 0, { last4: '4321' })], pf_t: [] });
    const r = await page.evaluate(() => { App.Statement._load('ekstre.pdf', { lines: ['Kredi Kartı Hesap Özeti', '02.10.2026 LC WAIKIKI KADIKOY 1.000,00', '05.10.2026 IADE LC WAIKIKI KADIKOY -400,00'] }); App.Statement.open(); App.Statement.setAccount('c'); App.Statement.commit();
      return S.txns().map(t => [t.type, t.amount, t.category, t.refCat || '']).sort((a, b) => b[1] - a[1]); });
    eq('ekstre: alışveriş Giyim, iadesi Giyim\'e bağlı', r, [['expense', 1000, 'Giyim', ''], ['income', 400, 'İade', 'Giyim']]);
    await ctx.close();
  }

  // ---- 5) Ay başı özeti: bugün 3 Ekim ----
  const sept = [tx('a1', 'expense', 5000, '2026-08-10', 'b'), tx('s0', 'income', 30000, '2026-09-01', 'b'), tx('s1', 'expense', 4000, '2026-09-05', 'b'), tx('s2', 'expense', 1500, '2026-09-12', 'b', { category: 'Faturalar' }), tx('o1', 'expense', 200, '2026-10-02', 'b')];
  const SUM = 'Gelir ₺30.000,00 · gider ₺5.500,00 · net +₺24.500,00 (tasarruf %82). En çok: Market ₺4.000,00. Gider Ağustos 2026 ayına göre %10 fazla.';
  {
    const notes = () => { window.__notes = []; window.Notification = function (t, o) { window.__notes.push([t, (o || {}).body || '']); }; window.Notification.permission = 'granted'; window.Notification.requestPermission = () => Promise.resolve('granted'); };
    const { page, ctx } = await open({ pf_a: [bank('b', 50000)], pf_t: sept }, '2026-10-03', notes);
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => { App.UI.nav('ozet'); const c = document.getElementById('ozet-month'); return { txt: c.textContent.replace(/\s+/g, ' ').trim(), sum: App.Insights.monthSummary('2026-09').text, notes: window.__notes.filter(n => /özeti/.test(n[0])) }; });
    eq('özet metni (elle: 30.000 − 5.500; tasarruf 24.500/30.000 = %82; gider 5.000 → 5.500 = %10 fazla)', r.sum, SUM);
    eq('Özet kartı: Eylül özeti, Raporu Aç / Kapat', r.txt, '📊 Eylül 2026 özeti' + SUM + '📄 Raporu AçKapat');
    eq('uygulama açıkken bildirim (bir kez)', r.notes, [['📊 Eylül 2026 özeti', SUM]]);
    const rep = await page.evaluate(() => { [...document.querySelectorAll('#ozet-month button')][0].click(); const v = document.getElementById('rapMonth').value; App.Report.close(); [...document.querySelectorAll('#ozet-month button')][1].click(); return [v, document.getElementById('ozet-month').textContent]; });
    eq('Raporu Aç Eylül raporunu açar; Kapat gizler', rep, ['2026-09', '']);
    await page.reload(); await page.waitForTimeout(1800);
    eq('yeniden açınca kart kapalı, bildirim tekrar gelmez', await page.evaluate(() => [document.getElementById('ozet-month').textContent, window.__notes.filter(n => /özeti/.test(n[0])).length]), ['', 0]);
    const plan = await page.evaluate(() => { const p = App.Push.plan(); return { sums: p.items.filter(x => x.kind === 'summary').map(x => [x.date, x.title]), days: p.days }; });
    eq('bildirim planı: 1 Kasım\'da Ekim özeti (yalnız o gün); 1 Ekim geçti', plan, { sums: [['2026-10-01', '📊 Eylül 2026 özeti'], ['2026-11-01', '📊 Ekim 2026 özeti']], days: ['2026-11-01'] });
    await ctx.close();
  }
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 50000)], pf_t: sept }, '2026-10-09');
    eq('ayın 8\'inden sonra kart yok', await page.evaluate(() => { App.UI.nav('ozet'); return document.getElementById('ozet-month').textContent; }), '');
    await ctx.close();
  }
  // Service worker: ayın 1'inde özet ayrı bildirim; ödeme yoksa "yaklaşan ödeme" bildirimi çıkmaz
  {
    const code = fs.readFileSync(path.join(R, 'sw.js'), 'utf8');
    const run = (items, now) => new Promise(res => {
      const shown = [], h = {};
      const RealDate = Date, fixed = new RealDate(now + 'T09:00:00').getTime();
      function D(...a) { return a.length ? new RealDate(...a) : new RealDate(fixed); } D.now = () => fixed; D.prototype = RealDate.prototype;
      const idb = { open: () => { const r = {}; setTimeout(() => { r.result = { transaction: () => ({ objectStore: () => ({ get: () => { const q = {}; setTimeout(() => { q.result = { items }; q.onsuccess && q.onsuccess(); }); return q; } }) }) }; r.onsuccess && r.onsuccess(); }); return r; } };
      const self = { addEventListener: (n, f) => { h[n] = f; }, registration: { showNotification: (t, o) => { shown.push([t, o.body, o.tag]); return Promise.resolve(); } }, location: { origin: 'x' }, clients: {} };
      vm.runInNewContext(code, { self, indexedDB: idb, caches: {}, fetch: () => {}, URL, Promise, Date: D, setTimeout, console });
      h.push({ waitUntil: p => p.then(() => res(shown)) });
    });
    const items = [{ date: '2026-11-01', kind: 'summary', title: '📊 Ekim 2026 özeti', text: 'Gelir ₺1,00' }, { date: '2026-11-02', text: '−₺7.500,00 Kira (Tekrarlayan)' }];
    eq('1 Kasım: özet ayrı bildirim + yarınki kira', await run(items, '2026-11-01'), [['📊 Ekim 2026 özeti', 'Gelir ₺1,00', 'ft-month'], ['💰 Yaklaşan ödeme', 'yarın: −₺7.500,00 Kira (Tekrarlayan)', 'ft-due']]);
    eq('30 Ekim: özet gösterilmez (2 gün önceden değil), yalnız ödeme', await run(items, '2026-10-31'), [['💰 Yaklaşan ödeme', '2 gün sonra: −₺7.500,00 Kira (Tekrarlayan)', 'ft-due']]);
    eq('yalnız özet varken boş "yaklaşan ödeme" bildirimi yok', await run(items.slice(0, 1), '2026-11-01'), [['📊 Ekim 2026 özeti', 'Gelir ₺1,00', 'ft-month']]);
  }

  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
