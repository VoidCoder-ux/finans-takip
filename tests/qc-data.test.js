// Usage: node tests/qc-data.test.js
// Yedek ve CSV: tam yedek indir → başka cihaza (boş) geri yükle → kayıt sayıları, bakiyeler, ilişkiler (transfer çifti, taksit planı,
// borç, hedef) aynı; bozuk yedek mevcut veriyi bozmaz; CSV dışa → boş cihaza içe: tutar/tarih/kişi/hesap/kategori korunur,
// transfer gider sayılmaz; formül enjeksiyonu kaçışlı. Kurmaca veri, sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qcdata-'));
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function device(seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed);
    await page.reload(); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const okTop = p => p.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
  const A = await device({ pf_s: USERS, pf_a: [{ id: 'a_b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 5000, openingBalance: 5000, ts: 1 }, { id: 'a_c', name: 'Kart', type: 'card', owner: 'personal', userId: 'u_b', limit: 10000, balance: 0, openingBalance: 0, ts: 2 }] });
  // Uygulamanın kendi yollarıyla zengin veri
  await A.page.evaluate(() => {
    App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="a_c"]').click(); document.getElementById('txnUser').value = 'u_b';
    document.getElementById('txnAmt').value = '1.234,56'; document.getElementById('txnNote').value = '=HYPERLINK("http://kotu")'; document.getElementById('txnCat').value = 'Giyim'; App.Transactions.add();
    document.getElementById('txnAmt').value = '600'; document.getElementById('txnNote').value = 'Taksitli; "tırnak"'; document.getElementById('txnInst').value = '3'; document.getElementById('txnInstStart').value = td(); App.Transactions.add();
    App.Transactions.createTransfer({ from: 'a_b', to: 'a_c', amount: 500, date: td(), note: 'Kart ödemesi' });
    const g = S.goals(); g.push({ id: 'g1', name: 'Tatil', target: 10000, emoji: '🏖', accountId: '', sourceAccountId: '', txnMode: 'none', contributions: [{ id: 'c1', amount: 250, date: td(), note: '', accountId: '', txnId: '', transferId: '' }], done: null, ts: 1 }); S.saveGoals(g);
    renderAllViews();
  });
  const fp = p => p.evaluate(() => ({ n: S.txns().length, acc: S.accounts().map(a => [a.name, a.balance]), plans: [...new Set(S.txns().filter(t => t.installment).map(t => t.installment.planId))].length, trf: S.txns().filter(t => t.transferId).length, goals: S.goals().map(g => [g.name, g.contributions.length]), exp: App.Transactions.monthTotals(tm()).expense, users: S.txns().map(t => t.userId).sort() }));
  const before = await fp(A.page);
  eq('başlangıç: kart −1.234,56 −200 (ilk taksit) +500 = −934,56; banka 4.500', before.acc, [['Vadesiz', 4500], ['Kart', -934.56]]);

  // 1) Tam yedek indir
  await A.page.evaluate(() => App.Backup.open());
  const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.evaluate(() => App.Backup.download())]);
  const bfile = path.join(TMP, 'yedek.json'); await dl.saveAs(bfile);
  // 2) Boş cihaza geri yükle
  const B = await device({ pf_s: Object.assign({}, USERS, { activeUser: 'u_b' }) });
  await B.page.evaluate(() => App.Backup.open()); await B.page.setInputFiles('#backupFile', bfile); await B.page.waitForTimeout(200); await okTop(B.page);
  await B.page.waitForTimeout(1200); await B.page.waitForFunction(() => window.App && App.Transactions);
  eq('yedekten geri yükleme: sayılar, bakiyeler, plan, transfer çifti, hedef, kişi, gider aynı', await fp(B.page), before);
  eq('geri yükleme bu telefonun profilini (Ece) ezmez', await B.page.evaluate(() => S.settings().activeUser), 'u_b');
  // 3) Bozuk yedek: mevcut veri bozulmaz
  const bad = path.join(TMP, 'bozuk.json'); fs.writeFileSync(bad, JSON.stringify({ app: 'finanstakip', stores: { pf_t: 'bozuk' } }));
  await B.page.evaluate(() => App.Backup.open()); await B.page.setInputFiles('#backupFile', bad); await B.page.waitForTimeout(300);
  eq('bozuk yedek reddedilir, veri aynı', [await B.page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /bozuk/.test(t.textContent))), (await fp(B.page)).n], [true, before.n]);
  const half = path.join(TMP, 'yarim.json'); fs.writeFileSync(half, '{"app":"finanstakip","stores":{"pf_t":[');
  await B.page.evaluate(() => App.Backup.open()); await B.page.setInputFiles('#backupFile', half); await B.page.waitForTimeout(300);
  eq('yarım (kesik) dosya reddedilir, veri aynı', (await fp(B.page)).n, before.n);

  // 4) CSV dışa aktar → formül kaçışlı → boş cihaza içe aktar
  await A.page.evaluate(() => App.UI.nav('islemler'));
  const [cdl] = await Promise.all([A.page.waitForEvent('download'), A.page.evaluate(() => App.Transactions.exportCSV())]);
  const cfile = path.join(TMP, 'islemler.csv'); await cdl.saveAs(cfile);
  const csv = fs.readFileSync(cfile, 'utf8');
  eq('CSV: formül kaçışlı, ondalık virgül, tırnak korunur', [/"'=HYPERLINK\(""http:\/\/kotu""\)"/.test(csv), /"1234,56"/.test(csv), /Taksitli; ""tırnak""/.test(csv)], [true, true, true]);
  const C = await device({ pf_s: USERS, pf_a: [{ id: 'x_b', name: 'Vadesiz', type: 'bank', owner: 'shared', balance: 5000, openingBalance: 5000, ts: 1 }, { id: 'x_c', name: 'Kart', type: 'card', owner: 'shared', balance: 0, openingBalance: 0, ts: 2 }] });
  await C.page.evaluate(() => App.UI.nav('islemler'));
  await C.page.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'qcCsv'; i.onchange = () => App.Transactions.importCSV(i); document.body.appendChild(i); });
  await C.page.setInputFiles('#qcCsv', cfile); await C.page.waitForTimeout(300); await okTop(C.page); await C.page.waitForTimeout(300);
  const c = await C.page.evaluate(() => ({ n: S.txns().length, acc: S.accounts().map(a => [a.name, a.balance]), exp: App.Transactions.monthTotals(tm()).expense, note: (S.txns().find(t => /HYPERLINK/.test(t.note)) || {}).note, user: (S.txns().find(t => t.amount === 1234.56) || {}).userId, cat: (S.txns().find(t => t.amount === 1234.56) || {}).category }));
  eq('CSV geri yüklemede tutar/kişi/kategori/not, bakiyeler ve gider aynı; transfer gider sayılmaz', c, { n: before.n, acc: before.acc, exp: before.exp, note: '=HYPERLINK("http://kotu")', user: 'u_b', cat: 'Giyim' });
  await C.page.setInputFiles('#qcCsv', cfile); await C.page.waitForTimeout(300); await okTop(C.page).catch(() => {}); await C.page.waitForTimeout(300);
  eq('aynı CSV ikinci kez: yeni kayıt yok (tekrarlar atlanır)', await C.page.evaluate(() => S.txns().length), before.n);

  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  fs.rmSync(TMP, { recursive: true, force: true });
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
