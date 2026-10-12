// Usage: node tests/qc-goals.test.js
// Birikim hedefi tarihi ve tahmin: son 3 ayın (bu ay dahil; hedef daha yeniyse açıldığı aydan beri) aylık ortalama katkısıyla
// ne zaman tamamlanacağı, hedef tarihi varsa yetişmesi için ayda ne kadar gerektiği; kart satırları, özet, uyarılar, ekleme ve
// düzenleme, kayıt temizliği. Beklenen değerler elle hesaplandı. Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027; katkı penceresi Ağustos–Ekim (3 ay).
// Tatil: 30.000, 15.000 birikti (Haziran'daki 6.000 pencere dışında), Ağu/Eyl/Eki 3.000 → ayda 3.000; kalan 15.000 / 3.000 = 5 ay → Mart 2028; hedef Mart 2028 → yolunda (ayda 15.000 / 5 = 3.000)
// Araba: 100.000, Eylül'de açıldı, Eyl/Eki 4.000 → ayda 8.000 / 2 = 4.000; kalan 92.000 / 4.000 = 23 ay → Eylül 2029; hedef Haziran 2028 (8 ay) → geride, ayda 11.500
// Bilgisayar: tarih yok, Ekim'de açıldı, 5.000 → ayda 5.000; kalan 15.000 → 3 ay → Ocak 2028
// Kurs: hedef Ağustos 2027 geçti, 8.000 eksik. Bisiklet: son 3 ayda katkı yok. Okul: hedef ayı bu ay, 2.000 eksik. Telefon: tamamlandı
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const ts = d => new Date(d + 'T12:00:00').getTime(); let ci = 0; const c = (date, amount) => ({ id: 'c' + (++ci), amount, date, note: '', accountId: '', txnId: '', transferId: '' });
const G = [
  { id: 'g1', name: 'Tatil', target: 30000, emoji: '🏖', txnMode: 'none', contributions: [c('2027-06-10', 6000), c('2027-08-05', 3000), c('2027-09-05', 3000), c('2027-10-05', 3000)], done: null, ts: ts('2027-06-01'), due: '2028-03' },
  { id: 'g2', name: 'Araba', target: 100000, emoji: '🚗', txnMode: 'none', contributions: [c('2027-09-20', 4000), c('2027-10-10', 4000)], done: null, ts: ts('2027-09-15'), due: '2028-06' },
  { id: 'g3', name: 'Bilgisayar', target: 20000, emoji: '💻', txnMode: 'none', contributions: [c('2027-10-01', 5000)], done: null, ts: ts('2027-10-01') },
  { id: 'g4', name: 'Kurs', target: 10000, emoji: '📚', txnMode: 'none', contributions: [c('2027-03-05', 2000)], done: null, ts: ts('2027-03-01'), due: '2027-08' },
  { id: 'g5', name: 'Bisiklet', target: 8000, emoji: '🚲', txnMode: 'none', contributions: [c('2027-01-05', 1000)], done: null, ts: ts('2027-01-01') },
  { id: 'g6', name: 'Okul', target: 3000, emoji: '🎒', txnMode: 'none', contributions: [c('2027-10-02', 1000)], done: null, ts: ts('2027-09-01'), due: '2027-10' },
  { id: 'g7', name: 'Telefon', target: 5000, emoji: '📱', txnMode: 'none', contributions: [c('2027-05-01', 5000)], done: ts('2027-05-01'), ts: ts('2027-04-01'), due: '2027-12' }];
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 0, openingBalance: 0, ts: 1 }], pf_t: [], pf_g: G };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-10-20T10:00:00'));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(300);
  const sp = s => String(s || '').replace(/\s+/g, ' ').trim();
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent));
  const fc = name => page.evaluate(n => { const g = S.goals().find(x => x.name === n), f = App.Goals.forecast(g); return [f.status, f.pace, f.eta, f.need, f.text]; }, name);

  // 1) Tahminler
  eq('Tatil: yolunda', await fc('Tatil'), ['ok', 3000, '2028-03', 3000, 'Yolunda: bu hızla (ayda ~₺3.000,00) Mart 2028 ayında tamamlanır; hedef Mart 2028.']);
  eq('Araba: geride (Eylül\'de açıldı: 2 ayın ortalaması)', await fc('Araba'), ['behind', 4000, '2029-09', 11500, 'Geride: Haziran 2028 ayına yetişmesi için ayda ₺11.500,00 ayırın (son aylarda ayda ~₺4.000,00).']);
  eq('Bilgisayar: tarihsiz tahmin', await fc('Bilgisayar'), ['pace', 5000, '2028-01', 0, 'Bu hızla (ayda ~₺5.000,00) Ocak 2028 ayında tamamlanır.']);
  eq('Kurs: tarihi geçti', await fc('Kurs'), ['late', 0, '', 0, 'Hedef tarihi (Ağustos 2027) geçti; ₺8.000,00 eksik.']);
  eq('Bisiklet: katkı durmuş', await fc('Bisiklet'), ['stalled', 0, '', 0, 'Son 3 ayda katkı yok; ne zaman tamamlanacağı hesaplanamıyor.']);
  eq('Okul: hedef ayı bu ay', await fc('Okul'), ['behind', 500, '2028-02', 2000, 'Hedef ayı bu ay: ₺2.000,00 daha gerekiyor.']);
  eq('Telefon: tamamlandı (tahmin yok)', await fc('Telefon'), ['done', 0, '', 0, '']);

  // 2) Birikim sayfası: özet ve kart satırları
  await page.evaluate(() => App.UI.nav('hedefler')); await page.waitForTimeout(100);
  const pg = await page.evaluate(() => { const sp = s => String(s || '').replace(/\s+/g, ' ').trim();
    return { plan: [sp(document.querySelector('#goalsPlan .goal-plan b').textContent), sp(document.querySelector('#goalsPlan .goal-plan span').textContent)],
      cards: [...document.querySelectorAll('#goalsGrid .goal-card')].map(c => [sp(c.querySelector('.goal-name').textContent), sp((c.querySelector('.goal-due') || {}).textContent), (c.querySelector('.goal-eta') || {}).className || '']) }; });
  eq('özet: tarihli hedefler için ayda 3.000 + 11.500 + 2.000', pg.plan, ['📅 Tarihli hedefler için ayda ₺16.500,00 ayırın', '3 hedef · 2 tanesi geride']);
  eq('kartlar: hedef tarihi satırı ve tahmin rengi', pg.cards, [
    ['Tatil', '🗓 Hedef tarihi: Mart 2028 · 5 ay kaldı', 'goal-eta good'], ['Araba', '🗓 Hedef tarihi: Haziran 2028 · 8 ay kaldı', 'goal-eta warn'], ['Bilgisayar', '', 'goal-eta'],
    ['Kurs', '🗓 Hedef tarihi: Ağustos 2027', 'goal-eta bad'], ['Bisiklet', '', 'goal-eta'], ['Okul', '🗓 Hedef tarihi: Ekim 2027 · bu ay', 'goal-eta warn'], ['Telefon ✅', '', '']]);

  // 3) Uyarılar (içinde bulunulan ay); geçmiş ayın raporunda yok
  eq('uyarılar: geride, tarihi geçti, ayı bu ay', await page.evaluate(() => App.Insights.compute('2027-10').warnings.filter(w => /hedef/.test(w.title)).map(w => [w.level, w.title, w.text])), [
    ['yellow', 'Araba hedefi geride', 'Haziran 2028 ayına yetişmesi için ayda ₺11.500,00 ayırın (son aylarda ayda ~₺4.000,00).'],
    ['yellow', 'Kurs hedefinin tarihi geçti', 'Hedef tarihi Ağustos 2027 · ₺8.000,00 eksik.'],
    ['yellow', 'Okul hedefinin ayı bu ay', '₺2.000,00 daha gerekiyor.']]);
  eq('geçmiş ayda hedef uyarısı yok', await page.evaluate(() => App.Insights.compute('2027-09').warnings.filter(w => /hedef/.test(w.title)).length), 0);

  // 4) Katkı eklenince tahmin değişir: Araba'ya bugün 60.000 → ayda (8.000 + 60.000) / 2 = 34.000; kalan 32.000 → Kasım 2027, yolunda
  await page.evaluate(() => { document.getElementById('ca_g2').value = '60.000'; document.getElementById('cd_g2').value = '2027-10-20'; App.Goals.addContrib('g2'); });
  eq('Araba katkıdan sonra yolunda', await fc('Araba'), ['ok', 34000, '2027-11', 4000, 'Yolunda: bu hızla (ayda ~₺34.000,00) Kasım 2027 ayında tamamlanır; hedef Haziran 2028.']);
  eq('özet güncellendi (3.000 + 4.000 + 2.000; yalnız Okul geride)', await page.evaluate(() => [...document.querySelectorAll('#goalsPlan .goal-plan > *')].map(e => e.textContent.trim())), ['📅 Tarihli hedefler için ayda ₺9.000,00 ayırın', '3 hedef · 1 tanesi geride']);

  // 5) Yeni hedef: geçmiş ay reddedilir; geçerli tarih kaydedilir ve alan temizlenir
  const addGoal = (name, amt, due) => page.evaluate(v => { document.getElementById('gName').value = v[0]; document.getElementById('gTarget').value = v[1]; document.getElementById('gDue').value = v[2]; App.Goals.add(); }, [name, amt, due]);
  await addGoal('Düğün', '50.000', '2027-09');
  eq('geçmiş ay: hata, hedef eklenmedi', [(await toasts()).some(t => /Hedef tarihi bu ay ya da sonrası olmalı/.test(t)), await page.evaluate(() => S.goals().some(g => g.name === 'Düğün'))], [true, false]);
  await addGoal('Düğün', '50.000', '2028-10');
  eq('geçerli tarih: kaydedildi, alan boşaldı, katkısız tahmin', await page.evaluate(() => { const g = S.goals().find(x => x.name === 'Düğün'), f = App.Goals.forecast(g); return [g.due, document.getElementById('gDue').value, f.status, f.need, f.text]; }),
    ['2028-10', '', 'behind', 4167, 'Geride: Ekim 2028 ayına yetişmesi için ayda ₺4.167,00 ayırın (son 3 ayda katkı yok).']);
  await addGoal('Kamp', '2.000', '');
  eq('tarihsiz hedef: due alanı yok', await page.evaluate(() => 'due' in S.goals().find(x => x.name === 'Kamp')), false);

  // 6) Düzenleme: Bilgisayar'a Aralık 2027 → ayda 15.000 / 2 = 7.500, Ocak 2028'de biter → geride. Geçmiş ay reddedilir;
  // tarihi geçmiş Kurs'un tarihi değiştirilmeden adı düzenlenebilir; tarih silinince alan kalkar
  const edit = async (id, vals) => { await page.evaluate(i => App.Goals.edit(i), id); await page.evaluate(v => { const d = document.querySelector('.app-dialog-holder'); Object.keys(v).forEach(k => { d.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); d.querySelector('[data-act="ok"]').click(); }, vals); };
  eq('düzenleme penceresinde tarih alanı (ay seçici)', await page.evaluate(() => { App.Goals.edit('g1'); const i = document.querySelector('.app-dialog-holder [data-pkey="due"]'), r = [i.type, i.value]; document.querySelector('.app-dialog-holder [data-act="cancel"]').click(); return r; }), ['month', '2028-03']);
  await edit('g3', { due: '2027-09' });
  eq('geçmiş ay: hata, pencere açık', [(await toasts()).filter(t => /bu ay ya da sonrası/.test(t)).length >= 2, await page.evaluate(() => !!document.querySelector('.app-dialog-holder'))], [true, true]);
  await page.evaluate(() => { const d = document.querySelector('.app-dialog-holder'); d.querySelector('[data-pkey="due"]').value = '2027-12'; d.querySelector('[data-act="ok"]').click(); });
  eq('Bilgisayar Aralık 2027: geride, ayda 7.500', await fc('Bilgisayar'), ['behind', 5000, '2028-01', 7500, 'Geride: Aralık 2027 ayına yetişmesi için ayda ₺7.500,00 ayırın (son aylarda ayda ~₺5.000,00).']);
  await edit('g4', { name: 'Yüzme kursu' });
  eq('tarihi geçmiş hedefin adı düzenlenebilir, tarih kalır', await page.evaluate(() => { const g = S.goals().find(x => x.id === 'g4'); return [g.name, g.due, !document.querySelector('.app-dialog-holder')]; }), ['Yüzme kursu', '2027-08', true]);
  await edit('g4', { due: '' });
  eq('tarih silinince alan kalkar, uyarı gider', await page.evaluate(() => ['due' in S.goals().find(x => x.id === 'g4'), App.Insights.compute('2027-10').warnings.some(w => /Yüzme kursu/.test(w.title))]), [false, false]);

  // 7) Kayıt temizliği ve eşitleme
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('pf_g')); g.find(x => x.id === 'g5').due = '2028-13'; g.find(x => x.id === 'g3').due = '2027-12'; localStorage.setItem('pf_g', JSON.stringify(g)); });
  await page.reload(); await page.waitForTimeout(300);
  eq('geçersiz tarih atılır, geçerli kalır', await page.evaluate(() => [S.goals().find(x => x.id === 'g5').due, S.goals().find(x => x.id === 'g3').due]), [undefined, '2027-12']);
  eq('eşitlenen hedefte tarih var', await page.evaluate(() => App.Sync.collect().stores.pf_g.filter(g => g.due).map(g => g.name + ':' + g.due).sort()), ['Araba:2028-06', 'Bilgisayar:2027-12', 'Düğün:2028-10', 'Okul:2027-10', 'Tatil:2028-03', 'Telefon:2027-12']);

  // 8) Dar ekran: Birikim sayfası taşmıyor
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => App.UI.nav('hedefler')); await page.waitForTimeout(100);
  eq('320 px: taşma yok', await page.evaluate(() => { const bad = []; document.querySelectorAll('#page-hedefler *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5)]; }), [true, []]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
