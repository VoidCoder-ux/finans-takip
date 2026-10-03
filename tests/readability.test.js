// Usage: node tests/readability.test.js [ekran-görüntüsü-klasörü]
// Görünürlük ve kolaylıklar: yazı boyları (13px altı yok), Yazı Boyutu ayarı, sade işlem satırı, büyük dokunma alanları,
// alttaki bildirim mesajları, "Diğer"de kalanları düzeltme kartı, ekstreyle işyeri adı tamamlama, kart son ödeme hatırlatması.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..'), OUT = process.argv[2] || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const now = new Date(), day = k => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k)), dmy = d => d.split('-').reverse().join('.');
// Kartın son ödemesi 2 gün sonra olsun: kesim = bugün − 8 gün
const cutDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8).getDate();

function seed() {
  return {
    pf_a: [
      { id: 'a_bank', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', last4: '4359', balance: 20000, openingBalance: 20000, ts: 1 },
      { id: 'a_ax', name: 'Akbank Axess', type: 'card', owner: 'shared', last4: '7777', statementDay: cutDay, balance: -1426.78 - 80 - 45, openingBalance: 0, ts: 2 }],
    pf_t: [
      { id: 't_akb', type: 'expense', amount: 1426.78, category: 'Diğer', date: day(-1), note: 'Akbank kart harcaması', accountId: 'a_ax', userId: 'u_self', ts: 3, balanceApplied: true, src: 'sms', via: 'email' },
      { id: 't_k1', type: 'expense', amount: 80, category: 'Diğer', date: day(-2), note: 'Kırtasiye Ali', accountId: 'a_ax', userId: 'u_self', ts: 2, balanceApplied: true },
      { id: 't_k2', type: 'expense', amount: 45, category: 'Diğer', date: day(-3), note: 'Kırtasiye Ali', accountId: 'a_ax', userId: 'u_self', ts: 1, balanceApplied: true }],
    pf_s: { onboarded: true, users: [{ id: 'u_self', name: 'Osman', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_self', lastBackupAt: Date.now() }
  };
}

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, seed());
  await page.reload(); await page.waitForTimeout(400);

  // 1) Yazı boyları: açık sayfalarda 13px'ten küçük yazı yok
  const small = await page.evaluate(() => {
    const out = [];
    for (const pg of ['ozet', 'islemler', 'hesaplar', 'istatistikler', 'ayarlar']) {
      App.UI.nav(pg);
      const w = document.createTreeWalker(document.querySelector('.page.active'), NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode, t = n.textContent.trim(); if (t.length < 2) continue; const el = n.parentElement, r = el.getBoundingClientRect(); if (!r.width) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12.9) out.push(pg + ': ' + t.slice(0, 20) + ' ' + fs + 'px'); }
    }
    return out.slice(0, 8);
  });
  eq('no text smaller than 13px on main pages', small, []);
  eq('secondary text color brighter (dark theme)', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--txt2').trim()), '#aab6cf');

  // 2) Yazı Boyutu ayarı (cihaza özel, yeniden açınca kalır)
  await page.evaluate(() => { App.UI.nav('ayarlar'); document.querySelector('#fsPick [data-fs="l"]').click(); });
  eq('"Büyük": root font 18px, button marked', await page.evaluate(() => [getComputedStyle(document.documentElement).fontSize, document.querySelector('#fsPick .fs-opt.on').textContent]), ['18px', 'Büyük']);
  await page.reload(); await page.waitForTimeout(300);
  eq('text size kept after reopening', await page.evaluate(() => [document.documentElement.getAttribute('data-fs'), getComputedStyle(document.documentElement).fontSize]), ['l', '18px']);
  await page.evaluate(() => App.UI.setFontSize('xl'));
  eq('"Çok Büyük": 20px; inputs never below 16px', await page.evaluate(() => [getComputedStyle(document.documentElement).fontSize, parseFloat(getComputedStyle(document.getElementById('txnAmt')).fontSize) >= 16]), ['20px', true]);
  await page.evaluate(() => { App.UI.nav('islemler'); });
  eq('"Çok Büyük": no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth), 390);
  if (OUT) await page.screenshot({ path: OUT + '/xl-islemler.png' });
  await page.evaluate(() => App.UI.setFontSize('n'));
  eq('"Normal" back to 16px', await page.evaluate(() => [document.documentElement.hasAttribute('data-fs'), getComputedStyle(document.documentElement).fontSize, localStorage.getItem('ft_fs')]), [false, '16px', null]);

  // 3) İşlem satırı: başlık işyeri/not, altında kategori · tarih · hesap, etiketler ayrı
  const row = await page.evaluate(() => { App.UI.nav('islemler'); const r = [...document.querySelectorAll('#txnList .ti')].find(x => x.textContent.includes('Kırtasiye')); return [r.querySelector('.ti-cat').textContent, r.querySelector('.ti-meta').textContent, !!r.querySelector('.ti-tags .user-tag')]; });
  eq('row title is the note, meta has category and account', [row[0], /^Diğer · .+ · Akbank Axess …7777$/.test(row[1]), row[2]], ['Kırtasiye Ali', true, true]);
  eq('edit/delete buttons visible (filled, 44px)', await page.evaluate(() => { const b = document.querySelector('#txnList .btn-del'), cs = getComputedStyle(b); return [cs.backgroundColor !== 'rgba(0, 0, 0, 0)', b.getBoundingClientRect().height >= 44]; }), [true, true]);

  // 4) Dokunma alanları
  eq('checkboxes 22px, stats month/report controls ≥44px', await page.evaluate(() => { App.UI.nav('istatistikler'); const c = document.getElementById('cmpYoY').getBoundingClientRect(), m = document.getElementById('statMonth').getBoundingClientRect(), b = document.querySelector('.stats-action-btn').getBoundingClientRect(); return [Math.round(c.width), m.height >= 44, b.height >= 44]; }), [22, true, true]);

  // 5) Bildirim mesajı altta (üstteki başlığı kapatmaz)
  eq('toast shown above the bottom bar', await page.evaluate(() => { App.UI.toast('Deneme mesajı'); const r = document.querySelector('.toast').getBoundingClientRect(); return r.top > window.innerHeight / 2; }), true);

  // 6) "Diğer"de kalanlar
  eq('Özet card counts uncategorized spending', await page.evaluate(() => { App.UI.nav('ozet'); const c = document.querySelector('#ozet-uncat .sh-title'); return c && c.textContent; }), '🏷️ Kategorisi belli olmayan 3 harcama');
  await page.evaluate(() => App.Uncat.open()); await page.waitForTimeout(150);
  await page.evaluate(() => { const s = document.querySelector('#uncatHolder select[data-uncat="t_k1"]'); s.value = 'Market'; s.dispatchEvent(new Event('change')); });
  eq('same shop on another row follows; generic Akbank row does not', await page.evaluate(() => [document.querySelector('[data-uncat="t_k2"]').value, document.querySelector('[data-uncat="t_akb"]').value]), ['Market', '']);
  if (OUT) await page.screenshot({ path: OUT + '/uncat.png' });
  await page.evaluate(() => document.getElementById('uncatSave').click()); await page.waitForTimeout(150);
  eq('saved: both rows Market, balance unchanged, card shows 1 left', await page.evaluate(() => [S.txns().filter(t => t.note === 'Kırtasiye Ali').map(t => t.category), App.Accounts.get('a_ax').balance, document.querySelector('#ozet-uncat .sh-title').textContent]), [['Market', 'Market'], -1551.78, '🏷️ Kategorisi belli olmayan 1 harcama']);

  // 7) Kart son ödeme hatırlatması (kesim + 10 gün; kesimden sonra ödeme yoksa)
  const dues = await page.evaluate(() => [App.Notifications.cardDues(3).map(c => [c.in, c.text]), App.Notifications.upcomingBills(3).filter(b => b.kind === 'card').length, App.Push.plan().items.some(x => /Akbank Axess …7777 son ödeme/.test(x.text))]);
  eq('card due in 2 days: reminder text, in-app list and push plan', dues, [[[2, '💳 Akbank Axess …7777 son ödeme — güncel borç ₺1.551,78']], 1, true]);
  eq('no reminder after paying the card', await page.evaluate(() => { const t = S.txns(); t.push({ id: 'pay', type: 'income', amount: 500, category: 'Transfer', date: td(), note: 'Ödeme', accountId: 'a_ax', userId: 'u_self', ts: 9, balanceApplied: false }); S.saveTxns(t); const n = App.Notifications.cardDues(3).length; S.saveTxns(t.filter(x => x.id !== 'pay')); return n; }), 0);
  eq('no reminder for a card without debt', await page.evaluate(() => { const a = S.accounts(), c = a.find(x => x.id === 'a_ax'), b = c.balance; c.balance = 0; S.saveAccounts(a); const n = App.Notifications.cardDues(3).length; c.balance = b; S.saveAccounts(a); return n; }), 0);

  // 8) Ekstre yüklenince işyeri adı bilinmeyen e-posta kaydına ad ve kategori
  await page.evaluate(() => { document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()); App.UI.nav('islemler'); });
  const html = '<html><body><table><tr><td>Tarih</td><td>Açıklama</td><td>Borç</td><td>Alacak</td></tr><tr><td>' + dmy(day(-1)) + '</td><td>MIGROS KADIKOY</td><td>1.426,78</td><td></td></tr><tr><td>' + dmy(day(-1)) + '</td><td>BIM BIRLESIK MAGAZALAR</td><td>62,50</td><td></td></tr></table></body></html>';
  await page.setInputFiles('#stmtFile', { name: 'ekstre.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from(html, 'utf8') });
  await page.waitForFunction(() => document.getElementById('stmtList'), null, { timeout: 15000 });
  await page.selectOption('#stmtAcc', 'a_ax'); await page.waitForTimeout(100);
  eq('preview: known e-mail record will get the shop name; new row selected', await page.evaluate(() => [[...document.querySelectorAll('#stmtList .stmt-row')].map(r => [r.querySelector('input').checked, r.querySelector('.stmt-desc').textContent.trim()]), /1 kayda işyeri adı eklenecek/.test(document.getElementById('stmtSum').textContent), document.getElementById('stmtOk').textContent]), [[[false, 'MIGROS KADIKOY kayıtlı · adı eklenecek'], [true, 'BIM BIRLESIK MAGAZALAR']], true, '1 İşlemi Ekle · 1 Güncelle']);
  if (OUT) await page.screenshot({ path: OUT + '/enrich.png' });
  await page.click('#stmtOk'); await page.waitForTimeout(200);
  eq('e-mail record now has shop name and category; amount/balance kept; no duplicate', await page.evaluate(() => { const t = S.txns().find(x => x.id === 't_akb'); return [t.note, t.category, t.amount, t.via, S.txns().filter(x => x.amount === 1426.78).length, App.Accounts.get('a_ax').balance]; }), ['MIGROS KADIKOY', 'Market', 1426.78, 'email', 1, -1614.28]);
  eq('uncategorized card gone', await page.evaluate(() => document.getElementById('ozet-uncat').innerHTML), '');
  eq('balances consistent', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
