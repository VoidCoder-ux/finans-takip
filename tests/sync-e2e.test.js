// Usage: node tests/sync-e2e.test.js [http://127.0.0.1:8787]
// İki ayrı tarayıcı profili (iki cihaz) ile Cloudflare Worker üzerinden uçtan uca şifreli eşitleme ve bildirim zinciri.
// Gerekenler: `cd worker && npx wrangler dev --test-scheduled` (+ .dev.vars içinde VAPID anahtarları ve ALLOW_INSECURE_PUSH=1).
// Sunucu veya Playwright yoksa atlanır.
const http = require('http'), path = require('path');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = iso(new Date());
const TOMORROW = iso(new Date(Date.now() + 864e5));

(async () => {
  const pw = loadPlaywright();
  if (!pw) { console.log('Playwright yok; eşitleme testi atlandı.'); process.exit(0); }
  try { const r = await fetch(BASE + '/v1/config'); if (!r.ok) throw 0; } catch (e) { console.log('Eşitleme sunucusu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  const browser = await pw.chromium.launch({ channel: 'chromium' }); // tam Chromium: headless shell bildirim iznini desteklemiyor
  async function device(name, seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(['notifications'], { origin: BASE });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('✗ [' + name + '] page error: ' + e.message); });
    await page.goto(BASE + '/index.html');
    await page.evaluate(seed => { localStorage.clear(); Object.keys(seed).forEach(k => localStorage.setItem(k, JSON.stringify(seed[k]))); }, seed || {});
    await page.reload();
    await page.waitForFunction(() => window.App && App.Sync);
    return { ctx, page };
  }
  const A_ACC = 'a1700000000000_shar';
  const acc = { id: A_ACC, name: 'Ortak Hesap', type: 'bank', owner: 'shared', balance: 1000, openingBalance: 1000, ts: 1 };
  const txn = (id, amount, note, extra) => Object.assign({ id, type: 'expense', amount, category: 'Market', date: TODAY, note, accountId: A_ACC, userId: 'u_self', ts: 1, balanceApplied: true }, extra || {});
  const bal = p => p.evaluate(() => S.accounts().map(a => [a.name, a.balance]));
  const ids = p => p.evaluate(() => S.txns().map(t => t.id).sort());
  const sync = p => p.evaluate(() => App.Sync.syncNow({ quiet: true }));
  // Uygulamanın kendi yoluyla işlem ekle (bakiye ve eşitleme tetiklemesi dahil)
  const addExpense = (p, amount, note) => p.evaluate(({ amount, note }) => { App.UI.nav('islemler'); App.UI.setType('expense'); document.getElementById('txnAmt').value = amount; document.getElementById('txnNote').value = note; App.Transactions.add(); }, { amount, note });

  // 1) A eşitlemeyi başlatır; B kendi verisiyle katılır → birleşim
  const A = await device('A', { pf_a: [acc], pf_t: [txn('t1700000000000_aaa1', 100, 'Migros A')], pf_a_dummy: 0, pf_s: { onboarded: true, theme: 'dark' } });
  eq('A starts sync', await A.page.evaluate(u => App.Sync.start(u), BASE), true);
  await A.page.evaluate(() => App.UI.closeModal('syncCodeHolder'));
  const code = await A.page.evaluate(() => App.Sync.codeOf(App.Sync.cfg()));
  const B = await device('B', { pf_a: [Object.assign({}, acc, { balance: 950, openingBalance: 1000 })], pf_t: [txn('t1700000000000_bbb1', 50, 'Bakkal B')], pf_s: { onboarded: true, theme: 'light' } });
  eq('B joins with code', await B.page.evaluate(c => App.Sync.join(c), code), true);
  eq('B has union of both devices', await ids(B.page), ['t1700000000000_aaa1', 't1700000000000_bbb1']);
  eq('B balance recomputed from ledger', await bal(B.page), [['Ortak Hesap', 850]]);
  await sync(A.page);
  eq('A receives B\'s record', await ids(A.page), ['t1700000000000_aaa1', 't1700000000000_bbb1']);
  eq('A balance matches B', await bal(A.page), [['Ortak Hesap', 850]]);

  // 2) Sunucu yalnız şifreli veri görür
  const raw = await A.page.evaluate(() => { const c = App.Sync.cfg(); return App.Sync.api(c, 'GET', '').then(r => r.body.data); });
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  eq('server copy is ciphertext (no plaintext notes)', [/Migros|Bakkal|Ortak Hesap/.test(decoded), /"ct":"/.test(decoded)], [false, true]);
  const wrongKey = code.slice(0, -6) + (code.slice(-6) === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');
  const C = await device('C', {});
  eq('tampered code cannot join', await C.page.evaluate(c => App.Sync.join(c), wrongKey), false);
  await C.ctx.close();

  // 3) Aynı anda iki cihazda ekleme → ikisi de korunur, bakiyeler tutarlı
  await addExpense(A.page, '10', 'Eşzamanlı A');
  await addExpense(B.page, '20', 'Eşzamanlı B');
  await sync(A.page); await sync(B.page); await sync(A.page);
  const notes = async p => (await p.evaluate(() => S.txns().map(t => t.note))).sort();
  eq('concurrent adds kept on A', await notes(A.page), ['Bakkal B', 'Eşzamanlı A', 'Eşzamanlı B', 'Migros A']);
  eq('concurrent adds kept on B', await notes(B.page), ['Bakkal B', 'Eşzamanlı A', 'Eşzamanlı B', 'Migros A']);
  eq('balances converge after concurrent adds', [await bal(A.page), await bal(B.page)], [[['Ortak Hesap', 820]], [['Ortak Hesap', 820]]]);

  // 4) Aynı kaydın farklı alanlarını iki cihaz düzenler → alan düzeyinde birleşir
  await A.page.evaluate(() => { const t = S.txns(); t.find(x => x.id === 't1700000000000_aaa1').note = 'Migros (A notu)'; S.saveTxns(t); });
  await B.page.evaluate(() => { const t = S.txns(); t.find(x => x.id === 't1700000000000_aaa1').category = 'Yiyecek'; S.saveTxns(t); });
  await sync(A.page); await sync(B.page); await sync(A.page);
  const rec = p => p.evaluate(() => { const t = S.txns().find(x => x.id === 't1700000000000_aaa1'); return [t.note, t.category]; });
  eq('field-level merge on A', await rec(A.page), ['Migros (A notu)', 'Yiyecek']);
  eq('field-level merge on B', await rec(B.page), ['Migros (A notu)', 'Yiyecek']);

  // 5) Silme yayılır; 6) biri düzenlerken diğeri silerse düzenleme korunur
  const idOf = (p, note) => p.evaluate(n => S.txns().find(t => t.note === n).id, note);
  const delId = await idOf(A.page, 'Eşzamanlı A');
  await A.page.evaluate(id => App.Transactions.purge(id), delId);
  await sync(A.page); await sync(B.page);
  eq('deletion propagates to B', (await ids(B.page)).includes(delId), false);
  eq('balance after deletion', await bal(B.page), [['Ortak Hesap', 830]]);
  const keepId = await idOf(A.page, 'Eşzamanlı B');
  await A.page.evaluate(id => App.Transactions.purge(id), keepId);
  await B.page.evaluate(id => { const t = S.txns(); t.find(x => x.id === id).note = 'B düzenledi'; S.saveTxns(t); }, keepId);
  await sync(A.page); await sync(B.page); await sync(A.page);
  eq('edit beats concurrent delete', [(await ids(A.page)).includes(keepId), (await ids(B.page)).includes(keepId)], [true, true]);

  // 7) Ortak ayarlar eşitlenir, cihaza özel ayarlar eşitlenmez
  await A.page.evaluate(() => { const u = S.settings().users.slice(); u.push({ id: 'u1700000000000_kid1', name: 'Çocuk', emoji: '🧒', color: '#3b82f6' }); S.saveSetting('users', u); });
  await sync(A.page); await sync(B.page);
  eq('shared settings (members) synced', await B.page.evaluate(() => S.settings().users.map(u => u.name)), ['Ben', 'Eş', 'Çocuk']);
  eq('device settings (theme) not synced', [await A.page.evaluate(() => S.settings().theme), await B.page.evaluate(() => S.settings().theme)], ['dark', 'light']);

  // 8) Bildirim zinciri: plan → sunucu kaydı → cron → push servisine istek; SW push'ta yerel metni gösterir
  const hits = [];
  const mock = http.createServer((q, s) => { hits.push({ url: q.url, auth: q.headers.authorization }); s.writeHead(201); s.end(); });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const endpoint = 'http://127.0.0.1:' + mock.address().port + '/push/A';
  await A.page.evaluate(({ tomorrow }) => { const r = S.recurring(); r.push({ id: 'r1700000000000_kira', type: 'expense', amount: 17500, category: 'Faturalar', day: +tomorrow.slice(8), note: 'Kira', accountId: 'a1700000000000_shar', userId: 'u_self', isSubscription: false, active: true, ts: 1 }); S.saveRecurring(r); }, { tomorrow: TOMORROW });
  const plan = await A.page.evaluate(() => App.Push.plan());
  eq('push plan pings day before and due day', [plan.days.includes(TODAY), plan.days.includes(TOMORROW), plan.items.some(i => /Kira/.test(i.text))], [true, true, true]);
  // Tarayıcının gerçek push servisi (FCM) bu ortamda yok: aboneliği sahte uç noktaya yönlendir
  await A.page.evaluate(ep => {
    const c = App.Sync.cfg(); c.push = true; localStorage.setItem('ft_sync', JSON.stringify(c));
    const ready = navigator.serviceWorker.ready;
    Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => ready.then(reg => ({ pushManager: { getSubscription: () => Promise.resolve({ endpoint: ep, unsubscribe: () => Promise.resolve(true) }) } })) });
  }, endpoint);
  eq('device registers ping days with server', await A.page.evaluate(() => App.Push.refresh(true)), true);
  await fetch(BASE + '/__scheduled?cron=0+6+*+*+*');
  await new Promise(r => setTimeout(r, 1500));
  eq('cron sends VAPID push to this device only', [hits.length, hits[0] && hits[0].url, /^vapid t=/.test((hits[0] || {}).auth || '')], [1, '/push/A', true]);
  const reminders = await A.page.evaluate(() => IDB.get('reminders').then(r => r.items.filter(i => /Kira/.test(i.text)).length));
  eq('reminder text stays on device (IndexedDB)', reminders > 0, true);
  // SW push olayını CDP ile tetikle ve bildirimi doğrula
  const cdp = await A.ctx.newCDPSession(A.page);
  const regId = await new Promise(async res => { cdp.on('ServiceWorker.workerRegistrationUpdated', e => { const r = e.registrations.find(x => !x.isDeleted); if (r) res(r.registrationId); }); await cdp.send('ServiceWorker.enable'); setTimeout(() => res(null), 3000); });
  if (regId) {
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE, registrationId: regId, data: '' });
    await new Promise(r => setTimeout(r, 800));
    const shown = await A.page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.getNotifications()).then(n => n.map(x => x.title + ' | ' + x.body)));
    eq('service worker shows local reminder text on push', shown.some(s => /Kira/.test(s) && /yarın/.test(s)), true);
  } else { fail++; console.log('✗ service worker registration not found'); }

  // Temizlik: kasa sunucudan silinir, tüm cihazlarda eşitleme durur
  eq('vault deleted from server', await A.page.evaluate(() => { const c = App.Sync.cfg(); return App.Sync.api(c, 'DELETE', '').then(r => r.body.deleted); }), true);
  eq('other device reports missing vault', await B.page.evaluate(() => App.Sync.syncNow({ quiet: true })), false);
  mock.close(); await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
