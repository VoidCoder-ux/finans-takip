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
      { id: 'a_bank', name: 'Yapı Kredi Vadesiz', type: 'bank', owner: 'shared', last4: '6604', balance: 30000, openingBalance: 30000, ts: 1 },
      { id: 'a_world', name: 'Yapı Kredi World', type: 'card', owner: 'shared', last4: '3812', statementDay: cut1, limit: 50000, balance: -12000, openingBalance: -10000, ts: 2 },
      { id: 'a_ax', name: 'Akbank Axess', type: 'card', owner: 'shared', last4: '7777', statementDay: cut2, limit: 10000, balance: -8600, openingBalance: -8600, ts: 3 },
      { id: 'a_cash', name: 'Cüzdan', type: 'cash', owner: 'shared', balance: 500, openingBalance: 500, ts: 4 }],
    pf_t: [
      { id: 't1', type: 'expense', amount: 2000, category: 'Market', date: day(-2), note: 'Migros', accountId: 'a_world', userId: 'u_self', ts: 1, balanceApplied: true },
      { id: 't_inst', type: 'expense', amount: 500, category: 'Giyim', date: futMonth, note: 'Zara (2/3)', accountId: 'a_world', userId: 'u_self', ts: 2, balanceApplied: false, installment: { planId: 'p1', index: 2, total: 3, totalAmount: 1500, name: 'Zara', startDate: day(-30), balanceApplied: false } }],
    pf_s: { onboarded: true, users: [{ id: 'u_self', name: 'Deniz', emoji: '🙋', color: '#14b8a6' }], activeUser: 'u_self', lastBackupAt: Date.now() }
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
  eq('World: debt, limit, available (limit − debt − future installment 500, as the bank blocks it), statement debt, minimum (%20), next statement, due in 5 days, installments', i1, [12000, 50000, 37500, 25, 10000, 10000, 2000, 2000, 2000, 5, false, [{ month: futMonth.slice(0, 7), amount: 500 }]]);
  eq('limit stored and kept after reload (storage/sync)', await page.evaluate(() => App.Accounts.get('a_world').limit), 50000);

  // 2) Hesap sayfası
  const accCard = await page.evaluate(() => { App.UI.nav('hesaplar'); const c = [...document.querySelectorAll('#accGrid .acc-card')].find(x => x.textContent.includes('World')); return [c.querySelector('.cc-lim-txt').textContent, c.querySelector('.cc-due').textContent, [...c.querySelectorAll('.cc-acts button')].map(b => b.textContent)]; });
  eq('account card: limit/available, due line, buttons', [accCard[0], /^Son ödeme .+: ₺10\.000,00 · asgari ₺2\.000,00$/.test(accCard[1]), accCard[2]], ['Limit ₺50.000,00 · Kalan ₺37.500,00 · taksitlere ayrılan ₺500,00', true, ['Detay', '💳 Ödeme Gir']]);
  if (OUT) await page.locator('#accGrid').screenshot({ path: OUT + '/cards-accounts.png' });

  // 3) Detay
  await page.evaluate(() => App.Cards.detail('a_world')); await page.waitForTimeout(150);
  const det = await page.evaluate(() => [...document.querySelectorAll('#cardDetailHolder .cc-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 10));
  eq('detail rows', det.slice(0, 7), ['Toplam borç₺12.000,00', 'Limit₺50.000,00', 'Gelecek taksitlere ayrılan₺500,00', 'Kalan limit₺37.500,00', 'Dönem borcu₺10.000,00', 'Kalan dönem borcu₺10.000,00', 'Asgari ödeme (kalan)₺2.000,00']);
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
  eq('minimum paid: no reminder any more (remaining statement debt is optional)', await page.evaluate(() => App.Notifications.cardDues(7).filter(c => /World/.test(c.text)).length), 0);
  eq('minimum paid: card shows a calm green note, not a warning', await page.evaluate(() => { const i = App.Cards.info('a_world'), d = document.createElement('div'); d.innerHTML = App.Cards.mini(App.Accounts.get('a_world')); const e = d.querySelector('.cc-due'); return [i.minPaid, e.className, /^✓ Asgari ödendi · kalan dönem borcu ₺8\.000,00 · son ödeme /.test(e.textContent)]; }), [true, 'cc-due ok', true]);
  // Kalanı öde → hatırlatma ve uyarı yok
  await page.evaluate(() => { App.Cards.pay('a_world'); document.getElementById('ccPayOk').click(); }); await page.waitForTimeout(150);
  eq('statement paid: no current reminder, card shows paid', await page.evaluate(() => [App.Notifications.cardDues(7).filter(c => /World/.test(c.text) && c.in <= 7).length, App.Cards.info('a_world').stmtLeft, App.Accounts.get('a_world').balance, App.Accounts.get('a_bank').balance]), [0, 0, -2000, 20000]);

  // 5) Gecikme ve limit uyarıları (Akbank: son ödeme 5 gün önce geçti, limitin %86'sı dolu)
  const ax = await page.evaluate(() => { const i = App.Cards.info('a_ax'); return [i.overdue, i.minMissed, i.stmtLeft, i.minLeft, i.daysToDue]; });
  eq('Akbank: overdue, minimum not paid', ax, [true, true, 8600, 1720, -5]);
  eq('Özet shows red overdue alert with pay button', await page.evaluate(() => { App.UI.nav('ozet'); return [...document.querySelectorAll('#ozet-cards .cc-alert')].map(x => [x.classList.contains('red'), x.querySelector('b').textContent, x.querySelector('button').textContent]); }), [[true, '⚠️ Son ödeme günü geçti', '💳 Ödeme Gir']]);
  eq('Stats warnings: limit almost full and overdue', await page.evaluate(() => App.Insights.compute(tm()).warnings.filter(w => /Akbank/.test(w.title)).map(w => w.level + ':' + w.title).sort()), ['red:Akbank Axess …7777 son ödeme geçti', 'yellow:Akbank Axess …7777 limiti dolmak üzere']);
  // Asgari son ödemeden önce ödendiyse: Özet uyarısı, hatırlatma ve kırmızı uyarı kalkar
  eq('Akbank minimum paid: no Özet alert, no reminder, no overdue warning; bars say paid', await page.evaluate(() => {
    const a = S.accounts(), c = a.find(x => x.id === 'a_ax'); c.balance += 1720; S.saveAccounts(a);
    const t = S.txns(); t.push({ id: 't_minax', type: 'income', amount: 1720, category: 'Transfer', date: td(), note: 'Asgari', accountId: 'a_ax', userId: 'u_self', ts: 9, balanceApplied: true }); S.saveTxns(t);
    App.Cards.renderAlerts(); const i = App.Cards.info('a_ax');
    const out = [i.minPaid, i.minMissed, document.querySelectorAll('#ozet-cards .cc-alert').length, App.Notifications.cardDues(60).filter(x => /Akbank/.test(x.text)).length, App.Insights.compute(tm()).warnings.filter(w => /son ödeme/.test(w.title)).length,
      [...document.querySelectorAll('#ozet-cardbars .ccb')].find(b => /Akbank/.test(b.textContent)).querySelector('.ccb-sub.ok').textContent];
    const b = S.accounts(); b.find(x => x.id === 'a_ax').balance -= 1720; S.saveAccounts(b); S.saveTxns(S.txns().filter(x => x.id !== 't_minax')); App.Cards.renderAlerts();
    return out; }), [true, false, 0, 0, 0, '✓ Asgari ödendi · kalan dönem borcu ₺6.880,00']);

  // Asgari oran: limit 100.000 TL'ye kadar %20, aşarsa %40
  eq('minimum rate: 100.000 limit → %20, 100.001 → %40', await page.evaluate(() => { const a = S.accounts(), c = a.find(x => x.id === 'a_ax'), keep = c.limit; c.limit = 100000; S.saveAccounts(a); const m1 = App.Cards.info('a_ax').minTotal; c.limit = 100001; S.saveAccounts(a); const m2 = App.Cards.info('a_ax').minTotal; c.limit = keep; S.saveAccounts(a); return [m1, m2]; }), [1720, 3440]);

  // 6) Elle harcama limiti aşıyorsa sor
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('#txnPayChips [data-acc="a_ax"]').click(); document.getElementById('txnAmt').value = '2000'; App.Transactions.add(); }); await page.waitForTimeout(150);
  eq('over-limit expense asks first', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [!!m && /Kart limiti aşılıyor/.test(m.textContent), S.txns().filter(t => t.amount === 2000 && t.accountId === 'a_ax').length]; }), [true, 0]);
  await page.evaluate(() => [...document.querySelectorAll('.modal-bd.show')].pop().querySelector('[data-act="ok"]').click()); await page.waitForTimeout(150);
  eq('"Yine de Ekle" adds it', await page.evaluate(() => S.txns().filter(t => t.amount === 2000 && t.accountId === 'a_ax').length), 1);

  // 7) Özet: kart borcuna dokununca kartlarım
  await closeModals();
  await page.evaluate(() => { App.UI.nav('ozet'); document.querySelector('button.hero-tile').click(); }); await page.waitForTimeout(150);
  eq('hero card-debt chip opens all cards', await page.evaluate(() => [...document.querySelectorAll('#cardsHolder .cc-ov-top b')].map(b => b.textContent)), ['💳 Yapı Kredi World …3812', '💳 Akbank Axess …7777']);
  if (OUT) await page.screenshot({ path: OUT + '/cards-overview.png' });
  await closeModals();

  // 8) Bankanın "kartınıza ödeme yapıldı" mesajı: bankadan karta aktarım (gider sayılmaz), aynı ödeme ikinci kez eklenmez
  const r1 = await page.evaluate(() => App.BankSms.ingest([{ id: 7001, label: 'abcd1234_u_self', text: 'Yapi Kredi: 3812 ile biten kredi kartiniza ' + new Date().toLocaleDateString('tr-TR') + ' tarihinde 1.000,00 TL odeme yapilmistir.', receivedAt: Date.now() }]));
  eq('card payment SMS → transfer from bank to card', [r1.transfers, r1.queued, await page.evaluate(() => S.txns().filter(t => t.transferId && t.amount === 1000).map(t => [t.type, t.accountId, t.src]).sort())], [1, 0, [['expense', 'a_bank', 'sms'], ['income', 'a_world', 'sms']]]);
  const r2 = await page.evaluate(() => App.BankSms.ingest([{ id: 7002, label: 'abcd1234_u_self', text: 'Kredi kartiniza 1.000,00 TL odeme yapilmistir. Yapi Kredi World', receivedAt: Date.now() }]));
  eq('same payment again (other message) → not added twice', [r2.transfers || 0, r2.dupes, await page.evaluate(() => S.txns().filter(t => t.transferId && t.amount === 1000).length)], [0, 1, 2]);
  eq('card payment with unknown card still goes to approval', await page.evaluate(() => App.BankSms.ingest([{ id: 7003, label: 'abcd1234_u_self', text: 'Garanti: Kredi kartiniza 300,00 TL odeme yapilmistir.', receivedAt: Date.now() }]).queued), 1);

  // 8b) Ödemenin iki kez girilmesine karşı: mesajla gelen ödeme varken "Borcu Öde" sorar; borçtan fazla ödemede sorar
  await page.evaluate(() => { App.Cards.pay('a_world'); document.getElementById('ccAmt').value = '1000'; document.getElementById('ccPayOk').click(); }); await page.waitForTimeout(150);
  eq('Borcu Öde: same payment already recorded → asks, adds nothing yet', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [/zaten kayıtlı olabilir/.test(m.textContent), S.txns().filter(t => t.accountId === 'a_world' && t.type === 'income' && t.amount === 1000).length]; }), [true, 1]);
  await closeModals();
  const debtW = await page.evaluate(() => App.Cards.info('a_world').debt);
  await page.evaluate(d => { App.Cards.pay('a_world'); document.getElementById('ccAmt').value = String(d + 5000); document.getElementById('ccPayOk').click(); }, debtW); await page.waitForTimeout(150);
  eq('Borcu Öde: more than the debt → asks', await page.evaluate(() => /Ödeme borçtan fazla/.test([...document.querySelectorAll('.modal-bd.show')].pop().textContent)), true);
  await closeModals();
  // Bankaların farklı cümleleri kart borcu ödemesi olarak tanınır; karta "gelen" para gelir sayılmaz
  const P = t => page.evaluate(t => { const x = App.BankSms.parse(t, Date.now()); return [x.kind, /Kredi kartı borç ödemesi/.test(x.reason)]; }, t);
  eq('"…ile biten kartınıza … ödeme yapılmıştır" recognised', await P('Akbank: 7777 ile biten kartınıza 04.10.2026 tarihinde 12.000,00 TL ödeme yapılmıştır.'), ['review', true]);
  eq('"kredi kartı ödemeniz alınmıştır" recognised', await P('Yapi Kredi: 3812 nolu kredi karti odemeniz alinmistir. Tutar: 500,00 TL'), ['review', true]);
  eq('"kartınızdan fatura ödemeniz" stays a spend', (await P('Kartinizdan 450,00 TL fatura odemeniz gerceklesmistir. Yapi Kredi'))[1], false);
  const r3 = await page.evaluate(() => { const b = App.Accounts.get('a_bank').balance; const r = App.BankSms.ingest([{ id: 7010, label: 'abcd1234_u_self', text: 'Akbank: 7777 ile biten kartiniza 750,00 TL yatirilmistir.', receivedAt: Date.now() }]); return [r.transfers || 0, r.added, App.Accounts.get('a_bank').balance - b, S.txns().filter(t => t.amount === 750 && t.accountId === 'a_ax').map(t => [t.type, t.category, !!t.transferId])]; });
  eq('money "to the card" becomes a card payment from the bank, not income', r3, [1, 0, -750, [['income', 'Transfer', true]]]);
  // Mükerrer ödeme uyarısı ve tek dokunuşla düzeltme
  await page.evaluate(() => { App.Transactions.createTransfer({ from: 'a_bank', to: 'a_ax', amount: 750, date: td(), userId: 'u_self' }); App.UI.nav('ozet'); renderAllViews(); });
  eq('Özet warns about the same card payment recorded twice', await page.evaluate(() => [...document.querySelectorAll('#ozet-cards .cc-alert b')].map(b => b.textContent).filter(t => /iki kez/.test(t))), ['⚠️ Aynı kart ödemesi iki kez kaydedilmiş olabilir']);
  const bankBefore = await page.evaluate(() => App.Accounts.get('a_bank').balance);
  await page.evaluate(() => [...document.querySelectorAll('#ozet-cards .cc-alert')].find(x => /iki kez/.test(x.textContent)).querySelector('.btn-primary').click()); await page.waitForTimeout(200);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); if (m && m.querySelector('[data-act="ok"]')) m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(200);
  eq('"Birini Sil": one payment removed, money back in the bank, warning gone', await page.evaluate(b => [S.txns().filter(t => t.amount === 750 && t.accountId === 'a_ax').length, App.Accounts.get('a_bank').balance - b, document.querySelectorAll('#ozet-cards .cc-alert').length && [...document.querySelectorAll('#ozet-cards .cc-alert')].some(x => /iki kez/.test(x.textContent))], bankBefore), [1, 750, false]);
  // Fazla ödeme (alacak) görünür
  eq('card in credit shows a clear warning', await page.evaluate(() => { const a = S.accounts(), c = a.find(x => x.id === 'a_cash'); const x = { id: 'a_tmp', name: 'Deneme Kart', type: 'card', owner: 'shared', balance: 1200, openingBalance: 1200, ts: 99 }; a.push(x); S.saveAccounts(a); const h = App.Cards.mini(App.Accounts.get('a_tmp')); const hero = (App.Accounts.renderSummary(), document.getElementById('heroCardNote').textContent); S.saveAccounts(S.accounts().filter(y => y.id !== 'a_tmp')); App.Accounts.renderSummary(); return [/fazla ödeme \(alacak\)/.test(h), /kartta alacak ₺1\.200,00/.test(hero)]; }), [true, true]);
  // Son ödeme tarihi elle: kesimden 12 gün sonra olan banka
  await page.evaluate(() => App.Accounts.edit('a_world')); await page.waitForTimeout(150);
  const dd = await page.evaluate(() => { const c = App.Cards.info('a_world').cut, d = new Date(c + 'T12:00:00'); d.setDate(d.getDate() + 12); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="dueDate"]').value = iso; m.querySelector('[data-act="ok"]').click(); return iso; });
  await page.waitForTimeout(150);
  eq('due date entered as a full date (12 days after cut) is used', await page.evaluate(() => [App.Accounts.get('a_world').dueOffset, App.Cards.info('a_world').due]), [12, dd]);
  eq('wrong order (due before cut) is refused', await page.evaluate(() => App.Cards.fromDates('2026-10-10', '2026-10-01').err || ''), 'Son ödeme tarihi, kesim tarihinden 1-40 gün sonra olmalı.');
  await closeModals();

  // 8c) Yaklaşan kesim tarihi girilince saklanır: önceki ekstre kapanmış sayılır, borç sonraki ekstreye yazılır
  const up = await page.evaluate(() => { const d = new Date(); const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7), du = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 17); const f = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); return [f(c), f(du)]; });
  await page.evaluate(() => App.Accounts.edit('a_ax')); await page.waitForTimeout(150);
  await page.evaluate(([c, d]) => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="cutDate"]').value = c; m.querySelector('[data-pkey="dueDate"]').value = d; m.querySelector('[data-act="ok"]').click(); }, up); await page.waitForTimeout(150);
  eq('upcoming cut date kept: no overdue, debt goes to next statement with entered dates', await page.evaluate(() => { const i = App.Cards.info('a_ax'); return [i.upcoming, i.overdue, i.stmtLeft, i.nextCut, i.nextDue, i.nextStmt === i.debt]; }), [true, false, 0].concat(up).concat([true]));
  await page.evaluate(() => App.Accounts.edit('a_ax')); await page.waitForTimeout(150);
  eq('edit dialog shows the entered (upcoming) dates again', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [m.querySelector('[data-pkey="cutDate"]').value, m.querySelector('[data-pkey="dueDate"]').value]; }), up);
  await closeModals();
  eq('reload keeps the entered dates', await page.evaluate(() => { S.load(); const i = App.Cards.info('a_ax'); return [i.nextCut, i.nextDue]; }), up);
  // Özet: her kart için borç / kullanılabilir limit çubuğu
  const bars = await page.evaluate(() => { App.UI.nav('ozet'); renderAllViews(); return [...document.querySelectorAll('#ozet-cardbars .ccb')].map(b => [b.querySelector('.ccb-top b').textContent, !!b.querySelector('.cc-bar') || /Limit girilmedi/.test(b.textContent), /Kullanılabilir|aşıldı|Limit girilmedi/.test(b.textContent)]); });
  eq('Özet "Kartlarım": one row per card with debt and available limit', [bars.length >= 2, bars.every(b => b[1] && b[2]), bars.map(b => b[0]).slice(0, 2)], [true, true, ['Yapı Kredi World …3812', 'Akbank Axess …7777']]);
  if (OUT) await page.locator('#ozet-cardbars').screenshot({ path: OUT + '/ozet-cardbars.png' });

  // 9) Kart ekleme / düzenleme alanları
  await page.evaluate(() => App.Accounts.edit('a_ax')); await page.waitForTimeout(150);
  eq('edit dialog has statement date, due date (full dates) and limit', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [(i => m.querySelector('[data-pkey="cutDate"]').value === (i.upcoming ? i.nextCut : i.cut) && m.querySelector('[data-pkey="dueDate"]').value === (i.upcoming ? i.nextDue : i.due))(App.Cards.info('a_ax')), m.querySelector('[data-pkey="limit"]').value]; }), [true, '10000']);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="limit"]').value = '25000'; m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  eq('limit updated', await page.evaluate(() => App.Accounts.get('a_ax').limit), 25000);
  await page.evaluate(() => { App.UI.nav('islemler'); App.UI.setType('expense'); document.querySelector('[data-acc="__new__"]').click(); }); await page.waitForTimeout(150);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="name"]').value = 'Garanti Bonus'; m.querySelector('[data-pkey="limit"]').value = '30.000'; m.querySelector('[data-pkey="cutDate"]').value = '2026-09-20'; m.querySelector('[data-pkey="dueDate"]').value = '2026-10-02'; m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  eq('quick add card with limit and statement day', await page.evaluate(() => { const a = S.accounts().find(x => x.name === 'Garanti Bonus'); return [a.type, a.limit, a.statementDay, a.dueOffset]; }), ['card', 30000, 20, 12]);
  await page.evaluate(() => { App.UI.nav('hesaplar'); document.getElementById('accName').value = 'İş Bankası Maximum'; document.getElementById('accType').value = 'card'; App.Accounts.onTypeChange(); document.getElementById('accLimit').value = '40.000'; App.Accounts.add(); });
  eq('add form saves limit', await page.evaluate(() => (S.accounts().find(a => a.name === 'İş Bankası Maximum') || {}).limit), 40000);
  // 10) Ortak limit: aynı bankanın iki kartı tek limit; borç ve ekstre kart kart ayrı
  await closeModals();
  await page.evaluate(() => { const a = S.accounts(); a.push({ id: 'a_hb', name: 'Yapı Kredi Hepsiburada', type: 'card', owner: 'shared', last4: '5127', balance: -3000, openingBalance: -3000, limit: 20000, ts: 9 }); S.saveAccounts(a); App.Accounts.edit('a_hb'); });
  await page.waitForTimeout(150);
  eq('edit dialog offers "limit shared with" other cards', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); return [...m.querySelector('[data-pkey="limitWith"]').options].map(o => o.textContent); }), ['— Hayır, kendi limiti var —', '🔗 Yapı Kredi World …3812', '🔗 Akbank Axess …7777', '🔗 Garanti Bonus', '🔗 İş Bankası Maximum']);
  await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-bd.show')].pop(); m.querySelector('[data-pkey="limitWith"]').value = 'a_world'; m.querySelector('[data-act="ok"]').click(); }); await page.waitForTimeout(150);
  const sh = await page.evaluate(() => { const w = App.Cards.info('a_world'), h = App.Cards.info('a_hb'); return { hbLimitField: App.Accounts.get('a_hb').limit, wDebt: w.debt, hDebt: h.debt, wAvail: w.avail, hAvail: h.avail, limit: h.limit, shared: [w.shared, h.shared] }; });
  eq('shared limit: one limit (World), available = limit − both debts − future installment of World 500, debts separate', [sh.hbLimitField, sh.limit, sh.wAvail, sh.hAvail, sh.hDebt, sh.shared], [undefined, 50000, 50000 - sh.wDebt - 3000 - 500, 50000 - sh.wDebt - 3000 - 500, 3000, [['Yapı Kredi Hepsiburada'], ['Yapı Kredi World']]]);
  eq('account cards say "Ortak limit" and name the other card', await page.evaluate(() => { App.UI.nav('hesaplar'); const c = [...document.querySelectorAll('#accGrid .acc-card')].find(x => x.querySelector('.acc-name').textContent.includes('Hepsiburada')); return [/^Ortak limit ₺50\.000,00/.test(c.querySelector('.cc-lim-txt').textContent), /🔗 Limit ortak: Yapı Kredi World/.test(c.textContent)]; }), [true, true]);
  eq('over-limit check uses the shared limit', await page.evaluate(() => { const i = App.Cards.info('a_hb'); return [!!App.Cards.overLimit('a_hb', i.avail + 1), !App.Cards.overLimit('a_hb', i.avail - 1)]; }), [true, true]);
  await page.evaluate(() => App.Cards.detail('a_hb')); await page.waitForTimeout(100);
  eq('detail shows shared limit and total debt of the cards', await page.evaluate(() => { const t = document.getElementById('cardDetailHolder').textContent; return [/Ortak limit₺50\.000,00/.test(t), /Ortak limitli kartlarYapı Kredi World/.test(t), /Kartların toplam borcu/.test(t)]; }), [true, true, true]);
  await closeModals();
  eq('limit warning once per shared limit (on the main card)', await page.evaluate(() => { const a = S.accounts(); a.find(x => x.id === 'a_hb').balance = -46000; S.saveAccounts(a); const w = App.Insights.compute(tm()).warnings.filter(x => /Yapı Kredi .*limiti/.test(x.title)).map(x => x.title); a.find(x => x.id === 'a_hb').balance = -3000; S.saveAccounts(a); return w; }), ['Yapı Kredi World …3812 ve ortak kartların limiti dolmak üzere']);
  await page.evaluate(() => App.Accounts.reconcileAccountBalances(true));
  // Yeni Hesap Ekle formunda ortak limit (Düzenle'deki kuralla): yalnız kart türünde; kendi limiti olan kartlar listelenir
  eq('add form: shared-limit choice only for cards, lists cards with their own limit', await page.evaluate(() => { App.UI.nav('hesaplar'); const ty = document.getElementById('accType'), w = document.getElementById('accLimitWithWrap'); ty.value = 'bank'; App.Accounts.onTypeChange(); const hid = w.style.display; ty.value = 'card'; App.Accounts.onTypeChange(); return [hid, w.style.display, document.querySelector('label[for="accLimitWith"]').textContent, [...document.getElementById('accLimitWith').options].map(o => o.textContent)]; }),
    ['none', '', 'Limiti Şu Kartla Ortak', ['— Hayır, kendi limiti var —', '🔗 Yapı Kredi World …3812', '🔗 Akbank Axess …7777', '🔗 Garanti Bonus', '🔗 İş Bankası Maximum']]);
  await page.evaluate(() => { const bonus = S.accounts().find(a => a.name === 'Garanti Bonus'); document.getElementById('accName').value = 'Garanti Bonus Ek'; document.getElementById('accLimit').value = '15.000'; document.getElementById('accLimitWith').value = bonus.id; App.Accounts.add(); });
  eq('add form: new card shares the chosen card\'s limit (main card limit unchanged, no own limit kept); choice resets, new card not offered as main', await page.evaluate(() => { const bonus = S.accounts().find(a => a.name === 'Garanti Bonus'), ek = S.accounts().find(a => a.name === 'Garanti Bonus Ek'), i = App.Cards.info(ek), sel = document.getElementById('accLimitWith');
    return [ek.limitWith === bonus.id, 'limit' in ek, bonus.limit, i.limit, i.shared, App.Cards.info(bonus).shared, sel.value, [...sel.options].some(o => /Bonus Ek/.test(o.textContent))]; }), [true, false, 30000, 30000, ['Garanti Bonus'], ['Garanti Bonus Ek'], '', false]);
  await page.evaluate(() => { document.getElementById('accName').value = 'Limitsiz Ana'; App.Accounts.add(); });
  await page.evaluate(() => { const ana = S.accounts().find(a => a.name === 'Limitsiz Ana'); document.getElementById('accName').value = 'Limitsiz Ek'; document.getElementById('accLimit').value = '12.000'; document.getElementById('accLimitWith').value = ana.id; App.Accounts.add(); });
  eq('add form: main card without a limit takes the limit entered for the shared card', await page.evaluate(() => { const ana = S.accounts().find(a => a.name === 'Limitsiz Ana'), ek = S.accounts().find(a => a.name === 'Limitsiz Ek'); return [ana.limit, 'limit' in ek, ek.limitWith === ana.id, App.Cards.info(ek).avail]; }), [12000, false, true, 12000]);

  await page.reload(); await page.waitForTimeout(300);
  eq('after reload: limits and last payment account kept', await page.evaluate(() => [App.Accounts.get('a_ax').limit, App.Accounts.get('a_world').payFrom]), [25000, 'a_bank']);
  eq('balances consistent with history', await page.evaluate(() => App.Accounts.reconcileAccountBalances(true)), false);
  eq('no horizontal overflow on Hesap page', await page.evaluate(() => { App.UI.nav('hesaplar'); return document.documentElement.scrollWidth; }), 390);
  eq('no page errors', errors, []);
  await browser.close(); srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
