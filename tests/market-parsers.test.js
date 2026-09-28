// Usage: node tests/market-parsers.test.js
// Sunucunun piyasa verisi ayrıştırıcılarını gerçek kaynak biçimlerini taklit eden örneklerle sınar (ağ gerekmez).
const path = require('path');
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }

const { TCMB, TRUNCGIL, TEFAS, TEFAS_LEGACY, CPI } = require('./fixtures/market.js');

(async () => {
  const m = await import(path.join(__dirname, '..', 'worker', 'src', 'market.js'));
  eq('num: Turkish grouping', [m.num('4.381,20'), m.num('41.6583'), m.num('1,5'), m.num(''), m.num('₺ 28.580'), m.num('48.7710')], [4381.2, 41.6583, 1.5, 0, 28580, 48.771]);
  const t = m.parseTcmbXml(TCMB);
  eq('TCMB: USD/EUR/GBP forex buying + bulletin date', [t.rates.USD, t.rates.EUR, t.rates.GBP, t.date], [41.6583, 48.771, 55.9322, '2026-09-26']);
  eq('TCMB: ignores other currencies', Object.keys(t.rates).sort(), ['EUR', 'GBP', 'USD']);
  const g = m.parseTruncgil(TRUNCGIL);
  eq('Truncgil: gold buying prices (string/number formats)', [g.GOLD_GRAM, g.GOLD_QUARTER, g.USD], [4381.2, 7165.5, 41.62]);
  eq('Truncgil: "28.580" read as Turkish thousands', g.GOLD_FULL, 28580);
  const f = m.parseTefas(TEFAS);
  eq('TEFAS: latest price per fund, invalid rows skipped', [f.prices.TTE[0], f.prices.AFT[0], Object.keys(f.prices).sort()], [1.184523, 0.412398, ['AFT', 'TTE']]);
  eq('TEFAS: price date', f.date, '2026-09-26');
  const fl = m.parseTefas(TEFAS_LEGACY);
  eq('TEFAS legacy format still parsed', [fl.prices.TTE[0], fl.prices.AFT[0], fl.date], [1.184523, 0.412398, '2026-09-26']);
  eq('TEFAS date formats', ['2026-09-26T00:00:00', '20260926', '26.09.2026', 1790380800000, '', null].map(m.tefasDay), ['2026-09-26', '2026-09-26', '2026-09-26', '2026-09-26', '', '']);
  eq('TEFAS error envelope is empty, not a crash', Object.keys(m.parseTefas({ errorCode: 'E1', errorMessage: 'Kayıt bulunamadı', resultList: null }).prices).length, 0);
  const c = m.parseCpiHtml(CPI);
  eq('CPI: monthly % by month (comma/dot, nested tags, negative)', c, { '2026-08': 1.84, '2026-07': 1.78, '2026-06': 0.99, '2026-05': -0.2 });
  eq('empty inputs are safe', [Object.keys(m.parseTcmbXml('').rates).length, Object.keys(m.parseTefas(null).prices).length, Object.keys(m.parseCpiHtml('<html></html>')).length], [0, 0, 0]);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
