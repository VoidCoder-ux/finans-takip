// Usage: node tests/qc-flow.test.js [ekran-görüntüsü-klasörü]
// "Gelir − gider" elde kalan para değildir: kart borcu ödemesi ve aktarımlar bunun içinden yapılır.
//  - Özet ve raporda "Gelen para nereye gitti?": ay başında hesaplarda + gelir − kart borcuna ödenen − hesaplardan harcanan
//    − uygulamada olmayan hesaba aktarılan = şu an hesaplarda.
//  - Kart borcu hesaplardaki paradan fazlaysa Özet "₺X eksik" der.
//  - Hesabı silinmiş aktarım Dikkat'te çıkar; Transferi Düzenle'den hesap seçilince düzelir (bakiyeler doğru).
// Kurmaca veri (Deniz ve Ece); beklenen değerler elle hesaplandı. Sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 9 Ekim 2026. Hesaplar 28 Eylül'de eklendi: Vadesiz 150, Kart A borç 30.000 (eski borç), Kart B borç 8.000.
// Ekim: maaş 20.000 + 12.000; Kart A'ya 10.000 ödeme; Vadesiz'den silinmiş bir hesaba 2.000 aktarım (gelen bacağın hesabı yok);
// berber 300 (Vadesiz), market 1.200 (Kart B) ve 800 (Kart A).
// Elle: gelir 32.000, gider 300 + 1.200 + 800 = 2.300, gelir − gider = 29.700.
// Vadesiz: 150 + 32.000 − 10.000 − 2.000 − 300 = 19.850. Kart A: 30.000 − 10.000 + 800 = 20.800; Kart B: 8.000 + 1.200 = 9.200 → borç 30.000.
// Kart borcu düşünce: 19.850 − 30.000 = −10.150 → "₺10.150,00 eksik".
const at = d => new Date(d + 'T12:00:00').getTime();
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋' }, { id: 'u_b', name: 'Ece', emoji: '💑' }];
const A = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 19850, openingBalance: 150, ts: at('2026-09-28') },
  { id: 'c1', name: 'Kart A', type: 'card', owner: 'shared', last4: '1111', limit: 50000, statementDay: 25, dueOffset: 10, balance: -20800, openingBalance: -30000, ts: at('2026-09-28') },
  { id: 'c2', name: 'Kart B', type: 'card', owner: 'shared', last4: '2222', limit: 20000, statementDay: 12, dueOffset: 10, balance: -9200, openingBalance: -8000, ts: at('2026-09-28') }];
let n = 0;
const tx = (type, amount, date, acc, o) => Object.assign({ id: 't' + (++n), type, amount, category: type === 'income' ? 'Maaş' : 'Market', date, note: '', accountId: acc, userId: 'u_a', ts: at(date) + n, balanceApplied: true }, o || {});
const T = [tx('income', 20000, '2026-10-03', 'b', { note: 'Maaş', userId: 'u_b' }), tx('income', 12000, '2026-10-05', 'b', { note: 'Maaş', userId: 'u_b' }),
  tx('expense', 10000, '2026-10-05', 'b', { category: 'Transfer', note: 'Kart borcu ödemesi: Kart A …1111', transferId: 'tr1' }), tx('income', 10000, '2026-10-05', 'c1', { category: 'Transfer', note: 'Kart borcu ödemesi: Kart A …1111', transferId: 'tr1' }),
  tx('expense', 2000, '2026-10-05', 'b', { category: 'Transfer', note: '', transferId: 'tr2' }), tx('income', 2000, '2026-10-05', '', { category: 'Transfer', note: '', transferId: 'tr2' }),
  tx('expense', 300, '2026-10-06', 'b', { category: 'Diğer', note: 'Berber' }), tx('expense', 1200, '2026-10-07', 'c2', { note: 'Migros', userId: 'u_b' }), tx('expense', 800, '2026-10-08', 'c1', { note: 'A101' })];
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00'));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(400);
  const sp = s => s.replace(/\s+/g, ' ').trim();

  eq('ortak hesap: ay başı 150 + gelir 32.000 − kart 10.000 − harcanan 300 − hesapsız aktarım 2.000 = 19.850', await page.evaluate(() => { const f = App.Transactions.moneyFlow('2026-10'); return [f.start, f.income, f.cardPay, f.spend, f.extOut, f.extIn, f.other, f.end]; }), [150, 32000, 10000, 300, 2000, 0, 0, 19850]);
  eq('hesabı olmayan aktarım bulunur', await page.evaluate(() => App.Transactions.orphanTransfers('2026-10').map(o => [o.date, o.amount, o.from && o.from.id, o.to])), [['2026-10-05', 2000, 'b', null]]);

  // Özet
  const oz = await page.evaluate(() => { App.UI.nav('ozet'); App.Transactions.renderSummaryMetrics(); App.Accounts.renderSummary(); const t = id => document.getElementById(id).textContent;
    return { hero: [t('heroNet'), t('heroCard'), t('heroAfter'), t('heroAfterNote'), document.getElementById('heroAfter').classList.contains('ht-neg')], month: [t('mInc'), t('mExp'), t('mNet'), [...document.querySelectorAll('.month-grid .mg-lbl')].map(x => x.textContent)],
      rows: [...document.querySelectorAll('#mCards .mf-row')].map(r => [r.querySelector('span').firstChild.textContent, (r.querySelector('small') || {}).textContent || '', r.querySelector('b').textContent]), note: (document.querySelector('#mCards .mc-note') || {}).textContent || '' }; });
  eq('Özet: kart borcu paradan fazla → "₺10.150,00 eksik" (eksi rakam "elinizde kalan" diye yazılmaz)', oz.hero, ['₺19.850,00', '₺30.000,00', '₺10.150,00 eksik', 'kart borçları hesaplardaki paradan fazla', true]);
  eq('Özet Bu Ay: gelir 32.000, gider 2.300, "Gelir − Gider" +29.700', oz.month, ['₺32.000,00', '₺2.300,00', '+₺29.700,00', ['Gelir', 'Gider', 'Gelir − Gider']]);
  eq('Özet: gelen para nereye gitti (son satır = hesaplardaki para)', oz.rows, [['Ay başında hesaplarda', '', '₺150,00'], ['＋ Gelir', '', '+₺32.000,00'],
    ['− Kart borcuna ödenen', 'uygulamadan önceki kart borcu; bu ayın giderinde yok', '−₺10.000,00'], ['− Hesaplardan harcanan', 'nakit, banka kartı, fatura', '−₺300,00'],
    ['− Uygulamada olmayan hesaba', '⚠️ hesabı silinmiş aktarım: İşlemler\'de düzenleyip hesabı seçin', '−₺2.000,00'], ['= Şu an hesaplarda', '', '₺19.850,00']]);
  eq('Özet: kartla harcanan gidere dahil, dökümde yok', oz.note, 'Kartla harcanan ₺2.000,00 gidere dahil; ödenene kadar kart borcunda durur, bu dökümde yok.');
  if (OUT) await page.screenshot({ path: OUT + '/flow-ozet.png', fullPage: true });

  // Dikkat (İstatistikler ve rapor aynı listeyi kullanır)
  eq('Dikkat: hesabı olmayan aktarım', await page.evaluate(() => App.Insights.compute('2026-10').warnings.filter(w => /aktarım/.test(w.title)).map(w => [w.level, w.title, w.text])), [['yellow', 'Hesabı olmayan aktarım', '05 Ekim 2026 · ₺2.000,00 · Vadesiz → (hesap yok). İşlemler\'de transferi düzenleyip hesabı seçin; para başka birine gittiyse transferi silip gider olarak girin.']]);
  eq('İşlem listesinde aktarım "(hesap yok)" ve uyarı', await page.evaluate(() => { App.UI.nav('islemler'); App.Transactions.renderList(); const r = [...document.querySelectorAll('#txnList .ti')].find(x => /Transfer/.test(x.textContent) && /2\.000/.test(x.textContent)); return r ? [/Vadesiz → \(hesap yok\)/.test(r.textContent), /Hesabı silinmiş: ✎ ile hesabı seçin/.test(r.textContent)] : null; }), [true, true]);

  // Rapor
  const r = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); const tx = el => (el || {}).textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    return { story: tx(d.querySelector('.pr-story')), kpi: [...d.querySelectorAll('.pr-kpi')][2] ? [...[...d.querySelectorAll('.pr-kpi')][2].children].map(tx) : [], pos: [...[...d.querySelectorAll('.pr-pos > div')][2].children].map(tx).join(' '),
      flowHead: tx(d.querySelector('.pr-flow').closest('.pr-sec').querySelector('.pr-h2').firstChild), flow: [...d.querySelectorAll('.pr-flow tbody tr')].map(x => [...x.cells].map(tx)), flowNote: tx(d.querySelector('.pr-flow + .pr-note')),
      bar: tx(d.querySelector('.pr-stack').closest('.pr-sec').querySelector('.pr-h2').firstChild), legend: [...d.querySelectorAll('.pr-legend > div')].map(tx), kalan: /Kalan/.test(d.textContent),
      alerts: [...d.querySelectorAll('.pr-al b')].map(tx), trf: [...d.querySelectorAll('.pr-txns tr.pr-trf')].map(x => tx(x.cells[2])), guide: tx(d.querySelector('.pr-gl > div')) }; });
  // Önümüzdeki ödemeler: Kart B ekstresi 22 Ekim 9.200 → 10.650; Kart A ekstresi 4 Kasım 20.800 → −10.150 (eksiye düşer)
  eq('rapor özeti: "kaldı" demez; kart borcuna ödenen ve hesaplardaki para yazar', r.story, 'Ekim\'in ilk 9 gününde ₺32.000 geldi, ₺2.300 harcandı. Kart borçlarına ₺10.000 ödendi. Hesaplarda şu an ₺19.850 var. En çok harcanan: Market (%87). 4 Kasım\'da hesaplar eksiye düşebilir.');
  eq('rapor: üçüncü kutu "Gelir − gider", elde kalan para değil', r.kpi, ['Gelir − gider', '+₺29.700', 'Harcanmayan pay: %93', 'Elde kalan para değil: hesaplarda şu an ₺19.850']);
  eq('rapor: borç paradan fazla → "₺10.150 eksik"', r.pos, 'Borç düşülünce ₺10.150 eksik');
  eq('rapor: gelen para nereye gitti', [r.flowHead, r.flow], ['Gelen para nereye gitti?', [['Ay başında hesaplarda', '₺150'], ['+ Gelir', '+₺32.000'], ['− Kart borcuna ödenen · uygulamadan önceki kart borcu; bu ayın giderinde yok', '−₺10.000'],
    ['− Hesaplardan harcanan · nakit, banka kartı, fatura', '−₺300'], ['− Uygulamada olmayan hesaba · hesabı silinmiş aktarım', '−₺2.000'], ['= Şu an hesaplarda', '₺19.850']]]);
  eq('rapor: kartla harcanan dökümde yok notu', r.flowNote, 'Kartla yapılan ₺2.000 harcama bu dökümde yok: kart borcuna eklendi, ekstre gününde ödenir.');
  eq('rapor: harcama çubuğu yalnız kategoriler ("Kalan" yok)', [r.bar, r.legend, r.kalan], ['Harcama nereye gitti?', ['Market ₺2.000', 'Diğer ₺300'], false]);
  eq('rapor: Dikkat\'te hesabı olmayan aktarım', r.alerts.includes('Hesabı olmayan aktarım.'), true);
  eq('rapor eki: aktarımın hesabı "hesap yok"', r.trf, ['Vadesiz → hesap yok', 'Vadesiz → Kart A …1111']);
  eq('okuma rehberi "Gelir − gider"i açıklar', r.guide, 'Gelir − gider: ayın geliri eksi harcaması; elde kalan para değildir. Elde kalan, "Gelen para nereye gitti?" bölümünün son satırı.');

  // Transferi Düzenle: hesap seçimi. Önce bir Cüzdan ekle; aktarımı Cüzdan'a bağla
  await page.evaluate(() => { const a = S.accounts(); a.push({ id: 'w', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 0, openingBalance: 0, ts: Date.now() }); S.saveAccounts(a); S.load(); });
  const ed = await page.evaluate(() => { const id = S.txns().find(t => t.transferId === 'tr2' && t.type === 'expense').id; App.Transactions.edit(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop();
    const info = [m.querySelector('.modal-title').textContent, /gittiği hesap uygulamada yok/.test(m.textContent), m.querySelector('[data-pkey="from"]').value, m.querySelector('[data-pkey="to"]').value];
    m.querySelector('[data-pkey="to"]').value = 'b'; m.querySelector('[data-act="ok"]').click(); const same = !!document.querySelector('.modal-bd.show [data-pkey="to"]');
    m.querySelector('[data-pkey="to"]').value = 'w'; m.querySelector('[data-act="ok"]').click();
    return { info, same, legs: S.txns().filter(t => t.transferId === 'tr2').map(t => [t.type, t.accountId, t.amount, t.note]).sort(), bal: [App.Accounts.get('b').balance, App.Accounts.get('w').balance], orph: App.Transactions.orphanTransfers().length }; });
  eq('düzenle penceresi: hesap yok uyarısı, nereden Vadesiz, nereye boş', ed.info, ['Transferi Düzenle', true, 'b', '']);
  eq('aynı hesap seçilirse kaydetmez', ed.same, true);
  eq('Cüzdan seçilince: bacaklar bağlandı, not yenilendi; Vadesiz 19.850 aynı, Cüzdan 2.000; hesabı olmayan aktarım kalmadı', [ed.legs, ed.bal, ed.orph], [[['expense', 'b', 2000, 'Vadesiz → Cüzdan'], ['income', 'w', 2000, 'Vadesiz → Cüzdan']], [19850, 2000], 0]);
  eq('düzeltme sonrası döküm: aktarım hesaplar arası (toplamı değiştirmez); şu an hesaplarda 19.850 + 2.000 = 21.850', await page.evaluate(() => { const f = App.Transactions.moneyFlow('2026-10'); return [f.start, f.income, f.cardPay, f.spend, f.extOut, f.end]; }), [150, 32000, 10000, 300, 0, 21850]);
  eq('düzeltme sonrası uyarı yok', await page.evaluate(() => App.Insights.compute('2026-10').warnings.some(w => /aktarım/.test(w.title))), false);
  eq('yenilemeden sonra da bakiyeler aynı (açılış + hareketler)', await page.evaluate(() => { S.load(); return [App.Accounts.get('b').balance, App.Accounts.get('w').balance, App.Accounts.get('c1').balance]; }), [19850, 2000, -20800]);
  // Kart borcu paradan azsa "elinizde kalan" ve eksi işareti yok
  eq('borç paradan az: "elinizde kalan"', await page.evaluate(() => { const a = S.accounts(), b = a.find(x => x.id === 'b'); b.openingBalance += 20000; b.balance += 20000; S.saveAccounts(a); S.load(); App.Accounts.renderSummary(); return [document.getElementById('heroAfter').textContent, document.getElementById('heroAfterNote').textContent, document.getElementById('heroAfter').classList.contains('ht-neg')]; }), ['₺11.850,00', 'elinizde kalan', false]);
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
