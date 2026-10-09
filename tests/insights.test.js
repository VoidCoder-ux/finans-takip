// Usage: node tests/insights.test.js [ekran-görüntüsü-klasörü]
// Aylık analiz: dikkat edilecekler (uyarılar), nereye gitti / nereden geldi, aylık PDF raporundaki aynı bölümler.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// Sabit "bugün": ayın 20'si (tempo hesabı için yeterli gün geçmiş olsun)
const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
const d = (mo, day) => iso(new Date(Y, M + mo, day));

function seed() {
  const t = [];let k = 0;
  const add = (type, amount, category, date, note, accountId, userId, extra) => t.push(Object.assign({ id: 't' + (k++), type, amount, category, date, note, accountId, userId, ts: k, balanceApplied: true }, extra || {}));
  // Son 3 ay: maaş 50.000, market ~6.000, yiyecek ~1.500
  for (const mo of [-3, -2, -1]) { add('income', 50000, 'Maaş', d(mo, 1), 'Maaş', 'a_bank', 'u_self'); add('expense', 6000, 'Market', d(mo, 10), 'Migros', 'a_card', 'u_self'); add('expense', 1500, 'Yiyecek', d(mo, 12), 'Starbucks', 'a_card', 'u_partner'); }
  // Bu ay (1-15 arası): market 9.000 (artış), yiyecek 1.000, yeni kategori Giyim 4.000, maaş 50.000 + freelance 5.000
  add('income', 50000, 'Maaş', d(0, 1), 'Maaş', 'a_bank', 'u_self');
  add('income', 5000, 'Freelance', d(0, 3), 'Logo işi', 'a_bank', 'u_partner');
  add('expense', 5000, 'Market', d(0, 2), 'Migros Kadıköy', 'a_card', 'u_self');
  add('expense', 4000, 'Market', d(0, 9), 'BİM', 'a_card', 'u_partner');
  add('expense', 1000, 'Yiyecek', d(0, 5), 'Starbucks', 'a_card', 'u_partner');
  add('expense', 4000, 'Giyim', d(0, 6), 'Zara', 'a_card', 'u_self');
  add('expense', 22000, 'Faturalar', d(0, 25), 'Kira (planlı)', 'a_bank', 'u_self', { balanceApplied: false });
  add('expense', 3000, 'Transfer', d(0, 7), 'Kart ödemesi', 'a_bank', 'u_self', { transferId: 'tr1' });
  add('income', 3000, 'Transfer', d(0, 7), 'Kart ödemesi', 'a_card', 'u_self', { transferId: 'tr1' });
  return {
    pf_a: [{ id: 'a_bank', name: 'Yapıkredi TLCARD', type: 'bank', owner: 'shared', last4: '6604', balance: 20000, openingBalance: 0, ts: 1 }, { id: 'a_card', name: 'Yapıkredi World', type: 'card', owner: 'shared', last4: '3812', balance: -25000, openingBalance: 0, ts: 2 }],
    pf_t: t, pf_b: { Market: 8000, Yiyecek: 3000 },
    pf_r: [{ id: 'r_nf', type: 'expense', amount: 229.99, category: 'Eğlence', day: 12, note: 'Netflix', accountId: 'a_card', userId: 'u_self', isSubscription: true, active: true, ts: 1 }],
    pf_s: { onboarded: true, users: [{ id: 'u_self', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_partner', name: 'Ayşe', emoji: '👩', color: '#ec4899' }], activeUser: 'u_self', lastBackupAt: Date.now() }
  };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Saat: bu ayın 15'i (kira 25'inde planlı)
  await ctx.addInitScript(fixed => { const R = Date, f = new R(fixed).getTime(); class D extends R { constructor(...a) { super(...(a.length ? a : [f])); } static now() { return f; } } window.Date = D; }, new Date(Y, M, 15, 12).toISOString());
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
  await page.reload(); await page.waitForTimeout(400);
  const a = await page.evaluate(() => App.Insights.compute(tm()));
  eq('totals: planned rent and own transfers are not counted', [a.income, a.expense, a.histMonths, a.avgExpense], [55000, 14000, 3, 7500]);
  eq('pace: 14.000 in 15 days → ~28.000 projected (avg 7.500)', a.projected, Math.round(14000 / 15 * new Date(Y, M + 1, 0).getDate() * 100) / 100);
  const titles = a.warnings.map(w => w.level + ':' + w.title);
  eq('warnings include pace, market spike, new clothing, budget, card debt, subscriptions, savings', [
    titles.includes('red:Harcama temposu yüksek'), titles.includes('yellow:Market harcaması arttı'), titles.includes('yellow:Giyim bu ay yeni'),
    titles.includes('red:Market bütçesi aşıldı'), titles.includes('info:Kredi kartı borcu'), titles.includes('info:Abonelikler'), titles.includes('green:İyi gidiyor')], [true, true, true, true, true, true, true]);
  eq('warnings sorted red → yellow → info → green', a.warnings.map(w => w.level).join(',').replace(/(\w+)(,\1)+/g, '$1'), 'red,yellow,info,green');
  eq('no false alarm: Yiyecek went down', titles.some(t => /Yiyecek/.test(t)), false);
  eq('where it went: categories, places (brand names), people, cards', [a.categories.map(x => x.key), a.places.slice(0, 3).map(x => x.key + ' ' + x.amount), a.byUser.map(x => x.key + ' ' + x.amount), a.byAccount.map(x => x.key)], [['Market', 'Giyim', 'Yiyecek'], ['Migros 5000', 'BİM 4000', 'Zara 4000'], ['Deniz 9000', 'Ayşe 5000'], ['Yapıkredi World …3812']]);
  eq('where it came from', [a.incomeCategories.map(x => x.key + ' ' + x.amount), a.incomeByUser.map(x => x.key), a.incomeByAccount.map(x => x.key)], [['Maaş 50000', 'Freelance 5000'], ['Deniz', 'Ayşe'], ['Yapıkredi TLCARD …6604']]);

  // İstatistikler sayfası
  await page.evaluate(() => App.UI.nav('istatistikler')); await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ warn: document.querySelectorAll('#statsInsights .an-warn').length, red: document.querySelectorAll('#statsInsights .an-warn.red').length, where: [...document.querySelectorAll('#statsWhere .chart-title')].map(x => x.textContent), subs: [...document.querySelectorAll('#statsWhere .an-sub')].map(x => x.textContent) }));
  eq('stats page shows warnings and where/whence cards', [st.warn >= 7, st.red >= 2, st.where, st.subs], [true, true, ['💸 Nereye Gitti? · ₺14.000,00', '💰 Nereden Geldi? · ₺55.000,00'], ['Kategoriler', 'En çok harcanan yerler', 'Kim harcadı', 'Hangi kart / hesaptan', 'Gelir türü', 'Kime geldi', 'Hangi hesaba']]);
  if (OUT) await page.screenshot({ path: OUT + '/stats-insights.png', fullPage: true });
  // Geçen ay seçilince tempo ve bugünkü kart borcu uyarısı gösterilmez
  const prev = await page.evaluate(() => { const p = App.Insights.compute(App.Insights.compute(tm()).prev.month); return [p.projected, p.warnings.some(w => /Kredi kartı/.test(w.title)), p.expense]; });
  eq('past month: no pace projection, no current card-debt warning', prev, [null, false, 7500]);

  // PDF raporu
  const rep = await page.evaluate(() => { window.print = () => {}; App.Report.generateMonth(tm()); const h = document.getElementById('printHolder'), tx = s => (s || {}).textContent || '';
    const sec = [...h.querySelectorAll('.pr-h2')].map(x => x.firstChild.textContent.replace(/\s*\(\d+\)$/, ''));
    return { sec, warn: h.querySelectorAll('.pr-al').length, more: tx(h.querySelector('.pr-alerts + .pr-note')), exp: tx(h.querySelector('.pr-kout .pr-kv')), tot: tx(h.querySelector('.pr-cats .pr-tot td.pr-r')), note: tx(h.querySelector('.pr-kpis + .pr-note')),
      planned: [...h.querySelectorAll('.pr-txns tr')].filter(r => /planlı, toplamlara girmedi/.test(r.textContent)).length, acc: /Yapıkredi World …3812/.test(h.textContent) }; });
  eq('report sections: bir bakışta, ayrıntılar, ek', rep.sec, ['Gelirin nereye gitti?', 'Dikkat', 'Önümüzdeki 30 gün', 'Kategoriler', 'Kim ne harcadı?', 'En çok harcanan yerler', 'Gelir kaynakları', 'Kredi kartları', 'Hesaplar', 'Her ay ne kadar kaldı?', 'Ek: ' + ({ '01': 'Ocak\'ın', '02': 'Şubat\'ın', '03': 'Mart\'ın', '04': 'Nisan\'ın', '05': 'Mayıs\'ın', '06': 'Haziran\'ın', '07': 'Temmuz\'un', '08': 'Ağustos\'un', '09': 'Eylül\'ün', '10': 'Ekim\'in', '11': 'Kasım\'ın', '12': 'Aralık\'ın' })[iso(new Date()).slice(5, 7)] + ' bütün işlemleri', 'Okuma rehberi']);
  eq('report: en önemli 4 uyarı (İstatistikler ile aynı sırada), kalanı sayılır', [rep.warn, rep.more], [Math.min(4, a.warnings.length), a.warnings.length > 4 ? 've ' + (a.warnings.length - 4) + ' not daha (İstatistikler sayfasında).' : '']);
  eq('report totals match stats (planned rent counted separately)', [rep.exp, rep.tot, rep.note, rep.planned, rep.acc], ['₺14.000', '₺14.000', 'Tarihi gelmemiş 1 planlı kayıt toplamlara girmedi; günü gelince eklenir.', 1, true]);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
