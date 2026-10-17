// Usage: node tests/qc-loans.test.js
// Banka kredileri ve borç bitirme planı: eşit taksitli ödeme planı (taksitten faiz ya da faizden taksit, KKDF + BSMV), taksit
// gününe göre ödenen taksit, ara ödeme (vade kısalır), erken kapatma tahmini, kapatma; nakit akışı (tekrarlayan kredi ödemesiyle
// çift sayılmaz), net servet, sağlık puanı, PDF rapor, eşitleme ve yedek; çığ / kartopu planı. Beklenen değerler bağımsız bir
// hesapla (aynı kurallar, ayrı kod) bulundu. Kurmaca veri (Deniz ve Ece); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027.
// Taşıt: 300.000, 36 ay, taksit 16.500 (her ayın 15'i, Ocak 2027'den) → aylık faiz %4,286; 10 taksit ödendi, kalan anapara 255.688,14.
// Konut: 1.200.000, 120 ay, %2,79 (vergisiz) → taksit 34.759,28 (her ayın 5'i, Haziran 2026'dan); 10 Mart 2027'de 50.000 ara ödeme → 99 taksit.
// Tekrarlayan "Taşıt kredisi taksidi" (16.500, ayın 15'i) var: nakit akışında kredi taksidi ikinci kez yazılmaz.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const L = [{ id: 'ln1', name: 'Taşıt kredisi', kind: 'tasit', principal: 300000, term: 36, first: '2027-01-15', installment: 16500, rate: 0, tax: true, accountId: 'b', prepay: [], closed: null, ts: 1 },
  { id: 'ln2', name: 'Konut kredisi', kind: 'konut', principal: 1200000, term: 120, first: '2026-06-05', installment: 0, rate: 2.79, tax: false, accountId: 'b', prepay: [{ id: 'lp1', date: '2027-03-10', amount: 50000 }], closed: null, ts: 2 }];
const T = ['2027-07', '2027-08', '2027-09'].map((m, i) => ({ id: 'i' + i, date: m + '-01', type: 'income', amount: 100000, category: 'Maaş', note: 'Maaş', accountId: 'b', userId: 'u_a', ts: i + 1, balanceApplied: true }));
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 385000, openingBalance: 85000, ts: 1 }, { id: 'c', name: 'Bonus', type: 'card', owner: 'shared', balance: -24000, openingBalance: -24000, ts: 1, limit: 60000, statementDay: 20, dueOffset: 10 }],
  pf_t: T, pf_l: L,
  pf_d: [{ id: 'd1', direction: 'borrowed', person: 'Ece\'nin annesi', amount: 15000, date: '2027-06-01', hasDue: false, dueDate: '', note: '', accountId: '', txnId: '', payments: [], settled: false, ts: 1 }],
  pf_r: [{ id: 'r1', type: 'expense', amount: 16500, category: 'Kredi Ödemesi', day: 15, note: 'Taşıt kredisi taksidi', accountId: 'b', userId: 'u_a', isSubscription: false, active: true, autoLog: false }] };

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
  const st = id => page.evaluate(id => { const l = S.loans().find(x => x.id === id), s = App.Loans.state(l); return [App.Loans.inst(l), Math.round(App.Loans.eff(l) * 1e6) / 1e4, s.paid, s.count, s.bal, s.remaining, s.remInterest, s.totalInterest, s.end, s.next && s.next.date, s.active]; }, id);

  // 1) Ödeme planı ve bugünkü durum
  eq('taşıt: taksitten faiz %4,286; 10/36, kalan anapara', await st('ln1'), [16500, 4.286, 10, 36, 255688.14, 428999.93, 173311.79, 293999.93, '2029-12-15', '2027-11-15', true]);
  eq('konut: faizden taksit, ara ödemeyle 99 taksit', await st('ln2'), [34759.28, 2.79, 17, 99, 1112028.37, 2818189.71, 1706161.34, 2259097.47, '2034-08-05', '2027-11-05', true]);
  eq('ilk taksitler (taşıt): faiz, anapara, kalan', await page.evaluate(() => App.Loans.schedule(S.loans()[0]).slice(0, 2).map(x => [x.date, x.pay, x.interest, x.principal, x.bal])),
    [['2027-01-15', 16500, 12857.89, 3642.11, 296357.89], ['2027-02-15', 16500, 12701.79, 3798.21, 292559.68]]);
  eq('ay sonunu aşan taksit günü (31 Ocak → 28 Şubat)', await page.evaluate(() => App.Loans.schedule({ principal: 3000, term: 3, first: '2027-01-31', installment: 1000, rate: 0, tax: false, prepay: [] }).map(x => x.date)), ['2027-01-31', '2027-02-28', '2027-03-31']);

  // 2) Erken kapatma tahmini: kalan anapara + işlemiş faiz + ücret (taşıt tüketici kredisi: ücret yok; konut kalan 82 > 36 ay → %2)
  eq('erken kapatma tahmini', await page.evaluate(() => S.loans().map(l => { const p = App.Loans.payoff(l); return [p.days, p.accrued, p.feeRate, p.fee, p.total, p.saving]; })),
    [[5, 1826.45, 0, 0, 257514.59, 171485.34], [15, 15512.8, 0.02, 22240.57, 1149781.74, 1668407.97]]);

  // 3) Krediler sekmesi
  await page.evaluate(() => { App.UI.nav('borclar'); App.UI.subTab('borclar', 'loans'); }); await page.waitForTimeout(100);
  const pg = await page.evaluate(() => { const sp = s => String(s || '').replace(/\s+/g, ' ').trim(); return { m: [...document.querySelectorAll('#loanSummary .mc')].map(c => sp(c.querySelector('.mc-val').textContent) + ' ' + sp(c.querySelector('.mc-lbl').textContent)),
    cards: [...document.querySelectorAll('#loanList .loan-card')].map(c => [sp(c.querySelector('.loan-name').textContent), sp(c.querySelector('.loan-sub').textContent), [...c.querySelectorAll('.loan-grid b')].map(b => b.textContent), sp(c.querySelector('.loan-rate').textContent)]) }; });
  eq('özet: kalan anapara, aylık taksit, kalan faiz', pg.m, ['₺1.367.716,51 Kalan Anapara', '₺51.259,28 Aylık Taksit', '₺1.879.473,13 Kalan Faiz']);
  eq('kredi kartları', pg.cards, [
    ['🚗 Taşıt kredisiTaşıt', '₺16.500,00 taksit · 10/36 ödendi · sonraki 15 Kasım 2027', ['₺255.688,14', '₺173.311,79', 'Aralık 2029', '₺293.999,93'], 'Aylık faiz (taksitten) %4,29 · çekilen ₺300.000,00 · 36 ay'],
    ['🏠 Konut kredisiKonut', '₺34.759,28 taksit · 17/99 ödendi · sonraki 05 Kasım 2027', ['₺1.112.028,37', '₺1.706.161,34', 'Ağustos 2034', '₺2.259.097,47'], 'Aylık faiz %2,79 · çekilen ₺1.200.000,00 · 120 ay']]);

  // 4) Yeni kredi: hatalar; ihtiyaç 100.000, 12 ay, %3 + KKDF/BSMV (%3,9) → taksit 10.593,48, 12 taksit, faiz 27.121,82
  const addLoan = v => page.evaluate(v => { Object.keys(v).forEach(k => { const e = document.getElementById(k); if (e.type === 'checkbox') e.checked = v[k]; else e.value = v[k]; }); App.Loans.add(); }, v);
  await addLoan({ lnName: 'İhtiyaç', lnKind: 'ihtiyac', lnAmt: '100.000', lnTerm: '12', lnFirst: '2027-11-01', lnInst: '', lnRate: '', lnTax: true });
  await addLoan({ lnName: 'İhtiyaç', lnKind: 'ihtiyac', lnAmt: '100.000', lnTerm: '12', lnFirst: '2027-11-01', lnInst: '8.000', lnRate: '', lnTax: true });
  await addLoan({ lnName: 'İhtiyaç', lnKind: 'ihtiyac', lnAmt: '100.000', lnTerm: '12', lnFirst: '2027-11-01', lnInst: '', lnRate: '25', lnTax: true });
  eq('hatalar: taksit/faiz yok, taksit × vade az, faiz sınırı', (await toasts()).filter(t => /Aylık taksiti ya da aylık faizi girin|Taksit × vade \(₺96\.000,00\), çekilen tutardan az olamaz|Aylık faiz %0 ile %20/.test(t)).length, 3);
  await addLoan({ lnName: 'İhtiyaç kredisi', lnKind: 'ihtiyac', lnAmt: '100.000', lnTerm: '12', lnFirst: '2027-11-01', lnInst: '', lnRate: '3', lnTax: true });
  eq('faizden taksit (vergilerle %3,9), toast, alanlar boşaldı', [await page.evaluate(() => { const l = S.loans().find(x => x.name === 'İhtiyaç kredisi'), s = App.Loans.state(l); return [l.installment, l.rate, l.tax, s.count, s.totalInterest, s.paid, s.active]; }), (await toasts()).some(t => /Kredi eklendi: ₺10\.593,48 × 12 taksit, toplam faiz ₺27\.121,82/.test(t)), await page.evaluate(() => document.getElementById('lnAmt').value)],
    [[10593.48, 3, true, 12, 27121.82, 0, true], true, '']);
  eq('konut seçilince vergi kutusu kapanır', await page.evaluate(() => { const k = document.getElementById('lnKind'); k.value = 'konut'; App.Loans.onKind(); const t = document.getElementById('lnTax'), r = [t.checked, t.disabled]; k.value = 'ihtiyac'; App.Loans.onKind(); return r.concat([t.checked]); }), [false, true, true]);

  // 5) Ara ödeme: bugün 50.000 → 7 taksit azalır, faizden 78.488,41 tasarruf; kalan anaparadan fazlası reddedilir
  const modal = async (vals) => page.evaluate(v => { const d = document.querySelector('.app-dialog-holder'); Object.keys(v).forEach(k => { d.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); d.querySelector('[data-act="ok"]').click(); }, vals);
  await page.evaluate(() => App.Loans.prepay('ln1')); await modal({ amount: '300.000', date: '2027-10-20' });
  eq('kalan anaparadan fazla ara ödeme reddedilir', [(await toasts()).some(t => /kalan anaparadan \(₺255\.688,14\) fazla olamaz/.test(t)), await page.evaluate(() => !!document.querySelector('.app-dialog-holder'))], [true, true]);
  await modal({ amount: '50.000', date: '2027-10-20' });
  eq('ara ödeme: vade kısalır', [await st('ln1'), (await toasts()).some(t => /7 taksit azaldı, faizden ₺78\.488,41 tasarruf/.test(t))],
    [[16500, 4.286, 10, 29, 205688.14, 300511.52, 94823.38, 215511.52, '2029-05-15', '2027-11-15', true], true]);
  await page.evaluate(() => App.Loans.showPlan('ln1')); await page.waitForTimeout(50);
  eq('ödeme planı penceresi: ara ödeme listesi, 29 satır, 10 soluk', await page.evaluate(() => { const m = document.querySelector('.ln-modal'); return [m.querySelectorAll('.ln-pre').length, m.querySelectorAll('tbody tr').length, m.querySelectorAll('tbody tr.paid').length, /ayın 15\. günü/.test(m.textContent)]; }), [1, 29, 10, true]);
  await page.evaluate(() => document.querySelector('.ln-pre .btn-del').click()); await page.waitForTimeout(50);
  eq('ara ödeme silinince plan eski hâline döner', (await st('ln1')).slice(2, 6), [10, 36, 255688.14, 428999.93]);
  await page.evaluate(() => App.UI.closeModal('lnPlan'));

  // 6) Nakit akışı ve takvim: konut taksitleri yazılır; taşıt taksidi tekrarlayan ödemede olduğu için ikinci kez yazılmaz
  eq('nakit akışı (60 gün)', await page.evaluate(() => App.Cashflow.items(60).filter(x => /kredi|Kredi/.test(x.label + x.src)).map(x => [x.date, x.label, x.amount, x.src])),
    [['2027-11-01', '🏦 İhtiyaç kredisi', 10593.48, 'Kredi taksidi'], ['2027-11-05', '🏦 Konut kredisi', 34759.28, 'Kredi taksidi'], ['2027-11-15', 'Taşıt kredisi taksidi', 16500, 'Tekrarlayan'],
      ['2027-12-01', '🏦 İhtiyaç kredisi', 10593.48, 'Kredi taksidi'], ['2027-12-05', '🏦 Konut kredisi', 34759.28, 'Kredi taksidi'], ['2027-12-15', 'Taşıt kredisi taksidi', 16500, 'Tekrarlayan']]);

  // 7) Net servet: hesaplar 385.000 − kart 24.000 − borç 15.000 − kalan anapara (255.688,14 + 1.112.028,37 + 100.000)
  eq('net servet: krediler borç', await page.evaluate(() => { const n = App.NetWorth.compute(); return [n.loans, n.total]; }), [1467716.51, -1121716.51]);
  eq('geçmiş ay sonundaki kalan anapara (30 Eylül; ihtiyaç kredisi henüz çekilmemiş)', await page.evaluate(() => App.Loans.balanceAt('2027-09-30')), 1376662.42);

  // 8) Sağlık puanı: kredi ödemesi işlemlerde yokken kredi taksitleri sayılır: 3 × 51.259,28 / 300.000 = %51 → 0 puan
  eq('sağlık: borç ödemesi gelire oranı', await page.evaluate(() => { const it = App.Health.compute(0).items.find(x => x.key === 'debt'); return [it.val, it.pts, App.Loans.dueIn('2027-09')]; }), ['gelire oranı %51', 0, 51259.28]);

  // 9) Erken kapat: kapanan kredi aktif değil, net servete ve nakit akışına girmez; yeniden açılabilir
  await page.evaluate(() => App.Loans.close('ln1')); await page.waitForTimeout(50);
  eq('kapama penceresi tahmini tutarla açılır', await page.evaluate(() => [document.querySelector('.app-dialog-holder [data-pkey="amount"]').value, /yaklaşık ₺171\.485,34 faizden kurtulursunuz/.test(document.querySelector('.app-dialog-holder').textContent), /Tüketici kredisinde erken ödeme ücreti alınmaz/.test(document.querySelector('.app-dialog-holder').textContent)]), ['257514,59', true, true]);
  await modal({ amount: '260.071,47', date: '2027-10-20' });
  eq('kapandı', [await page.evaluate(() => { const l = S.loans()[0], s = App.Loans.state(l); return [l.closed, s.active, s.bal, s.paid, s.count, App.Loans.payoff(l)]; }), await page.evaluate(() => App.NetWorth.compute().loans)],
    [[{ date: '2027-10-20', amount: 260071.47 }, false, 0, 10, 10, null], 1212028.37]);
  eq('kapanan kredi listede ayrı', await page.evaluate(() => [document.querySelectorAll('#loanList .loan-card.closed').length, /Kapandı: 20 Ekim 2027 · ₺260\.071,47 ödendi/.test(document.querySelector('#loanList .loan-card.closed').textContent)]), [1, true]);
  await page.evaluate(() => App.Loans.reopen('ln1'));
  eq('yeniden açıldı', (await st('ln1')).slice(2, 5).concat([(await st('ln1'))[10]]), [10, 36, 255688.14, true]);

  // 10) Bitirme planı: kart faizi %5, asgari %20 (en az 100); kişisel borcun asgarisi yok. İhtiyaç kredisini çıkarıp bağımsız hesapla karşılaştır
  await page.evaluate(() => S.saveLoans(S.loans().filter(l => l.id !== S.loans().find(x => x.name === 'İhtiyaç kredisi').id)));
  await page.evaluate(() => { App.UI.subTab('borclar', 'plan'); App.Loans.setPlan('extra', '5.000'); });
  const pl = () => page.evaluate(() => { const r = App.Loans.plan(); return [r.base.months, r.base.interest, r.plan.months, r.plan.interest, r.plan.budget, r.plan.items.map(x => x.paidAt)]; });
  eq('çığ (ek 5.000)', await pl(), [0, 1886904.97, 39, 929904.46, 61299.28, [15, 38, 3, 39]]);
  await page.evaluate(() => App.Loans.setPlan('strategy', 'snowball'));
  eq('kartopu (ek 5.000)', await pl(), [0, 1886904.97, 39, 965866.34, 61299.28, [16, 39, 5, 3]]);
  const ui = await page.evaluate(() => { const sp = s => String(s || '').replace(/\s+/g, ' ').trim(), c = document.getElementById('payoffPlan'); return [sp(c.querySelector('.po-sum').textContent), [...c.querySelectorAll('.po-list li')].map(li => sp(li.textContent))]; });
  eq('plan özeti', ui[0], 'Bütün borçlar Ocak 2031 ayında biter (39 ay)Ayda ₺61.299,28 ödeme · toplam faiz ₺965.866,34Yalnız asgari ödemeyle: faizsiz kişisel borçların asgarisi olmadığı için hiç kapanmaz, toplam faiz ₺1.886.904,97 · ₺921.038,63 faiz tasarrufu');
  eq('plan sırası (kartopu)', ui[1], ["🤝 Ece'nin annesi₺15.000,00 · faizsizOcak 2028asgariyle bitmiyor", '💳 Bonus₺24.000,00 · aylık faiz %5Mart 2028asgariyle Mart 2030', '🚗 Taşıt kredisi₺255.688,14 · aylık faiz %4,29Şubat 2029asgariyle Aralık 2029', '🏠 Konut kredisi₺1.112.028,37 · aylık faiz %2,79Ocak 2031asgariyle Ağustos 2034']);
  await page.evaluate(() => App.Loans.setPlan('cards', false));
  eq('kart dahil değilken plan 3 borç', await page.evaluate(() => App.Loans.plan().debts.map(d => d.key.slice(0, 1))), ['l', 'l', 'd']);
  await page.evaluate(() => App.Loans.setPlan('cardRate', '30'));
  eq('kart faizi sınırı', (await toasts()).some(t => /Kart faizi %0 ile %20 arasında olmalı/.test(t)), true);

  // 11) PDF rapor (bu ay): krediler tablosu ve rehber
  eq('rapor: krediler', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-10'); const sp = s => String(s || '').replace(/\s+/g, ' ').trim(), t = d.querySelector('.pr-loans');
    return [[...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => sp(c.textContent))), /Kredi:/.test(d.querySelector('.pr-guide').textContent)]; }),
    [[['Taşıt kredisi · Taşıt · sonraki 15 Kas', '₺16.500', '10/36', '₺255.688,14', 'Ara 2029'], ['Konut kredisi · Konut · sonraki 05 Kas', '₺34.759,28', '17/99', '₺1.112.028,37', 'Ağu 2034'], ['Toplam', '₺51.259,28', '', '₺1.367.716,51', '']], true]);

  // 12) Kayıt temizliği, eşitleme ve yedek
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('pf_l')); l.push({ id: 'bad', name: 'Bozuk', principal: 0, term: 12, first: '2027-01-01', installment: 100 }, { id: 'x2', name: 'Faizsiz', kind: 'yok', principal: 1200, term: 999, first: 'tarih', installment: 0, rate: 0 }); localStorage.setItem('pf_l', JSON.stringify(l)); });
  await page.reload(); await page.waitForTimeout(300);
  eq('bozuk kayıtlar atılır', await page.evaluate(() => S.loans().map(l => l.id)), ['ln1', 'ln2']);
  eq('eşitleme ve yedek kredileri taşır (yedekten yüklerken de temizlenir)', await page.evaluate(() => [App.Sync.collect().stores.pf_l.map(l => l.id), Array.isArray(App.Backup.snapshot().stores.pf_l)]), [['ln1', 'ln2'], true]);

  // Düzenleme: konut faizi %2,5, taksit boş → 1.200.000 × 0,025 / (1 − 1,025^−120) = 31.634,15 (vergi yok); silme onayla
  await page.evaluate(() => App.Loans.edit('ln2')); await modal({ installment: '', rate: '2,5', tax: '0' });
  eq('düzenleme: faizden yeni taksit', await page.evaluate(() => { const l = S.loans().find(x => x.id === 'ln2'); return [l.rate, l.tax, l.installment, App.Loans.inst(l)]; }), [2.5, false, 31634.15, 31634.15]);
  await page.evaluate(() => App.Loans.remove('ln2')); await page.evaluate(() => document.querySelector('.app-dialog-holder [data-act="ok"]').click());
  eq('silme', await page.evaluate(() => S.loans().map(l => l.id)), ['ln1']);

  // 13) Dar ekran: Krediler, plan ve ödeme planı penceresi taşmıyor
  await page.setViewportSize({ width: 320, height: 700 });
  const ov = sel => page.evaluate(sel => { const bad = []; document.querySelectorAll(sel).forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5)]; }, sel);
  await page.evaluate(() => { App.UI.nav('borclar'); App.UI.subTab('borclar', 'loans'); }); await page.waitForTimeout(100);
  eq('320 px: krediler', await ov('#page-borclar *'), [true, []]);
  await page.evaluate(() => App.UI.subTab('borclar', 'plan'));
  eq('320 px: plan', await ov('#page-borclar *'), [true, []]);
  await page.evaluate(() => App.Loans.showPlan('ln1')); await page.waitForTimeout(50);
  eq('320 px: ödeme planı penceresi (açık)', [await page.evaluate(() => document.querySelectorAll('.ln-modal tbody tr').length), await ov('.ln-modal *')], [36, [true, []]]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
