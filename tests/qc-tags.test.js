// Usage: node tests/qc-tags.test.js
// Etiketler: işleme etiket (ekleme, düzenleme, taksit planı), süzgeç ve arama, etkin etiket (geçmişe ve bankadan gelen
// harcamalara, fişe kendiliğinden ekleme), İstatistikler'de etiket toplamları, raporda Etiketler bölümü, CSV ve yükleme.
// Beklenen değerler elle hesaplandı. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Ağustos 2027, bugün 20 Ağustos. Vadesiz: 40.000 + 30.000 − 900 − 12.500 − 3.000 (Temmuz) − 1.000 (karta aktarım) = 52.600
// Kart: −2.400 − 650 + 150 + 1.000 − 1.000 (Mont 1/3, Temmuz) − 1.000 (Mont 2/3) = −3.900
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
const A = [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 52600, openingBalance: 40000, ts: 1 },
  { id: 'c', name: 'Kart', type: 'card', owner: 'shared', last4: '4821', limit: 30000, balance: -3900, openingBalance: 0, ts: 2 }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, accountId, userId, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId, userId, ts: n, balanceApplied: date <= '2027-08-20' }, extra || {}));
tx('2027-07-20', 'expense', 3000, 'Giyim', 'Okul alışverişi', 'b', 'u_a', { tags: ['Okul açılışı'] });
tx('2027-08-01', 'income', 30000, 'Maaş', 'Maaş', 'b', 'u_b');
tx('2027-08-05', 'expense', 900, 'Market', 'Migros', 'b', 'u_a');
tx('2027-08-10', 'expense', 12500, 'Faturalar', 'Kira', 'b', 'u_b', { recurringId: 'r1' });
tx('2027-08-16', 'expense', 2400, 'Ulaşım', 'Shell', 'c', 'u_a');
tx('2027-08-17', 'expense', 650, 'Yiyecek', 'Balıkçı', 'c', 'u_b');
tx('2027-08-17', 'income', 150, 'İade', 'İade: Balıkçı', 'c', 'u_b');
tx('2027-08-18', 'expense', 1000, 'Transfer', 'Kart borcu ödemesi: Kart', 'b', 'u_a', { transferId: 'tr1' });
tx('2027-08-18', 'income', 1000, 'Transfer', 'Kart borcu ödemesi: Kart', 'c', 'u_a', { transferId: 'tr1' });
[0, 1, 2].forEach(i => tx('2027-0' + (7 + i) + '-16', 'expense', 1000, 'Giyim', 'Mont (' + (i + 1) + '/3)', 'c', 'u_a', { balanceApplied: i < 2, installment: { planId: 'p1', index: i + 1, total: 3, totalAmount: 3000, name: 'Mont', startDate: '2027-07-16', balanceApplied: i < 2 } }));
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: A, pf_t: T, pf_r: [{ id: 'r1', type: 'expense', amount: 12500, category: 'Faturalar', day: 10, note: 'Kira', accountId: 'b', active: true }] };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-08-20T10:00:00'));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, SEED);
  await page.reload(); await page.waitForTimeout(300);
  await page.evaluate(() => App.UI.nav('islemler'));
  const modal = () => page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return m ? { title: m.querySelector('.modal-title').textContent, fields: [...m.querySelectorAll('[data-pkey]')].map(x => [x.getAttribute('data-pkey'), x.value]), list: [...m.querySelectorAll('datalist option')].map(o => o.value) } : null; });
  const fill = (vals) => page.evaluate(v => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); Object.keys(v).forEach(k => { m.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); m.querySelector('[data-act="ok"]').click(); }, vals);
  const tagsOf = note => page.evaluate(nt => S.txns().filter(t => t.note === nt).map(t => t.tags || []), note);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#txnList .ti')].map(r => [r.querySelector('.ti-cat').textContent, [...r.querySelectorAll('.tag-chip')].map(c => c.textContent)]));
  const addTxn = (o) => page.evaluate(o => { App.UI.setType(o.type || 'expense'); document.getElementById('txnAmt').value = o.amount; document.getElementById('txnDate').value = o.date;
    if (o.cat) document.getElementById('txnCat').value = o.cat; document.getElementById('txnNote').value = o.note; document.getElementById('txnTags').value = o.tags; document.getElementById('txnInst').value = o.inst || ''; App.UI.pickAcc(o.acc); App.Transactions.add(); }, o);

  // 1) Başlangıç: eski etiketli kayıt; süzgeç ve öneri listesi
  eq('etiket süzgeci ve öneri listesi var olan etiketle', await page.evaluate(() => [document.getElementById('fTag').hidden, [...document.getElementById('fTag').options].map(o => o.textContent), [...document.querySelectorAll('#tagList option')].map(o => o.value)]),
    [false, ['Tüm Etiketler', '🏷 Okul açılışı'], ['Okul açılışı']]);
  eq('satırda etiket', (await rows()).find(r => r[0] === 'Okul alışverişi'), ['Okul alışverişi', ['🏷 Okul açılışı']]);
  eq('Etiket alanı: giderde var, aktarımda yok; etkin etiket yokken boş', await page.evaluate(() => { const w = document.getElementById('txnTagWrap'); App.UI.setType('transfer'); const a = w.style.display; App.UI.setType('expense'); return [a, w.style.display, document.getElementById('txnTags').value]; }), ['none', '', '']);

  // 2) Ekleme: virgül, # ve ; ayırır; büyük/küçük harf aynı etiket; var olan yazılış kullanılır
  await addTxn({ amount: '450', date: '2027-08-19', cat: 'Yiyecek', note: 'Dondurma', tags: ' Antalya  tatili ,#Otel; otel ', acc: 'c' });
  await addTxn({ amount: '1200', date: '2027-08-19', cat: 'Eğlence', note: 'Tekne turu', tags: 'antalya TATİLİ', acc: 'c' });
  eq('eklenen kayıtların etiketleri (temizlenir, tekrar edilmez, var olanın yazılışı)', [await tagsOf('Dondurma'), await tagsOf('Tekne turu')], [[['Antalya tatili', 'Otel']], [['Antalya tatili']]]);
  eq('form temizlenince etiket alanı boşalır (etkin etiket yok)', await page.evaluate(() => document.getElementById('txnTags').value), '');

  // 3) Süzgeç ve arama
  await page.selectOption('#fTag', 'Antalya tatili'); await page.waitForTimeout(80);
  eq('etiket süzgeci: yalnız o etiket; toplam', [(await rows()).map(r => r[0]), await page.evaluate(() => document.getElementById('txnFilterSum').textContent)],
    [['Tekne turu', 'Dondurma'], '2 kayıt · Gelir ₺0,00 · Gider ₺1.650,00 · Net -₺1.650,00']);
  await page.selectOption('#fTag', ''); await page.fill('#fSearch', 'otel'); await page.waitForTimeout(80);
  eq('arama etikette de arar', (await rows()).map(r => r[0]), ['Dondurma']);
  await page.fill('#fSearch', ''); await page.evaluate(() => App.Transactions.renderList());

  // 4) Düzenleme: alan dolu, öneri listesi; boşaltınca etiket kalkar
  await page.evaluate(() => App.Transactions.edit(S.txns().find(t => t.note === 'Dondurma').id)); await page.waitForTimeout(80);
  const m1 = await modal();
  eq('düzenle: etiket alanı ve öneriler', [m1.fields.find(f => f[0] === 'tags')[1], m1.list], ['Antalya tatili, Otel', ['Antalya tatili', 'Okul açılışı', 'Otel']]);
  await fill({ tags: 'Antalya tatili' }); await page.waitForTimeout(80);
  eq('düzenlenen etiket kaydedilir ("Otel" artık yok)', [await tagsOf('Dondurma'), await page.evaluate(() => [...document.getElementById('fTag').options].map(o => o.value))], [[['Antalya tatili']], ['', 'Antalya tatili', 'Okul açılışı']]);

  // 5) Taksitli alışverişte etiket bütün plana; taksit düzenlenince plan boyunca değişir
  await addTxn({ amount: '3000', date: '2027-08-20', cat: 'Eğitim', note: 'Tablet', tags: 'Okul açılışı', inst: '3', acc: 'c' });
  eq('taksit planının üç taksidinde etiket', await tagsOf('Tablet (1/3)').then(async a => a.concat(await tagsOf('Tablet (2/3)'), await tagsOf('Tablet (3/3)'))), [['Okul açılışı'], ['Okul açılışı'], ['Okul açılışı']]);
  await page.evaluate(() => App.Transactions.edit(S.txns().find(t => t.note === 'Tablet (2/3)').id)); await page.waitForTimeout(80);
  await fill({ tags: 'Okul açılışı, Kırtasiye' }); await page.waitForTimeout(80);
  eq('taksit düzenle: etiket bütün planda', await page.evaluate(() => S.txns().filter(t => /^Tablet/.test(t.note)).map(t => (t.tags || []).join('+'))), ['Okul açılışı+Kırtasiye', 'Okul açılışı+Kırtasiye', 'Okul açılışı+Kırtasiye']);
  // Tablet taksitleri bu testin geri kalanını etkilemesin
  await page.evaluate(() => { const p = S.txns().find(t => /^Tablet/.test(t.note)).installment.planId; const keep = S.txns().filter(t => !(t.installment && t.installment.planId === p)); const c = S.accounts(); c.find(a => a.id === 'c').balance = -3900 - 1650; S.saveAccounts(c); S.saveTxns(keep); App.Transactions.renderList(); });

  // 6) Etkin etiket: 16 Ağustos'tan beri → geçmiş kayıtlara (aktarım, düzenli ödeme ve eski taksit hariç)
  await page.evaluate(() => App.Tags.start()); await page.waitForTimeout(80);
  const m2 = await modal();
  eq('etkinlik başlat penceresi: ad, gün (bugün), geçmişe ekle', [m2.title, m2.fields], ['Etkinlik başlat', [['name', ''], ['from', '2027-08-20'], ['past', '1']]]);
  await fill({ name: 'antalya tatili', from: '2027-08-16', past: '1' }); await page.waitForTimeout(120);
  eq('geçmişe eklenen: Shell, Balıkçı, iadesi (Mont 2/3, aktarım, Kira eklenmez)', await page.evaluate(() => S.txns().filter(t => t.date >= '2027-08-16' && t.date <= '2027-08-20').map(t => t.note + ':' + (t.tags || []).join('+')).sort()),
    ['Balıkçı:Antalya tatili', 'Dondurma:Antalya tatili', 'Kart borcu ödemesi: Kart:', 'Kart borcu ödemesi: Kart:', 'Mont (2/3):', 'Shell:Antalya tatili', 'Tekne turu:Antalya tatili', 'İade: Balıkçı:Antalya tatili']);
  eq('toast, şerit ve hazır yazılan etiket', await page.evaluate(() => [[...document.querySelectorAll('.toast')].map(t => t.textContent).find(t => /başladı/.test(t)), document.getElementById('tagBanner').hidden, document.getElementById('tagBanner').textContent.replace(/\s+/g, ' ').trim(), document.getElementById('txnTags').value]),
    ['✅ "Antalya tatili" başladı. 3 kayda eklendi.', false, '🏷 Antalya tatili etkin (16 Ağustos gününden beri): yeni kayıtlara ve bankadan gelen harcamalara kendiliğinden ekleniyor.Bitir', 'Antalya tatili']);
  // Bankadan gelen harcama ve fiş: etiket kendiliğinden
  const sms = await page.evaluate(() => App.BankSms.ingest([{ id: 901, label: 'abcd1234_u_a', text: '4821 ile biten kartinizdan 320,00 TL harcama yapildi. Isyeri: PLAJ KAFE', receivedAt: Date.now() }]));
  eq('bankadan gelen harcama etiketli', [sms.added, await page.evaluate(() => S.txns().filter(t => t.src === 'sms').map(t => [t.amount, t.tags || []]))], [1, [[320, ['Antalya tatili']]]]);
  await page.evaluate(() => App.Transactions.addExpense({ amount: 80, date: '2027-08-20', category: 'Yiyecek', note: 'Simit', accountId: 'b', userId: 'u_a' }));
  eq('fişten eklenen harcama etiketli', await tagsOf('Simit'), [['Antalya tatili']]);
  await page.evaluate(() => { document.getElementById('txnAmt').value = '60'; document.getElementById('txnNote').value = 'Su'; App.UI.pickAcc('b'); App.Transactions.add(); });
  eq('elle eklenen kayıt: hazır yazılan etkin etiketle', await tagsOf('Su'), [['Antalya tatili']]);

  // 7) İstatistikler: etiket toplamları. Antalya: 2.400 + 650 − 150 + 450 + 1.200 + 320 + 80 + 60 = 5.010 (8 kayıt)
  await page.evaluate(() => App.Tags.open()); await page.waitForTimeout(120);
  eq('İstatistikler › Etiketler: toplam, kayıt, tarihler; etkin işareti', await page.evaluate(() => [...document.querySelectorAll('#statsTags .tag-row')].map(r => [r.querySelector('.tag-name').textContent, r.querySelector('.tag-meta').textContent, r.querySelector('.tag-amt').textContent])),
    [['🏷 Antalya tatilietkin', '8 kayıt · 16–20 Ağustos 2027', '₺5.010,00'], ['🏷 Okul açılışı', '1 kayıt · 20 Temmuz 2027', '₺3.000,00']]);
  await page.click('#statsTags .tag-row:nth-child(2) button'); await page.waitForTimeout(100);
  eq('"İşlemler" düğmesi: İşlemler\'de o etiket süzülü, liste görünümü', [await page.evaluate(() => document.body.getAttribute('data-page')), await page.evaluate(() => document.getElementById('fTag').value), (await rows()).map(r => r[0])], ['islemler', 'Okul açılışı', ['Okul alışverişi']]);
  await page.evaluate(() => App.Transactions.clearFilters());

  // 8) Rapor: Ağustos etiketleri (Okul açılışı Temmuz'da, yok); rehber; ekte etiket
  const rep = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-08', { txns: true }); const sp = s => s.replace(/\s+/g, ' ').trim();
    return { rows: [...d.querySelectorAll('.pr-tags tbody tr')].map(r => [...r.cells].map(c => sp(c.textContent))), head: [...d.querySelectorAll('.pr-tags th')].map(x => x.textContent), guide: [...d.querySelectorAll('.pr-gl b')].map(b => b.textContent).filter(x => /Etiket/.test(x)),
      ek: [...d.querySelectorAll('.pr-txns tr')].map(r => sp(r.cells[0].textContent)).filter(x => /^Shell/.test(x)) }; });
  eq('rapor: Etiketler tablosu, rehber, ekte etiket', rep, { rows: [['🏷 Antalya tatili · 8 kayıt', '₺5.010', '₺5.010', '16–20 Ağustos 2027']], head: ['Etiket', 'Bu ay', 'Toplam', 'Tarihler'], guide: ['Etiket:'], ek: ['Shell · 🏷 Antalya tatili'] });
  eq('rapor: Temmuz\'da Okul açılışı', await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = App.Report.build('2027-07'); return [...d.querySelectorAll('.pr-tags tbody tr')].map(r => r.cells[0].textContent.replace(/\s+/g, ' ').trim()); }), ['🏷 Okul açılışı · 1 kayıt']);

  // 9) Takvim: etiket süzgeci
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.refreshFilterDropdowns(); document.getElementById('fTag').value = 'Antalya tatili'; App.Transactions.setView('cal'); });
  eq('takvim etiket süzgeciyle: yalnız tatil günleri, not', await page.evaluate(() => [Object.fromEntries([...document.querySelectorAll('.cal-d')].filter(b => b.querySelector('.cal-v')).map(b => [+b.dataset.d.slice(8), [...b.querySelectorAll('.cal-v')].map(x => x.textContent)])), !!document.querySelector('.cal-note')]),
    [{ 16: ['2.400'], 17: ['500'], 19: ['1.650'], 20: ['460'] }, true]);
  await page.evaluate(() => { App.Transactions.setView('list'); App.Transactions.clearFilters(); });

  // 10) Bitir: şerit kalkar, yeni kayıt etiketsiz
  await page.evaluate(() => App.Tags.stop()); await page.waitForTimeout(80);
  eq('bitir: toast, şerit, alan, ayar', await page.evaluate(() => [[...document.querySelectorAll('.toast')].map(t => t.textContent).find(t => /bitti/.test(t)), document.getElementById('tagBanner').hidden, document.getElementById('txnTags').value, S.settings().activeTag]),
    ['✅ "Antalya tatili" bitti. Toplam harcama ₺5.010,00 (8 kayıt).', true, '', null]);
  await page.evaluate(() => App.Transactions.addExpense({ amount: 40, date: '2027-08-20', category: 'Yiyecek', note: 'Çay', accountId: 'b', userId: 'u_a' }));
  eq('bitince fiş etiketsiz', await tagsOf('Çay'), [[]]);

  // 11) CSV: dışa aktarmada Etiketler sütunu; yüklerken etiketler okunur
  const csv = await page.evaluate(async () => { let blob; const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click; URL.createObjectURL = b => { blob = b; return o(b); }; HTMLAnchorElement.prototype.click = function () {}; App.Transactions.exportCSV(); URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; return blob ? await blob.text() : ''; });
  eq('CSV: başlık ve etiketli satır', [csv.split(/\r?\n/)[0].replace(/^﻿/, ''), csv.split(/\r?\n/).find(l => /Dondurma/.test(l))], ['Tarih;Tür;Kategori;Tutar;Hesap;Üye;Not;Etiketler', '"2027-08-19";"Gider";"Yiyecek";"450,00";"Kart";"Deniz";"Dondurma";"Antalya tatili"']);
  await page.evaluate(() => App.Transactions.importCSVFile(new File(['﻿Tarih;Tür;Kategori;Tutar;Hesap;Üye;Not;Etiketler\n2027-08-02;Gider;Market;100,00;Vadesiz;Deniz;Bakkal;Okul açılışı, Kırtasiye\n'], 'x.csv', { type: 'text/csv' })));
  await page.waitForTimeout(300); await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click()); await page.waitForTimeout(200);
  eq('CSV yükleme: etiketler okunur', await tagsOf('Bakkal'), [['Okul açılışı', 'Kırtasiye']]);

  // 12) Kayıt temizliği: boş, uzun, tekrar eden etiketler yüklemede düzeltilir; yeniden açılışta kalır
  await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('pf_t')); t.push({ id: 'tz', type: 'expense', amount: 5, category: 'Diğer', date: '2027-08-01', note: 'Bozuk', accountId: 'b', userId: 'u_a', ts: 1, balanceApplied: false, tags: ['', '  çok   boşluk ', 123, 'ÇOK BOŞLUK', 'x'.repeat(60), 'a', 'b', 'c', 'd'] }); localStorage.setItem('pf_t', JSON.stringify(t)); });
  await page.reload(); await page.waitForTimeout(300);
  eq('yükleme: temizlenmiş etiketler (en çok 5, 40 karakter)', await tagsOf('Bozuk'), [['çok boşluk', '123', 'x'.repeat(40), 'a', 'b']]);
  eq('yeniden açılışta etiketler ve etkin etiket yok', [await tagsOf('Shell'), await page.evaluate(() => S.settings().activeTag)], [[['Antalya tatili']], null]);
  // Etkin etiketle açılış (ya da başka cihazdan eşitlenince): şerit ve formdaki alan hazır
  await page.evaluate(() => S.saveSetting('activeTag', { name: 'Okul açılışı', from: '2027-08-20' })); await page.reload(); await page.waitForTimeout(300);
  eq('etkin etiketle açılışta şerit ve dolu alan', await page.evaluate(() => { App.UI.nav('islemler'); return [document.getElementById('tagBanner').hidden, document.getElementById('txnTags').value]; }), [false, 'Okul açılışı']);
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
