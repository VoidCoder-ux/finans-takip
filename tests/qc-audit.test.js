// Usage: node tests/qc-audit.test.js
// Genel denetim düzeltmeleri (beklenen değerler elle hesaplandı, bugün 8 Ekim 2026 sabit):
//  1) Kart, bu dönemin son ödeme gününden sonra eklendiyse girilen borç "ödenmemiş dönem borcu" sayılmaz: yanlış
//     "Son ödeme günü geçti" uyarısı yok, borç sonraki ekstreye yazılır. Daha önce eklenen kartta gecikme uyarısı sürer.
//  2) Aile sayfası "Cüzdan Özeti" Özet'teki Aile Paneli ile aynı rakam: hesaplardaki para ayrı, kart borcu ayrı.
//  3) "En çok harcanan yerler": işyeri adı içermeyen banka notu ("Akbank kart harcaması · …") yer sayılmaz; BİM şubeleri tek yer.
//  4) Bütçe kullanımı İstatistikler ile raporda aynı: devirle eksiye düşen limit toplamı azaltmaz; tabloda "Tükendi".
//  5) "Bakiye eksiye düşebilir" yalnız önümüzdeki ödemeler bakiyeyi düşürüyorsa; kesim günü olmayan kartın borcunun bugünden
//     düşüldüğü Özet'te yazar (kesim günü olan kartlar: tests/qc-ideas.test.js).
//  6) İadeler giderden düşülünce İstatistikler'de not.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
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
const TODAY = '2026-10-08';
const tx = (id, type, amount, date, accountId, o) => Object.assign({ id, type, amount, category: type === 'income' ? 'Maaş' : 'Market', date, note: id, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, o || {});
const pay = (id, amount, date, from, to) => [tx(id + '_o', 'expense', amount, date, from, { category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id }), tx(id + '_i', 'income', amount, date, to, { category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id })];
// Kesim her ayın 11'i, son ödeme kesimden 10 gün sonra: son ekstre 11 Eylül, son ödemesi 21 Eylül; sonraki kesim 11 Ekim, son ödemesi 21 Ekim
const card = (id, ts, balance, o) => Object.assign({ id, name: 'Kart ' + id, type: 'card', owner: 'shared', statementDay: 11, dueOffset: 10, balance, openingBalance: balance, ts: at(ts) }, o || {});
const bank = (id, balance, o) => Object.assign({ id, name: 'Vadesiz', type: 'bank', owner: 'shared', balance, openingBalance: balance, ts: at('2026-08-01') }, o || {});

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(TODAY + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS }, data));
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const flat = s => s.replace(/\s+/g, ' ').trim();

  // 1) Son ödeme gününden sonra eklenen kart
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 20000), card('late', '2026-10-01', -12000), card('early', '2026-09-01', -8000), card('mid', '2026-09-15', -6000), card('paid', '2026-10-01', -7000, { openingBalance: -12000 })], pf_t: pay('p1', 5000, '2026-10-05', 'b', 'paid') });
    const inf = id => page.evaluate(id => { const i = App.Cards.info(id); return { overdue: i.overdue, upcoming: !!i.upcoming, lateAdd: !!i.lateAdd, stmtLeft: i.stmtLeft, nextCut: i.nextCut, nextDue: i.nextDue, nextStmt: i.nextStmt }; }, id);
    eq('1 Ekim\'de eklenen kart (son ödeme 21 Eylül geçmişti): gecikme yok, borç 11 Ekim ekstresine', await inf('late'), { overdue: false, upcoming: true, lateAdd: true, stmtLeft: 0, nextCut: '2026-10-11', nextDue: '2026-10-21', nextStmt: 12000 });
    eq('1 Eylül\'de eklenen kart (kesimden önce): 8.000 dönem borcu ödenmedi, gecikme uyarısı sürer', await inf('early'), { overdue: true, upcoming: false, lateAdd: false, stmtLeft: 8000, nextCut: '2026-10-11', nextDue: '2026-10-21', nextStmt: 0 });
    eq('15 Eylül\'de eklenen kart (kesimle son ödeme arası): girilen borç ekstreyi içerir, gecikme uyarısı sürer', (await inf('mid')).overdue, true);
    eq('geç eklenen karta 5.000 ödeme: kalan 7.000 sonraki ekstreye', await inf('paid'), { overdue: false, upcoming: true, lateAdd: true, stmtLeft: 0, nextCut: '2026-10-11', nextDue: '2026-10-21', nextStmt: 7000 });
    const ui = await page.evaluate(() => {
      App.UI.nav('ozet'); App.Cards.renderAlerts();
      const alerts = document.getElementById('ozet-cards').innerText;
      const w = App.Insights.compute('2026-10').warnings.filter(x => /son ödeme geçti/.test(x.title)).map(x => x.title);
      const mini = App.Cards.mini('late');
      App.Cards.detail('late'); const det = document.getElementById('cardDetailHolder').innerText; App.UI.closeModal('cardDetailHolder');
      const dues = App.Notifications.cardDues(30).filter(d => d.id.indexOf('late_') === 0).map(d => [d.date, d.amount]);
      return { alertLate: /Kart late/.test(alerts), alertEarly: /Kart early/.test(alerts), w, mini: /Ekstre 11 Ekim 2026 kesilecek/.test(mini) && !/Son ödeme geçti/.test(mini), det: /21 Eylül 2026\) sonra eklendiği için/.test(det), dues };
    });
    eq('Özet uyarısı yalnız gerçekten geciken kartlarda; İstatistikler uyarısı da öyle', [ui.alertLate, ui.alertEarly, ui.w], [false, true, ['Kart early son ödeme geçti', 'Kart mid son ödeme geçti']]);
    eq('hesap kartında "Ekstre 11 Ekim kesilecek"; detayda nedeni yazar', [ui.mini, ui.det], [true, true]);
    eq('son ödeme hatırlatması: 21 Ekim, yaklaşık 12.000', ui.dues, [['2026-10-21', 12000]]);
    await ctx.close();
  }

  // 2) Aile sayfası Cüzdan Özeti = Özet Aile Paneli
  {
    const { page, ctx } = await open({
      pf_a: [bank('b', 20000), card('c', '2026-10-01', -5000), { id: 'e1', name: 'Ece nakit', type: 'cash', owner: 'personal', userId: 'u_b', balance: 1500, openingBalance: 1500, ts: at('2026-08-01') }, card('e2', '2026-10-01', -700, { owner: 'personal', userId: 'u_b' })],
      pf_t: [tx('m1', 'expense', 300, '2026-10-03', 'b'), tx('m2', 'income', 1000, '2026-10-04', 'e1', { userId: 'u_b' })]
    });
    const r = await page.evaluate(() => {
      App.UI.nav('aile');
      const rows = [...document.querySelectorAll('#walletSummary .wallet-row')].map(e => [e.querySelector('.wr-name').innerText, e.querySelector('.wr-meta').innerText, e.querySelector('.wr-bal').innerText, (e.querySelector('.wr-cap') || {}).innerText || '']);
      App.UI.nav('ozet'); App.Users.renderFamilyPanel();
      const panel = [...document.querySelectorAll('#ozet-family .wallet-row')].map(e => [e.querySelector('.wr-bal').innerText, e.querySelector('.wr-cap').innerText]);
      return { rows, panel };
    });
    eq('Aile sayfası ortak cüzdan: hesaplarda 20.000 − 300 = 19.700 (kart borcu ayrı)', r.rows[0], ['Ortak Cüzdan', '2 hesap · Bu ay ₺0,00 gelir · ₺300,00 gider · 💳 kart borcu ₺5.000,00', '₺19.700,00', 'hesaplarda']);
    eq('Özet paneliyle aynı rakam', r.panel.map(x => x.join(' ')), r.rows.map(x => x[2] + ' ' + x[3]));
    eq('kişisel hesaplı üye: hesaplardaki para (1.500 + 1.000 gelir) ve kart borcu ayrı, sağda bu ay net', r.rows[2], ['Ece', '2 kişisel hesap: ₺2.500,00 · 💳 kart borcu ₺700,00 · Bu ay ₺1.000,00 gelir · ₺0,00 gider', '+₺1.000,00', 'bu ay net']);
    await ctx.close();
  }

  // 3) En çok harcanan yerler
  {
    const { page, ctx } = await open({
      pf_a: [bank('b', 20000), card('c', '2026-08-01', -3000)],
      pf_t: [tx('y1', 'expense', 410, '2026-10-02', 'c', { note: 'Akbank kart harcaması · Gıda ve market', src: 'sms' }), tx('y2', 'expense', 120, '2026-10-03', 'c', { note: 'BIM-T205 KADIKOY' }), tx('y3', 'expense', 80, '2026-10-04', 'c', { note: 'BİM BİRLEŞİK MAĞAZALAR' }),
        tx('y4', 'expense', 55, '2026-10-05', 'c', { note: 'Kart harcaması', src: 'sms' }), tx('y5', 'expense', 60, '2026-10-06', 'b', { note: 'Simit Sarayı Moda', category: 'Yiyecek' })]
    });
    const r = await page.evaluate(() => { const rep = App.Report.build('2026-10'); const i = rep.indexOf('En Çok Harcanan Yerler'); return { places: App.Insights.compute('2026-10').places.map(x => [x.key, x.amount]), rep: rep.slice(i, rep.indexOf('</table>', i)).replace(/<[^>]+>/g, ' ') }; });
    eq('genel banka notları yer sayılmaz; BİM şubeleri tek yer', r.places, [['BİM', 200], ['Simit Sarayı', 60]]);
    eq('raporun yer tablosu da aynı', [/BİM/.test(r.rep), /Akbank kart/.test(r.rep), /Kart harcaması/.test(r.rep)], [true, false, false]);
    await ctx.close();
  }

  // 4) Bütçe kullanımı: Eğlence limiti 1.000, devirli; eylülde 3.500 harcandı → devir −2.500, ekim limiti −1.500 (tükendi)
  {
    const { page, ctx } = await open({
      pf_a: [bank('b', 20000)], pf_b: { 'Eğlence': 1000, Market: 4000 }, pf_bm: { 'Eğlence': { carryOver: true, carryStart: '2026-09' } },
      pf_t: [tx('s1', 'expense', 3500, '2026-09-12', 'b', { category: 'Eğlence' }), tx('o1', 'expense', 200, '2026-10-02', 'b', { category: 'Eğlence' }), tx('o2', 'expense', 1000, '2026-10-03', 'b')]
    });
    const r = await page.evaluate(() => {
      App.UI.nav('istatistikler');
      const kpi = [...document.querySelectorAll('#statsKpis .skpi')].find(e => /Bütçe/.test(e.textContent)).textContent.replace(/\s+/g, ' ');
      const row = [...document.querySelectorAll('#statsTable tr')].find(e => /Eğlence/.test(e.textContent)).querySelector('[data-l="Limit"]').textContent;
      const rep = App.Report.build('2026-10').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const w = App.Insights.compute('2026-10').warnings.find(x => /Eğlence/.test(x.title));
      return { kpi, row, rep: /harcanan ₺1\.200,00 \/ limit ₺4\.000,00/.test(rep) && /Bütçe Kullanımı .*%30/.test(rep), w: w && w.text };
    });
    eq('İstatistikler: 1.200 / 4.000 = %30 (eksi limit toplamı azaltmaz)', r.kpi, 'Bütçe Kullanımı%30,0₺1.200,00 / ₺4.000,00 limitli kategoriler');
    eq('rapor aynı rakam', r.rep, true);
    eq('kategori tablosunda eksi limit yerine "Tükendi"', r.row.replace(/\s+/g, ' '), 'Tükendi (devir -₺1.500,00)');
    eq('uyarı metni anlaşılır', r.w, '₺200,00 harcandı; önceki aylardan devreden aşım (₺1.500,00) bu ayın limitini bitirdi.');
    await ctx.close();
  }

  // 5) Nakit akışı uyarısı ve Özet notu
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 1000), card('c', '2026-08-01', -5000, { statementDay: null })], pf_t: [] });
    const r = await page.evaluate(() => { App.UI.nav('ozet'); App.Cashflow.renderMini(); const t = App.Insights.compute('2026-10').warnings.map(x => x.title); return { w: t.filter(x => /eksiye|Kredi kartı borcu/.test(x)), note: document.getElementById('cashflowMini').innerText.replace(/\s+/g, ' ') }; });
    eq('ödeme yokken yalnız kart borcu uyarısı (bakiye uyarısı tekrar etmez)', r.w, ['Kredi kartı borcu']);
    eq('Özet: kesim günü olmayan kartın borcunun bugünden düşüldüğü yazar', /Kesim günü girilmemiş kart borcu \(₺5\.000,00\) bugünden düşüldü/.test(r.note), true);
    await ctx.close();
  }
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 1000)], pf_r: [{ id: 'r1', type: 'expense', amount: 3000, category: 'Faturalar', day: 20, note: 'Kira', accountId: 'b', userId: 'u_a', active: true, ts: 1 }], pf_t: [] });
    const r = await page.evaluate(() => { App.UI.nav('ozet'); App.Cashflow.renderMini(); return { w: App.Insights.compute('2026-10').warnings.filter(x => /eksiye/.test(x.title)).map(x => x.text), note: /Kesim günü|kart ekstreleri/.test(document.getElementById('cashflowMini').innerText) }; });
    eq('20 Ekim kira 3.000 bakiyeyi −2.000\'e düşürür: uyarı var', r.w, ['Önümüzdeki 30 günün ödemeleriyle hesaplardaki para en düşük -₺2.000,00 olabilir.']);
    eq('kart yokken not yok', r.note, false);
    await ctx.close();
  }

  // 6) İade notu
  {
    const { page, ctx } = await open({ pf_a: [bank('b', 5000)], pf_t: [tx('i1', 'expense', 900, '2026-10-02', 'b', { category: 'Giyim' }), tx('i2', 'income', 150, '2026-10-04', 'b', { category: 'İade', note: 'İade: Giyim' })] });
    const r = await page.evaluate(() => { App.UI.nav('istatistikler'); return flat0(document.getElementById('statsWhere').textContent); function flat0(s) { return s.replace(/\s+/g, ' '); } });
    eq('İstatistikler: toplam gider 750, iade notu', [/Nereye Gitti\? · ₺750,00/.test(r), /₺150,00 iade toplam giderden düşüldü/.test(r)], [true, true]);
    await ctx.close();
  }

  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
