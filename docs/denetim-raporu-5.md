# Aile Kasası — Yayın Öncesi Kalite Denetimi (#5)

**Tarih:** 2026-10-05
**Başlangıç:** `main` f9bba33, sürüm 2026.10.04.8 (779 otomatik kontrol, tümü geçiyordu)
**Sonuç:** `claude/lucid-edison-e0skrj`, sürüm **2026.10.05.1** (önbellek v35)
**Karar:** **Şu koşullarla hazır** (bkz. §10)

Bu denetim #4'ün üstüne yapıldı. #4'te doğrulanan akışlar yeniden çalıştırıldı. Asıl odak, #4'te sınanmamış durumlardı: düzenleme sonrası tutarlılık, banka mesajlarının sıra dışı biçimleri, geçmiş ay raporları, hatalı dosyalar, kayıp telefon ve izin reddi.

**Kanıt türleri:**

| Kısaltma | Anlamı |
|---|---|
| **K** | Kod incelemesi |
| **O** | Otomatik test (Playwright + gerçek `index.html`, yerel `wrangler dev`) |
| **T** | Tarayıcı denemesi ve ekran görüntüsü (telefon boyutu 390×844) |
| **C** | Gerçek cihaz. **Yapılamadı:** iPhone, gerçek banka mesajı, gerçek Gmail ve canlı Cloudflare kullanılmadı. |

Bütün test verileri kurmacadır ("Deniz", "Ece", "ALI VELI"…). Canlı kasaya, bankaya, Gmail'e ya da üretim veritabanına hiçbir istek gönderilmedi. Sunucu testleri yalnız bu makinedeki geçici `wrangler dev` sunucusunda çalıştı.

## 1. Kapsam ve doğrulama tablosu

| # | Alan | Ne sınandı | Kanıt | Sonuç |
|---|---|---|---|---|
| 1 | Başlangıç / yayın kanalları | main sürümü, Cloudflare yüklemesi, GitHub Pages | K, O | Pages kararı → G2 |
| 2 | Veri koruma | Hatalı dosya yüklemede kayıt/bakiye değişmez; depolama hatasında SMS silinmez; hesap/üye silme tutarları korur | O (qc-files, qc-finance2, qc-bank 11) | ✓ |
| 3 | Bağımsız hesap (10.000 / 1.000 / 400) | #4 senaryoları + düzenleme: hesabı, türü, tarihi değiştirme; transfer tarihini ileri alma | O (qc-finance, qc-finance2) | ✓ |
| 4 | Kart, taksit, tarih | Tek taksidin tutar/tarihini düzenleme, planı silme, gün geçince taksidin bir kez işlenmesi, saat dilimi (İstanbul gece yarısı) | O (qc-finance2, qc-cards, qc-bank) | ✓ |
| 5 | Tekrarlayan, maaş | Aynı ay iki "MAAŞ" mesajı (maaş + ikramiye) | O (qc-bank 12) | G5 düzeltildi |
| 5 | Bütçe | Bu ay ilk kez konan limit; limit değişimi; geçmiş ay uyarısı ve tablo | O (qc-finance2 6) | G6 düzeltildi |
| 5 | Borç, hedef, portföy, enflasyon | Portföy satışı gelir değil aktarım; yıllık fon katkısı paradan düşmez | O, K | ✓ (G7 metin) |
| 6 | Banka SMS / e-posta | Faiz, aidat, provizyon, döviz, ATM, giden/gelen FAST, kendi hesaplar arası virman, taksit, iade, limit bilgisi, tarihsiz mesaj, gelecek tarih | O (qc-bank 12–14, bank-sms 62) | G3, G4, G8, G10 düzeltildi |
| 6 | Gmail betiği | 2 günde 50'den çok e-posta, gönderim hatası, tekrar | O (gmail-script) | G9 düzeltildi |
| 7 | Ekstre, fiş, CSV, yedek | Bozuk PDF, boş/başlıklı CSV, .xls, .docx, resim, 16 MB; fiş toplamı (indirim, ara toplam, nakit, para üstü, KDV) | O (qc-files, receipt-*, statement-import), T | ✓ |
| 8 | İki/üç cihaz eşitleme | #4 senaryoları + **kayıp telefon**: kasayı sil, yeni kod, eski kodun erişimi biter | O (qc-sync 8) | ✓ (sınır: §6) |
| 9 | Gerçek ekran arayüzü | 144 ekranlık tarama (ui-scan + qc-visual), bildirim kartı önce/sonra | O, T | G11 düzeltildi |
| 10 | Güvenlik, performans, PWA | Sunucu giriş sınırları (gövde 2 MB, SMS 1.000, e-posta 120.000 karakter, bekleyen 300, cihaz 10), XSS taraması, önbellek sürümü | K, O (worker-api, xss-scan) | ✓ (K2 önerisi sürüyor) |
| 11 | Bulgular | §2 | | |
| 12 | Teslim | §3–§10 | | |

## 2. Bulunan ve düzeltilen sorunlar

Önem: **P0** veri kaybı/güvenlik · **P1** yanlış para · **P2** yanıltıcı ya da eksik · **P3** küçük.

| No | Önem | Sorun ve nasıl görülür | Kök neden | Düzeltme | Test |
|---|---|---|---|---|---|
| G1 | P2 | Depo herkese açık; 6 test dosyasında kullanıcının gerçek adı vardı. | Testlerde gerçek ad kullanılmış. | Kurmaca ad ("Deniz"). Eski commit'lerde ad hâlâ duruyor (geçmiş yeniden yazılmadı). | grep |
| G3 | **P1** | "Kartınıza 120,50 TL gecikme faizi yansıtılmıştır" / "yıllık kart aidatı yansıtılmıştır" **gelir** okunuyordu. Kart borcu azalmış, gelir artmış görünüyordu. | "kartınıza" sözcüğü gelir sayılıyordu. | Faiz, aidat, ücret, masraf, komisyon, BSMV/KKDF + "yansıtıldı/tahsil edildi/kesildi" → gider. | qc-bank 13 |
| G4 | P2 | Otel/akaryakıt **provizyonu** kesin harcama gibi ekleniyordu. "Provizyon iptal" mesajı ise **iade** sayılıyordu. | Provizyon ayrı ele alınmıyordu. | Provizyon onay kuyruğuna düşer ("kesin tutar farklı olabilir"). İptali yok sayılır. | qc-bank 13 |
| G5 | **P1** | Aynı ay iki "MAAŞ" mesajı (46.500 maaş, sonra 30.000 ikramiye): ikincisi birincinin **üstüne yazıyordu**. Banka 76.500 yerine 30.000 artmış görünüyordu. | Planlı maaşla eşleşen kayıt yeniden eşleşmeye açık kalıyordu. | Eşleşen kayıt "SMS'ten" işaretlenir. İkinci mesaj ayrı kayıt olur. | qc-bank 12 |
| G6 | P2 | Bu ay Market'e 1.000 TL limit konunca **geçen ayın** 1.500 TL harcaması için "Market bütçesi aşıldı" uyarısı ve tabloda "Aşıldı" çıkıyordu. | Geçmiş ayda limit yoksa bugünkü limit kullanılıyordu. | Limit konmadan önceki aylar limitsiz sayılır. Limit 2.000 → 1.000 değişince geçmiş ay 2.000 ile değerlendirilir. | qc-finance2 6 (eski kodda kırmızı) |
| G7 | P3 | Yıllık fon "katkı"sının hesaptan para düşürmediği yazmıyordu; "ayırdım" sanılabilirdi. | Açıklama eksikti. | Açıklama metni: "yalnız takip içindir; ödediğinizde Ödendi ile gider kaydedin". | T |
| G8 | P2 | "Vadesiz hesabınızdan Vadeli hesabınıza 10.000 TL virman" tek mesajı **10.000 TL gider** olarak kendiliğinden ekleniyordu. | Kendi hesaplar arası para tek mesajda tanınmıyordu. | Bu mesaj onaya düşer; "↔ Aktarım (gider değil)" seçili gelir. Tek taraflı giden/gelen mesajlar eskisi gibi eşleşip transfere çevrilir. | qc-bank 14 |
| G9 | P2 | Gmail betiği hep en yeni 50 e-postaya bakıyordu. 2 günde 50'den çok banka e-postası (kampanyalar dahil) gelirse 51. ve sonrakiler **hiç okunmuyordu**. | Sayfalama yoktu. | Sonraki sayfalar da okunur. Bir çalışmada en çok 100 yeni e-posta gönderilir, kalanı 5 dakika sonra. 260 e-posta 3 çalışmada eksiksiz gider. | gmail-script |
| G10 | P3 | Giden FAST'te alıcı adı "FAST ALI VELI" yazılıyordu. | "FAST/EFT/ile" sözcükleri ayıklanmıyordu. | Bu sözcükler atılır. | qc-bank 14 |
| G11 | P2 | Bildirim izni daha önce reddedilmiş telefonda "Bildirimleri Aç" düğmesi **hiçbir şey söylemeden** çalışmıyordu. | Tarayıcı reddedilmiş izni bir daha sormaz; uygulama bunu açıklamıyordu. | Kart ve düğme, iznin telefon ayarlarından nasıl açılacağını söyler. | qc-notify (eski kodda kırmızı) |

**Doğrulandı, sorun bulunmadı:** işlemin hesabını/türünü/tarihini düzenleme; tek taksit düzenleme ve plan silme; gün geçince taksidin bir kez işlenmesi; transfer tarihini ileri alma; hesap ve üye silme; döviz harcamasının onaya düşmesi (TL karşılığı istenir); ATM'nin onaya düşmesi; 6 taksitli harcama; kart borcu ödemesi; iade; limit bilgisinin yok sayılması; İstanbul saatiyle gece yarısında tarih; hatalı dosyalarda anlaşılır hata; fiş toplamı; kayıp telefon akışı.

**Bilinen küçük sınırlar (P3, düzeltilmedi):**
- Garanti'nin "kartınızdan 05/10/26 BIM MAGAZALARI 312,50 TL" biçiminde işyeri adı boş kalır. Desteklenen bankalar Akbank ve Yapı Kredi.
- Yalnız "BIM" yazan tek satırlı fiş başlığında işyeri adı boş kalır; kategori yine Market olur.

## 3. Karar gerektiren konular

- **G2 — GitHub Pages açık.** Her `main` birleştirmesinde, testlerden geçmeden ikinci bir kopya yayımlanıyor ("pages build and deployment"). Aile Cloudflare adresini kullanıyorsa bu kopyaya gerek yok. İçeriğine bu ortamdan erişilemedi. **Öneri:** GitHub > Settings > Pages > Source: **None**.
- **K2 — Sunucu kayıt anahtarı (`REGISTRATION_KEY`).** Hâlâ tanımlı değil. Adresi bilen herkes boş bir kasa açabilir. Verilerinize erişemez ama sunucu kaynağı kullanır. **Öneri:** tanımlayın.

## 4. Çalıştırılan testler

`START_SERVER=1 REQUIRE_SERVER=1 bash tests/run-all.sh` (yerel `wrangler dev`, hiçbir test atlanmadı):

| Test | Sonuç |
|---|---|
| `tests/bank-sms.test.js` | 92 passed, 0 failed |
| `tests/browser-behavior.test.js` | 128 passed, 0 failed |
| `tests/cards.test.js` | 50 passed, 0 failed |
| `tests/date-math.test.js` | 37 passed, 0 failed |
| `tests/gmail-script.test.js` | 30 passed, 0 failed |
| `tests/insights.test.js` | 13 passed, 0 failed |
| `tests/market-e2e.test.js` | 14 passed, 0 failed |
| `tests/market-parsers.test.js` | 12 passed, 0 failed |
| `tests/ozet-summary.test.js` | 12 passed, 0 failed |
| `tests/pay-account.test.js` | 11 passed, 0 failed |
| `tests/qc-bank.test.js` | 18 passed, 0 failed |
| `tests/qc-cards.test.js` | 17 passed, 0 failed |
| `tests/qc-data.test.js` | 9 passed, 0 failed |
| `tests/qc-files.test.js` | 9 passed, 0 failed |
| `tests/qc-finance.test.js` | 29 passed, 0 failed |
| `tests/qc-finance2.test.js` | 21 passed, 0 failed |
| `tests/qc-notify.test.js` | 7 passed, 0 failed |
| `tests/qc-sync.test.js` | 22 passed, 0 failed |
| `tests/quality-regression.test.js` | 112 passed, 0 failed |
| `tests/readability.test.js` | 22 passed, 0 failed |
| `tests/receipt-camera.test.js` | 7 passed, 0 failed |
| `tests/receipt-e2e.test.js` | 15 passed, 0 failed |
| `tests/receipt-pdf.test.js` | 5 passed, 0 failed |
| `tests/receipt-quota.test.js` | 3 passed, 0 failed |
| `tests/sms-e2e.test.js` | 49 passed, 0 failed |
| `tests/statement-import.test.js` | 24 passed, 0 failed |
| `tests/sync-e2e.test.js` | 29 passed, 0 failed |
| `tests/worker-api.test.js` | 29 passed, 0 failed |
| `tests/ui-scan.js` | Sorun bulunmadı |
| `tests/xss-scan.js` | XSS taraması temiz |
| `tests/qc-visual.js` | Sorun bulunmadı (72 ekran + ilk açılış) |

**Toplam: 826 kontrol + 3 tarama (ui-scan, xss-scan, qc-visual 72 ekran + ilk açılış), tümü geçti, 0 atlandı.** Başlangıçta 779 kontrol vardı.

Yeni ya da genişletilen testler:
- `qc-finance2`: düzenleme, taksit, transfer, silme, bütçe geçmiş ay.
- `qc-bank` 12–14: maaş + ikramiye; faiz, aidat, provizyon; döviz, ATM, virman, FAST.
- `qc-files`: hatalı ekstre dosyaları.
- `qc-notify`: bildirim izni reddi.
- `qc-sync` 8: kayıp telefon.
- `gmail-script`: 50'den çok e-posta.

Düzeltmelerin testleri (G6, G11) eski kodda çalıştırıldı ve kırmızı verdi.

**Ekran görüntüleri:** Bildirim kartının önce/sonra görüntüleri paylaşılan rapor sayfasındadır; depoya eklenmedi. Diğer düzeltmeler ekranın görünüşünü değiştirmiyor (yalnız hesap ve metin).

## 5. Gerçek cihaz / dış hizmet olmadan doğrulanamayanlar

- Bankaların **gerçek** SMS ve e-posta biçimleri: faiz, aidat, provizyon, virman ve döviz mesajları kurmaca örneklerle sınandı. Biçim farklıysa mesaj onay kuyruğuna düşer, kendiliğinden yanlış eklenmez.
- iPhone Kestirmeler otomasyonu, Gmail Apps Script'in kendi hesabınızda çalışması, iPhone'da bildirim izni ekranı.
- GitHub Pages kopyasının içeriği ve kimin kullandığı.
- Canlı Cloudflare (yükleme, D1, cron).

## 6. Kayıp ya da çalınan telefon (yeni)

Eşitleme kodunu bilen her cihaz kasaya erişebilir. Kodu "değiştir" diye tek bir tuş yoktur; şu yol sınandı ve çalışıyor:

1. Kalan bir telefonda: Ayarlar > Eşitleme > **Sunucudaki Veriyi Sil** > "SİL" yazın. Bu telefondaki veriler kalır.
2. Aynı telefonda **Eşitlemeyi Başlat** → yeni kod.
3. Diğer aile telefonlarında: "kasa bulunamadı" uyarısı görünür → **Bu Cihazda Kapat** → **Kodla Katıl** (yeni kod).
4. Kayıp telefon yeni kasaya erişemez; eski kodla yeni bir cihaz da katılamaz.

**Sınır:** Kayıp telefondaki yerel veri uzaktan silinemez. Telefonun kendi kilidi ve uzaktan silme özelliği (Bul/Find My) gerekir.

## 7. Aile kabul testi (~20 dakika)

#4 raporundaki 9 adım geçerlidir. Sürüm olarak **2026.10.05.1** arayın. Ek olarak:

10. **Bütçe:** Bu ay yeni bir kategoriye limit koyun. İstatistikler'de geçen aya bakın: o kategori için "Aşıldı" yazmamalı.
11. **Bildirim:** İzin verilmemiş bir telefonda Ayarlar > Bildirimler kartı, iznin nereden açılacağını söylemeli.
12. **Gmail (isteğe bağlı):** Ayarlar > Gmail kartı > **Betik ve Adımlar** > "2) Kod.gs" metnini kopyalayıp Apps Script'teki eski kodun yerine yapıştırın ve kaydedin (bağlantı aynı kalır). Eski betik de çalışmaya devam eder; yalnız 50 e-posta sınırı kalır.

## 8. Yedek, geçiş ve geri dönüş planı

- **Veri yapısı değişmedi.** Geçiş gerekmez.
- **Bütçe geçmişi:** Önceden konmuş limitler, değiştirildiklerinde "önceki aylara ait" olarak saklanır. Mevcut kayıtlara dokunulmaz.
- **Yayından önce:** her telefonda Ayarlar > Yedek > **Yedek İndir**.
- **Yayın sonrası kontrol:**
  - sürüm 2026.10.05.1 görünüyor;
  - Özet açılıyor;
  - bir harcama eklenip silinebiliyor;
  - eşitleme "son eşitleme: az önce" diyor.
- **Geri dönüş:**
  1. GitHub'da birleştirilen PR'ı açın ve **Revert**'e basın.
  2. Açılan geri alma PR'ını birleştirin; otomatik yükleme eski sürümü geri koyar.
  3. Veriler telefonlarda ve şifreli kasada kalır.

## 9. Değişiklik özeti

| Dosya | Değişiklik |
|---|---|
| `index.html` | SMS: faiz/aidat gider, provizyon onaya, maaş+ikramiye, virman onaya, FAST alıcı adı. Gmail betiği sayfalama. Bütçe geçmiş ay. Yıllık fon açıklaması. Bildirim izni açıklaması. Sürüm 2026.10.05.1 |
| `sw.js` | Önbellek v35 |
| `tests/` | 3 yeni test dosyası (qc-files, qc-notify, qc-finance2), 4 genişletilen; testlerde gerçek ad yerine kurmaca ad |
| `docs/denetim-raporu-5.md` | Bu rapor |

## 10. Karar: **Şu koşullarla hazır**

**Gerekçe:**
- Bu turda 2 P1 sorun bulundu: faizin gelir sayılması ve ikramiyenin maaşı silmesi. İkisi de düzeltildi ve testle korunuyor.
- 6 P2 ve 2 P3 sorun da düzeltildi.
- Açık P0 ya da P1 yok.
- 826 otomatik kontrol ve görsel taramalar temiz (§4).

**Koşullar:**
1. PR'daki GitHub "Testler" kontrolü yeşil olmalı.
2. Yayından önce her telefonda yedek alınmalı.
3. §7 kabul testi gerçek telefonlarda yapılmalı. Özellikle banka mesajları gerçek biçimleriyle ilk hafta onay kuyruğundan izlenmeli.
4. Önerilen: G2 (Pages'i kapatmak) ve K2 (kayıt anahtarı).
