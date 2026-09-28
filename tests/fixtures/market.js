// Piyasa kaynaklarının yanıt biçimlerini taklit eden örnekler (ayrıştırıcı ve uçtan uca testlerde ortak)
const TCMB = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="26.09.2026" Date="09/26/2026"  Bulten_No="2026/185" >
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
			<Unit>1</Unit>
			<Isim>ABD DOLARI</Isim>
			<CurrencyName>US DOLLAR</CurrencyName>
			<ForexBuying>41.6583</ForexBuying>
			<ForexSelling>41.7334</ForexSelling>
			<BanknoteBuying>41.6291</BanknoteBuying>
			<BanknoteSelling>41.7960</BanknoteSelling>
	</Currency>
	<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
			<Unit>1</Unit><Isim>EURO</Isim><ForexBuying>48.7710</ForexBuying><ForexSelling>48.8589</ForexSelling>
	</Currency>
	<Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP">
			<Unit>1</Unit><Isim>İNGİLİZ STERLİNİ</Isim><ForexBuying>55.9322</ForexBuying><ForexSelling>56.2238</ForexSelling>
	</Currency>
	<Currency CrossOrder="12" Kod="JPY" CurrencyCode="JPY">
			<Unit>100</Unit><Isim>JAPON YENİ</Isim><ForexBuying>27.8110</ForexBuying><ForexSelling>27.9951</ForexSelling>
	</Currency>
</Tarih_Date>`;

const TRUNCGIL = { Update_Date: '2026-09-28 10:03:01', USD: { Type: 'Currency', Buying: 41.62, Selling: 41.70 }, GRA: { Type: 'Gold', Name: 'Gram Altın', Buying: '4.381,20', Selling: '4.382,90' }, CEYREKALTIN: { Type: 'Gold', Buying: 7165.5, Selling: 7290 }, TAMALTIN: { Type: 'Gold', Buying: '28.580', Selling: '29.100' }, ONS: { Type: 'Gold', Buying: 3765 } };

// Yeni TEFAS API (Nisan 2026 sonrası): /api/funds/fonGnlBlgSiraliGetir
const TEFAS = { errorCode: null, errorMessage: null, resultList: [
  { tarih: '2026-09-26T00:00:00', fonKodu: 'TTE', fonUnvan: 'İŞ PORTFÖY BIST TEKNOLOJİ AĞIRLIK SINIRLAMALI ENDEKS HİSSE SENEDİ FONU', fiyat: 1.184523, tedPaySayisi: 1, kisiSayisi: 1, portfoyBuyukluk: 1 },
  { tarih: '2026-09-25T00:00:00', fonKodu: 'TTE', fonUnvan: 'eski gün', fiyat: 1.17 },
  { tarih: '2026-09-26T00:00:00', fonKodu: 'AFT', fonUnvan: 'AK PORTFÖY YENİ TEKNOLOJİLER YABANCI HİSSE SENEDİ FONU', fiyat: 0.412398 },
  { tarih: '2026-09-26T00:00:00', fonKodu: '', fonUnvan: 'bozuk', fiyat: 1 },
  { tarih: '2026-09-26T00:00:00', fonKodu: 'XYZ', fonUnvan: 'fiyatsız', fiyat: 0 }
] };

// Eski TEFAS API (BindHistoryInfo) biçimi; ayrıştırıcı ikisini de okur
const TEFAS_LEGACY = { draw: 0, recordsTotal: 3, data: [
  { TARIH: '1790380800000', FONKODU: 'TTE', FONUNVAN: 'İŞ PORTFÖY BIST TEKNOLOJİ AĞIRLIK SINIRLAMALI ENDEKS HİSSE SENEDİ FONU', FIYAT: 1.184523 },
  { TARIH: '1790294400000', FONKODU: 'TTE', FONUNVAN: 'eski gün', FIYAT: 1.17 },
  { TARIH: '1790380800000', FONKODU: 'AFT', FONUNVAN: 'AK PORTFÖY YENİ TEKNOLOJİLER YABANCI HİSSE SENEDİ FONU', FIYAT: 0.412398 },
  { TARIH: '1790380800000', FONKODU: '', FONUNVAN: 'bozuk', FIYAT: 1 },
  { TARIH: '1790380800000', FONKODU: 'XYZ', FONUNVAN: 'fiyatsız', FIYAT: 0 }
] };

const CPI = `<div class="table"><table class="table table-bordered"><tbody>
<tr><td><strong>Ay-Yıl</strong></td><td><strong>TÜFE (Yıllık % Değişim)</strong></td><td><strong>TÜFE (Aylık % Değişim)</strong></td></tr>
<tr><td>08-2026</td><td>31,51</td><td>1,84</td></tr>
<tr><td>07-2026</td><td>31.75</td><td>1.78</td></tr>
<tr><td><p>06-2026</p></td><td><p>32,11</p></td><td><p>0,99</p></td></tr>
<tr><td>05-2026</td><td>32.61</td><td>-0.20</td></tr>
</tbody></table></div>`;

module.exports = { TCMB, TRUNCGIL, TEFAS, TEFAS_LEGACY, CPI };
