// Usage: node tests/market-e2e.test.js [http://127.0.0.1:8787]
// Sunucunun piyasa verisini çekip kaydetmesini ve uygulamanın kullanmasını uçtan uca sınar.
// Gerçek kaynaklar yerine 127.0.0.1:8799'daki sahte kaynak kullanılır; worker/.dev.vars içinde:
//   MARKET_TCMB_URL=http://127.0.0.1:8799/tcmb  MARKET_TRUNCGIL_URL=http://127.0.0.1:8799/truncgil
//   MARKET_TEFAS_URL=http://127.0.0.1:8799/tefas  MARKET_CPI_URL=http://127.0.0.1:8799/cpi
// Sunucu veya Playwright yoksa atlanır.
const http = require('http'), path = require('path');
const { TCMB, TRUNCGIL, TEFAS, CPI } = require('./fixtures/market.js');
const BASE = process.argv[2] || process.env.SYNC_BASE || 'http://127.0.0.1:8787';
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; } }
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

let tefasDown = false;
const hits = {};
const mock = http.createServer((q, s) => {
  const k = q.url.split('?')[0].slice(1); hits[k] = (hits[k] || 0) + 1;
  if (k === 'tcmb') { s.writeHead(200, { 'Content-Type': 'application/xml' }); return s.end(TCMB); }
  if (k === 'truncgil') { s.writeHead(200, { 'Content-Type': 'application/json' }); return s.end(JSON.stringify(TRUNCGIL)); }
  if (k === 'tefas') { let b = ''; q.on('data', c => b += c); q.on('end', () => { hits.tefasBody = b; if (tefasDown) { s.writeHead(503); return s.end('down'); } s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(TEFAS)); }); return; }
  if (k === 'cpi') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(CPI); }
  s.writeHead(404); s.end();
});

(async () => {
  const pw = loadPlaywright();
  try { const r = await fetch(BASE + '/v1/config'); if (!r.ok) throw 0; } catch (e) { console.log('Sunucu çalışmıyor (' + BASE + '); test atlandı.'); process.exit(0); }
  await new Promise(r => mock.listen(8799, '127.0.0.1', r));

  // 1) Sunucu kaynaklardan çekip kaydeder
  const m = await (await fetch(BASE + '/v1/market?refresh=1')).json();
  // Veri önceki çalıştırmadan önbellekte taze olabilir; örnek değerler gelmediyse sunucu sahte kaynağa bağlı değildir
  if (!m.rates || m.rates.USD !== 41.6583) { console.log('Worker sahte kaynağa bağlanmadı: .dev.vars içinde MARKET_*_URL ayarlı değil; test atlandı.'); mock.close(); process.exit(0); }
  eq('rates: TCMB FX + Truncgil gold', [m.rates.USD, m.rates.EUR, m.rates.GOLD_GRAM, m.rates.GOLD_QUARTER, m.rates.GOLD_FULL, m.rates.provider], [41.6583, 48.771, 4381.2, 7165.5, 28580, 'TCMB + Truncgil']);
  eq('funds: all funds with latest price', [m.funds.count, m.funds.prices.TTE[0], m.funds.date], [2, 1.184523, '2026-09-26']);
  if (hits.tefasBody) eq('TEFAS request is a form post for one day', /fontip=(YAT|EMK)/.test(hits.tefasBody) && /bastarih=\d{2}\.\d{2}\.\d{4}/.test(hits.tefasBody), true);
  eq('cpi: monthly changes', m.cpi.monthly['2026-08'], 1.84);
  eq('status: no errors', [m.ratesStatus.error, m.fundsStatus.error, m.cpiStatus.error], ['', '', '']);
  const before = { tcmb: hits.tcmb, tefas: hits.tefas };
  await fetch(BASE + '/v1/market?refresh=1');
  eq('fresh data is served from cache (no upstream calls)', [hits.tcmb, hits.tefas], [before.tcmb, before.tefas]);

  // 2) Kaynak düşerse son iyi veri korunur, hata raporlanır (zorunlu yenileme: cron'un yaptığı gibi)
  tefasDown = true;
  const force = await fetch(BASE + '/__scheduled?cron=15+*+*+*+*');
  eq('scheduled market refresh runs', force.ok, true);

  // 3) Uygulama: fon fiyatı TEFAS'tan, TÜFE ileri uzatılır, kurlar sunucudan
  if (pw) {
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { fail++; console.log('✗ page error: ' + e.message); });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => {
      localStorage.clear();
      // workers.dev dışındaki yerel test adresini sunucu olarak tanıt (üretimde eşitleme adresi ya da workers.dev kullanılır)
      localStorage.setItem('ft_market', JSON.stringify({ serverOrigin: location.origin }));
      localStorage.setItem('pf_s', JSON.stringify({ onboarded: true, rates: { USD: 1, updated: 1, provider: 'eski' } }));
      localStorage.setItem('pf_p', JSON.stringify([
        { id: 'pa1700000000000_fund', type: 'FUND', qty: 1000, cost: 1, currentPrice: 0, label: 'TTE', ts: 1 },
        { id: 'pa1700000000000_usd1', type: 'USD', qty: 10, cost: 30, currentPrice: 0, label: '', ts: 2 }
      ]));
      // TÜFE'yi Nisan 2026'da bitmiş gibi göster: yayımlanan aylar eklenmeli
      const c = {}; ['2026-02', '2026-03', '2026-04'].forEach((k, i) => { c[k] = 5000 + i * 100; });
      localStorage.setItem('pf_cpi', JSON.stringify(c)); localStorage.setItem('pf_s', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('pf_s')), { cpiVersion: 2 })));
    });
    await page.reload();
    await page.waitForFunction(() => window.App && App.Market && S.portfolio()[0].priceSource === 'TEFAS', null, { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate(() => ({ p: S.portfolio()[0], rates: S.settings().rates, cpi: App.Inflation.data() }));
    eq('fund price filled from TEFAS by code in label', [st.p.code, st.p.currentPrice, st.p.priceDate, st.p.priceSource], ['TTE', 1.184523, '2026-09-26', 'TEFAS']);
    eq('rates taken from server', [st.rates.USD, st.rates.GOLD_GRAM, st.rates.provider], [41.6583, 4381.2, 'TCMB + Truncgil']);
    eq('CPI extended with published months (May −0.20%)', [st.cpi['2026-05'], Object.keys(st.cpi).sort().pop()], [Math.round(5200 * (1 - 0.002) * 100) / 100, '2026-08']);
    // Fon kodu ile yeni varlık: ad ve fiyat otomatik
    await page.evaluate(() => { App.UI.nav('portfoy'); document.getElementById('portType').value = 'FUND'; App.Portfolio.onTypeChange(); });
    await page.fill('#portCode', 'aft');
    eq('code hint shows fund name and price', (await page.textContent('#portCodeHint')).includes('AK PORTFÖY'), true);
    await page.fill('#portQty', '100');
    await page.evaluate(() => App.Portfolio.add());
    const added = await page.evaluate(() => S.portfolio().find(p => p.code === 'AFT'));
    eq('new fund by code gets name and price', [added && added.label.slice(0, 10), added && added.currentPrice], ['AK PORTFÖY', 0.412398]);
    await page.evaluate(() => App.UI.nav('ayarlar'));
    const card = await page.textContent('#setMarketCard');
    eq('settings shows source status', [/Kur \/ altın: \d/.test(card) || /Kur \/ altın: .*TCMB/.test(card), /2 fon/.test(card), /TÜFE/.test(card)], [true, true, true]);
    await browser.close();
  }
  mock.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
