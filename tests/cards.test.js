// Usage: node tests/cards.test.js [ekran-görüntüsü-klasörü]
// Kredi kartları: limit ve kalan limit, dönem borcu / gelecek ekstre / taksitler, asgari ödeme, tek dokunuşla borç ödeme,
// son ödeme hatırlatması ve gecikme uyarısı, limit uyarısı, elle harcamada limit kontrolü, bankanın "kartınıza ödeme" mesajı.
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
const now = new Date(), dayD = k => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k), day = k => iso(dayD(k));
// Kart 1 (Yapı Kredi World): kesim 5 gün önce → son ödeme 5 gün sonra. Kart 2 (Akbank): kesim 15 gün önce → son ödeme 5 gün önce geçti
const cut1 = dayD(-5).getDate(), cut2 = dayD(-15).getDate();
const futMonth = iso(new Date(now.getFullYear(), now.getMonth() + 1, 10));

function seed() {
  return {
    pf_a: [
      { id: 'a_bank', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', last4: '4359', balance: 30000, openingBalance: 30000, ts: 1 },
      { id: 'a_world', name: 'Yapı Kredi World', type: 'card', owner: 'shared', last4: '2947', statementDay: cut1, limit: 50000, balance: -12000, openingBalance: -10000, ts: 2 },
      { id: 'a_ax', name: 'Akbank Axess', type: 'card', owner: 'shared', last4: '7777', statementDay: cut2, limit: 10000, balance: -8600, openingBalance: -8600, ts: 3 },
      { id: 'a_cash', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 500, openingBalance: 500, ts: 4 }],
    pf_t: [
      { id: 't1', type: 'expense', amount: 2000, category: 'Market', date: day(-2), note: 'Migros', accountId: 'a_world', userId: 'u_self', ts: 1, balanceApplied: true },
      { id: 't_inst', type: 'expense', amount: 500, category: 'Giyim', date: futMonth, note: 'Zara (2/3)', accountId: 'a_world', userId: 'u_self', ts: 2, balanceApplied: false, installment: { planId: 'p1', index: 2, total: 3, totalAmount: 1500, name: 'Zara', startDate: day(-30), balanceApplied: false } }],
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
  const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal-bd.show').forEach(m => (m.closest('[id]') || m).remove()));

  // 1) Hesaplama
  const i1 = await page.evaluate(() => { const i = App.Cards.info('a_world'); return [i.debt, i.limit, i.avail, Math.round(i.used * 100), i.stmtTotal, i.stmtLeft, i.minTotal, i.minLeft, i.nextStmt, i.daysToDue, i.overdue, i.installments]; });
  eq('World: debt, limit, available, statement debt, minimum (%20), next statement, due in 5 days, installments', i1, [12000, 50000, 38000, 24, 10000, 10000, 2000, 2000, 2000, 5, false, [{ month: futMonth.slice(0, 7), amount: 500 }]]);
  eq('limit stored and kept after reload (storage/sync)', await page.evaluate(() => App.Accounts.get('a_world').limit), 50000);

  // 2) Hesap sayfası
  const accCard = await page.evaluate(() => { App.UI.nav('hesaplar'); const c = [...document.querySelectorAll('#accGrid .acc-card')].find(x => x.textContent.includes('World')); return [c.querySelector('.cc-lim-txt').textContent, c.querySelector('.cc-due').textContent, [...c.querySelectorAll('.cc-acts button')].map(b => b.textContent)]; });
  eq('account card: limit/available, due line, buttons', [accCard[0], /^Son ödeme .+: ₺10\.000,00 · asgari ₺2\.000,00$/.test(accCard[1]), accCard[2]], ['Limit ₺50.000,00 · Kalan ₺38.000,00', true, ['Detay', '💳 Borcu Öde']]);
  if (OUT) await page.locator('#accGrid').screenshot({ path: OUT + '/cards-accounts.png' });

  // 3) Detay
  await page.evaluate(() => App.Cards.detail('a_world')); await page.waitForTimeout(150);
  const det = await page.evaluate(() => [...document.querySelectorAll('#cardDetailHolder .cc-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 10));
  eq('detail rows', det.slice(0, 7), ['Toplam borç₺12.000,00', 'Limit₺50.000,00', 'Kalan limit₺38.000,00', 'Dönem borcu₺10.000,00', 'Kalan dönem borcu₺10.000,00', 'Asgari ödeme (kalan)₺2.000,00', det[6]]);
  eq('detail shows next statement and installments', await page.evaluate(() => { const t = document.getElementById('cardDetailHolder').textContent; return [/Kesimden sonraki harcamalar₺2\.000,00/.test(t), /Gelecek aylara taksitler/.test(t), /₺500,00/.test(t)]; }), [true, true, true]);
  if (OUT) await page.screenshot({ path: OUT + '/cards-detail.png' });
  await closeModals();

  // 4) Borç öde: asgari
  await page.evaluate(() => App.Cards.pay('a_world')); await page.waitForTimeout(150);
  eq('pay: options, default amount = statement debt, default source = bank', await page.evaluate(() => [[...document.querySelectorAll('#ccOpts .cc-opt')].map(b => b.textContent), document.getElementById('ccAmt').value, document.getElementById('ccFrom').value]), [['Dönem borcu₺10.000,00', 'Asgari₺2.000,00', 'Tüm borç₺12.000,00', 'Başka tutar'], '10000', 'a_bank']);
  if (OUT) await page.screenshot({ path: OUT + '/cards-pay.png' });
  await page.evaluate(() => { document.querySelectorAll('#ccOpts .cc-opt')[1].click(); document.getElementById('ccPayOk').click(); }); await page.waitForTimeout(150);
  const afterMin = await page.evaluate(() => { const i = App.Cards.info('a_world'); return [App.Accounts.get('a_bank').balance, App.Accounts.get('a_world').balance, i.stmtLeft, i.minLeft, App.Accounts.get('a_world').payFrom, JSON.stringify(App.Transactions.monthTotals(tm()))]; });
  eq('paid minimum: bank −2000, card debt −2000, minimum done, not counted as income/expense', afterMin.slice(0, 5).concat(/"income":0/.test(afterMin[5]) || !/"income":2000/.test(afterMin[5])), [28000, -10000, 8000, 0, 'a_bank', true]);
  eq('reminder now shows the remaining statement debt', await page.evaluate(() => App.Notifications.cardDues(7).filter(c => /World/.test(c.text)).map(c => [c.in, c.text])), [[5, '💳 Yapı Kredi World …2947 son ödeme: ₺8.000,00']]);
  // Kalanı öde → hatırlatma ve uyarı yok
  await page.evaluate(() => { App.Cards.pay('a_world'); document.getElementById('ccPayOk').click(); }); await page.waitForTimeout(150);
  eq('statement paid: no current reminder, card shows paid', await page.evaluate(() => [App.Notifications.cardDues(7).filter(c => /World/.test(c.text) && c.in <= 7).length, App.Cards.info('a_world').stmtLeft, App.Accounts.get('a_world').balance, App.Accounts.get('a_bank').balance]), [0, 0, -2000, 20000]);

  // 5) Gecikme ve limit uyarıları (Akbank: son ödeme 5 gün önce geçti, limitin %86'sı dolu)
  const ax = await page.evaluate(() => { const i = App.Cards.info('a_ax'); return [i.overdue, i.minMissed, i.stmtLeft, i.minLeft, i.daysToDue]; });
  eq('Akbank: overdue, minimum not paid', ax, [true, true, 8600, 1720, -5]);
  eq('Özet shows red overdue alert with pay button', await page.evaluate(() => { App.UI.nav('ozet'); return [...document.querySelectorAll('#ozet-cards .cc-alert')].map(x => [x.classList.contains('red'), x.querySelector('b').textContent, x.querySelector('button').textContent]); }), [[true, '⚠️ Son ödeme günü geçti', '💳 Öde']]);
  eq('Stats warnings: limit almost full and overdue', await page.evaluate(() => App.Insights.compute(tm()).warnings.filter(w => /Akbank/.test(w.title)).map(w => w.level + ':' + w.title).sort()), ['red:Akbank Axess …7777 son ödeme geçti', 'yellow:Akbank Axess …7777 limiti dolmak üzere']);

  // 6) Elle harcama limiti aşıyorsa sor
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="a_ax"]').click(); document.getElementById('txnAmt').value = '2000'; App.Transactions.add(); }); await page.waitForTimeout(150);
  eq('over-limit expense asks first', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [!!m && /Kart limiti aşılıyor/.test(m.textContent), S.txns().filter(t => t.amount === 2000 && t.accountId === 'a_ax').length]; }), [true, 0]);
  await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click()); await page.waitForTimeout(150);
  eq('"Yine de Ekle" adds it', await page.evaluate(() => S.txns().filter(t => t.amount === 2000 && t.accountId === 'a_ax').length), 1);

  // 7) Özet: kart borcuna dokununca kartlarım
  await closeModals();
  await page.evaluate(() => { App.UI.nav('ozet'); document.querySelector('.chip-btn').click(); }); await page.waitForTimeout(150);
  eq('hero card-debt chip opens all cards', await page.evaluate(() => [...document.querySelectorAll('#cardsHolder .cc-ov-top b')].map(b => b.textContent)), ['💳 Yapı Kredi World …2947', '💳 Akbank Axess …7777']);
  if (OUT) await page.screenshot({ path: OUT + '/cards-overview.png' });
  await closeModals();

  // 8) Bankanın "kartınıza ödeme yapıldı" mesajı: bankadan karta aktarım (gider sayılmaz), aynı ödeme ikinci kez eklenmez
  const r1 = await page.evaluate(() => App.BankSms.ingest([{ id: 7001, label: 'abcd1234_u_self', text: 'Yapi Kredi: 2947 ile biten kredi kartiniza ' + new Date().toLocaleDateString('tr-TR') + ' tarihinde 1.000,00 TL odeme yapilmistir.', receivedAt: Date.now() }]));
  eq('card payment SMS → transfer from bank to card', [r1.transfers, r1.queued, await page.evaluate(() => S.txns().filter(t => t.transferId && t.amount === 1000).map(t => [t.type, t.accountId, t.src]).sort())], [1, 0, [['expense', 'a_bank', 'sms'], ['income', 'a_world', 'sms']]]);
  const r2 = await page.evaluate(() => App.BankSms.ingest([{ id: 7002, label: 'abcd1234_u_self', text: 'Kredi kartiniza 1.000,00 TL odeme yapilmistir. Yapi Kredi World', receivedAt: Date.now() }]));
  eq('same payment again (other message) → not added twice', [r2.transfers || 0, r2.dupes, await page.evaluate(() => S.txns().filter(t => t.transferId && t.amount === 1000).length)], [0, 1, 2]);
  eq('card payment with unknown card still goes to approval', await page.evaluate(() => App.BankSms.ingest([{ id: 7003, label: 'abcd1234_u_self', text: 'Garanti: Kredi kartiniza 300,00 TL odeme yapilmistir.', receivedAt: Date.now() }]).queued), 1);

  // 9) Kart ekleme / düzenleme alanları
  await page.evaluate(() => App.Accounts.edit('a_ax')); await page.waitForTimeout(150);
  eq('edit dialog has statement day and limit', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [m.querySelector('[data-pkey="stmt"]').value !== '', m.querySelector('[data-pkey="limit"]').value]; }), [true, '10000']);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="limit"]').value = '25000'; m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  eq('limit updated', await page.evaluate(() => App.Accounts.get('a_ax').limit), 25000);
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('[data-acc="__new__"]').click(); }); await page.waitForTimeout(150);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="name"]').value = 'Garanti Bonus'; m.querySelector('[data-pkey="limit"]').value = '30.000'; m.querySelector('[data-pkey="stmt"]').value = '20'; m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  eq('quick add card with limit and statement day', await page.evaluate(() => { const a = S.accounts().find(x => x.name === 'Garanti Bonus'); return [a.type, a.limit, a.statementDay]; }), ['card', 30000, 20]);
  await page.evaluate(() => { App.UI.nav('hesaplar'); document.getElementById('accName').value = 'İş Bankası Maximum'; document.getElementById('accType').value = 'card'; App.Accounts.onTypeChange(); document.getElementById('accLimit').value = '40.000'; App.Accounts.add(); });
  eq('add form saves limit', await page.evaluate(() => (S.accounts().find(a => a.name === 'İş Bankası Maximum') || {}).limit), 40000);
  await page.reload(); await page.waitForTimeout(300);
  eq('after reload: limits and last payment account kept', await page.evaluate(() => [App.Accounts.get('a_ax').limit, App.Accounts.get('a_world').payFrom]), [25000, 'a_bank']);
  eq('balances consistent with history', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('no horizontal overflow on Hesap page', await page.evaluate(() => { App.UI.nav('hesaplar'); return document.documentElement.scrollWidth; }), 390);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
