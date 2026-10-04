# Aile Kasası — Yayın Öncesi Kalite Denetimi (#4)

**Tarih:** 2026-10-04
**Başlangıç:** `main` 131a317, sürüm 2026.10.04.5
**Sonuç:** `claude/lucid-edison-e0skrj` (PR #61), sürüm 2026.10.04.7
**Değişiklik:** 8 commit (rapor dahil 9), 38 dosya, +925 / −106 satır
**Karar:** **Şu koşullarla hazır** (bkz. §9)

Kanıt türleri ayrı gösterilir:

| Kısaltma | Anlamı |
|---|---|
| **K** | Kod incelemesi |
| **O** | Otomatik test (Playwright + gerçek `index.html`, yerel `wrangler dev`) |
| **T** | Tarayıcı denemesi ve ekran görüntüsü incelemesi (masaüstü Chromium, telefon boyutları) |
| **C** | Gerçek cihaz. **Bu denetimde yapılamadı:** iPhone, gerçek banka mesajı, gerçek Gmail ve canlı Cloudflare kullanılmadı. |

Test verileri tamamen kurmacadır. Canlı kasaya, bankaya, Gmail'e ya da üretim veritabanına hiçbir istek gönderilmedi. Sunucu testleri yalnız bu makinedeki geçici `wrangler dev` sunucusunda çalıştı.

## 1. Kapsam ve doğrulama tablosu

| Alan | Durum | Kanıt |
|---|---|---|
| Gelir / gider / transfer / açılış / bakiye düzeltme ayrımı | Çalıştırılarak doğrulandı | O (`qc-finance` A, B) |
| Bakiye = açılış + gerçekleşmiş hareketler | Çalıştırılarak doğrulandı | O (`qc-finance` B2, `qc-sync`) |
| Kart harcaması, kart ödemesi, düzenleme, silme, geri al, yenileme | Çalıştırılarak doğrulandı | O (`qc-finance` A1–A10) |
| İleri tarihli kayıt | Sorun bulundu → düzeltildi (F2) | O |
| Kuruş, taksit bölme, sayı biçimleri, geçersiz tutar, çift dokunma | Sorun bulundu → düzeltildi (F1) | O (`qc-finance` D, E, G, H) |
| İade / iptal | Karar verildi (K1) ve uygulandı: iade gideri azaltır | O (`qc-finance` F2–F4) |
| Özet = İstatistik = PDF rapor | Çalıştırılarak doğrulandı | O (`qc-finance` A3–A4) |
| Kart: dönem / sonraki ekstre / taksit / limit / fazla ödeme | Sorun bulundu → düzeltildi (F3, F5) | O (`qc-cards`, `cards`) |
| Tarihler: artık yıl, ay sonu, yıl değişimi, kesim günü | Çalıştırılarak doğrulandı | O (`qc-cards` 1–3) |
| Kısmi / asgari / tam / fazla ödeme, asgari sonrası uyarı | Çalıştırılarak doğrulandı | O (`qc-cards` 2) |
| Asgari ödeme mevzuatı (%20 / %40, eşik 100.000 TL) | Doğrulandı: BDDK 1.10.2026 kararı, 4.10.2026'da haber kaynaklarıyla. BDDK'nın kendi sayfası açılamadı. | K |
| "Borcu Öde" ifadesi | Sorun bulundu → düzeltildi (F4) | T |
| Tekrarlayan (uzun süre kapalı, iki cihaz, bir kez) | Çalıştırılarak doğrulandı | O (`qc-finance` J, `bank-sms`) |
| Maaş SMS'i ↔ planlı maaş (±%50, zam/ikramiye) | Doğrulandı | O (`bank-sms`), K |
| Borç / alacak, kısmi tahsilat | Sorun bulundu → düzeltildi (F11) | O (`qc-finance` I) |
| Hedef, acil durum fonu, yıllık fon: çift sayım | Sorun yok (net servete girmezler) | K |
| Net servet: taksit yükümlülüğü, silinmiş hesaplar | Sorun bulundu → düzeltildi (F12) | O (`qc-cards`, `ozet-summary`) |
| Portföy, kur, eski / eksik veri | Sorun bulundu → düzeltildi (F13) | O (`market-e2e`), K |
| Bütçe, devir, geçmiş ay limiti | Sorun yok | K, O (`quality-regression`) |
| Banka SMS / e-posta: ayrıştırma, eşleme, tekrar, silme | Sorun bulundu → düzeltildi (F6–F10) | O (`qc-bank`, `bank-sms`, `sms-e2e`, `gmail-script`) |
| iPhone Kestirmeler, gerçek Yapı Kredi / Akbank, gerçek Gmail | **Erişim nedeniyle doğrulanamadı** | — |
| Ekstre (PDF / şifreli PDF / XLSX / CSV) | Sorun bulundu → düzeltildi (F16) | O (`statement-import`) |
| Fiş (QR, OCR, yapay zekâ), düşük güvenli okuma | Sorun yok (kayıt her zaman onaylı); kamera gerçek cihazda denenmedi | O (`receipt-*`), K |
| CSV dışa / içe aktarma, formül enjeksiyonu | Çalıştırılarak doğrulandı | O (`qc-data`) |
| Yedek / geri yükleme, bozuk yedek | Çalıştırılarak doğrulandı; F17 düzeltildi | O (`qc-data`) |
| Eşitleme: 3 cihaz, çevrimdışı, eski cihaz, silme ↔ düzenleme | Çalıştırılarak doğrulandı | O (`qc-sync`, `sync-e2e`) |
| Profil, gizlilik | Sorun bulundu → düzeltildi (F15) | T |
| Bağlantı kapatma başarısızken yanlış başarı | Sorun bulundu → düzeltildi (F14) | O (`qc-sync` 7) |
| Sunucu yetkisi, şifreleme, XSS | Sorun yok | O (`worker-api`, `xss-scan`, `sync-e2e`) |
| Kötüye kullanım ve maliyet | Sorun bulundu → düzeltildi (F18), öneri var | O (`receipt-quota`) |
| Bağımlılık açıkları | Sorun bulundu → düzeltildi (F19) | `npm audit` 0 |
| Performans (8.000 işlem) | Doğrulandı | T (ölçüm) |
| PWA, çevrimdışı, sürüm geçişi | Doğrulandı (tarayıcıda); iOS ana ekranda denenmedi | O (`browser-behavior`, `ui-scan`) |
| Bildirim (izin reddi, iOS) | Kod incelendi; gerçek iPhone'da doğrulanamadı | K, O (`sync-e2e` push zinciri) |
| Görsel: 12 sayfa × 9 ekran, iki tema, üç yazı boyu, yatay, ilk açılış | Sorun bulundu → düzeltildi (F20–F22) | O (`ui-scan`, `qc-visual`), T |
| Ekran klavyesi açıkken erişim | Gerçek cihazda doğrulanamadı. Pencereler kaydırılabilir, alanlar ≥16 px (iOS yakınlaştırmaz). | K |
| Yayın hattı (CI) | Sorun bulundu → düzeltildi (F23) | GitHub Actions |

## 2. Bulunan ve düzeltilen sorunlar

**Önem dereceleri:**
- **P0:** veri kaybı, yetkisiz erişim
- **P1:** yanlış bakiye ya da toplam, eksik ya da mükerrer kayıt
- **P2:** kullanımı zorlaştıran sorun
- **P3:** küçük sorun

**P0 bulunmadı.**

| # | Önem | Alan | Sorun → kök neden | Düzeltme | Doğrulama |
|---|---|---|---|---|---|
| F2 | P1 | İşlem formu | İleri tarihli kayıttan sonra tarih alanı ileride kalıyordu. Sonraki "bugünkü" harcama sessizce planlı kaydediliyor, bakiye değişmiyor, ekranda yine "İşlem eklendi" yazıyordu. | İleri tarih formda kalmaz. Planlı kayıt "… için planlandı" diye açıkça bildirilir. | qc-finance C3, F1 |
| F3 | P1 | Kart limiti | Banka taksitli alışverişin tamamını limitten düşer; uygulama yalnız günü gelmiş taksiti düşüyordu. Kalan limit fazla görünüyor, limit uyarısı geç geliyordu. | Gelecek taksitler "taksitlere ayrılan" olarak kalan limitten düşülür (ortak limitte de). | qc-cards 4. Eski `cards` testlerinin beklentileri banka davranışına göre güncellendi (38.000 → 37.500). |
| F6 | P1 | SMS tekrarı | Elle girilmiş aynı tutarlı bir kayıt varsa SMS, işyerine bakılmadan atılıyordu. Örnek: elle "Migros 150" varken gelen "ŞOK 150" SMS'i kayboluyordu. | Adlar uyuşursa tekrar sayılır; uyuşmazsa gerekçesiyle onaya düşer. | qc-bank 1–2 |
| F7 | P1 | SMS taksit | "3 taksitli" kart harcaması tam tutar tek gider olarak yazılıyordu. | Elle girişle aynı taksit planı kurulur (sabit kimlikler; mesaj tekrar gelirse ikinci plan kurulmaz). | qc-bank 5 |
| F8 | P1 | Onay kuyruğu | Kart borcu ödemesi, ATM çekimi ya da kendi hesaplar arası para yalnız gider/gelir olarak eklenebiliyordu; aynı para iki kez gider sayılıyordu. | "↔ Aktarım (gider değil)" türü, karşı hesap seçimi, mükerrer ödeme kontrolü. | qc-bank 6 |
| F10 | P1 | SMS kutusu | Cihaza yazılamayan mesajlar (depolama dolu) yine de sunucudan siliniyordu. | Yazma hatasında sunucudaki mesajlar silinmez. | qc-bank 11 (kod yolu) |
| F12 | P1 | Net servet | Gelecek taksitler borç sayılmıyordu. Örnek: 12 taksitli 12.000 TL'de net servet 11.000 TL fazla görünüyordu. | Gelecek taksitler borç sayılır; geçmiş aylar da aynı kuralla hesaplanır (sahte düşüş olmaz). | qc-cards 4 |
| F14 | P1 | Güvenlik | SMS/Gmail bağlantısını kapatma isteği sunucuya ulaşmasa da "kapatıldı" deniyordu. Bağlantı sunucuda geçerli kalıyor, uygulamadan bir daha kapatılamıyordu. | Yalnız sunucu onaylarsa kapatılır; aksi hâlde açık hata mesajı. | qc-sync 7 (çevrimdışı → hata; çevrimiçi → eski adres 404) |
| F1 | P2 | Tutar | "₺1.234,56", "1 234,56" ve "1,234.56" için altta doğru ipucu görünüyor ama kaydet reddediyordu. | Tutar okuyucusu ipucuyla aynı kuralı kullanır. | qc-finance E1 |
| F4 | P2 | İfade | "Borcu Öde / Öde" bankada ödeme yapılıyormuş izlenimi veriyordu. | "Ödeme Gir", "Ödeme Kaydı", "Bu ekran bankada ödeme yapmaz…", "Kaydet". | T, cards |
| F5 | P2 | Ortak limit | Ana kart silinince ek kartlar limitsiz kalıyordu. | Limit ilk ek karta geçer. | qc-cards 4 |
| F9 | P2 | SMS | Kampanya SMS'i ("50.000 TL'ye varan kredi") onaya düşüyordu. | Gerçek bir hareket fiili yoksa yoksayılır. | qc-bank 7 |
| F11 | P2 | Borç | Borca bağlı hareket İşlemler'den silinince borç açık kalıyordu; net servet şişiyordu. | Silme, borç ya da ödeme kaydından onaylı yapılır. Portföy hareketinde uyarı çıkar. | qc-finance I |
| F15 | P2 | Aile | Profilin gizlilik sağlamadığı söylenmiyordu. | Aile sayfasında açık not. | T |
| F16 | P2 | Ekstre | 40 sayfa / 1.000 satır üstü sessizce atlanıyordu. | Açık uyarı ve ne yapılacağı. | K, statement-import |
| F18 | P2 | Sunucu maliyeti | Kayıt anahtarı yokken herkes kasa açabilir; fiş yapay zekâsı yalnız kasa başına sınırlıydı. | Sunucu geneli günlük sınır (varsayılan 300). | receipt-quota |
| F19 | P2 | Bağımlılık | wrangler 4.142'de undici açıkları (1 yüksek, 2 orta). Bu araç yalnız geliştirme ve yayında kullanılır. | wrangler 4.147, `npm audit` 0. | Tüm sunucu testleri yeni sürümle geçti. |
| F20 | P2 | Görsel | Yatay telefonda düğmeler 25–31 px'ti. | Dokunmatik ekranda ≥40 px. | qc-visual |
| F21 | P2 | Görsel | 320 px + en büyük yazıda tutarlar sayının ortasından bölünüyordu (₺92.020,0│0), kart adı harf ortasından bölünüyordu, düzenle düğmesi simgenin üstüne biniyordu. | Tutarlar bölünmez; dar ekranda kutucuklar alt alta, hesap kartları tek sütun. | T (önce/sonra), qc-visual |
| F23 | P2 | Yayın hattı | Otomatik yükleme yalnız 2 küçük testi (tarih, piyasa) çalıştırıyordu. Banka, kart ve eşitleme yayından önce hiç sınanmıyordu. | `test.yml`: her PR'da ve yüklemeden önce ~780 kontrollük tam paket, yerel sunucu dahil. Test geçmezse yükleme yapılmaz. | GitHub Actions |
| F24 | P3 | Kurulum hatırlatması / test | GitHub'daki bir test çalıştırması bir kez zaman aşımına uğradı. Haftalık "Kurulum Kontrolü" penceresi açılıştan 500 ms sonra çıkıyor ve o an açık olan pencerenin (CSV onayı) üstüne biniyordu. Ayrıca yedek geri yükleme testi sayfa yenilenmesini sabit 900 ms bekliyordu. | Hatırlatma açık bir pencere varken çıkmaz. Test yenilemenin kendisini bekler. "Rastgele hata" sayılmadı: 8–10 kat yavaşlatılmış tarayıcıda yeniden üretildi, düzeltmeden sonra 3/3 geçti. | browser-behavior (yavaşlatılmış) |
| F13, F17, F22 | P3 | Portföy / yedek / onay metni | Kur alınamayınca uyarı yoktu; yedekte eşitleme birleştirmesi anlatılmıyordu; seçenek metni kesiliyordu. | Uyarı ve açıklamalar eklendi. | T |

## 3. Karar gerektiren konular

- **K1 — İadeler: karar verildi, uygulandı ("gideri azaltsın").** Yeni **İade** kategorisi (↩️) gelir sayılmaz; Özet, İstatistikler, PDF rapor, aile paneli ve filtre toplamlarında o ayın giderinden düşülür. Bankanın iade/iptal SMS'leri ve ekstredeki iade satırları kendiliğinden bu kategoriye girer. Daha önce bankadan "İade: …" notuyla gelmiş kayıtlar açılışta İade'ye taşınır. Kategori bütçeleri değişmez (iadenin hangi kategoriden olduğu bilinmez). PDF raporda "İade (giderden düşüldü)" satırı görünür. Test: qc-finance F2–F4, statement-import.
- **K2 — Sunucu kayıt anahtarı (`REGISTRATION_KEY`).** Tanımlı değil; adresi bilen herkes boş bir kasa açabilir. Verilerinize erişemez ama sunucu kaynağı kullanır. F18 maliyeti sınırladı. Yine de Cloudflare'de anahtar tanımlamanız önerilir. Bu bir dakikalık, sizin yapacağınız bir iş; tanımlandıktan sonra yeni telefonlar eşitlemeye bu anahtarla katılır.

## 4. Çalıştırılan testler

**Ortam:** Linux, Chromium (Playwright 1.56.1), Node 22, yerel `wrangler dev` 4.147.

| Paket | Başlangıç | Son |
|---|---|---|
| bank-sms | 92 | 92 |
| browser-behavior | 128 | 128 |
| cards | 50 | 50 (4 beklenti banka davranışına göre güncellendi, F3) |
| date-math | 37 | 37 |
| gmail-script | 29 | 29 |
| insights | 13 | 13 |
| market-e2e | 13 | 12 (önbellek durumuna bağlı bir koşullu kontrol) |
| market-parsers | 12 | 12 |
| ozet-summary | 12 | 12 |
| pay-account | 11 | 11 |
| quality-regression | 112 | 112 |
| readability | 22 | 22 |
| receipt-camera / receipt-e2e / receipt-pdf | 7 / 15 / 5 | 7 / 15 / 5 |
| sms-e2e | 49 | 49 |
| statement-import | 24 | 24 |
| sync-e2e | 29 | 29 |
| worker-api | 29 | 29 |
| **yeni** qc-finance | — | 29 |
| **yeni** qc-cards | — | 17 |
| **yeni** qc-bank | — | 15 |
| **yeni** qc-data | — | 9 |
| **yeni** qc-sync | — | 16 |
| **yeni** receipt-quota | — | 3 |
| ui-scan, xss-scan | temiz | temiz |
| **yeni** qc-visual | — | temiz (72 ekran + ilk açılış) |
| **Toplam** | **689** | **778**, hepsi geçti |

Hepsini tek komutla çalıştırmak için: `START_SERVER=1 REQUIRE_SERVER=1 bash tests/run-all.sh`

**GitHub Actions** (temiz Ubuntu kurulumu, [çalışma 37222331158](https://github.com/VoidCoder-ux/finans-takip/actions/runs/37222331158)): tüm paketler geçti, 0 atlandı, ~3 dakika. Orada market-e2e 13 kontrol çalıştırdı (taze önbellek), toplam 775.

**Veri senaryoları:**
- Banka 10.000 / kart 1.000 / ödeme 400, ardından düzenleme 500, silme, geri alma.
- 3 taksitte 100 TL (kuruş dağılımı).
- 12 taksitli telefon ve ortak limit.
- Artık yıl, yıl değişimi, kesim günü.
- Uzun adlar, 1.234.567,89 TL gibi büyük tutarlar.
- 8.000 işlem.
- 3 cihaz, iki aile üyesi.

**Performans (8.000 işlem):**
- Açılış 169 ms, İşlemler sayfası 29 ms, arama 10 ms, ekleme 50 ms.
- İstatistikler 81 ms, PDF rapor 14 ms, bellek 17 MB.
- Tarayıcı depolama sınırı ~5 MB; bu yaklaşık 20.000 işleme yeter.

## 5. Gerçek cihaz / dış hizmet olmadan doğrulanamayanlar

- iPhone Kestirmeler otomasyonunun SMS'i gerçekten göndermesi (kilitli ekran, uygulama kapalı, internet yok).
- Gerçek Yapı Kredi ve Akbank SMS / e-posta biçimleri. Kurmaca örnekler gerçek biçimlere benzetildi; biçim değişirse onay kuyruğuna düşer.
- Gmail Apps Script'in kendi hesabınızda çalışması (izin, 5 dakikalık tetikleyici, izin iptali).
- iPhone'da ana ekrandan açılan uygulamada bildirim (iOS 16.4+), kamera ve ekran klavyesi.
- Canlı Cloudflare (yükleme, D1, cron) ve bankaların gerçek PDF / XLSX ekstreleri.

## 6. Aile kabul testi (ilk kurulumdan, ~20 dakika)

1. **Yedek alın:** Ayarlar > Yedek / Geri Yükle > **Yedek İndir**. Dosyayı saklayın.
2. Güncellemeden sonra Ayarlar'ın en altında **2026.10.04.7** yazdığını görün.
3. **Bankadan kart ödemesi:** İşlem > Gider > kartı seçin > 100 TL ekleyin. Hesaplar'da kart borcu 100 artar, banka değişmez. Kart > **💳 Ödeme Gir** > 100 > Kaydet. Banka 100 azalır, kart borcu 0, "Bu ay gider" yalnız 100 artmıştır.
4. **Eşin telefonu:** Aynı kayıtlar 1 dakika içinde görünür. Eşin eklediği bir kayıt sizin telefonunuza da gelir.
5. **Taksit:** Kartla 3 taksit 300 TL girin. Kart borcu 100 artar; kart detayında "Gelecek taksitlere ayrılan ₺200" ve kalan limit 300 azalmış görünür.
6. **SMS / e-posta:** Kartla küçük bir alışveriş yapın. Birkaç dakika içinde (uygulama açıkken) kendiliğinden eklenir. Aynı alışverişi elle de girdiyseniz ikinci kez eklenmez.
7. **İleri tarih:** Yarına bir fatura girin ("… için planlandı" der). Sonraki kayıtta tarih bugüne döner.
8. **Silme:** Bir kaydı silin, "Geri al" ile geri getirin; bakiye eski haline döner.
9. **Telefonda okunabilirlik:** Ayarlar > Yazı Boyutu > en büyük. Özet'te hiçbir tutar ikiye bölünmez.

## 7. Yedek, geçiş ve geri dönüş planı

- **Veri yapısı değişmedi.** Geçiş gerekmez. Eski kayıtlar olduğu gibi okunur.
- **Yeni alanlar yalnız SMS'ten gelen taksit planında:** `src: 'sms'` ve sabit kimlik. Eski sürüm bu kayıtları sıradan taksit olarak okur.
- **Yayından önce** her telefonda **Yedek İndir**.
- **Yayın sonrası kontrol:** sürüm 2026.10.04.7 · Özet açılıyor · bir harcama ekle/sil · eşitleme "son eşitleme: az önce" · Ayarlar > SMS bağlantısı "açık".
- **Geri dönüş:**
  1. GitHub > Pull requests > birleştirilen PR > **Revert**.
  2. Açılan geri alma PR'ını birleştirin; otomatik yükleme eski sürümü geri koyar.
  3. Veriler telefonlarda ve şifreli kasada kalır; geri dönüş veriye dokunmaz.
  4. Gerekirse yedekten geri yükleyin. Eşitleme açıkken yedek, diğer telefonlardaki kayıtlarla birleştirilir.

## 8. Değişiklik özeti

| Dosya | Değişiklik |
|---|---|
| `index.html` | Tutar okuma, ileri tarih, taksitin limite ve net servete etkisi, ortak taksit planı (elle + SMS), SMS tekrar denetimi, onayda aktarım türü, kampanya filtresi, ack koruması, borç-hareket silme, bağlantı kapatma onayı, ekstre sınır uyarısı, ifade ve görsel düzeltmeleri |
| `worker/src/receipt.js` | Sunucu geneli günlük yapay zekâ sınırı |
| `worker/package-lock.json` | wrangler 4.147 |
| `.github/workflows/test.yml` (yeni), `deploy.yml` | Her PR'da ve yüklemeden önce tam test |
| `tests/run-all.sh` ve 7 yeni test dosyası | Bağımsız beklenen değerlerle senaryolar |

## 9. Karar: **Şu koşullarla hazır**

**Gerekçe:**
- Bulunan 8 P1 sorunun hepsi düzeltildi ve testlerle korunuyor. Açık P0 ya da P1 yok.
- 778 otomatik kontrol ve 144 ekranlık görsel tarama (ui-scan 72 + qc-visual 72) temiz.
- Para akışının tamamı (harcama → ödeme → düzenleme → silme → yenileme → iki/üç cihaz eşitlemesi) bağımsız beklenen değerlerle doğrulandı.

**Koşullar:**
1. PR'daki GitHub "Testler" kontrolü yeşil olmalı.
2. Yayından önce her telefonda yedek alınmalı.
3. §6 kabul testi gerçek iPhone'larda yapılmalı. Özellikle SMS Kestirmesi, Gmail ve bildirimler bu denetimde gerçek cihazda sınanamadı.
4. Önerilen: K2 kayıt anahtarı.
