// Usage: node tests/email-extract.test.js
// Sunucu: banka e-postasından işlem satırının ayıklanması (worker/src/sms.js extractEmail). Sunucu ve ağ gerekmez.
// Banka işlem cümlesiyle kampanya cümlesini ("… chip-para kazandınız", "son ödeme tarihine kadar", "%2 puan") aynı paragrafa
// yazabilir: kampanya cümlesi atılır, işlem cümlesi kalır (eskiden bütün e-posta atılıyor, harcama hiç gelmiyordu).
const path = require('path'), { pathToFileURL } = require('url');
let pass = 0, fail = 0;
function eq(label, a, e) { const ok = JSON.stringify(a) === JSON.stringify(e); ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + label + ' => ' + JSON.stringify(a) + (ok ? '' : ' (expected ' + JSON.stringify(e) + ')')); }
(async () => {
  const { extractEmail } = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'sms.js')).href);
  const at = Date.parse('2026-11-18T09:30:00Z');
  const mail = (from, subj, body) => from + '\n' + subj + '\n<html><body><table><tr><td>' + body + '</td></tr></table><p>Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.</p></body></html>';
  const X = (from, subj, body) => extractEmail(mail(from, subj, body), at).split('\n');
  const chip = X('Akbank <bilgi@akbank.com>', 'Axess Harcama Bildirimi', "<p>Sayın AYŞE YILMAZ,</p><p>1234 ile biten Axess kartınızla MIGROS'tan 245,90 TL harcama yapılmıştır. Bu harcamanızdan 2,46 TL chip-para kazandınız.</p>");
  eq('chip-para cümlesi aynı paragrafta: işlem kalır, kampanya atılır', [chip.some(l => l === "1234 ile biten Axess kartınızla MIGROS'tan 245,90 TL harcama yapılmıştır."), chip.some(l => /kazand/.test(l))], [true, false]);
  const kadar = X('Garanti BBVA <bilgi@garantibbva.com.tr>', 'Harcama', "<p>Bonus kartınızla TEKNOSA'dan 12.000,00 TL tutarında 6 taksitli harcama yapılmıştır. Taksitleriniz son ödeme tarihine kadar ekstrenize yansıyacaktır.</p>");
  eq('"kadar" geçen ikinci cümle: taksitli harcama kalır', [kadar.some(l => /TEKNOSA'dan 12\.000,00 TL tutarında 6 taksitli harcama yapılmıştır\.$/.test(l)), kadar.some(l => /kadar/.test(l))], [true, false]);
  const yuzde = X('Yapı Kredi <bilgi@yapikredi.com.tr>', 'Harcama', "<p>World kartınızla SHELL'den 1.250,00 TL harcama yapılmıştır; %2 worldpuan kazandınız.</p>");
  eq('noktalı virgülle eklenen "%2 puan": harcama kalır', [yuzde.some(l => /SHELL'den 1\.250,00 TL harcama yapılmıştır;?$/.test(l)), yuzde.some(l => /worldpuan/.test(l))], [true, false]);
  const unvan = X('Akbank <bilgi@akbank.com>', 'Harcama', '<p>Axess kartınızla MIGROS TICARET A.Ş. isyerinde 245,90 TL harcama yapılmıştır. 2,46 TL chip-para kazandınız.</p>');
  eq('unvandaki nokta cümle sanılmaz ("A.Ş. isyerinde")', unvan.some(l => l === 'Axess kartınızla MIGROS TICARET A.Ş. isyerinde 245,90 TL harcama yapılmıştır.'), true);
  // Yalnız kampanya olan e-posta yine hiç alınmaz
  eq('yalnız kampanya: alınmaz', extractEmail(mail('Akbank <kampanya@akbank.com>', 'Size özel fırsat!', "<p>Axess kartınızla market alışverişlerinizde 250 TL'ye varan chip-para kazanın!</p>"), at), '');
  // Düz işlem e-postası değişmez
  eq('düz işlem e-postası', X('Akbank <bilgi@akbank.com>', 'Harcama', "<p>1234 ile biten Axess kartınızla MIGROS'tan 245,90 TL harcama yapılmıştır.</p>"), ['Akbank', 'Harcama', "1234 ile biten Axess kartınızla MIGROS'tan 245,90 TL harcama yapılmıştır.", 'E-posta tarihi: 18.11.2026 12:30']);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
