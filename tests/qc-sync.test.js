// Usage: node tests/qc-sync.test.js [http://127.0.0.1:8787]
// Aile kullanımı, iki/üç cihaz: çevrimdışı değişiklik ve yeniden bağlanma, uzun süre kapalı kalan eski cihazın silinenleri
// geri getirmemesi, kart ödemesi (transfer çifti) ve taksit planının eşitlenmesi, aynı banka mesajının iki cihazda işlenmesi,
// cihaza özel profil, "Bu cihazda kapat". Yalnız yerel geliştirme sunucusu (wrangler dev) ile çalışır; canlı kasaya dokunmaz.
const path = require('path');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = iso(new Date());

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log('Playwright yok; test atlandı.'); process.exit(0); }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.log('Bu test yalnız yerel sunucuda çalışır (canlı kasaya test kaydı gönderilmez).'); process.exit(0); }
  try { const r = await fetch(BASE + '/v1/config'); if (!r.ok) throw 0; } catch (e) { console.log('Eşitleme sunucusu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  const browser = await pw.chromium.launch();
  async function device(name, seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('✗ [' + name + '] page error: ' + e.message); });
    await page.goto(BASE + '/index.html');
    await page.evaluate(seed => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(seed).forEach(k => localStorage.setItem(k, JSON.stringify(seed[k]))); }, seed || {});
    await page.reload();
    await page.waitForFunction(() => window.App && App.Sync);
    return { ctx, page };
  }
  const USERS = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
  const accs = [{ id: 'a1700000000000_bank', name: 'Ortak Vadesiz', type: 'bank', owner: 'shared', last4: '4444', balance: 10000, openingBalance: 10000, ts: 1 },
    { id: 'a1700000000000_card', name: 'Ortak Kart', type: 'card', owner: 'shared', last4: '1111', limit: 30000, balance: 0, openingBalance: 0, ts: 2 }];
  const BANK = accs[0].id, CARD = accs[1].id;
  const sync = p => p.evaluate(() => App.Sync.syncNow({ quiet: true }));
  const bal = p => p.evaluate(() => S.accounts().map(a => a.balance));
  const notes = async p => (await p.evaluate(() => S.txns().map(t => t.note))).sort();
  const add = (p, amount, note, acc) => p.evaluate(o => { App.UI.nav('islemler'); App.UI.setType('expense'); const c = document.querySelector('#txnPayChips [data-acc="' + o.acc + '"]'); if (c) c.click(); document.getElementById('txnAmt').value = o.amount; document.getElementById('txnNote').value = o.note; App.Transactions.add(); }, { amount, note, acc });
  const settle = async (...ps) => { for (let i = 0; i < 2; i++) for (const p of ps) await sync(p); };

  const A = await device('A', { pf_a: accs, pf_t: [], pf_s: { onboarded: true, users: USERS, activeUser: 'u_a' } });
  await A.page.evaluate(u => App.Sync.start(u), BASE); await A.page.evaluate(() => App.UI.closeModal('syncCodeHolder'));
  const code = await A.page.evaluate(() => App.Sync.codeOf(App.Sync.cfg()));
  const B = await device('B', { pf_s: { onboarded: true, users: USERS, activeUser: 'u_b' } });
  eq('B (eşin telefonu) katıldı', await B.page.evaluate(c => App.Sync.join(c), code), true);
  await settle(A.page, B.page);
  eq('profil cihaza özel: A=Deniz, B=Ece', [await A.page.evaluate(() => S.settings().activeUser), await B.page.evaluate(() => S.settings().activeUser)], ['u_a', 'u_b']);

  // 1) Kart harcaması + kart ödemesi (transfer çifti) eşitlenir; bakiyeler iki cihazda aynı
  await add(A.page, '1000', 'Market (A)', CARD);
  await A.page.evaluate(card => { App.Cards.pay(card); [...document.querySelectorAll('#ccOpts .cc-opt')].pop().click(); document.getElementById('ccAmt').value = '400'; document.getElementById('ccPayOk').click(); }, CARD);
  await settle(A.page, B.page);
  eq('B: banka 9.600, kart −600; gider 1.000 (ödeme gider değil)', [await bal(B.page), await B.page.evaluate(() => App.Transactions.monthTotals(tm()).expense)], [[9600, -600], 1000]);
  eq('B kaydı kimin yaptığını korur (Deniz)', await B.page.evaluate(() => S.txns().find(t => t.note === 'Market (A)').userId), 'u_a');

  // 2) Çevrimdışı: A internetsiz iki kayıt ekler ve bir kaydı düzenler; B aynı anda ekler ve A'nın düzenlemediği bir kaydı siler
  await add(B.page, '50', 'Silinecek (B)', BANK); await settle(A.page, B.page);
  await A.ctx.setOffline(true);
  await add(A.page, '75', 'Çevrimdışı 1 (A)', BANK); await add(A.page, '25', 'Çevrimdışı 2 (A)', CARD);
  eq('çevrimdışıyken eşitleme başarısız ama veri cihazda', [await sync(A.page), (await notes(A.page)).includes('Çevrimdışı 1 (A)')], [false, true]);
  await add(B.page, '30', 'Çevrimiçi (B)', BANK);
  await B.page.evaluate(() => { const t = S.txns().find(x => x.note === 'Silinecek (B)'); App.Transactions.purge(t.id); renderAllViews(); });
  await sync(B.page);
  await A.ctx.setOffline(false);
  await settle(A.page, B.page);
  const expect = ['Market (A)', 'Kart borcu ödemesi: Ortak Kart', 'Kart borcu ödemesi: Ortak Kart', 'Çevrimdışı 1 (A)', 'Çevrimdışı 2 (A)', 'Çevrimiçi (B)'].sort();
  eq('yeniden bağlanınca A ve B aynı kayıtlar (çevrimdışı eklenenler kaybolmadı, silinen geri gelmedi)', [await notes(A.page), await notes(B.page)], [expect, expect]);
  // banka: 10.000 − 400 − 75 − 30 = 9.495; kart: −1.000 + 400 − 25 = −625
  eq('iki cihazda bakiyeler hareketlerden aynı hesaplanır', [await bal(A.page), await bal(B.page)], [[9495, -625], [9495, -625]]);

  // 3) Eski cihaz: C katılır, uzun süre kapalı kalır; bu sırada A iki kaydı siler. C açılınca silinenler geri gelmez
  const C = await device('C', { pf_s: { onboarded: true, users: USERS, activeUser: 'u_a' } });
  await C.page.evaluate(c => App.Sync.join(c), code); await settle(C.page);
  await C.ctx.setOffline(true);
  await A.page.evaluate(() => { ['Çevrimdışı 1 (A)', 'Çevrimiçi (B)'].forEach(n => { const t = S.txns().find(x => x.note === n); App.Transactions.purge(t.id); }); renderAllViews(); });
  await settle(A.page, B.page);
  await add(C.page, '12', 'Eski cihaz (C)', BANK);
  await C.ctx.setOffline(false); await settle(C.page, A.page, B.page);
  const exp2 = ['Market (A)', 'Kart borcu ödemesi: Ortak Kart', 'Kart borcu ödemesi: Ortak Kart', 'Çevrimdışı 2 (A)', 'Eski cihaz (C)'].sort();
  eq('eski cihaz silinenleri geri getirmez, kendi yeni kaydını ekler (3 cihaz aynı)', [await notes(A.page), await notes(B.page), await notes(C.page)], [exp2, exp2, exp2]);
  eq('3 cihazda bakiye aynı: banka 9.588, kart −625', [await bal(A.page), await bal(B.page), await bal(C.page)], [[9588, -625], [9588, -625], [9588, -625]]);

  // 4) Aynı banka mesajı iki cihazda (sunucudan silinmeden önce) işlenirse tek kayıt
  const sms = [{ id: 777001, label: 'abcd1234_u_a', text: '1111 ile biten kartinizla BIM isyerinden 64,90 TL harcama yapilmistir. Yapi Kredi', receivedAt: Date.now() }];
  await A.page.evaluate(i => App.BankSms.ingest(i), sms); await B.page.evaluate(i => App.BankSms.ingest(i), sms);
  await settle(A.page, B.page);
  eq('aynı SMS iki cihazda işlendi → eşitlemeden sonra tek kayıt, kart −689,90', [await A.page.evaluate(() => S.txns().filter(t => t.amount === 64.9).length), await B.page.evaluate(() => S.txns().filter(t => t.amount === 64.9).length), (await bal(B.page))[1]], [1, 1, -689.9]);

  // 5) Taksit planı eşitlenir; B planı silince A'da da silinir, kart geri döner
  await A.page.evaluate(card => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="' + card + '"]').click(); document.getElementById('txnAmt').value = '900'; document.getElementById('txnNote').value = 'Taksitli (A)'; document.getElementById('txnInst').value = '3'; document.getElementById('txnInstStart').value = td(); App.Transactions.add(); }, CARD);
  await settle(A.page, B.page);
  eq('B: 3 taksit, kart yalnız ilk taksit kadar arttı (−989,90), 600 limitte ayrılmış', [await B.page.evaluate(() => S.txns().filter(t => t.installment && /Taksitli/.test(t.note)).length), (await bal(B.page))[1], await B.page.evaluate(c => App.Cards.info(c).blocked, CARD)], [3, -989.9, 600]);
  await B.page.evaluate(() => { const t = S.txns().find(x => x.installment && /Taksitli/.test(x.note)); App.Transactions.purge(t.id); renderAllViews(); });
  await settle(B.page, A.page);
  eq('plan B\'de silindi → A\'da da yok, kart −689,90', [await A.page.evaluate(() => S.txns().filter(t => t.installment).length), (await bal(A.page))[1]], [0, -689.9]);

  // 6) "Bu cihazda kapat": B'deki veriler kalır, sonraki değişiklikler B'ye gelmez
  const bNotes = await notes(B.page);
  await B.page.evaluate(() => App.Sync.disable());
  const disc = await B.page.evaluate(() => App.Sync.configured());
  if (disc) { // onay penceresi varsa kabul et
    await B.page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); const b = m && m.querySelector('[data-act="ok"]'); if (b) b.click(); });
    await B.page.waitForTimeout(300);
  }
  eq('B bağlantısı kapandı, veriler duruyor', [await B.page.evaluate(() => App.Sync.configured()), await notes(B.page)], [false, bNotes]);
  await add(A.page, '5', 'Kapattıktan sonra (A)', BANK); await sync(A.page);
  eq('kapatılan cihaza yeni kayıt gelmez', (await notes(B.page)).includes('Kapattıktan sonra (A)'), false);

  // 7) SMS bağlantısını kapatma: sunucuya ulaşılamazsa "kapatıldı" denmez, bağlantı geçerli kalır; çevrimiçi kapatınca gerçekten geçersiz
  await A.page.evaluate(() => App.BankSms.setup()); await A.page.waitForTimeout(300);
  await A.page.evaluate(() => document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()));
  const smsUrl = await A.page.evaluate(() => App.BankSms.url());
  const okTop = p => p.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
  await A.ctx.setOffline(true);
  await A.page.evaluate(() => App.BankSms.disable()); await okTop(A.page); await A.page.waitForTimeout(400);
  eq('çevrimdışı kapatma: hata gösterilir, bağlantı uygulamada açık kalır', [await A.page.evaluate(() => !!App.BankSms.url()), await A.page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /kapatılamadı/.test(t.textContent)))], [true, true]);
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => App.BankSms.disable()); await okTop(A.page); await A.page.waitForTimeout(400);
  const post = await fetch(smsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'AILEKASASI-TEST 1,00 TL' }) });
  eq('çevrimiçi kapatma: uygulamada kapalı ve eski bağlantı sunucuda geçersiz (404)', [await A.page.evaluate(() => App.BankSms.url()), post.status], ['', 404]);

  // 8) Kayıp telefon: kodu bilen eski cihaz (C) erişimini kaybetmeli. A sunucudaki kasayı siler, yeni kasa açar, B yeni kodla katılır
  const cNotes = await notes(C.page);
  await A.page.evaluate(() => App.Sync.destroy());
  await A.page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="c"]').value = 'sil'; m.querySelector('[data-act="ok"]').click(); });
  await A.page.waitForFunction(() => !App.Sync.configured(), null, { timeout: 5000 }).catch(() => {});
  eq('A: "SİL" ile kasa silindi, A\'da eşitleme kapandı, veriler duruyor', [await A.page.evaluate(() => App.Sync.configured()), (await notes(A.page)).includes('Market (A)')], [false, true]);
  eq('C (kayıp telefon): eşitleme başarısız, anlaşılır mesaj, verisi silinmez', [await sync(C.page), await C.page.evaluate(() => /bulunamadı/.test(App.Sync.cfg().lastError)), await notes(C.page)], [false, true, cNotes]);
  await A.page.evaluate(u => App.Sync.start(u), BASE); await A.page.evaluate(() => App.UI.closeModal('syncCodeHolder'));
  const code2 = await A.page.evaluate(() => App.Sync.codeOf(App.Sync.cfg()));
  eq('yeni kasa yeni kod', code2 !== code, true);
  eq('B yeni kodla yeniden katıldı', await B.page.evaluate(c => App.Sync.join(c), code2), true);
  await add(A.page, '7', 'Yeni kasa (A)', BANK); await settle(A.page, B.page);
  eq('B yeni kasadaki kaydı alır; C almaz ve eski kodla katılınamaz', [(await notes(B.page)).includes('Yeni kasa (A)'), await sync(C.page), (await notes(C.page)).includes('Yeni kasa (A)')], [true, false, false]);
  const D = await device('D', { pf_s: { onboarded: true, users: USERS, activeUser: 'u_a' } });
  eq('eski kodla yeni cihaz katılamaz', [await D.page.evaluate(c => App.Sync.join(c), code), await D.page.evaluate(() => App.Sync.configured())], [false, false]);

  // Temizlik: test kasası yerel sunucudan silinir
  await A.page.evaluate(() => { const c = App.Sync.cfg(); return App.Sync.api(c, 'DELETE', ''); });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); process.exit(fail ? 1 : 0);
})();
