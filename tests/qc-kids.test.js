// Usage: node tests/qc-kids.test.js
// Çocuklar (Aile › Çocuklar): üyeye çocuk işareti, kendiliğinden yazılan harçlık (haftalık/aylık; hesap eklenmeden önceki gün
// bakiyeyi değiştirmez; kimlik gün başına sabit, eşitlemede tek kayıt; silinen yeniden yazılmaz), nakit akışında yaklaşan harçlık,
// çocuk başına yıllık gider (kategoriye göre, iade düşülür, geçen yıl aynı dönemle), kumbara (çocuğa ait hedef).
// Beklenen değerler elle hesaplandı. Kurmaca veri (Deniz, Ece; çocuklar Ada ve Kuzey); sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

// Bugün 20 Ekim 2027 Çarşamba. Ada: haftalık 500 harçlık, ilk gün 3 Eylül 2027 Cuma, Cüzdan'dan (nakit; uygulamaya 10 Eylül'de eklendi).
// Yazılacak harçlıklar: 3, 10, 17, 24 Eylül; 1, 8, 15 Ekim = 7 × 500 = 3.500. 3 Eylül cüzdan eklenmeden önce: bakiyeye zaten dahil
// (açılış +500), diğer 6 gün bakiyeden düşer: 5.000 − 3.000 = 2.000; açılış 4.000 + 500 = 4.500.
// Ada 2027 giderleri: Eğitim 12.000 + 6.000 = 18.000; Giyim 3.000 + 2.500 − 500 iade = 5.000; Harçlık 3.500; Sağlık 800; Eğlence 400;
// Yiyecek 300; Market 200 → toplam 28.200; ilk 5 + "Diğer kategoriler" 500. İlk gider Şubat: 9 ay → ayda 28.200 / 9 = 3.133,33 ≈ 3.133.
// 2026 aynı dönem (20 Ekim'e kadar): 10.000 + 2.000 = 12.000 (Kasım'daki 5.000 sayılmaz) → bu yıl %135 daha fazla.
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' },
  { id: 'u_k1', name: 'Ada', emoji: '🧒', color: '#f59e0b', kid: true, allowance: { amount: 500, period: 'week', from: '2027-09-03', accountId: 'n', done: '' } },
  { id: 'u_k2', name: 'Kuzey', emoji: '👦', color: '#3b82f6', kid: true }];
let n = 0; const T = [];
const tx = (date, type, amount, category, note, extra) => T.push(Object.assign({ id: 't' + (++n), date, type, amount, category, note, accountId: 'b', userId: 'u_k1', ts: n, balanceApplied: true }, extra || {}));
tx('2027-02-10', 'expense', 12000, 'Eğitim', 'Okul taksidi'); tx('2027-09-15', 'expense', 6000, 'Eğitim', 'Yüzme kursu');
tx('2027-04-05', 'expense', 3000, 'Giyim', 'Bahar kıyafeti'); tx('2027-09-20', 'expense', 2500, 'Giyim', 'Okul ayakkabısı'); tx('2027-09-25', 'income', 500, 'İade', 'Ayakkabı iadesi', { refCat: 'Giyim' });
tx('2027-06-01', 'expense', 800, 'Sağlık', 'Diş'); tx('2027-07-01', 'expense', 400, 'Eğlence', 'Sinema'); tx('2027-08-01', 'expense', 300, 'Yiyecek', 'Dondurma'); tx('2027-08-02', 'expense', 200, 'Market', 'Kırtasiye');
tx('2026-02-10', 'expense', 10000, 'Eğitim', 'Okul taksidi'); tx('2026-05-01', 'expense', 2000, 'Giyim', 'Mont'); tx('2026-11-01', 'expense', 5000, 'Giyim', 'Kışlık');
tx('2027-10-01', 'income', 60000, 'Maaş', 'Maaş', { userId: 'u_a' }); tx('2027-10-05', 'expense', 9000, 'Market', 'Migros', { userId: 'u_a' });
T.push({ id: 'X1o', date: '2027-10-10', type: 'expense', amount: 1000, category: 'Transfer', note: 'Aktarım', accountId: 'b', transferId: 'X1', userId: 'u_k1', ts: 900, balanceApplied: true },
  { id: 'X1i', date: '2027-10-10', type: 'income', amount: 1000, category: 'Transfer', note: 'Aktarım', accountId: 'n', transferId: 'X1', userId: 'u_k1', ts: 900, balanceApplied: true });
const bal = {}; T.forEach(t => { if (t.balanceApplied) bal[t.accountId] = (bal[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount); });
const NTS = new Date('2027-09-10T12:00:00').getTime();
const SEED = { pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() },
  pf_a: [{ id: 'b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: bal.b, openingBalance: 0, ts: 1 }, { id: 'n', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 5000, openingBalance: 4000, ts: NTS },
    { id: 'c', name: 'Bonus', type: 'card', owner: 'shared', balance: 0, openingBalance: 0, ts: 1, limit: 60000 }],
  pf_t: T, pf_g: [] };
const AL = ['2027-09-03', '2027-09-10', '2027-09-17', '2027-09-24', '2027-10-01', '2027-10-08', '2027-10-15'];

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
  const alTx = () => page.evaluate(() => S.txns().filter(t => /^al/.test(t.id)).map(t => [t.id, t.date, t.amount, t.category, t.userId, t.accountId, !!t.preOpen]).sort());
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent));
  const hasToast = m => toasts().then(a => a.some(t => t.endsWith(' ' + m)));
  const kid = i => page.evaluate(i => { const c = document.querySelectorAll('#kidsPanel .kid-card')[i], sp = s => String(s || '').replace(/\s+/g, ' ').trim(); if (!c) return null;
    const secs = [...c.querySelectorAll('.kid-sec')];
    return { name: sp(c.querySelector('.kid-name').textContent), sub: sp(c.querySelector('.kid-sub').textContent), al: [...secs[0].querySelectorAll('.kid-line')].map(x => sp(x.textContent)), alBtns: [...secs[0].querySelectorAll('button')].map(b => sp(b.textContent)),
      cats: [...secs[1].querySelectorAll('.kid-cat')].map(r => [sp(r.querySelector('.kc-name').textContent), r.querySelector('.kc-amt').textContent]), exp: [...secs[1].querySelectorAll('.kid-line')].map(x => sp(x.textContent)),
      goals: [...secs[2].querySelectorAll('.kid-goal')].map(g => [sp(g.querySelector('.kg-name').textContent), sp(g.querySelector('.kg-amt').textContent), sp(g.querySelector('.kg-foot span').textContent)]), gl: [...secs[2].querySelectorAll('.kid-line')].map(x => sp(x.textContent)) }; }, i);
  const dlg = () => page.evaluate(() => { const d = document.querySelector('.app-dialog-holder'); return d ? [...d.querySelectorAll('[data-pkey]')].map(x => [x.getAttribute('data-pkey'), x.value]) : null; });
  const fill = v => page.evaluate(v => { const d = document.querySelector('.app-dialog-holder'); Object.keys(v).forEach(k => { const x = d.querySelector('[data-pkey="' + k + '"]'); x.value = v[k]; }); d.querySelector('[data-act="ok"]').click(); }, v);

  // 1) Açılışta harçlık kendiliğinden yazılır
  eq('7 harçlık yazıldı (ilki cüzdan eklenmeden önce)', await alTx(), AL.map(d => ['alu_k1_' + d.replace(/-/g, ''), d, 500, 'Harçlık', 'u_k1', 'n', d === '2027-09-03']));
  eq('açılış bildirimi', await hasToast('7 harçlık kendiliğinden yazıldı.'), true);
  eq('cüzdan: bakiye 5.000 − 3.000 = 2.000, açılış 4.000 + 500', await page.evaluate(() => { const a = App.Accounts.get('n'); return [a.balance, a.openingBalance]; }), [2000, 4500]);
  eq('işlenen son gün, Harçlık kategorisi bir kez', await page.evaluate(() => [App.Users.get('u_k1').allowance.done, (S.settings().customCats || []).filter(c => c.name === 'Harçlık').map(c => [c.emoji, c.type]), EC.includes('Harçlık')]), ['2027-10-15', [['🪙', 'expense']], true]);
  eq('bakiye tutarlı (yeniden hesapla değiştirmez)', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('tekrar çalışınca yeni kayıt yok', await page.evaluate(() => App.Kids.autoRun()), 0);
  await page.reload(); await page.waitForTimeout(250);
  eq('yeniden açılınca da 7', [(await alTx()).length, (await toasts()).some(t => /harçlık kendiliğinden/.test(t))], [7, false]);

  // 2) Aile › Çocuklar kartları
  await page.evaluate(() => App.UI.nav('aile')); await page.waitForTimeout(150);
  eq('üye kartında rol', await page.evaluate(() => [...document.querySelectorAll('#familyMembers .uc-role')].map(x => x.textContent)), ['Aktif Profil', 'Üye', 'Çocuk', 'Çocuk']);
  eq('Ada kartı', await kid(0), { name: 'Ada', sub: 'Bu yıl ₺28.200,00 gider · ayda ortalama ₺3.133,00',
    al: ['Haftalık ₺500,00 · her Cuma · 💵 Cüzdan', 'Sıradaki: 22 Ekim 2027'], alBtns: ['✎ Değiştir', '⏹ Durdur'],
    cats: [['📚 Eğitim', '₺18.000,00'], ['👕 Giyim', '₺5.000,00'], ['🪙 Harçlık', '₺3.500,00'], ['💊 Sağlık', '₺800,00'], ['🎬 Eğlence', '₺400,00'], ['📦 Diğer kategoriler', '₺500,00']],
    exp: ['Geçen yıl aynı dönem: ₺12.000,00 · bu yıl %135 daha fazla'], goals: [], gl: ['Kumbara hedefi yok.'] });
  eq('Kuzey kartı (harçlık ve gider yok)', await kid(1).then(k => [k.sub, k.al, k.alBtns, k.cats, k.exp]), ['Bu yıl ₺0,00 gider', ['Harçlık tanımlı değil.'], ['＋ Harçlık Ekle'], [], ['Bu yıl çocuk adına gider yok.']]);
  eq('ipucu', await page.evaluate(() => document.querySelector('#kidsPanel .kid-hint').textContent), 'ℹ️ Okul, kurs, giyim gibi çocuk için yapılan giderleri eklerken “Kim Yaptı” alanında çocuğu seçin; burada toplanır.');
  eq('yıllık hesap: 2026 tamamı 17.000, aktarım sayılmaz', await page.evaluate(() => [App.Kids.yearStats('u_k1', 2026).total, App.Kids.yearStats('u_k1', 2027).cats.length]), [17000, 7]);

  // 3) Nakit akışı: 22, 29 Ekim; 5, 12, 19 Kasım
  eq('nakit akışında yaklaşan harçlık', await page.evaluate(() => App.Cashflow.items(30).filter(x => x.src === 'Harçlık').map(x => [x.date, x.label, x.amount])), ['2027-10-22', '2027-10-29', '2027-11-05', '2027-11-12', '2027-11-19'].map(d => [d, '🪙 Harçlık: Ada', 500]));

  // 4) Silinen harçlık yeniden yazılmaz; eşitlemede aynı kimlik tek kayıt olur
  await page.evaluate(() => { S.saveTxns(S.txns().filter(t => t.id !== 'alu_k1_20271015')); });
  eq('silinen yeniden yazılmaz', [await page.evaluate(() => App.Kids.autoRun()), (await alTx()).length], [0, 6]);
  eq('iki telefonun yazdığı harçlık eşitlemede tek kayıt', await page.evaluate(() => { const l = S.txns().filter(t => /^al/.test(t.id)), r = l.map(t => Object.assign({}, t, { ts: t.ts + 5 })); return mergeList([], l, r).length; }), 6);

  // 5) Aylık harçlık penceresi (Kuzey): 31 Ağustos'tan, Vadesiz'den 1.000 → 31 Ağustos, 30 Eylül yazılır; sıradaki 31 Ekim
  await page.evaluate(() => App.Kids.setAllowance('u_k2')); await page.waitForTimeout(50);
  eq('harçlık penceresi: hesaplar yalnız nakit/banka', await page.evaluate(() => [...document.querySelectorAll('.app-dialog-holder [data-pkey="acc"] option')].map(o => o.textContent)), ['🏦 Vadesiz', '💵 Cüzdan']);
  eq('varsayılanlar', await dlg(), [['amount', ''], ['period', 'week'], ['from', '2027-10-20'], ['acc', 'n']]);
  await fill({ amount: '' }); await page.waitForTimeout(50);
  eq('tutar yok: hata, pencere açık', [await hasToast('Geçerli tutar girin.'), !!(await dlg())], [true, true]);
  await fill({ amount: '1000', period: 'month', from: '2026-10-19', acc: 'b' }); await page.waitForTimeout(50);
  eq('bir yıldan eski: hata', [await hasToast('İlk harçlık günü en çok bir yıl önce olabilir.'), !!(await dlg())], [true, true]);
  await fill({ from: '2027-08-31' }); await page.waitForTimeout(150);
  eq('aylık harçlık kaydedildi', [await page.evaluate(() => App.Users.get('u_k2').allowance), (await alTx()).filter(x => x[4] === 'u_k2').map(x => [x[1], x[2], x[5], x[6]]), await hasToast('Harçlık kaydedildi; geçmiş 2 harçlık yazıldı.')],
    [{ amount: 1000, period: 'month', from: '2027-08-31', accountId: 'b', done: '2027-09-30' }, [['2027-08-31', 1000, 'b', false], ['2027-09-30', 1000, 'b', false]], true]);
  eq('Kuzey kartında harçlık', await kid(1).then(k => [k.al, k.sub]), [['Aylık ₺1.000,00 · her ayın 31. günü (kısa aylarda son gün) · 🏦 Vadesiz', 'Sıradaki: 31 Ekim 2027'], 'Bu yıl ₺2.000,00 gider · ayda ortalama ₺667,00']);
  eq('ay sonunu aşan gün: kısa ayda son gün (2028 artık yıl)', await page.evaluate(() => App.Kids.dates(App.Users.get('u_k2').allowance, '2027-11-01', '2028-04-30')), ['2027-11-30', '2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  // Düzenleme: tutar 1.200; yazılmış günler değişmez
  await page.evaluate(() => App.Kids.setAllowance('u_k2')); await page.waitForTimeout(50);
  eq('düzenleme penceresi dolu', await dlg(), [['amount', '1000'], ['period', 'month'], ['from', '2027-08-31'], ['acc', 'b']]);
  await fill({ amount: '1200' }); await page.waitForTimeout(100);
  eq('düzenlendi: geçmiş aynı, yaklaşan yeni tutar', [await page.evaluate(() => App.Users.get('u_k2').allowance.amount), (await alTx()).filter(x => x[4] === 'u_k2').map(x => x[2]), await page.evaluate(() => App.Kids.upcoming(30).filter(x => x.label.includes('Kuzey')).map(x => [x.date, x.amount]))], [1200, [1000, 1000], [['2027-10-31', 1200]]]);
  // Hesap silinirse harçlık yazılmaz, kartta uyarı
  await page.evaluate(() => { S.saveAccounts(S.accounts().filter(a => a.id !== 'b')); App.Users.renderAll(); });
  eq('hesap yok: uyarı, yazılmaz', [await kid(1).then(k => k.al[1]), await page.evaluate(() => App.Kids.upcoming(30).filter(x => x.label.includes('Kuzey')).length)], ['⚠️ Harçlığın hesabı bulunamadı; harçlık yazılmıyor. Değiştir\'den hesap seçin.', 0]);
  // Durdur
  await page.evaluate(() => App.Kids.stopAllowance('u_k2')); await page.waitForTimeout(50);
  await page.evaluate(() => document.querySelector('.app-dialog-holder [data-act="ok"]').click()); await page.waitForTimeout(100);
  eq('durduruldu: yazılanlar kalır', [await page.evaluate(() => App.Users.get('u_k2').allowance), (await alTx()).filter(x => x[4] === 'u_k2').length, await kid(1).then(k => k.alBtns)], [undefined, 2, ['＋ Harçlık Ekle']]);

  // 6) Kumbara: Ada için Bisiklet 8.000, 2.400 konur (yeni gider yazılmaz)
  await page.evaluate(() => App.Kids.addKumbara('u_k1')); await page.waitForTimeout(50);
  await fill({ name: '', target: '8000' }); await page.waitForTimeout(50);
  eq('kumbara: ad yok hatası', await hasToast('Hedefin adını girin.'), true);
  await fill({ name: 'Bisiklet', emoji: '🚲' }); await page.waitForTimeout(100);
  const g1 = await page.evaluate(() => S.goals().find(g => g.name === 'Bisiklet'));
  eq('kumbara hedefi', [g1.userId, g1.target, g1.emoji, g1.txnMode, g1.contributions.length], ['u_k1', 8000, '🚲', 'none', 0]);
  const nTx = await page.evaluate(() => S.txns().length);
  await page.evaluate(id => App.Kids.kumbaraAdd(id), g1.id); await page.waitForTimeout(50);
  await fill({ amount: '2400' }); await page.waitForTimeout(100);
  eq('kumbaraya 2.400: kartta', await kid(0).then(k => [k.goals, k.gl, k.sub]), [[['🚲 Bisiklet', '₺2.400,00 / ₺8.000,00', '%30 · ₺5.600,00 kaldı']], [], 'Bu yıl ₺27.700,00 gider · ayda ortalama ₺3.078,00']);
  eq('kumbara katkısı işlem yazmaz', await page.evaluate(() => S.txns().length), nTx);

  // 7) Birikim › Hedefler: sahip seçimi, kumbara etiketi, düzenleme
  await page.evaluate(() => { App.UI.nav('hedefler'); }); await page.waitForTimeout(150);
  eq('hedef formunda sahip', await page.evaluate(() => [document.getElementById('gOwnerRow').style.display, [...document.querySelectorAll('#gOwner option')].map(o => o.textContent)]), ['', ['👨‍👩‍👧 Aile hedefi', '🐷 Kumbara: 🧒 Ada', '🐷 Kumbara: 👦 Kuzey']]);
  eq('hedef kartında kumbara', await page.evaluate(() => [...document.querySelectorAll('#goalsGrid .goal-own')].map(x => x.textContent)), ['🐷 Kumbara: 🧒 Ada']);
  await page.evaluate(() => { document.getElementById('gName').value = 'Lego'; document.getElementById('gTarget').value = '3000'; document.getElementById('gOwner').value = 'u_k2'; App.Goals.add(); }); await page.waitForTimeout(100);
  eq('formdan Kuzey kumbarası', await page.evaluate(() => [S.goals().find(g => g.name === 'Lego').userId, document.getElementById('gOwner').value]), ['u_k2', '']);
  const g2 = await page.evaluate(() => S.goals().find(g => g.name === 'Lego').id);
  await page.evaluate(id => App.Goals.edit(id), g2); await page.waitForTimeout(50);
  eq('düzenlemede sahip alanı', await dlg().then(d => d.find(x => x[0] === 'owner')), ['owner', 'u_k2']);
  await fill({ owner: '' }); await page.waitForTimeout(100);
  eq('aile hedefine çevrildi', await page.evaluate(id => S.goals().find(g => g.id === id).userId, g2), undefined);
  await page.evaluate(() => { S.saveSetting('users', S.settings().users.map(u => { const x = Object.assign({}, u); delete x.kid; delete x.allowance; return x; })); App.Goals.renderAll(); });
  eq('çocuk yoksa sahip seçimi gizli', await page.evaluate(() => document.getElementById('gOwnerRow').style.display), 'none');
  await page.evaluate(sd => { S.saveSetting('users', sd); }, U.map(u => u.id === 'u_k1' ? Object.assign({}, u, { allowance: Object.assign({}, u.allowance, { done: '2027-10-15' }) }) : u));

  // 8) Üye ekleme ve düzenleme
  await page.evaluate(() => { App.UI.nav('aile'); document.getElementById('userName').value = 'Eylül'; document.getElementById('userEmoji').value = '👧'; document.getElementById('userKid').checked = true; App.Users.add(); }); await page.waitForTimeout(100);
  eq('çocuk üye eklendi', await page.evaluate(() => { const u = S.settings().users.find(x => x.name === 'Eylül'); return [u.kid, document.getElementById('userKid').checked, [...document.querySelectorAll('#kidsPanel .kid-name')].map(x => x.textContent)]; }), [true, false, ['Ada', 'Kuzey', 'Eylül']]);
  await page.evaluate(() => App.Users.edit('u_k1')); await page.waitForTimeout(50);
  eq('üye düzenlemede çocuk sorusu', await dlg().then(d => d.find(x => x[0] === 'kid')), ['kid', '1']);
  await fill({ name: 'Ada Su' }); await page.waitForTimeout(100);
  eq('ad değişti, harçlık korundu', await page.evaluate(() => { const u = App.Users.get('u_k1'); return [u.name, u.kid, u.allowance.amount, u.allowance.done]; }), ['Ada Su', true, 500, '2027-10-15']);
  await page.evaluate(() => App.Users.edit('u_k1')); await page.waitForTimeout(50);
  await fill({ kid: '' }); await page.waitForTimeout(100);
  eq('çocuk değil: harçlık durur, kart kalkar', await page.evaluate(() => { const u = App.Users.get('u_k1'); return [u.kid, u.allowance, [...document.querySelectorAll('#kidsPanel .kid-name')].map(x => x.textContent), App.Kids.upcoming(30).length]; }), [undefined, undefined, ['Kuzey', 'Eylül'], 0]);
  // Silinen üyenin kumbarası aile hedefi olur
  await page.evaluate(() => { const g = S.goals(); g.find(x => x.name === 'Lego').userId = 'u_k2'; S.saveGoals(g); App.Users.remove('u_k2'); }); await page.waitForTimeout(50);
  await page.evaluate(() => document.querySelector('.app-dialog-holder [data-act="ok"]').click()); await page.waitForTimeout(100);
  eq('silinen çocuğun kumbarası aile hedefi', await page.evaluate(() => S.goals().find(g => g.name === 'Lego').userId), undefined);

  // 9) Kayıt temizliği ve eşitleme
  const norm = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pf_s')); s.users = [{ id: 'k1', name: 'A', kid: true, allowance: { amount: 300, period: 'x', from: '2027-10-01', accountId: 'n', done: 'bad' } }, { id: 'k2', name: 'B', kid: 'yes', allowance: { amount: 300, period: 'week', from: '2027-10-01' } },
    { id: 'k3', name: 'C', kid: true, allowance: { amount: -5, period: 'week', from: '2027-10-01' } }, { id: 'k4', name: 'D', kid: true, allowance: { amount: 300, from: '01.10.2027' } }];
    localStorage.setItem('pf_s', JSON.stringify(s)); const g = JSON.parse(localStorage.getItem('pf_g')); g.push({ id: 'gx', name: 'X', target: 10, contributions: [], userId: 'bad id!' }, { id: 'gy', name: 'Y', target: 10, contributions: [], userId: 'k1' }); localStorage.setItem('pf_g', JSON.stringify(g));
    S.load(); return [S.settings().users.map(u => [u.id, u.kid, u.allowance]), S.goals().filter(x => x.id === 'gx' || x.id === 'gy').map(x => [x.id, x.userId])]; });
  eq('kayıt temizliği', norm, [[['k1', true, { amount: 300, period: 'week', from: '2027-10-01', accountId: 'n', done: '' }], ['k2', undefined, undefined], ['k3', true, undefined], ['k4', true, undefined]], [['gx', undefined], ['gy', 'k1']]]);
  eq('eşitleme çocuk ve harçlığı taşır', await page.evaluate(() => [App.Sync.collect().s.users[0].allowance.amount, App.Sync.collect().stores.pf_g.find(g => g.id === 'gy').userId]), [300, 'k1']);

  // 10) Dar ekran
  await page.evaluate(sd => { S.saveSetting('users', sd); App.UI.nav('aile'); }, U); await page.waitForTimeout(100);
  await page.setViewportSize({ width: 320, height: 700 }); await page.waitForTimeout(100);
  eq('320 px: taşma yok', await page.evaluate(() => { const bad = []; document.querySelectorAll('#kidsPanel *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > window.innerWidth + 0.5) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth <= window.innerWidth, bad.slice(0, 5), document.querySelectorAll('#kidsPanel .kid-card').length]; }), [true, [], 2]);

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
