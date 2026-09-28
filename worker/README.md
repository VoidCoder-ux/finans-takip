# Finans Takip — Cloudflare kurulumu

Tek bir Cloudflare Worker üç işi yapar:

1. **Uygulamayı yayınlar:** `index.html`, `sw.js` vb. `https://finans-takip.<hesabınız>.workers.dev` adresinden sunulur.
2. **Cihazlar arası eşitleme:** Aile üyelerinin telefonları aynı verileri görür.
3. **Uygulama kapalıyken bildirim:** Ödeme günlerinde telefona bildirim gider.

Ücretsiz Cloudflare planı kişisel/aile kullanımı için fazlasıyla yeterlidir:
- Workers günde 100.000 istek
- D1 veritabanı 5 GB
- Zamanlanmış görev (cron) dahil

## Gizlilik: sunucu neyi görür?

| Veri | Sunucuda |
|------|----------|
| İşlemler, hesaplar, borçlar… | **Hayır.** Telefonda AES-256-GCM ile şifrelenir; anahtar sunucuya hiç gelmez. |
| Eşitleme kodu / anahtar | **Hayır.** Sunucu yalnız erişim belirtecinin SHA-256 özetini tutar. |
| Bildirim | Yalnız **hangi günlerde** bildirim gideceği. Ödemenin adı ve tutarı telefonda kalır; bildirim metnini telefon kendi oluşturur. |

Eşitleme kodu verilerinize tam erişim verir; yalnız aile üyeleriyle paylaşın. Kod sızarsa:
1. Ayarlar > Eşitleme > **Sunucudan Sil** ile kasayı silin.
2. Eşitlemeyi yeniden başlatın; yeni kod üretilir.

## Kurulum (bir kez, ~10 dakika)

Gerekenler: ücretsiz bir Cloudflare hesabı ve bilgisayarda Node.js 18+.

```bash
cd worker
npm install
npx wrangler login                       # tarayıcıda Cloudflare hesabınızla giriş
```

**1. Veritabanı**

```bash
npx wrangler d1 create finans-takip
```

Çıktıdaki `database_id` değerini `wrangler.toml` içindeki `database_id = "..."` satırına yazın. Sonra tabloları oluşturun:

```bash
npm run db:init
```

**2. Bildirim anahtarları (VAPID)**

```bash
npm run vapid
```

- `wrangler.toml` içindeki `VAPID_SUBJECT` satırına kendi e-posta adresinizi yazın (`mailto:...`). Push servisleri sorun olursa bu adrese ulaşır.
- `VAPID_PUBLIC_KEY` boş kalabilir; sunucu genel anahtarı gizli anahtardan kendisi türetir.
- Gizli anahtarı kaydedin: aşağıdaki komut sorunca, `npm run vapid` çıktısının son satırındaki `{"kty":"EC",...}` metnini yapıştırın.

```bash
npx wrangler secret put VAPID_PRIVATE_JWK
```

**3. (Önerilir) Kayıt anahtarı**

Adresi bilen herkes kendine boş bir kasa açabilir; bu sizin verinize erişim sağlamaz, yalnız sunucuda yer kaplar. Bunu kapatmak için bir kayıt anahtarı belirleyin:

```bash
npx wrangler secret put REGISTRATION_KEY     # uzun, rastgele bir metin girin
```

Eşitlemeyi ilk başlatırken uygulama bu anahtarı bir kez sorar. Katılan cihazlara gerekmez.

**4. Yayınla**

```bash
npm run deploy
```

Çıktıdaki `https://finans-takip.<hesabınız>.workers.dev` adresi artık uygulamanızın adresidir.

## Telefonlarda kullanım

1. **İlk telefon:**
   1. Adresi açın, tarayıcı menüsünden **Ana ekrana ekle** deyin.
   2. Ana ekrandaki simgeden açın.
   3. Ayarlar > Cihazlar Arası Eşitleme > **Eşitlemeyi Başlat** (sunucu adresi kendiliğinden dolar).
2. **Eşin telefonu:**
   1. İlk telefonda **Cihaz Ekle** > **Paylaş** ile bağlantıyı gönderin (WhatsApp vb.).
   2. Eşiniz bağlantıyı açıp **Katıl** der.
   3. Veya kodu kopyalayıp o telefonda **Kodla Katıl** ile yapıştırın.
3. **Kapalıyken bildirim:** Her telefonda ayrı ayrı açılır.
   1. Ayarlar > Hatırlatmalar > **Uygulama kapalıyken de bildir**.
   2. Bildirimler her sabah 09:00'da (İstanbul) gelir: vadeden 2 gün önce, 1 gün önce ve vade günü.
   3. **iPhone:** yalnız ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+).

Eşitleme **anlıktır**: bir cihazda kaydedilen değişiklik ~3 saniye içinde sunucuya gider. Sunucu, uygulaması açık olan diğer cihazlara hemen haber verir (Durable Object + WebSocket); onlar yenilemeye gerek kalmadan güncellenir. Uygulama arka plandaysa öne gelince, internet kopmuşsa geri gelince eşitlenir. Anlık bağlantı kurulamazsa 30 saniyede bir kontrol edilir.

İki kişi aynı anda farklı işlemler eklerse ikisi de korunur. Aynı kaydın farklı alanlarını düzenlerlerse ikisi de birleşir. Aynı alanı düzenlerlerse son eşitleyen cihazın değeri kalır. Hesap bakiyeleri her birleştirmeden sonra işlem geçmişinden yeniden hesaplanır.

Cihaza özel kalanlar (eşitlenmez): tema, aktif profil, ekran kilidi PIN'i, AI ayarları.

## Güncelleme

Depoda yeni sürüm olduğunda kodu indirin, `wrangler.toml` içine `database_id` ve `VAPID_SUBJECT` değerlerinizi yeniden yazın (gizli anahtarlar Cloudflare'de kalır, tekrar girilmez) ve:

```bash
cd worker && npm run deploy
```

Uygulama dosyaları Worker ile birlikte yayınlanır.

## Geliştirme ve test

```bash
cd worker
cp .dev.vars.example .dev.vars           # yerel VAPID anahtarları (npm run vapid ile üretin)
npm run db:local
npm run dev -- --port 8787               # http://127.0.0.1:8787
npm test                                 # başka bir terminalde: API + iki cihazlı uçtan uca test
```

Yerel veritabanı depo dışında (`../../.finans-takip-dev`) tutulur. Depo içinde tutulursa `wrangler dev` uygulama klasörünü izlediği için sürekli yeniden başlar.

## API özeti

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| GET | `/v1/config` | Sunucu sürümü, VAPID genel anahtarı, kayıt anahtarı gerekip gerekmediği |
| GET | `/v1/vault/:id[?known=N]` | Şifreli veri ve sürüm (N güncelse yalnız `unchanged`) |
| PUT | `/v1/vault/:id` | `{baseVersion, data}`: sürüm eşleşirse yazar, değilse **409** |
| DELETE | `/v1/vault/:id` | Kasayı ve bildirim kayıtlarını siler |
| PUT/DELETE | `/v1/vault/:id/push/:deviceId` | Push uç noktası ve bildirim günleri |

Kimlik doğrulama `Authorization: Bearer <belirteç>` başlığıyla yapılır. Belirteç, eşitleme anahtarından türetilir.
