// Usage: node tests/qc-cardpay.test.js
// Kart borcu ödemeleri ve eski borç (beklenen değerler elle hesaplandı):
//  B) Hesap uygulamaya eklenmeden (ya da bakiyesi elle bankayla eşitlenmeden) önceki tarihli ekstre satırları bakiyeyi ikinci kez
//     değiştirmez; gelir/gider olarak kendi ayına yazılır. Silme, geri alma, tutar/tarih düzenleme bakiyeyi bozmaz.
//  A) "Para nereye gitti": ayın kart borcu ödemeleri (gider sayılmaz), kartla harcanan (gidere dahil, iade düşülür) ve ödemelerin
//     uygulamadan önceki borca giden kısmı; Özet ve aylık rapor aynı rakamı gösterir.
//  C) Uygulamadan önceki kart borcu: ödemeler önce onu kapatır (ilk giren ilk çıkar); kalan Özet, kart detayı ve raporda görünür.
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
// Hesapların uygulamaya eklendiği an (tarayıcıyla aynı yerel saat dilimi)
const at = iso => new Date(iso + 'T10:00:00').getTime();
const TODAY = '2026-10-08';
const tx = (id, type, amount, date, accountId, o) => Object.assign({ id, type, amount, category: type === 'income' ? 'Maaş' : 'Market', date, note: id, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, o || {});
const pay = (id, amount, date, from, to) => [tx(id + '_o', 'expense', amount, date, from, { category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id }), tx(id + '_i', 'income', amount, date, to, { category: 'Transfer', note: 'Kart borcu ödemesi', transferId: id })];

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
  const acc = (p, id) => p.evaluate(id => { const a = App.Accounts.get(id); return [a.balance, a.openingBalance]; }, id);
  const exp = (p, m) => p.evaluate(m => App.Transactions.monthTotals(m).expense, m);
  const editTx = (p, id, vals) => p.evaluate(({ id, vals }) => { App.Transactions.edit(id); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); Object.keys(vals).forEach(k => { const el = m.querySelector('[data-pkey="' + k + '"]'); el.value = vals[k]; }); m.querySelector('[data-act="ok"]').click(); }, { id, vals });
  // Ekstre önizlemesi: dosya satırları okunur, hesap seçilir, özet/etiketler alınır; istenirse eklenir
  const importStmt = (p, accId, lines, commit) => p.evaluate(({ accId, lines, commit }) => {
    App.Statement._load('ekstre.pdf', { lines }); App.Statement.open(); App.Statement.setAccount(accId);
    const out = { sum: document.getElementById('stmtSum').innerText.replace(/\s+/g, ' '), badges: [...document.querySelectorAll('#stmtList .stmt-row')].map(r => [r.querySelector('.stmt-desc').firstChild.textContent.trim(), (r.querySelector('.stmt-badge') || {}).textContent || '', r.querySelector('input').checked]) };
    if (commit) App.Statement.commit(); else App.Statement.close();
    return out;
  }, { accId, lines, commit });

  // B1) Kart 1 Ekim'de eklendi, borç 36.000 (eylül harcamaları dahil). Eylül–ekim ekstresi yüklenince eylül satırları bakiyeyi değiştirmez
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: at('2026-10-01') }, { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: -36000, openingBalance: -36000, ts: at('2026-10-01') }], pf_t: [] });
    const lines = ['Yapı Kredi Kredi Kartı Hesap Özeti', '10.09.2026 MIGROS KADIKOY 4.500,00', '20.09.2026 TEKNOSA 2.500,00', '28.09.2026 ÖDEME - TEŞEKKÜR EDERİZ -9.000,00', '01.10.2026 SOK MARKET 100,00', '05.10.2026 A101 200,00'];
    const pv = await importStmt(page, 'c', lines, true);
    eq('önizleme: eylül satırları "bakiye değişmez", ödeme işaretsiz, eklendiği gün (1 Ekim) normal', pv.badges, [['MIGROS KADIKOY', 'bakiye değişmez', true], ['TEKNOSA', 'bakiye değişmez', true], ['ÖDEME - TEŞEKKÜR EDERİZ', 'kart ödemesi', false], ['SOK MARKET', '', true], ['A101', '', true]]);
    eq('önizleme özeti: bakiyeye etkisi yalnız ekim satırları (−300), not eklenme tarihini söyler', [/bakiyeye etkisi −₺300,00/.test(pv.sum), /2 satır, hesabı uygulamaya eklediğiniz 01 Ekim 2026 tarihinden önce/.test(pv.sum), /bakiyeyi değiştirmez/.test(pv.sum)], [true, true, true]);
    // bakiye −36.000 − 100 − 200 = −36.300; açılış −36.000 + 7.000 = −29.000 (eylül başı borcu); eylül gideri 7.000, ekim 300
    eq('ekleme sonrası: kart −36.300, açılış −29.000', await acc(page, 'c'), [-36300, -29000]);
    eq('eylül gideri 7.000, ekim gideri 300 (ödeme gider değil, eklenmedi)', [await exp(page, '2026-09'), await exp(page, '2026-10')], [7000, 300]);
    eq('işaretli satır sayısı 2 (yalnız eylül)', await page.evaluate(() => S.txns().filter(t => t.preOpen).map(t => t.date).sort()), ['2026-09-10', '2026-09-20']);
    await page.reload(); await page.waitForTimeout(300);
    eq('yenileme sonrası aynı (bakiye = açılış + hareketler mutabakatı)', await acc(page, 'c'), [-36300, -29000]);
    eq('eski borç (C): eklerken girilen 36.000 korunur, ödeme yok → 36.000 kaldı', await page.evaluate(() => App.Cards.oldDebt('c')), { start: 36000, since: '2026-10-01', paid: 0, left: 36000 });
    eq('işlem listesinde "bakiye değişmedi" etiketi 2 satırda', await page.evaluate(() => { App.UI.nav('islemler'); document.getElementById('fMonth').value = ''; App.Transactions.renderList(); return [...document.querySelectorAll('#txnList .ti')].filter(x => /bakiye değişmedi/.test(x.textContent)).length; }), 2);
    eq('eylül raporu: satır açıklaması bakiyenin neden değişmediğini söyler', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-09'); return [...d.querySelectorAll('.pr-txns tr')].filter(r => /MIGROS/.test(r.textContent)).map(r => /kart eklenmeden önce; kart borcunu değiştirmedi/.test(r.textContent)); }), [true]);
    // Hesaplar tablosu: ay başında, giren, çıkan, ay sonunda; kart sonradan eklendi ama eylül satırları olduğu için eylül raporunda
    eq('eylül raporu hesap satırı: ay başı −29.000, çıkan 7.000, ay sonu borç 36.000 (o güne geri hesaplanan), eski borç notu yok', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-09'); const r = [...d.querySelectorAll('.pr-accs tbody tr')].find(x => /Kart/.test(x.cells[0].textContent)); return [[...r.cells].slice(1).map(c => c.textContent), /Uygulamadan önceki borç/.test(d.textContent)]; }), [['−₺29.000', '—', '−₺7.000', '−₺36.000'], false]);
    // Silme ve geri alma: bakiye değişmez, açılış geri kayar
    const mig = await page.evaluate(() => S.txns().find(t => /MIGROS/.test(t.note)).id);
    const removed = await page.evaluate(id => { const t = JSON.parse(JSON.stringify(S.txns().find(x => x.id === id))); App.Transactions.purge(id); return t; }, mig);
    eq('eylül satırı silindi: kart −36.300 kalır, açılış −33.500, eylül gideri 2.500', [await acc(page, 'c'), await exp(page, '2026-09')], [[-36300, -33500], 2500]);
    await page.evaluate(t => App.Transactions.restore([t]), removed);
    eq('geri alındı: açılış −29.000, eylül gideri 7.000', [await acc(page, 'c'), await exp(page, '2026-09')], [[-36300, -29000], 7000]);
    const tek = await page.evaluate(() => S.txns().find(t => /TEKNOSA/.test(t.note)).id);
    await editTx(page, tek, { amount: '3000' });
    eq('eylül satırının tutarı 2.500 → 3.000: kart yine −36.300, açılış −28.500, eylül 7.500', [await acc(page, 'c'), await exp(page, '2026-09')], [[-36300, -28500], 7500]);
    await editTx(page, tek, { date: '2026-10-02' });
    // eklendikten sonraki bir güne taşındı: artık normal hareket, borca eklenir (−36.300 − 3.000)
    eq('tarihi 2 Ekim\'e taşındı: normal harekete döner, kart −39.300, açılış −31.500', [await acc(page, 'c'), await page.evaluate(id => !!S.txns().find(t => t.id === id).preOpen, tek)], [[-39300, -31500], false]);
    eq('eylül 4.500, ekim 3.300', [await exp(page, '2026-09'), await exp(page, '2026-10')], [4500, 3300]);
    await ctx.close();
  }
  // B2) Eski sürümlü cihaz işareti (preOpen) silse de bakiye bozulmaz: açılış kaydırıldığı için toplam aynı kalır
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: -36000, openingBalance: -36000, ts: at('2026-10-01') }], pf_t: [] });
    await importStmt(page, 'c', ['Kredi Kartı Hesap Özeti', '10.09.2026 MIGROS 4.500,00', '20.09.2026 TEKNOSA 2.500,00'], true);
    await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('pf_t')); t.forEach(x => delete x.preOpen); localStorage.setItem('pf_t', JSON.stringify(t)); });
    await page.reload(); await page.waitForTimeout(300);
    eq('işaret silinip yeniden yüklendi: kart −36.000 (değişmedi), eylül gideri 7.000', [await acc(page, 'c'), await exp(page, '2026-09')], [[-36000, -29000], 7000]);
    await ctx.close();
  }
  // B3) Bakiye 8 Ekim'de elle bankayla eşitlendi: o günden önceki ekstre satırı bakiyeyi değiştirmez, o günkü satır değiştirir
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: at('2026-10-01') }], pf_t: [] });
    await page.evaluate(() => { App.Accounts.edit('b'); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="balance"]').value = '9000'; m.querySelector('[data-act="ok"]').click(); });
    eq('elle eşitleme: bakiye 9.000, açılış 9.000, eşitleme günü kaydedildi', await page.evaluate(() => { const a = App.Accounts.get('b'); return [a.balance, a.openingBalance, a.balAt]; }), [9000, 9000, TODAY]);
    const pv = await importStmt(page, 'b', ['Hesap Hareketleri IBAN', '03.10.2026 ATM PARA CEKME -1.000,00', '08.10.2026 MARKET -50,00'], true);
    eq('önizleme notu eşitleme tarihini söyler', /1 satır, bakiyeyi bankayla eşitlediğiniz 08 Ekim 2026 tarihinden önce/.test(pv.sum), true);
    // 9.000 − 50 = 8.950; açılış 9.000 + 1.000 = 10.000; ekim gideri 1.050
    eq('3 Ekim satırı bakiyeyi değiştirmez, 8 Ekim satırı değiştirir: 8.950, açılış 10.000, ekim gideri 1.050', [await acc(page, 'b'), await exp(page, '2026-10')], [[8950, 10000], 1050]);
    await page.reload(); await page.waitForTimeout(300);
    eq('yenileme sonrası eşitleme günü ve bakiye korunur', await page.evaluate(() => { const a = App.Accounts.get('b'); return [a.balance, a.balAt]; }), [8950, TODAY]);
    await ctx.close();
  }
  // B4) Eklenme anı bilinmeyen eski kayıtlı hesap (ts yok/küçük): eski davranış, tüm geçmiş satırlar bakiyeye işlenir
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: 0, openingBalance: 0, ts: 2 }], pf_t: [] });
    const pv = await importStmt(page, 'c', ['Kredi Kartı Hesap Özeti', '10.09.2026 MIGROS 5.000,00'], true);
    eq('eklenme anı bilinmiyor: etiket/not yok, kart −5.000', [pv.badges.map(b => b[1]), /bakiyeye etkisi/.test(pv.sum), await acc(page, 'c')], [[''], false, [-5000, 0]]);
    await ctx.close();
  }
  // A) Maaş 45.000; 4 Ekim'de karta 12.500 + 3.500 ödeme; ekimde kartla 2.600 + 1.400 harcama, 300 iade (kurmaca)
  {
    const T = [tx('maas', 'income', 45000, '2026-10-03', 'b'), ...pay('p1', 12500, '2026-10-04', 'b', 'c'), ...pay('p2', 3500, '2026-10-04', 'b', 'c'),
      tx('m1', 'expense', 2600, '2026-10-05', 'c', { note: 'Migros' }), tx('m2', 'expense', 1400, '2026-10-06', 'c', { note: 'Lokanta', category: 'Yemek' }), tx('r1', 'income', 300, '2026-10-07', 'c', { category: 'İade', note: 'İade' })];
    // banka 10.000 + 45.000 − 16.000 = 39.000; kart −36.000 + 16.000 − 2.600 − 1.400 + 300 = −23.700
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Maaş Hesabı', type: 'bank', owner: 'shared', balance: 39000, openingBalance: 10000, ts: at('2026-10-01') }, { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: -23700, openingBalance: -36000, ts: at('2026-10-01') }], pf_t: T });
    eq('bakiyeler: banka 39.000, kart −23.700', [(await acc(page, 'b'))[0], (await acc(page, 'c'))[0]], [39000, -23700]);
    eq('ekim: gelir 45.000, gider 3.700 (kart ödemeleri gider değil, iade düşülür)', await page.evaluate(() => App.Transactions.monthTotals('2026-10')), { income: 45000, expense: 3700, count: 4 });
    eq('ekim kart akışı: ödenen 16.000, kartla harcanan 3.700, eski borca giden 16.000', await page.evaluate(() => { const f = App.Cards.monthFlow('2026-10'); return [f.paid, f.spent, f.paidOld]; }), [16000, 3700, 16000]);
    // Banka 10.000 (1 Ekim'de eklendi) + 45.000 maaş − 16.000 kart ödemesi = 39.000; kartla harcanan 3.700 dökümde yok
    eq('Özet "Bu Ay": gelen para nereye gitti (kart ödemesi eski borç, kartla harcanan ayrı not)', await page.evaluate(() => { App.UI.nav('ozet'); App.Transactions.renderSummaryMetrics(); const el = document.getElementById('mCards');
      return [el.hidden, [...el.querySelectorAll('.mf-row')].map(r => [r.querySelector('span').firstChild.textContent, (r.querySelector('small') || {}).textContent || '', r.querySelector('b').textContent]), el.querySelector('.mc-note').textContent]; }),
      [false, [['Ay başında hesaplarda', '', '₺10.000,00'], ['＋ Gelir', '', '+₺45.000,00'], ['− Kart borcuna ödenen', 'uygulamadan önceki kart borcu; bu ayın giderinde yok', '−₺16.000,00'], ['= Şu an hesaplarda', '', '₺39.000,00']],
        'Kartla harcanan ₺3.700,00 gidere dahil; ödenene kadar kart borcunda durur, bu dökümde yok.']);
    eq('ekim raporu: gider 3.700; kart ödemeleri 16.000 (gider değil, eski borç payı yazılı); kartla harcanan 3.700', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); const t = d.textContent.replace(/\s+/g, ' ');
      return [d.querySelector('.pr-kout .pr-kv').textContent, /Bu ay kartlara ₺16\.000 ödendi; gider sayılmadı, harcamalar kartla yapıldıkları gün yazıldı\./.test(t), /Bunun ₺16\.000 kadarı uygulamadan önceki kart borcunu kapattı\./.test(t), /Bu ay kartla harcanan: ₺3\.700 \(gidere dahil\)\./.test(t)]; }), ['₺3.700', true, true, true]);
    eq('eski borç (C): 36.000; 16.000 ödendi, 20.000 kaldı', await page.evaluate(() => App.Cards.oldDebt('c')), { start: 36000, since: '2026-10-01', paid: 16000, left: 20000 });
    eq('Kartlarım satırı ve kart detayı kalan eski borcu gösterir', await page.evaluate(() => { App.Cards.renderBars(); const bar = document.getElementById('ozet-cardbars').innerText.replace(/\s+/g, ' '); App.Cards.detail('c'); const det = document.getElementById('cardDetailHolder').innerText.replace(/\s+/g, ' '); App.UI.closeModal('cardDetailHolder');
      return [/Uygulamadan önceki borç: ₺20\.000,00 kaldı · ₺16\.000,00 ödendi/.test(bar), /Kartı eklerken girilen borç ₺36\.000,00/.test(det), /Sonraki ödemelerle kapanan ₺16\.000,00/.test(det), /Kalan ₺20\.000,00/.test(det)]; }), [true, true, true, true]);
    eq('ekim raporu hesap satırı: eski borç durumu kartın altında yazılı', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2026-10'); const r = [...d.querySelectorAll('.pr-accs tbody tr')].find(x => /Kart/.test(x.cells[0].textContent)); return [r.cells[4].textContent, r.nextElementSibling.textContent]; }), ['−₺23.700', 'Uygulamadan önceki borç ₺36.000: ₺16.000 ödendi, ₺20.000 kaldı.']);
    await ctx.close();
  }
  // C) İki aya yayılan eski borç: kart 15 Eylül'de 10.000 borçla eklendi; 20 Eylül 4.000, 4 Ekim 9.000 ödeme; 25 Eylül 2.000, 5 Ekim 1.000 harcama
  {
    const T = [...pay('q1', 4000, '2026-09-20', 'b', 'c'), tx('s1', 'expense', 2000, '2026-09-25', 'c'), ...pay('q2', 9000, '2026-10-04', 'b', 'c'), tx('s2', 'expense', 1000, '2026-10-05', 'c')];
    // kart −10.000 + 4.000 − 2.000 + 9.000 − 1.000 = 0; banka 50.000 − 13.000 = 37.000
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 37000, openingBalance: 50000, ts: at('2026-09-15') }, { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: 0, openingBalance: -10000, ts: at('2026-09-15') }], pf_t: T });
    // eylül: 4.000 ödemenin tamamı eski borca (10.000'den); ekim: kalan 6.000 eski borç, 9.000 ödemenin 6.000'i eski borca
    eq('eylül akışı: ödenen 4.000, harcanan 2.000, eski borca 4.000', await page.evaluate(() => { const f = App.Cards.monthFlow('2026-09'); return [f.paid, f.spent, f.paidOld]; }), [4000, 2000, 4000]);
    eq('ekim akışı: ödenen 9.000, harcanan 1.000, eski borca 6.000', await page.evaluate(() => { const f = App.Cards.monthFlow('2026-10'); return [f.paid, f.spent, f.paidOld]; }), [9000, 1000, 6000]);
    eq('eski borç bugün: tamamı ödendi (kalan 0); 30 Eylül itibarıyla 6.000 kalmıştı', await page.evaluate(() => [App.Cards.oldDebt('c'), App.Cards.oldDebt('c', '2026-09-30')]), [{ start: 10000, since: '2026-09-15', paid: 10000, left: 0 }, { start: 10000, since: '2026-09-15', paid: 4000, left: 6000 }]);
    eq('raporlar: eylülde "4.000 ödendi, 6.000 kaldı", ekimde "tamamı ödendi"', await page.evaluate(() => ['2026-09', '2026-10'].map(m => { const d = document.createElement('div'); d.innerHTML = App.Report.build(m); const r = [...d.querySelectorAll('.pr-accs tbody tr')].find(x => /Kart/.test(x.cells[0].textContent)); return r.nextElementSibling.textContent; })), ['Uygulamadan önceki borç ₺10.000: ₺4.000 ödendi, ₺6.000 kaldı.', 'Uygulamadan önceki borç ₺10.000: tamamı ödendi.']);
    eq('kalan eski borç yoksa Kartlarım satırı göstermez; detay "Kapandı ✓"', await page.evaluate(() => { App.Cards.renderBars(); const bar = document.getElementById('ozet-cardbars').innerText; App.Cards.detail('c'); const det = document.getElementById('cardDetailHolder').innerText.replace(/\s+/g, ' '); App.UI.closeModal('cardDetailHolder'); return [/Uygulamadan önceki borç/.test(bar), /Kalan Kapandı ✓/.test(det)]; }), [false, true]);
    await ctx.close();
  }
  // Net servet geçmişi: kart eklenmeden önceki ay (eylül) kart hiç sayılmaz, eylül ekstresi yüklense de
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 10000, openingBalance: 10000, ts: at('2026-08-01') }, { id: 'c', name: 'Kart', type: 'card', owner: 'shared', balance: -36000, openingBalance: -36000, ts: at('2026-10-01') }], pf_t: [], pf_nw: [{ month: '2026-09', total: 10000, accounts: 10000, portfolio: 0, lent: 0, borrowed: 0, ts: 1 }] });
    await importStmt(page, 'c', ['Kredi Kartı Hesap Özeti', '10.09.2026 MIGROS 4.500,00', '20.09.2026 TEKNOSA 2.500,00'], true);
    eq('net servet: eylül 10.000 (yalnız banka), ekim 10.000 − 36.000 = −26.000', await page.evaluate(() => App.NetWorth._history().map(h => [h.month, h.total])), [['2026-09', 10000], ['2026-10', -26000]]);
    await ctx.close();
  }
  // Kart yoksa ya da bu ay kart hareketi yoksa Özet'te kart satırı çıkmaz
  {
    const { page, ctx } = await open({ pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 9000, openingBalance: 10000, ts: at('2026-10-01') }], pf_t: [tx('x', 'expense', 1000, '2026-10-02', 'b')] });
    eq('kart yok: "Bu Ay" dökümünde kart satırı ve kart notu yok (10.000 − 1.000 = 9.000)', await page.evaluate(() => { App.Transactions.renderSummaryMetrics(); const el = document.getElementById('mCards');
      return [el.hidden, [...el.querySelectorAll('.mf-row')].map(r => r.querySelector('span').firstChild.textContent + ' ' + r.querySelector('b').textContent), !!el.querySelector('.mc-note')]; }),
      [false, ['Ay başında hesaplarda ₺10.000,00', '− Hesaplardan harcanan −₺1.000,00', '= Şu an hesaplarda ₺9.000,00'], false]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
