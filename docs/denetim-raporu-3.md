# Finans Takip — Denetim Raporu #3

**Tarih:** 2026-09-27
**Kapsam:** `index.html`, `sw.js`, `manifest.json`: hesaplama doğruluğu, eksik özellikler, arayüz ve erişilebilirlik.
**Doğrulama:**
- `tests/date-math.test.js`: 37/37
- `tests/quality-regression.test.js`: 105/105
- `tests/browser-behavior.test.js`: 72/72 (gerçek `index.html`, headless Chromium)
- `tests/ui-scan.js`: 0 sorun (3 ekran genişliği × 2 tema × 14 sayfa + 14 modal)
- `tests/worker-api.test.js`: 22/22 ve `tests/sync-e2e.test.js`: 25/25 (yerel `wrangler dev` ile)

## 1. Hesaplama ve veri hataları (düzeltildi)

| # | Hata | Düzeltme |
|---|------|----------|
| 1 | Kart ödemesi harcamayı iki kez gider sayıyordu | Hesaplar arası **Transfer** (iki bağlı bacak; toplamlara girmez) |
| 2 | Hedef katkısı "transfer" modu kaynağı düşmeden gelir yazıyordu | Gerçek transfer (kaynak → birikim hesabı) |
| 3 | `openingBalance`'ı olmayan eski hesaplar açılışta çift düşülüyordu | Açılış bakiyesi geçmişten türetilir |
| 4 | Silinen üyenin işlemleri yenilemede aktif profile geçiyordu | Boş bırakılan `userId` korunur |
| 5 | Portföy K/Z maliyetsiz varlığın tüm değerini kâr sayıyordu | Yalnız maliyeti bilinen varlıklar |
| 6 | Fon adedi/fiyatı 2 haneye yuvarlanıyordu | 6 ondalık |
| 7 | Devirle tükenen bütçe "İyi" görünüyordu | "Aşıldı" |
| 8 | Bütçe devri 6 ayla sınırlı, geçmiş aylara güncel limit | Sınırsız, limit geçmişiyle |
| 9–10 | İstatistik bütçe kullanımı ve günlük ortalama yanlış paydaya bölünüyordu | Limitli kategoriler / geçen gün sayısı |
| 11 | Nakit akışı kaydedilmiş tekrarlayanı iki kez sayıyordu | Tekilleştirildi |
| 12–13 | Borç vadesi girilemiyordu; kapanan borçta ödeme silinemiyordu | Vade alanı, düzenleme, ödeme geçmişi |
| 14 | Yıllık fon ödeme sonrası sıfırlanmıyordu | "Ödendi" döngüsü |
| 15 | Gömülü TÜFE serisi hatalıydı (2022), Nisan 2026'da bitiyordu | TCMB aylık değişimlerinden zincirlendi (Ağustos 2026'ya kadar); yıllık oranlar ±0,02 puan |
| 16 | Çeyrek/tam altın ~%9 fazla değerleniyordu | 22 ayar saf altın katsayısı; alış kuru |
| 19 | CSV Türkçe Excel'de bozuk açılıyordu; banka ekstresi okunmuyordu | `;` ayraç, ondalık virgül; ayraç/tarih/işaretli tutar/Windows-1254 tanıma |
| 20 | "1.500" tutarı 1,5 TL okunuyordu | Binlik ayracı olarak okunur; canlı önizleme |

## 2. Eklenen özellikler

- **Düzenleme:** işlem, taksit, transfer, hesap (bakiye düzeltme), tekrarlayan, borç, hedef ve portföy varlığı.
- **Tekrarlayan işlemler:** hesap seçimi, duraklatma, unutulan ayı kaydetme, isteğe bağlı otomatik kaydetme.
- **Portföy:** kısmi/tam satış (gerçekleşen kâr/zarar), alışta tutarı hesaptan düşme, hedef dağılım formu.
- **Borç–hesap bağlantısı:** hareketler hesaba işlenir ama gelir/gider sayılmaz.
- **Kurallar:** gelir işlemlerine de uygulanır; mevcut işlemlere toplu uygulanabilir.
- **İşlem listesi:** tarih aralığı filtresi ve filtrelenen işlemlerin toplamı.
- **Ayarlar sayfası:** özel kategoriler, yedek hatırlatıcısı, kalıcı depolama izni, tüm verileri silme.
- **Ekran kilidi (PIN):** PIN yalnız PBKDF2 özeti olarak saklanır.
- **Geri alma:** silinen işlem 6 saniye içinde geri alınabilir.
- **Mobil:** her sayfada hızlı ekleme (+) düğmesi; Özet bölümleri katlanabilir.

## 3. Arayüz / erişilebilirlik taraması

| Kontrol | İlk tarama | Son |
|---------|-----------:|----:|
| Konsol hatası/uyarısı | 12 (meta CSP `frame-ancestors`) | 0 |
| Yatay taşma | 0 | 0 |
| WCAG AA kontrast ihlali | 573 | 0 |
| Mobilde 32 px altı dokunma alanı | 40 | 0 |
| Etiketsiz form alanı | 5 | 0 |
| Adsız düğme / yinelenen id | 0 | 0 |

Kontrast için yapılanlar:
- Soluk metin, mavi, pembe, mor ve kırmızı tonları koyu temada açıldı, açık temada koyulaştırıldı.
- Beyaz yazılı düğmeler ve bildirimler koyu teal ile yapıldı.
- Üye renkleri yazıda okunur olacak şekilde otomatik ayarlanıyor.
- Soluk kartlar saydamlık yerine kesik kenarlıkla gösteriliyor.

Elle ekran görüntüsü incelemesinde bulunan ve düzeltilen sorunlar:
- Aile panelinde tutar satır ortasında bölünüyordu.
- Yüzde biçimi Türkçe değildi ("%12,5" olmalı).
- İstatistik tablosunda kategori adı simgeden kopuyordu.
- "Son İşlemler"de gelecek tarihli taksitler en üstte görünüyordu.
- Açık temada gradyanlı kartlarda koyu yazı okunmuyordu.
- Mobilde boş bildirim kutusu alttaki düğmelere tıklamayı engelliyordu.

İşlev kontrolleri:
- ICS dosyası geçerli (başlangıç/bitiş eşleşiyor, UID'ler tekil).
- PDF raporu oluşuyor.
- CSV dışa aktarılıp yeniden okunabiliyor (hatalı satır 0).
- Net servet bileşenleri toplamla tutarlı; hesap bakiyesi mutabakat farkı 0.
- Service worker çevrimdışı açılışı sağlıyor.

## 4. Bilinen sınırlar (açık)

- ~~Çok cihaz / bulut eşitleme yok~~ ve ~~hatırlatmalar yalnız uygulama açıkken~~: Cloudflare Worker ile eklendi (`worker/README.md`). Uçtan uca şifreli eşitleme ve içeriksiz web push; kurulum için bir Cloudflare hesabı gerekir.
- **Ekran kilidi veriyi şifrelemez.**
- **AI "geçici API key" modu** anahtarı tarayıcıdan gönderir; proxy modu önerilir.
- **Kur servisleri** (truncgil, frankfurter) üçüncü taraftır; erişilemezse elle giriş açılır.
- **Eski veride otomatik düzeltilemeyenler:**
  - Önceki sürümde bakiyesi bozulmuş hesaplar hesaptaki ✎ ile düzeltilmeli.
  - Eski "birikim hesabına gelir yaz" katkıları gelir olarak kalır.
- **TÜFE Eylül 2026 ve sonrası** Ayarlar > TÜFE Güncelle ile girilmeli; eksik aylar son endeksle değerlenir.
- **`tests/ui-scan.js` gradyan zeminlerde kontrast ölçmez.** Bunlar elle kontrol edildi.
