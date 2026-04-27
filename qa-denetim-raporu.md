# Finans Takip QA / PWA / Finansal Hesaplama Denetimi

İncelenen kaynak: `index.html`, `sw.js`, `manifest.json`, `tests/date-math.test.js`, `tests/quality-regression.test.js`

Yerel kanıtlar:
- `node tests/date-math.test.js`: 37/37 geçti.
- `node tests/quality-regression.test.js`: 23/23 geçti.
- Tarayıcı elle doğrulama: 27 Nisan 2026 tarihinde 31 Aralık 2026 tarihli gelir eklenince özet net bakiyesi anında `₺1.100,00` oldu.

## 1. Uygulama Envanteri

### Sayfalar
- Özet: `page-ozet`
- Hesaplar: `page-hesaplar`
- Aile: `page-aile`
- İşlemler: `page-islemler`
- Tekrarlayan İşlemler: `page-tekrarlayan`
- Borçlar: `page-borclar`
- Bütçe: `page-butce`, alt sekmeler `limits`, `fund`
- Taksitler: `page-taksitler`
- Portföy: `page-portfoy`
- AI Finans Asistanı: `page-asistan`
- İstatistikler: `page-istatistikler`
- Kural Motoru: `page-kurallar`
- Hedefler: `page-hedefler`
- Rapor/PDF modalı: `App.Report.open/generate/build`
- ICS/Takvim: `App.ICS.exportAll/buildCalendar`
- Bildirimler: `App.Notifications`

### Formlar ve Alanlar
- Hesaplar: `accName`, `accType`, `accBal`, `accOwner`, `accUser`, `accStmtDay`
- Aile: `userName`, `userEmoji`, `userColor`, aktif profil kartları
- İşlemler: `txnAmt`, `txnDate`, `txnCat`, otomatik ortak hesap metni, `txnUser`, `txnNote`, `txnInst`, `txnInstStart`, `fType`, `fCat`, `fAcc`, `fUser`, `fMonth`, `fSearch`, `csvImport`
- Tekrarlayan: `recType`, `recAmt`, `recCat`, `recDay`, `recNote`, `recIsSub`, filtre butonları
- Borçlar: `debtDir`, `debtPerson`, `debtAmt`, `debtDate`, `debtNote`, dinamik `pay_amt_*`, `pay_date_*`
- Bütçe: `bCat`, `bLimit`, `bCarry`, `fundName`, `fundAmt`, `fundMonth`
- Portföy: `portType`, `portQty`, `portCost`, `portLabel`, kur çipleri, `aiProxyUrl`
- AI: `assistantQuestion`, `assistantApiKey`, hazır analiz butonları
- İstatistikler: `statMonth`, `cmpYoY`
- Kurallar: `ruField`, `ruValue`, `ruCat`
- Hedefler: `gName`, `gTarget`, `gEmoji`, dinamik katkı alanları `ca_*`, `cd_*`, `cn_*`

### Butonlar
- Tema: `themeBtn`
- Özet: hızlı gelir/gider, PDF raporu, nominal/reel, bildirim
- Hesaplar: hesap ekle, dinamik hesap sil
- Aile: üye ekle, aktif yap, düzenle, sil
- İşlemler: CSV yükle/indir, gelir/gider tipi, işlem ekle, dinamik işlem sil
- Tekrarlayan: ICS aktar, ekle, filtrele, kaydet/log, abonelik toggle, sil
- Borçlar: borç ekle, ödeme paneli, ödeme ekle/sil, borç sil
- Bütçe: limit kaydet/sil, yıllık fon ekle/katkı/sil
- Taksitler: sadece render/list görünümü
- Portföy: API ayarları, piyasa özeti, kur yenile, varlık ekle/sil, kur çipi düzenle
- AI: sor, API key kaydet/temizle, hazır analizler, gönderim onayı
- İstatistikler: seçili ay PDF raporu
- Kurallar: kural ekle, aktif/pasif, sil
- Hedefler: acil durum fonu oluştur, hedef ekle/sil, katkı ekle/sil
- Alt gezinme: Özet, İşlem, Hesap, Bütçe, Daha

### localStorage Anahtarları
- `pf_t`: işlemler
- `pf_b`: bütçeler
- `pf_g`: hedefler
- `pf_a`: hesaplar
- `pf_r`: tekrarlayan işlemler
- `pf_d`: borçlar
- `pf_s`: ayarlar, kullanıcılar, aktif profil, kurlar, proxy URL, market/assistant son yanıt
- `pf_f`: yıllık fonlar
- `pf_p`: portföy
- `pf_nw`: net servet geçmişi
- `pf_ru`: kurallar
- `pf_bm`: bütçe meta/devir ayarı
- `pf_cpi`: TÜFE verisi
- `pf_invalid_records`: normalize sırasında ayıklanan kayıtlar
- `pf_notif_last`: son bildirim günü
- `pf_direct_ai_key`: DeepSeek API key
- `pf_test`: depolama erişim testi

### Hesaplama / Render / Entegrasyon Fonksiyonları
- Hesaplama: `fmt`, `td`, `tm`, `toNum`, `validDate`, `addMonths`, `statementPeriod`, `monthTotals`, `catTotals`, `last6`, `allTimeTotals`, `rolloverBalance`, `effectiveLimit`, `avgExpense3mo`, `Users.stats`, `sharedStats`, `Installments.active`, `monthlyTotal`, `Portfolio.rateOf`, `Inflation.adjust`, `NetWorth.compute`, `YearlyFund.render` içi aylık fon hesabı, `Notifications.upcomingBills`
- Render: `UI.nav`, `refreshAccSelects`, `refreshUserSelects`, `refreshFilterDropdowns`, `Accounts.renderAll/renderSummary`, `Transactions.renderList/renderRecent/renderSummaryMetrics`, `Recurring.renderList/renderOzet/renderSubSummary`, `Debts.renderAll`, `Budget.renderAll/renderZBB`, `Goals.renderAll/renderEmergencyInfo`, `Users.renderAll/renderFamilyPanel`, `Rules.renderList`, `Charts.refresh/_summary/_donut/_bar/_table/_compare`, `Installments.render`, `Portfolio.render/renderMarketSummary`, `Assistant.render`, `YearlyFund.render`, `WeeklySummary.render`, `NetWorth.render/_renderChart`, `Report.build`
- Import/export/rapor/ICS/bildirim/AI/kur: `Transactions.exportCSV/importCSV/_parseCSV`, `Report.open/generate/generateMonth/build`, `ICS.buildCalendar/exportAll`, `Notifications.toggle/checkDueBills/upcomingBills`, `AI.call/saveKey/confirm`, `Assistant._context/_callDeepSeek`, `Portfolio.refreshRates/_fetchTruncgil/_fetchFrankfurter/_mergeRates/promptManualRates/generateMarketSummary`
- Tarih/ay/para/taksit/borç/bütçe/portföy/net servet: `validDate`, `validMonth`, `fd`, `fmt`, `addMonths`, `statementPeriod`, `reconcileInstallments`, `Debts._rem`, `Budget.rolloverBalance`, `YearlyFund.render`, `Portfolio.render`, `NetWorth.compute/snapshot`

## Kritik Finans Hataları

### FT-001
- ID: FT-001
- Önem derecesi: Kritik
- Etkilenen sayfa/modül: Özet, İşlemler, Hesaplar, Net Servet, Rapor
- Etkilenen alan/ID/fonksiyon: `txnDate`, `App.Transactions.add`, `App.Accounts.adjustBalance`, `App.Accounts.renderSummary`, `App.NetWorth.compute`
- Hata açıklaması: Normal işlemlerde gelecek tarih kontrolü yok; işlem tarihi gelecekte olsa bile hesap bakiyesi hemen değişiyor. Aylık kartlar aynı işlemi bu ay saymıyor, bu nedenle özet içinde net bakiye ve aylık gelir/gider aynı veri modelini temsil etmiyor.
- Nasıl yeniden üretilir: Ortak hesap oluştur, başlangıç bakiyesi `1000` gir; 27 Nisan 2026'da `2026-12-31` tarihli `100` TL gelir ekle; Özet'e dön.
- Beklenen sonuç: Gelecek tarihli işlem, vadesi gelene kadar hesap bakiyesini ve net serveti değiştirmemeli veya ekranda açık şekilde "planlı/gelecek" olarak ayrılmalı.
- Mevcut/olası sonuç: Net bakiye `₺1.100,00` olurken "Bu Ay Gelir" `₺0,00` kalıyor. Nakit pozisyonu olduğundan yüksek görünür.
- Finansal etkisi: Kullanıcı gelecekteki gelir/giderleri bugünkü nakit gibi görebilir; bütçe, net servet ve finansal kararlar yanlışlaşır.
- Önerilen düzeltme: `Transactions.add` içinde normal işlem için `date <= td()` şartıyla bakiye uygula; gelecekteki işlemlere `balanceApplied:false` ekle ve `reconcileScheduledTransactions` benzeri tekil/idempotent bir mutabakat fonksiyonu çalıştır.
- Test senaryosu: Bugünden ileri tarihli gelir/gider ekle; özet net bakiye değişmemeli; gün tarihi işlem tarihine ilerletilince yalnız bir kez uygulanmalı; silme hem uygulanmış hem uygulanmamış durumları doğru geri almalı.
- Kodda bakılması gereken yer: `index.html:1059`, `index.html:1086`, `index.html:1089`, `index.html:1101`, `index.html:1041`, `index.html:2028`

### FT-002
- ID: FT-002
- Önem derecesi: Kritik
- Etkilenen sayfa/modül: İşlemler, Hesaplar, localStorage
- Etkilenen alan/ID/fonksiyon: `txnAmt`, `recAmt`, `debtAmt`, `bLimit`, `fundAmt`, `portQty`, `App.Transactions.add`, `App.Accounts.add`
- Hata açıklaması: Birçok tutar alanı `parseFloat` ile okunuyor ve `Number.isFinite` kontrolü yapılmıyor. `1e309` gibi değerler `Infinity` üretir; işlem ve hesap bakiyesi bozulabilir.
- Nasıl yeniden üretilir: `txnAmt` veya `accBal` alanına `1e309` girip kayıt yap.
- Beklenen sonuç: Sadece sonlu, makul aralıkta, iki ondalık hassasiyetli tutarlar kabul edilmeli.
- Mevcut/olası sonuç: `Infinity` hesap bakiyesine uygulanır; JSON kaydında `Infinity` `null` değerine dönüşerek localStorage verisini bozabilir.
- Finansal etkisi: Bakiye, net servet, rapor ve grafikler anlamsız veya sıfırlanmış hale gelebilir.
- Önerilen düzeltme: Ortak `parseMoney(input,{min,max})` fonksiyonu kullan; `Number.isFinite(n)`, `n > 0`, `n <= 1e12` ve `Math.round(n*100)/100` şartlarını tüm para alanlarına uygula.
- Test senaryosu: `0`, `-1`, `1e309`, `Infinity`, `NaN`, `1,25`, `1.25`, `9999999999999999` değerleri tüm para alanlarında denenmeli.
- Kodda bakılması gereken yer: `index.html:998`, `index.html:1060`, `index.html:1214`, `index.html:1271`, `index.html:1318`, `index.html:1370`, `index.html:1713`, `index.html:1941`

### FT-003
- ID: FT-003
- Önem derecesi: Yüksek
- Etkilenen sayfa/modül: İşlemler, Hesaplar, CSV import/export
- Etkilenen alan/ID/fonksiyon: `csvImport`, `App.Transactions.exportCSV`, `App.Transactions.importCSV`
- Hata açıklaması: CSV export `Hesap` kolonunu yazıyor, import ise `Hesap` kolonunu hiç okumuyor ve bütün işlemleri ilk ortak hesaba atıyor.
- Nasıl yeniden üretilir: Birden fazla ortak/kişisel hesap içeren veri oluştur; CSV export al; aynı CSV'yi yeni kurulumda import et.
- Beklenen sonuç: Hesap adı/ID eşleşmeli; bulunamazsa kullanıcıya eşleme ekranı veya "hesapsız import" uyarısı verilmelidir.
- Mevcut/olası sonuç: Tüm hareketler ortak hesaba gider; hesap bazlı rapor, filtre, bakiye ve net servet sapar. Duplicate imzası da import edilen hesap ortak hesap olduğu için farklı davranır.
- Finansal etkisi: Banka/kart ayrımı kaybolur; hesap bazlı nakit ve borç takibi hatalı olur.
- Önerilen düzeltme: Header'da `hesap` kolonunu oku; `accounts.find(a => a.name === csvAccountName)` ile eşle; aynı isimli hesaplarda kullanıcıdan seçim iste; duplicate imzasında kaynak hesap bilgisini kullan.
- Test senaryosu: Banka ve kart hesaplarından export/import yap; işlem sayısı, hesap dağılımı ve toplam bakiye birebir korunmalı.
- Kodda bakılması gereken yer: `index.html:1162`, `index.html:1179`, `index.html:1193`, `index.html:1195`

### FT-004
- ID: FT-004
- Önem derecesi: Yüksek
- Etkilenen sayfa/modül: İşlemler, Aile, Hesaplar
- Etkilenen alan/ID/fonksiyon: Otomatik ortak hesap alanı, `txnUser`, `App.Accounts.sharedAccount`, `App.Transactions.add`
- Hata açıklaması: İşlem ekleme ekranında gerçek hesap seçimi yok; tüm gelir/giderler ilk ortak hesaba yönleniyor. Kişisel hesap oluşturulabiliyor fakat işlem yapılamıyor.
- Nasıl yeniden üretilir: Kişisel kullanıcı ve kişisel hesap oluştur; İşlemler sayfasında bu hesabı seçmeye çalış.
- Beklenen sonuç: Kullanıcı işlem hesabını seçebilmeli; kişisel hesap yalnız yetkili/ilgili kullanıcıyla veya açık uyarıyla kullanılmalı.
- Mevcut/olası sonuç: Kişisel hesaplar sadece statik bakiye kartı gibi kalır; yeni işlemler ortak hesaba gider.
- Finansal etkisi: Kişi bazlı cüzdan, aile paneli, hesap filtreleri ve net servet hesapları yanlışlaşır.
- Önerilen düzeltme: `txnAccount` select alanı ekle; varsayılanı aktif kullanıcının kişisel hesabı veya ortak hesap yap; hesap sahibi/aktif profil uyumsuzluğunda uyarı göster.
- Test senaryosu: Kişisel hesapta gelir/gider ekle; ortak hesap bakiyesi değişmemeli, kişisel hesap ve aile paneli değişmeli.
- Kodda bakılması gereken yer: `index.html:519`, `index.html:1024`, `index.html:1068`, `index.html:1069`

### FT-005
- ID: FT-005
- Önem derecesi: Yüksek
- Etkilenen sayfa/modül: Hesaplar, İşlemler, Taksitler, localStorage
- Etkilenen alan/ID/fonksiyon: `App.Accounts.adjustBalance`, `S.saveAccounts`, `S.saveTxns`, `App.Transactions.reconcileInstallments`
- Hata açıklaması: Hesap bakiyesi işlem geçmişinden türetilmiyor; kayıt anında mutasyona uğrayan ayrı bir alan olarak saklanıyor. localStorage bozulması, import, manuel hesap bakiyesi, silme ve geçmiş veri normalize süreçlerinde drift oluşabilir.
- Nasıl yeniden üretilir: Başlangıç bakiyesi olan hesapta işlem ekle/sil/import et; localStorage'da `pf_a.balance` veya `pf_t` bozulduğunda yeniden üretim yapılamaz.
- Beklenen sonuç: Bakiye `openingBalance + uygulanmış işlemler` formülüyle yeniden üretilebilir olmalı; drift tespit edilmelidir.
- Mevcut/olası sonuç: Hesap kartı ile işlem geçmişi birbirini kanıtlamaz. Silinen/taşınan/bozulan kayıtlar bakiye farkı bırakabilir.
- Finansal etkisi: Net bakiye ve net servet kalıcı olarak hatalı kalabilir.
- Önerilen düzeltme: Hesap modeline `openingBalance` ekle; `balance` yerine hesaplanan `currentBalance` kullan; uygulama açılışında mutabakat raporu üret.
- Test senaryosu: 1000 açılış + 250 gelir + 100 gider + silme + reload; hesaplanan bakiye her adımda beklenen değere eşit olmalı.
- Kodda bakılması gereken yer: `index.html:806`, `index.html:1004`, `index.html:1021`, `index.html:1089`, `index.html:1115`

## Diğer Bulgular

### FT-006
- ID: FT-006
- Önem derecesi: Yüksek
- Etkilenen sayfa/modül: AI Finans Asistanı, Güvenlik
- Etkilenen alan/ID/fonksiyon: `assistantApiKey`, `pf_direct_ai_key`, `App.AI.saveKey`, `App.AI.call`
- Hata açıklaması: API key doğrudan localStorage'a yazılıyor ve tarayıcıdan DeepSeek API'ye gönderiliyor.
- Nasıl yeniden üretilir: AI sayfasında API key girip Kaydet'e bas; anahtar `pf_direct_ai_key` olarak saklanır.
- Beklenen sonuç: API key istemcide kalıcı saklanmamalı; sadece güvenli backend/proxy kullanılmalı veya session-only tutulmalı.
- Mevcut/olası sonuç: XSS, tarayıcı eklentisi, ortak cihaz veya localStorage dışa aktarımıyla key sızabilir.
- Finansal etkisi: Doğrudan finans hesabı değil; fakat kullanıcı verisinin üçüncü taraf AI'ya gönderilmesi ve API maliyeti doğurabilir.
- Önerilen düzeltme: `assistantApiKey` akışını kaldır; sadece `aiProxyUrl` kabul et; proxy tarafında rate limit ve secret yönetimi uygula.
- Test senaryosu: Key kaydetme sonrası localStorage'da secret bulunmamalı; AI çağrısı yalnız proxy üzerinden gitmeli.
- Kodda bakılması gereken yer: `index.html:1639`, `index.html:1641`, `index.html:1646`, `index.html:1650`, `index.html:1653`

### FT-007
- ID: FT-007
- Önem derecesi: Yüksek
- Etkilenen sayfa/modül: AI Finans Asistanı, Portföy AI Özeti
- Etkilenen alan/ID/fonksiyon: `App.AI.confirm`, `App.Assistant._context`, `App.Assistant._callDeepSeek`, `App.Portfolio.generateMarketSummary`
- Hata açıklaması: Onay modalı yalnız özet sayıları gösteriyor; asıl payload içinde hesap bakiyeleri, bütçeler, borçlar, portföy ve büyük işlemler gönderiliyor. Kullanıcı hangi verinin gönderildiğini tam görmüyor.
- Nasıl yeniden üretilir: Remote AI aktifken hazır analiz başlat; modalda özet görünür, fakat payload `JSON.stringify(ctx)` ile daha geniş veri gönderir.
- Beklenen sonuç: Modal, gönderilecek tam veri kategorilerini ve mümkünse JSON önizlemesini göstermeli; minimizasyon uygulanmalı.
- Mevcut/olası sonuç: Kullanıcı onayı eksik bilgilendirilmiş olur.
- Finansal etkisi: Hassas finansal veri üçüncü tarafa gereğinden fazla aktarılabilir.
- Önerilen düzeltme: `confirm` içine payload önizlemesi koy; kişi/hesap bazlı ham değerleri maskelenebilir veya kullanıcı seçimine bağlanabilir hale getir.
- Test senaryosu: Remote AI öncesi modalda gönderilen tüm alan adları görünmeli; iptal edildiğinde fetch yapılmamalı.
- Kodda bakılması gereken yer: `index.html:1657`, `index.html:1846`, `index.html:1914`, `index.html:1916`, `index.html:1774`

### FT-008
- ID: FT-008
- Önem derecesi: Orta
- Etkilenen sayfa/modül: İşlemler, Veri doğrulama
- Etkilenen alan/ID/fonksiyon: `txnDate`, `debtDate`, `pay_date_*`, `App.Transactions.add`, `App.Debts.add`
- Hata açıklaması: Bazı kayıt akışları sadece boş tarih kontrolü yapıyor; `validDate()` kullanılmıyor. HTML date alanı normal UI'da yardımcı olsa da import, autofill veya DOM manipülasyonu geçersiz tarih üretebilir.
- Nasıl yeniden üretilir: DOM/otomasyon ile `txnDate` değerini geçersiz formatta set edip kaydet.
- Beklenen sonuç: Tüm tarih alanları `validDate` ile doğrulanmalı.
- Mevcut/olası sonuç: `fd()` raporda `-` gösterir; ay filtreleri, sıralama ve rapor kırılımları bozulabilir.
- Finansal etkisi: Yanlış ayda rapor, bütçe ve grafik sonuçları oluşabilir.
- Önerilen düzeltme: `if(!validDate(date))` kontrolünü transaction, debt, payment, goal contribution ve installment start alanlarına uygula.
- Test senaryosu: `2026-02-30`, `abcd`, boş ve geçerli tarih kombinasyonları denenmeli.
- Kodda bakılması gereken yer: `index.html:1067`, `index.html:1272`, `index.html:1279`, `index.html:1378`

### FT-009
- ID: FT-009
- Önem derecesi: Orta
- Etkilenen sayfa/modül: Tekrarlayan İşlemler, Özet, Bildirim, ICS
- Etkilenen alan/ID/fonksiyon: `recDay`, `App.Recurring.log`, `App.Recurring.renderOzet`, `App.Notifications.upcomingBills`
- Hata açıklaması: Tekrarlayan işlem "Kaydet" butonu planlanan güne göre değil bugünün tarihiyle işlem oluşturuyor ve aynı ay için mükerrer kayıt engeli yok.
- Nasıl yeniden üretilir: Ayın 15'i için fatura ekle; aynı ayda Kaydet'e iki kez bas.
- Beklenen sonuç: İlgili ayın vade tarihiyle tek kayıt oluşmalı; aynı recurring ID + ay için ikinci kayıt engellenmeli veya açık onay istemeli.
- Mevcut/olası sonuç: Aynı fatura birden fazla gider yazılabilir; tarih bugüne çekilir.
- Finansal etkisi: Aylık gider, bütçe ve nakit bakiye fazla düşer.
- Önerilen düzeltme: Recurring işlem kayıtlarına `recurringId` ve `period` ekle; `log(id, period)` içinde duplicate kontrolü yap; tarih `YYYY-MM-min(day,lastOfMonth)` olsun.
- Test senaryosu: Aynı faturayı aynı ay iki kez kaydet; ikinci işlem engellenmeli. 31 Şubat örneği son güne düşmeli.
- Kodda bakılması gereken yer: `index.html:1227`, `index.html:1230`, `index.html:1257`, `index.html:2230`

### FT-010
- ID: FT-010
- Önem derecesi: Orta
- Etkilenen sayfa/modül: Borçlar, Net Servet
- Etkilenen alan/ID/fonksiyon: `debtAmt`, ödeme tutarı, `App.Debts.addPayment`, `App.Debts._rem`, `App.NetWorth.compute`
- Hata açıklaması: Fazla ödeme engellenmiyor; kalan tutar sıfıra clamp ediliyor ve fazla ödeme ayrı alacak/borç olarak izlenmiyor.
- Nasıl yeniden üretilir: 100 TL borç ekle; 150 TL ödeme gir.
- Beklenen sonuç: Fazla ödeme engellenmeli veya 50 TL karşı alacak/borç olarak açıkça kaydedilmeli.
- Mevcut/olası sonuç: Borç kapandı görünür, fazla 50 TL finansal modelden kaybolur.
- Finansal etkisi: Net borç/alacak ve net servet eksik veya yanlış hesaplanır.
- Önerilen düzeltme: `addPayment` içinde `amt <= remaining` kontrolü ekle; fazla ödeme için kullanıcıya mahsup/karşı kayıt seçeneği sun.
- Test senaryosu: Kısmi ödeme, tam ödeme, fazla ödeme ve ödeme silme sonrası `settled`, kalan ve net servet doğrulanmalı.
- Kodda bakılması gereken yer: `index.html:1278`, `index.html:1282`, `index.html:1293`, `index.html:2032`

### FT-011
- ID: FT-011
- Önem derecesi: Orta
- Etkilenen sayfa/modül: İstatistikler
- Etkilenen alan/ID/fonksiyon: `statMonth`, `cmpYoY`, `App.Charts.refresh`, `App.Transactions.last6`
- Hata açıklaması: İstatistik sayfasında seçilen ay özet/donut/karşılaştırmada kullanılıyor; ancak 6 aylık gelir-gider bar grafiği her zaman cari aya göre üretiliyor.
- Nasıl yeniden üretilir: `statMonth` değerini geçmiş bir aya al; bar grafiği cari aydan geriye 6 ay gösterir.
- Beklenen sonuç: Seçilen ay merkezli son 6 ay çizilmeli.
- Mevcut/olası sonuç: Aynı ekranda KPI'lar seçilen ayı, bar grafik cari ayı anlatır.
- Finansal etkisi: Trend yorumu yanlış yapılabilir.
- Önerilen düzeltme: `last6(baseMonth)` parametresi ekle ve `Charts.refresh` içinden `last6(month)` çağır.
- Test senaryosu: 2025-12 seçildiğinde bar grafikte 2025-07..2025-12 görünmeli.
- Kodda bakılması gereken yer: `index.html:1127`, `index.html:1550`, `index.html:1601`

### FT-012
- ID: FT-012
- Önem derecesi: Orta
- Etkilenen sayfa/modül: Portföy, Net Servet
- Etkilenen alan/ID/fonksiyon: `portType=FUND`, `portQty`, `portCost`, `App.Portfolio.render`, `rateOf`, kur çipleri
- Hata açıklaması: Fon/Hisse için varsayılan kur `1` olsa da kur çiplerinde FUND düzenleme yok; değer `qty * 1` olarak kalabiliyor, maliyet ve güncel değer mantığı fonlar için eksik.
- Nasıl yeniden üretilir: Fon/Hisse ekle; güncel birim fiyatı girecek alan bulma.
- Beklenen sonuç: Fon/hisse için güncel fiyat veya manuel değer alanı olmalı.
- Mevcut/olası sonuç: Portföy toplamı ve net servet fon/hisse varlıklarında yanlış görünür.
- Finansal etkisi: Net servet ciddi oranda eksik/fazla hesaplanabilir.
- Önerilen düzeltme: `portCurrentPrice` alanı veya FUND için düzenlenebilir rate çipi ekle; `cost` sadece maliyet, `rate` güncel değer olsun.
- Test senaryosu: 10 adet fon, maliyet 100, güncel fiyat 120; değer 1200, kar 200 görünmeli.
- Kodda bakılması gereken yer: `index.html:783`, `index.html:1671`, `index.html:1795`, `index.html:1802`

### FT-013
- ID: FT-013
- Önem derecesi: Orta
- Etkilenen sayfa/modül: Bildirimler
- Etkilenen alan/ID/fonksiyon: `notifBtn`, `App.Notifications.upcomingBills`, `checkDueBills`
- Hata açıklaması: Bildirimler yalnız tekrarlayan giderleri kapsıyor; taksitler, yıllık fonlar ve borç vadeleri bildirim tarafına dahil değil.
- Nasıl yeniden üretilir: Gelecek 3 gün içinde taksit veya borç vadesi oluştur; bildirim kontrolü yap.
- Beklenen sonuç: Yaklaşan fatura/taksit/yıllık fon/borç birlikte bildirim adayına girmeli.
- Mevcut/olası sonuç: Kullanıcı önemli ödeme vadesini kaçırabilir.
- Finansal etkisi: Gecikme faizi, kredi kartı gecikmesi veya borç ödeme riski doğar.
- Önerilen düzeltme: `upcomingBills` yerine `upcomingObligations` yaz; recurring, due installments, yearly fund due month/day ve unsettled debt dueDate kaynaklarını birleştir.
- Test senaryosu: 0, 1, 3, 4 gün sonraki her yükümlülük için bildirim var/yok sınırları test edilmeli.
- Kodda bakılması gereken yer: `index.html:2230`, `index.html:2237`, `index.html:2241`

### FT-014
- ID: FT-014
- Önem derecesi: Orta
- Etkilenen sayfa/modül: ICS/Takvim
- Etkilenen alan/ID/fonksiyon: `App.ICS.buildCalendar`, `_event`
- Hata açıklaması: Tekrarlayan işlem UID'leri `rec-id-i` şeklinde üretiliyor. İhracat ayı değiştiğinde aynı takvim olayının `i` değeri değişir ve takvim uygulamaları aynı ödemeyi yeni etkinlik gibi içe alabilir.
- Nasıl yeniden üretilir: Nisan ayında 12 aylık ICS al; Mayıs ayında tekrar al; Haziran vadeli aynı recurring etkinliğinin UID'si değişir.
- Beklenen sonuç: UID event tarihine bağlı stabil olmalı: `rec-${id}-${YYYYMMDD}`.
- Mevcut/olası sonuç: Tekrarlı importlarda takvimde mükerrer etkinlik birikir.
- Finansal etkisi: Ödeme takibi karışır, çift ödeme algısı oluşabilir.
- Önerilen düzeltme: UID'leri kaynak ID + kesin tarih ile üret; ayrıca RFC 5545 için uzun satır folding uygulamayı değerlendir.
- Test senaryosu: Ardışık iki ay export edilen aynı etkinlik aynı UID'ye sahip olmalı.
- Kodda bakılması gereken yer: `index.html:2183`, `index.html:2197`, `index.html:2200`, `index.html:2201`

### FT-015
- ID: FT-015
- Önem derecesi: Düşük
- Etkilenen sayfa/modül: localStorage, Normalize
- Etkilenen alan/ID/fonksiyon: `S.g`, `S.normalize`, `pf_invalid_records`
- Hata açıklaması: Bozuk JSON parse edilemezse fallback veri kullanılıyor; kullanıcıya hangi anahtarın bozuk olduğu gösterilmiyor ve otomatik kurtarma/import yolu yok.
- Nasıl yeniden üretilir: `pf_t` değerini geçersiz JSON yapıp uygulamayı aç.
- Beklenen sonuç: Uygulama açılmalı ama kullanıcıya veri kurtarma/onarım mesajı ve yedek dışa aktarma seçeneği verilmeli.
- Mevcut/olası sonuç: İlgili veri görünmez; kullanıcı veri kaybı yaşadığını anlamayabilir.
- Finansal etkisi: İşlem geçmişi görünmediği için bakiye/rapor güvenilirliği kaybolur.
- Önerilen düzeltme: `g(k,fb)` catch içinde `pf_invalid_records` benzeri anahtar bazlı hata kaydı ve UI uyarısı üret; eski ham değeri `pf_corrupt_backup_*` olarak sakla.
- Test senaryosu: Her localStorage anahtarı bozuk JSON ile açılış testi; uygulama çökmeden net uyarı vermeli.
- Kodda bakılması gereken yer: `index.html:784`, `index.html:795`, `index.html:816`, `index.html:819`

## Sayfa Bazlı Kapsama Notları

- Özet: Net bakiye hesap bakiyelerinden geliyor; tüm zaman gelir/gider işlem geçmişinden geliyor. Bu iki kaynak gelecek tarih ve drift nedeniyle ayrışabiliyor.
- Hesaplar: Boş ad engelleniyor, negatif başlangıç bakiyesi kabul ediliyor. Kredi kartı ekstre günü 1-31 doğrulanıyor ama hesap seçimi işlem ekranında yok.
- Aile: Boş ad engelleniyor; aktif kullanıcı silinince yeni aktif kullanıcı atanıyor. Aynı isimli kullanıcılar CSV import'ta ilk eşleşmeye bağlanıyor.
- İşlemler: Tutar validasyonu sonlu sayı kontrolünden yoksun; tarih validasyonu eksik; taksit bölme testlerle doğrulanmış; son taksit farkı kapatılıyor.
- Tekrarlayan: Gün 1-31 sınırında; kısa aylar özet/bildirim/ICS tarafında clamp ediliyor; manuel kayıtta duplicate engeli yok.
- Borçlar: Net alacak/borç yönü doğru; fazla ödeme kayboluyor; borç hareketleri hesap bakiyesini etkilemiyor ve bu ekran içinde yeterince açık değil.
- Bütçe: Limit sıfır/negatif engelleniyor; gider toplamı yalnız giderlerden geliyor; devir hesabı cari tarihe göre son 6 ayı kullanıyor.
- Taksitler: Taksit başlangıcı geçmişteyse vadesi gelenler bakiyeye işleniyor; `balanceApplied` idempotent tasarlanmış ve testte geçiyor.
- Portföy: Döviz/altın kurları API veya manuel destekli; fon/hisse güncel fiyat akışı eksik.
- AI: Yerel fallback var; remote gönderimde onay var ama payload özeti eksik; API key localStorage riski var.
- İstatistikler: Chart instance destroy ediliyor; seçilen ay ile bar grafiğin baz ayı karışıyor.
- Kurallar: Boş değer engelleniyor; ilk eşleşen aktif kural kazanıyor; Türkçe case-folding locale-aware değil (`toLowerCase`, `toLocaleLowerCase('tr-TR')` değil).
- Hedefler: Hedef/katkı doğrulaması pozitif tutar bekliyor; katkılar hesap bakiyesini etkilemiyor.
- Rapor/PDF: Aylık toplamlar işlem listesiyle aynı kaynakta; aktif profil sadece etiket olarak yazıyor, raporu filtrelemiyor.
- ICS: Recurring, taksit, yıllık fon ve borç ekleniyor; UID stabilitesi sorunu var.
- Bildirimler: Tarayıcı desteği/izin reddi akışı temel düzeyde var; kapsam yalnız recurring gider.
- Güvenlik: Çoğu kullanıcı metni `esc()` ile basılıyor; CSV formül enjeksiyonu export'ta azaltılmış; API key ve AI veri minimizasyonu ana risk.
- Performans: Liste 300 işlemle sınırlandırılmış ve mesaj var; grafik/rapor hâlâ tüm `S.txns()` üzerinde çalışıyor, 10.000 kayıt için render gecikmesi beklenir.

## Düzeltme Sonrası Regresyon Listesi

1. Ortak hesap + gelir + gider + silme + reload ile bakiye mutabakatı.
2. Gelecek tarihli normal gelir/giderin bakiyeyi vade gününe kadar değiştirmemesi.
3. `10.000 / 3` taksit toplamının tam 10.000 olması ve vadesi gelmiş taksitlerin yalnız bir kez uygulanması.
4. Kredi kartı ekstre günü 15 için 14/15/16 tarihli işlemlerin dönem etiketi.
5. Kişisel hesap seçilerek işlem girme ve aile paneli ayrımı.
6. CSV export/import sonrası hesap, üye, kategori, not, Türkçe karakter, tırnak, virgül, satır sonu ve duplicate kontrolü.
7. `Yemek ' test <script>` kategorili import sonrası liste, silme, rapor ve CSV export güvenliği.
8. Borç kısmi/tam/fazla ödeme ve ödeme silme sonrası net borç + net servet.
9. Hedef katkı ekle/sil sonrası hedef durumu ve hesap bakiyesi beklentisinin UI'da açıklanması.
10. Devirli bütçe için geçmiş 6 ay manuel doğrulama.
11. USD, altın, fon/hisse için manuel/API kur ve net servet.
12. Seçili ay raporu ile ekrandaki istatistik toplamları.
13. ICS UID stabilitesi, Türkçe karakter, 29/30/31 ve yıl geçişi.
14. Bildirim izni ver/reddet; recurring, taksit, fon ve borç kapsamı.
15. AI proxy yokken yerel analiz; proxy varken gönderim önizlemesi; hata fallback.
16. 360px, iPhone 11/13, tablet ve desktop görünümlerinde tüm sayfalar, bottom-nav/safe-area ve grafik taşmaları.
17. Light/dark tema geçişinde Chart renkleri ve modal kontrastı.
18. 1.000/5.000/10.000 işlemde filtre, liste, grafik, rapor ve localStorage kota uyarısı.
