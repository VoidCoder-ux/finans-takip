// Usage: node tests/qc-ozellik.test.js
// Kasım 2026 yeni özellikleri (beklenen değerler elle hesaplandı):
//  1) İşlem bölme: tek kayıt iki kategoriye ayrılır, toplam ve bakiye değişmez; banka mesajının öbür kanaldan gelen eşi toplamla tanınır.
//  2) Şifreli yedek: parola olmadan okunamaz, doğru parolayla geri yüklenir, yanlış parolada veri değişmez.
//  3) Ortak gider dengeleme: kişisel hesaptan ödenen ortak giderler eşit paylaşılır; ortak hesap ve istek harcaması sayılmaz.
// Kurmaca veri (Deniz/Ece), sunucu gerekmez.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = () => ({ onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }, { id: 'u_b', name: 'Ece', emoji: '💑', color: '#ec4899' }], activeUser: 'u_a', lastBackupAt: Date.now() });
const at = iso => new Date(iso + 'T10:00:00').getTime();
const bank = (balance, id = 'b', x = {}) => Object.assign({ id, name: 'Vadesiz ' + id, type: 'bank', owner: 'shared', balance, openingBalance: balance, ts: at('2025-01-01') }, x);
let tn = 1;
const tx = (date, type, amount, category, note, accountId = 'b', x = {}) => Object.assign({ id: 't' + tn++, type, amount, category, date, note, accountId, userId: 'u_a', ts: at(date), balanceApplied: true }, x);

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function open(today, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date(today + 'T12:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS(), pf_a: [bank(50000)], pf_t: [] }, data || {}));
    await page.reload(); await page.waitForTimeout(250);
    return { ctx, page };
  }
  // Açık penceredeki alanları doldurup onaylar
  const fill = (p, vals) => p.evaluate(v => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); Object.keys(v).forEach(k => { m.querySelector('[data-pkey="' + k + '"]').value = v[k]; }); m.querySelector('[data-act="ok"]').click(); }, vals);

  // 1) İşlem bölme
  {
    const { page, ctx } = await open('2026-11-10', { pf_a: [bank(47500, 'b', { openingBalance: 50000 })], pf_t: [tx('2026-11-08', 'expense', 2500, 'Market', 'Migros', 'b', { id: 'm1', src: 'sms', sh: 'abc123' })] });
    await page.evaluate(() => App.Transactions.edit('m1'));
    await fill(page, { spAmt: '2500', spCat: 'Çocuk' });
    eq('toplamın tamamı ayrılamaz', await page.evaluate(() => S.txns().length), 1);
    await fill(page, { spAmt: '700', spCat: 'Market' });
    eq('aynı kategoriye bölünmez', await page.evaluate(() => S.txns().length), 1);
    await fill(page, { spAmt: '700', spCat: 'Çocuk' });
    eq('iki kayıt: 1.800 Market + 700 Çocuk', await page.evaluate(() => S.txns().map(t => [t.amount, t.category, t.note, t.date, t.sg, t.src]).sort((a, b) => b[0] - a[0])), [[1800, 'Market', 'Migros', '2026-11-08', 'm1', 'sms'], [700, 'Çocuk', 'Migros', '2026-11-08', 'm1', 'sms']]);
    eq('bakiye değişmez', await page.evaluate(() => App.Accounts.get('b').balance), 47500);
    eq('kategori toplamları', await page.evaluate(() => { const c = App.Transactions.catTotals('2026-11'); return [c.Market, c['Çocuk']]; }), [1800, 700]);
    eq('aynı harcamanın e-postası ikinci kez yazılmaz', await page.evaluate(() => { const r = App.BankSms.ingest([{ id: 5, label: 'gmailbox_u_a', text: 'Akbank\nKartinizla MIGROS isyerinden 2.500,00 TL harcama yapilmistir.\nE-posta tarihi: 08.11.2026 14:00', receivedAt: Date.now() }]); return [r.added, S.txns().length, App.Accounts.get('b').balance]; }), [0, 2, 47500]);
    await page.reload(); await page.waitForTimeout(200);
    eq('yeniden açılınca grup korunur', await page.evaluate(() => S.txns().every(t => t.sg === 'm1')), true);
    await ctx.close();
  }
  // 2) Şifreli yedek
  {
    const { page, ctx } = await open('2026-11-10', { pf_t: [tx('2026-11-08', 'expense', 2500, 'Market', 'Gizli Market', 'b')] });
    const r = await page.evaluate(async () => {
      const enc = await App.Backup.encrypt(App.Backup.snapshot(), 'parola123'), txt = JSON.stringify(enc);
      const dec = await App.Backup.decrypt(enc, 'parola123');
      let wrong = 'açıldı'; try { await App.Backup.decrypt(enc, 'parola124'); } catch (e) { wrong = 'reddedildi'; }
      return { enc: txt, plain: txt.includes('Gizli Market') || txt.includes('pf_t'), ok: dec.stores.pf_t[0].note, wrong, alan: [enc.app, enc.enc, enc.iter] };
    });
    eq('şifreli dosyada açık veri yok', r.plain, false);
    eq('doğru parola açar, yanlış parola reddedilir', [r.ok, r.wrong, r.alan], ['Gizli Market', 'reddedildi', ['finanstakip', 1, 250000]]);
    // Geri yükleme: önce yanlış, sonra doğru parola
    await page.evaluate(() => { const t = S.txns(); t[0].note = 'Sonradan değişti'; S.saveTxns(t); App.Backup.open(); });
    const file = { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(r.enc) };
    await page.setInputFiles('#backupFile', file); await page.waitForTimeout(150);
    await fill(page, { p: 'yanlis-parola' }); await page.waitForTimeout(900);
    eq('yanlış parolada veri değişmez', await page.evaluate(() => S.txns()[0].note), 'Sonradan değişti');
    await page.setInputFiles('#backupFile', file); await page.waitForTimeout(150);
    await fill(page, { p: 'parola123' }); await page.waitForTimeout(900);
    await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(1200);
    eq('doğru parolayla geri yüklenir', await page.evaluate(() => S.txns()[0].note), 'Gizli Market');
    await ctx.close();
  }
  // 3) Ortak gider dengeleme: 28.000 + 12.000 = 40.000, kişi başı 20.000; Ece 8.000 aktarır
  {
    const acc = [bank(50000), bank(30000, 'pa', { owner: 'personal', userId: 'u_a' }), bank(20000, 'pb', { owner: 'personal', userId: 'u_b' })];
    const t = [tx('2026-11-02', 'expense', 22000, 'Kira', 'Kira', 'pa'), tx('2026-11-03', 'expense', 6000, 'Market', 'Migros', 'pa'), tx('2026-11-04', 'expense', 12000, 'Faturalar', 'Elektrik', 'pb', { userId: 'u_b' }),
      tx('2026-11-05', 'expense', 5000, 'Market', 'Ortak hesaptan', 'b'), tx('2026-11-06', 'expense', 3000, 'Eğlence', 'Sinema', 'pa'), tx('2026-10-06', 'expense', 9000, 'Market', 'Geçen ay', 'pb', { userId: 'u_b' }), tx('2026-11-20', 'expense', 4000, 'Market', 'Planlı', 'pa', { balanceApplied: false })];
    const { page, ctx } = await open('2026-11-10', { pf_a: acc, pf_t: t });
    const s = await page.evaluate(() => { const x = App.Users.settle('2026-11'); return [x.total, x.share, x.rows.map(r => [r.u.name, r.paid, r.diff]), x.moves.map(m => [m.from.name, m.to.name, m.amount])]; });
    eq('yalnız kişisel hesaptan ödenen ortak giderler', s, [40000, 20000, [['Deniz', 28000, 8000], ['Ece', 12000, -8000]], [['Ece', 'Deniz', 8000]]]);
    await page.evaluate(() => App.UI.nav('aile')); await page.waitForTimeout(100);
    eq('kart cümlesi', await page.evaluate(() => document.getElementById('settleCard').textContent.includes('Ece, Deniz hesabına ₺8.000,00 aktarırsa eşitlenir')), true);
    await page.evaluate(() => App.Users.settleNav());
    eq('geçen ay: Ece 9.000 ödedi, Deniz 4.500 aktarır', await page.evaluate(() => App.Users.settle('2026-10').moves.map(m => [m.from.name, m.amount])), [['Deniz', 4500]]);
    await page.evaluate(() => { App.Users.settleEdit(); document.querySelector('#settleHolder [data-cat="Eğlence"]').checked = true; App.Users.settleSave(); });
    eq('kategori eklenince hesap değişir', await page.evaluate(() => { const x = App.Users.settle('2026-11'); return [x.total, x.moves[0].amount]; }), [43000, 9500]);
    await ctx.close();
  }
  // SONRAKI
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
