// Usage: node tests/qc-cards.test.js
// Kart tarih mantığı sabit tarihlerle: artık yıl şubatı, ay sonu kesimi, yıl değişimi, kesim günü, taksitin limite etkisi,
// ortak limitte ana kartın silinmesi, fazla ödeme. Beklenen değerler takvimden elle hesaplandı. Kurmaca veri.
const http = require('http'), fs = require('fs'), path = require('path');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
const pw = loadPlaywright();
if (!pw) { console.log('Playwright bulunamadı; test atlandı.'); process.exit(0); }
const R = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(R, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
const USERS = { onboarded: true, users: [{ id: 'u_a', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_a', lastBackupAt: Date.now() };

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await pw.chromium.launch();
  const errors = [];
  async function at(when, data) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(when + ': ' + e.message));
    await page.clock.setFixedTime(new Date(when + 'T10:00:00'));
    await page.goto(base);
    await page.evaluate(sd => { localStorage.clear(); localStorage.setItem('ft_setup_shown', String(Date.now())); Object.keys(sd).forEach(k => localStorage.setItem(k, JSON.stringify(sd[k]))); }, Object.assign({ pf_s: USERS }, data));
    await page.reload(); await page.waitForTimeout(300);
    return { page, ctx };
  }
  const T = (id, type, amount, date, acc, extra) => Object.assign({ id, type, amount, category: type === 'income' ? 'Transfer' : 'Market', date, note: id, accountId: acc, userId: 'u_a', ts: 1, balanceApplied: true }, extra || {});

  // 1) Artık yıl: bugün 1 Mart 2028, kesim günü 31 → kesim 29 Şubat, son ödeme 10 Mart
  {
    const { page, ctx } = await at('2028-03-01', {
      pf_a: [{ id: 'c', name: 'Deneme Kart', type: 'card', owner: 'shared', statementDay: 31, limit: 30000, balance: -1500, openingBalance: 0, ts: 1 }],
      pf_t: [T('feb29', 'expense', 1000, '2028-02-29', 'c'), T('mar1', 'expense', 500, '2028-03-01', 'c')]
    });
    eq('artık yıl: kesim 29.02, son ödeme 10.03, 9 gün; dönem borcu 1.000 (29 Şubat dahil), sonraki ekstre 500, sonraki kesim 31.03',
      await page.evaluate(() => { const i = App.Cards.info('c'); return [i.cut, i.due, i.daysToDue, i.stmtTotal, i.nextStmt, i.nextCut, i.nextDue, i.minTotal]; }),
      ['2028-02-29', '2028-03-10', 9, 1000, 500, '2028-03-31', '2028-04-10', 200]);
    eq('işlem listesindeki ekstre etiketi aynı kurala uyar (29 Şubat → Şubat, 1 Mart → Mart)', await page.evaluate(() => [App.Transactions.statementPeriod('c', '2028-02-29'), App.Transactions.statementPeriod('c', '2028-03-01')]), ['2028-02', '2028-03']);
    await ctx.close();
  }
  // 2) Yıl değişimi: bugün 3 Ocak 2027, kesim 28 → kesim 28.12.2026, son ödeme 07.01.2027
  {
    const { page, ctx } = await at('2027-01-03', {
      pf_a: [{ id: 'c', name: 'Deneme Kart', type: 'card', owner: 'shared', statementDay: 28, limit: 30000, balance: -2400, openingBalance: 0, ts: 1 },
        { id: 'b', name: 'Deneme Banka', type: 'bank', owner: 'shared', balance: 5000, openingBalance: 5000, ts: 2 }],
      pf_t: [T('dec', 'expense', 2000, '2026-12-20', 'c'), T('jan', 'expense', 400, '2027-01-02', 'c')]
    });
    eq('yıl değişimi: kesim 28.12.2026, son ödeme 07.01.2027 (4 gün), dönem 2.000, sonraki 400, sonraki kesim 28.01.2027 / son ödeme 07.02.2027',
      await page.evaluate(() => { const i = App.Cards.info('c'); return [i.cut, i.due, i.daysToDue, i.stmtLeft, i.nextStmt, i.nextCut, i.nextDue]; }),
      ['2026-12-28', '2027-01-07', 4, 2000, 400, '2027-01-28', '2027-02-07']);
    eq('yıl değişimi: Aralık 30 harcaması Ocak 2027 ekstresine yazılır', await page.evaluate(() => App.Transactions.statementPeriod('c', '2026-12-30')), '2027-01');
    eq('son ödemeye 4 gün: hatırlatma var (asgari 400)', await page.evaluate(() => App.Notifications.cardDues(7).map(x => [x.in, x.amount])), [[4, 2000]]);
    // Kısmi ödeme (asgari altı) → uyarı sürer; asgariyi tamamlayınca uyarı/hatırlatma kalkar ama kalan borç görünür
    await page.evaluate(() => { App.Transactions.createTransfer({ from: 'b', to: 'c', amount: 300, date: td(), note: 'Kısmi' }); renderAllViews(); });
    eq('300 ödeme (asgari 400 altı): asgari kalan 100, hatırlatma sürer', await page.evaluate(() => { const i = App.Cards.info('c'); return [i.minLeft, i.stmtLeft, App.Notifications.cardDues(7).length, i.minPaid]; }), [100, 1700, 1, false]);
    await page.evaluate(() => { App.Transactions.createTransfer({ from: 'b', to: 'c', amount: 100, date: td(), note: 'Asgari tamam' }); renderAllViews(); });
    eq('asgari tamam: hatırlatma kalkar, kalan dönem borcu 1.600 kartta yeşil notla görünür', await page.evaluate(() => { const i = App.Cards.info('c'); const d = document.createElement('div'); d.innerHTML = App.Cards.mini(App.Accounts.get('c')); return [i.minLeft, i.stmtLeft, App.Notifications.cardDues(7).length, i.minPaid, /kalan dönem borcu ₺1\.600,00/.test(d.textContent)]; }), [0, 1600, 0, true, true]);
    eq('banka 4.600, kart −2.000 (ödemeler gider değil)', await page.evaluate(() => [App.Accounts.get('b').balance, App.Accounts.get('c').balance, App.Transactions.monthTotals('2027-01').expense]), [4600, -2000, 400]);
    // Tam ödeme ve fazla ödeme
    await page.evaluate(() => { App.Transactions.createTransfer({ from: 'b', to: 'c', amount: 2500, date: td(), note: 'Fazla' }); renderAllViews(); });
    eq('fazla ödeme: kart 500 alacaklı, borç 0, dönem kapandı, uyarı yok', await page.evaluate(() => { const i = App.Cards.info('c'); return [i.credit, i.debt, i.stmtLeft, App.Notifications.cardDues(7).length]; }), [500, 0, 0, 0]);
    await ctx.close();
  }
  // 3) Kesim günü bugün: bugünkü harcama kapanan ekstreye yazılır
  {
    const { page, ctx } = await at('2027-01-28', {
      pf_a: [{ id: 'c', name: 'Deneme Kart', type: 'card', owner: 'shared', statementDay: 28, balance: -700, openingBalance: 0, ts: 1 }],
      pf_t: [T('today', 'expense', 700, '2027-01-28', 'c')]
    });
    eq('kesim günü: kesim bugün, bugünkü 700 bu ekstrede, son ödeme 07.02', await page.evaluate(() => { const i = App.Cards.info('c'); return [i.cut, i.stmtTotal, i.nextStmt, i.due]; }), ['2027-01-28', 700, 0, '2027-02-07']);
    await ctx.close();
  }
  // 4) Taksit: 12.000 TL 12 taksit. Banka tamamını limitten düşer; borç her ay 1.000 artar. Ay sonu başlangıç 31 Ocak → 28 Şubat, 31 Mart
  {
    const { page, ctx } = await at('2027-01-31', {
      pf_a: [{ id: 'c', name: 'Deneme Kart', type: 'card', owner: 'shared', statementDay: 5, limit: 20000, balance: 0, openingBalance: 0, ts: 1 },
        { id: 'c2', name: 'Deneme Kart Ek', type: 'card', owner: 'shared', limitWith: 'c', balance: -1000, openingBalance: -1000, ts: 2 }]
    });
    await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="c"]').click(); document.getElementById('txnAmt').value = '12000'; document.getElementById('txnNote').value = 'Telefon'; document.getElementById('txnInst').value = '12'; document.getElementById('txnInstStart').value = '2027-01-31'; App.Transactions.add(); });
    await page.waitForTimeout(150);
    eq('12 taksit: tarihler ay sonuna uyar (31.01, 28.02, 31.03), toplam 12.000', await page.evaluate(() => { const l = S.txns().filter(t => t.installment && t.installment.name === 'Telefon').sort((a, b) => a.date < b.date ? -1 : 1); return [l.slice(0, 3).map(t => t.date), Math.round(l.reduce((s, t) => s + t.amount, 0) * 100) / 100, l.length]; }), [['2027-01-31', '2027-02-28', '2027-03-31'], 12000, 12]);
    eq('kart borcu yalnız ilk taksit (1.000); kalan limit = 20.000 − (1.000+1.000 ortak) − 11.000 gelecek taksit = 7.000', await page.evaluate(() => { const i = App.Cards.info('c'); return [i.debt, i.blocked, i.avail, App.Cards.info('c2').avail]; }), [1000, 11000, 7000, 7000]);
    eq('7.000 üstü yeni harcama limit uyarısı verir', await page.evaluate(() => [!!App.Cards.overLimit('c', 7000.01), !!App.Cards.overLimit('c2', 7000)]), [true, false]);
    eq('net servet: gelecek 11 taksit (11.000) borç olarak düşülür: −2.000 kart − 11.000 = −13.000', await page.evaluate(() => { const n = App.NetWorth.compute(); return [n.inst, n.total]; }), [11000, -13000]);
    eq('aylık gider yalnız bu ayın taksiti (1.000), toplam 12.000 değil', await page.evaluate(() => App.Transactions.monthTotals('2027-01').expense), 1000);
    // Ortak limitin ana kartı silinince limit ek karta geçer
    await page.evaluate(() => { App.Accounts.remove('c'); [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click(); });
    await page.waitForTimeout(150);
    eq('ana kart silindi: ek kart limiti 20.000 korur, artık kendi kartı', await page.evaluate(() => { const a = App.Accounts.get('c2'); const i = App.Cards.info('c2'); return [a.limit, a.limitWith || null, i.limit, i.avail]; }), [20000, null, 20000, 19000]);
    await ctx.close();
  }
  eq('sayfa hatası yok', errors, []);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
});
