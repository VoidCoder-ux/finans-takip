// Usage: node tests/qc-reconcile.test.js
// Bankayla karşılaştırma: hesap açılmadan / bakiye eşitlenmeden önce gerçekleşmiş banka hareketi bakiyeyi ikinci kez değiştirmez (aynı gün
// mesajın geldiği ana bakılır); "Bankayla karşılaştır" fark ve olası nedenleri gösterir, farkı düzeltme olarak kaydeder; bakiye
// düzeltmelerinin geçmişi kalır; hesaba giren/çıkan gelir-gider ve aktarım olarak ayrılır. Kurmaca veri; sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

const NOW = '2027-10-20T15:00:00', T = new Date(NOW).getTime(), H = 3600000;
const U = [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }];
// Yapı Kredi hesabı bugün 14:00'te 50.000 TL bakiyeyle eklendi; Akbank ve nakit eski hesaplar
const ACC = () => [{ id: 'yk', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', balance: 50000, openingBalance: 50000, ts: T - H, last4: '2222' },
  { id: 'ak', name: 'Akbank Vadesiz', type: 'bank', owner: 'shared', balance: 20000, openingBalance: 20000, ts: 1, last4: '3333' },
  { id: 'n', name: 'Nakit', type: 'cash', owner: 'shared', balance: 3000, openingBalance: 3000, ts: 1 }];
const seed = o => Object.assign({ pf_s: { onboarded: true, users: U, activeUser: 'u_a', lastBackupAt: Date.now() }, pf_a: ACC(), pf_t: [], pf_sq: [] }, o || {});
const SMS = (id, text, at) => ({ id, text, label: 'abcdefgh_u_a', receivedAt: at });
const BILL = amt => '2222 nolu hesabinizdan 20.10.2027 tarihinde ' + amt + ' TL fatura odemesi yapilmistir. Yapi Kredi';

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto(base);
  const load = async sd => { await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, sd); await page.reload(); await page.waitForTimeout(250); };
  const acc = id => page.evaluate(id => { const a = App.Accounts.get(id); return [a.balance, a.openingBalance]; }, id);
  const exp = () => page.evaluate(() => App.Transactions.monthTotals('2027-10').expense);
  const ING = items => page.evaluate(items => App.BankSms.ingest(items), items);
  const dlg = () => page.evaluate(() => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); return d ? [d.querySelector('.modal-title').textContent, d.textContent] : null; });
  const click = act => page.evaluate(a => { [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('[data-act="' + a + '"]').click(); }, act);
  const rec = async (id, v) => { await page.evaluate(id => App.Accounts.reconcile(id), id); const t = await dlg(); await page.evaluate(v => { const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); d.querySelector('[data-pkey="bank"]').value = v; d.querySelector('[data-act="ok"]').click(); }, v); await page.waitForTimeout(80); return t[0]; };

  // 1) Aynı gün açılan hesap: sabahki harcamanın mesajı hesap eklendikten sonra işlenir → bakiye ikinci kez düşmez
  await load(seed());
  const r1 = await ING([SMS('s1', BILL('2.000,00'), T - 2 * H)]);
  eq('hesap eklenmeden önce gelmiş mesaj (aynı gün): bakiye 50.000 kalır, açılış 52.000, gider sayılır', [r1.added, r1.pre, await acc('yk'), await exp()], [1, 1, [50000, 52000], 2000]);
  eq('bildirim metni', await page.evaluate(r => App.BankSms.summary(r), r1), '1 banka hareketi eklendi · 1 hareket hesabın başlangıç bakiyesine zaten dahil, bakiye değişmedi');
  const r1b = await ING([SMS('s2', BILL('1.000,00'), T - 10 * 60000)]);
  eq('hesap eklendikten sonra gelen mesaj: bakiye düşer', [r1b.pre || 0, await acc('yk')], [0, [49000, 52000]]);
  const r1c = await ING([SMS('s3', '2222 nolu hesabinizdan 18.10.2027 tarihinde 500,00 TL fatura odemesi yapilmistir. Yapi Kredi', T)]);
  eq('geç gelen eski tarihli mesaj (hesaptan önceki gün): bakiye değişmez', [r1c.pre, await acc('yk')], [1, [49000, 52500]]);
  eq('eski hesapta (Akbank) aynı şey olmaz', [await ING([SMS('s4', '3333 nolu hesabinizdan 300,00 TL fatura odemesi yapilmistir. Akbank', T - 5 * H)]).then(r => r.pre || 0), await acc('ak')], [0, [19700, 20000]]);
  // Onay ekranından eklenen eski mesaj da aynı kuralla
  await load(seed({ pf_sq: [{ id: 'sqsms_q1', text: '2222 nolu hesabinizdan ATM\'den 1.500,00 TL nakit cekilmistir. Yapi Kredi', label: 'abcdefgh_u_a', receivedAt: T - 3 * H, reason: 'ATM nakit çekimi (nakit hesabına aktarım olabilir)', p: { type: 'expense', amount: 1500, date: '2027-10-20', note: 'Yapı Kredi hesabından ödeme', category: 'Diğer', accountId: 'yk', last4: '2222' }, ts: T - 3 * H }] }));
  await page.evaluate(() => App.BankSms.accept('sqsms_q1')); await click('ok'); await page.waitForTimeout(100);
  eq('onaydan eklenen eski ATM çekimi: Yapı Kredi değişmez, nakit artar', [await acc('yk'), await acc('n')], [[50000, 51500], [4500, 3000]]);

  // 2) Elle bakiye eşitleme: geçmişe yazılır; sonra o andan önce gelmiş mesaj bakiyeyi değiştirmez
  await load(seed());
  await page.evaluate(() => { App.Accounts.edit('ak'); const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); d.querySelector('[data-pkey="balance"]').value = '18500'; d.querySelector('[data-act="ok"]').click(); });
  eq('elle eşitleme: bakiye 18.500, açılış 18.500, geçmişte −1.500', await page.evaluate(() => { const a = App.Accounts.get('ak'); return [a.balance, a.openingBalance, a.balAt, a.adj]; }), [18500, 18500, '2027-10-20', [{ date: '2027-10-20', delta: -1500, why: 'edit' }]]);
  const r2 = await ING([SMS('s1', '3333 nolu hesabinizdan 20.10.2027 tarihinde 1.500,00 TL fatura odemesi yapilmistir. Akbank', T - 60000)]);
  eq('eşitlemeden önce gelmiş aynı günkü mesaj: bakiye 18.500 kalır (fark açıklandı)', [r2.pre, await acc('ak'), await exp()], [1, [18500, 20000], 1500]);
  eq('geçmiş ve son eşitleme anı yeniden yüklemede (eşitleme) kalır', await page.evaluate(() => { S.load(); const a = S.accounts().find(x => x.id === 'ak'); return [a.adj.length, a.balTs > 1e12]; }), [1, true]);

  // 3) Bankayla karşılaştır: fark onay bekleyen hareketten
  await load(seed({ pf_t: [{ id: 't1', type: 'income', amount: 52000, category: 'Maaş', date: '2027-10-15', note: 'Maaş', accountId: 'ak', userId: 'u_a', ts: 1, balanceApplied: true },
    { id: 't2', type: 'expense', amount: 4000, category: 'Market', date: '2027-10-16', note: 'Migros', accountId: 'ak', userId: 'u_a', ts: 2, balanceApplied: true },
    { id: 't3o', type: 'expense', amount: 10000, category: 'Transfer', date: '2027-10-17', note: 'Akbank Vadesiz → Nakit', accountId: 'ak', userId: 'u_a', ts: 3, balanceApplied: true, transferId: 'tr1' },
    { id: 't3i', type: 'income', amount: 10000, category: 'Transfer', date: '2027-10-17', note: 'Akbank Vadesiz → Nakit', accountId: 'n', userId: 'u_a', ts: 3, balanceApplied: true, transferId: 'tr1' }],
    pf_a: ACC().map(a => a.id === 'ak' ? Object.assign(a, { balance: 58000 }) : a.id === 'n' ? Object.assign(a, { balance: 13000 }) : a),
    pf_sq: [{ id: 'sqsms_q1', text: '3333 nolu hesabinizdan 1.250,00 TL harcama yapilmistir. Akbank', label: 'abcdefgh_u_a', receivedAt: T, reason: 'Hangi hesaba ait olduğu bulunamadı', p: { type: 'expense', amount: 1250, date: '2027-10-20', note: 'Akbank', category: 'Diğer', accountId: 'ak', last4: '3333' }, ts: T }] }));
  eq('Hesaplar: her hesapta "Bankayla/Cüzdanla karşılaştır"', await page.evaluate(() => { App.UI.nav('hesaplar'); App.Accounts.renderAll(); return [...document.querySelectorAll('#accGrid .acc-rec .btn')].map(b => b.textContent); }), ['🔍 Bankayla karşılaştır', '🔍 Bankayla karşılaştır', '🔍 Cüzdanla karşılaştır']);
  eq('karşılaştırma penceresi', await rec('ak', '56.750'), '🔍 Bankayla Karşılaştır');
  const d3 = await dlg();
  eq('sonuç: fark, onay bekleyen hareket; giren/çıkan ayrı', [d3[0], /Uygulamada: ₺58\.000,00/.test(d3[1]), /Bankada: ₺56\.750,00/.test(d3[1]), /Fark: −₺1\.250,00 \(uygulamada daha fazla\)/.test(d3[1]), /Fark, onay bekleyenlerin toplamına eşit\. 1 banka hareketi Özet'te onay bekliyor \(−₺1\.250,00\)/.test(d3[1]),
    /giren ₺52\.000,00 \(gelir ve iade ₺52\.000,00, aktarım ₺0,00\); çıkan ₺14\.000,00 \(gider ₺4\.000,00, aktarım ₺10\.000,00\)/.test(d3[1])], ['Karşılaştırma', true, true, true, true, true]);
  await click('cancel'); await page.waitForTimeout(50);
  eq('Vazgeç: hiçbir şey değişmez', await page.evaluate(() => { const a = App.Accounts.get('ak'); return [a.balance, a.recAt || '', (a.adj || []).length]; }), [58000, '', 0]);
  // Fark tek bir kaydın tutarı / aynı tutarda iki kayıt
  await rec('ak', '62.000');
  eq('fark tek kaydın tutarına eşit (Migros 4.000: iki kez ya da hiç)', /Fark, şu kaydın tutarına eşit: 16 Ekim 2027 · Migros · −₺4\.000,00/.test((await dlg())[1]), true);
  await click('cancel');
  await page.evaluate(() => { const t = S.txns(); t.unshift({ id: 't4', type: 'expense', amount: 4000, category: 'Market', date: '2027-10-17', note: 'Migros', accountId: 'ak', userId: 'u_a', ts: 4, balanceApplied: true }); S.saveTxns(t); App.Accounts.adjustBalance('ak', -4000); });
  await rec('ak', '58.000');
  eq('aynı tutarda iki yakın kayıt gösterilir', /Aynı tutarda iki kayıt: .*Migros ve .*Migros \(₺4\.000,00\)\. Biri fazla olabilir\./.test((await dlg())[1]), true);
  await click('ok'); await page.waitForTimeout(80);
  eq('"Farkı Düzelt": bakiye bankadaki, açılış kayar, gider değişmez, geçmişe yazılır', [await acc('ak'), await exp(), await page.evaluate(() => { const a = App.Accounts.get('ak'); return [a.recAt, a.adj]; }), await page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /Fark \(\+₺4\.000,00\) gelir-gider sayılmadı/.test(t.textContent)))],
    [[58000, 24000], 8000, ['2027-10-20', [{ date: '2027-10-20', delta: 4000, why: 'rec' }]], true]);
  await rec('ak', '58.000');
  eq('bakiyeler aynı: ✓ ve son düzeltme gösterilir', [(await dlg())[0], /✓ Bakiyeler aynı\./.test((await dlg())[1]), /Son bakiye düzeltmesi: 20 Ekim 2027 · \+₺4\.000,00/.test((await dlg())[1])], ['Karşılaştırma', true, true]);
  await click('ok');
  eq('hesap kartında son karşılaştırma', await page.evaluate(() => [...document.querySelectorAll('#accGrid .acc-rec-at')].map(x => x.textContent)), ['Son: 20.10']);
  await rec('n', '13.000');
  eq('nakit: cüzdanla karşılaştırma, aynı', /Cüzdanda: ₺13\.000,00[\s\S]*✓ Bakiyeler aynı/.test((await dlg())[1]), true);
  await click('ok');
  eq('geçersiz tutar: pencere açık kalır', await page.evaluate(() => { App.Accounts.reconcile('ak'); const d = [...document.querySelectorAll('.app-dialog-holder')].pop(); d.querySelector('[data-pkey="bank"]').value = 'abc'; d.querySelector('[data-act="ok"]').click(); return [...document.querySelectorAll('.app-dialog-holder')].pop().querySelector('.modal-title').textContent; }), '🔍 Bankayla Karşılaştır');

  eq('sayfa hatası yok', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
