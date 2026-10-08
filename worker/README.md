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
| Banka SMS'i / e-postası | **Kısa süre, açık metin.** Kestirme ve Gmail betiği şifreleme yapamaz. Metin, uygulama alana kadar (en çok 14 gün) bekler, sonra silinir. E-postanın yalnız işlem satırları saklanır. |

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

Cihaza özel kalanlar (eşitlenmez): tema, "Bu telefon kimin?" profili (eşitlemeye katılınca sorulur; Ayarlar > Bu Telefon Kimin?), ekran kilidi PIN'i, AI ayarları.

## Piyasa verileri

Sunucu herkese açık piyasa verilerini çekip D1'e kaydeder; uygulamalar `/v1/market` adresinden alır.

| Veri | Kaynak | Sıklık |
|------|--------|--------|
| USD, EUR, GBP | TCMB günlük kurlar (döviz alış) | saat başı |
| Gram, çeyrek, tam altın | Truncgil (alış) | saat başı |
| Fon fiyatları | TEFAS (yeni `/api/funds` servisi), tüm yatırım + emeklilik fonları | günde bir |
| TÜFE aylık değişim | TCMB tüketici fiyatları tablosu | günde bir |

Portföyde fon eklerken **Fon kodu (TEFAS)** alanına kodu yazın (ör. `TTE`); ad ve fiyat otomatik gelir, fiyat her gün güncellenir. Bir kaynak geçici olarak cevap vermezse son iyi veri kullanılır; durum Ayarlar > Piyasa Verileri kartında görünür.

## Fiş okutma

Özet ve İşlemler sayfasındaki **📷 Fiş Okut** kamerayı açar:

1. **Karekod (anında):** Kamera fişteki e-Arşiv / e-Fatura karekodunu sürekli arar; bulunca tutar ve tarih kesin olarak okunur. Android'de tarayıcının yerleşik okuyucusu, iPhone'da jsQR kullanılır.
2. **Yazı tanıma (ücretsiz, telefonda):** Karekod yoksa **📸 Çek** ile fotoğraf çekilir; telefonda yazılar okunur (tesseract.js, Türkçe). Gölgeye dayanıklı siyah-beyaz dönüştürme, küçük fotoğrafı büyütme ve gerekirse ikinci deneme yapılır. Toplam (GENEL TOPLAM > ÖDENECEK / KDV Dahil Tutar > TOPLAM; KDV, ara toplam, para üstü hariç; TOPLAM ile KART/NAKİT satırı eşleşirse o seçilir; siyah-beyaz ve gri iki okuma birleştirilir, "*" işaretli tutar tercih edilir), tarih ("21 09 2026" gibi bozuk yazımlar dahil), mağaza ve kategori bulunur. Bilinen zincirler (BİM, A101, ŞOK, Migros, CarrefourSA, Opet, Shell, Gratis, LC Waikiki…) yazı bozuk okunsa da benzerlikle tanınır ve kategorileri otomatik seçilir. Fotoğraf telefondan çıkmaz. İlk kullanımda okuma paketi (~6 MB) bir kez indirilir.
3. **Yapay zekâ (isteğe bağlı, DeepSeek):** Sonuç yanlışsa kontrol penceresinde **🤖 Yapay Zekâyla Oku** çıkar. Fotoğraf değil, **telefonun okuduğu yazı** DeepSeek'e gönderilir; mağaza, tarih, toplam ve kalemler çıkarılır. Yalnız eşitlemedeki cihazlar kullanabilir; kasa başına günlük sınır vardır (varsayılan 50).

**iPhone'da taranmış belge:** Dosyalar > ••• > **Belgeleri Tara** ile taradığınız fişi uygulamada **📷 Fiş Okut > 📄 Galeri / Dosya > Dosya Seç** ile açın (iOS, ana ekrana eklenen web uygulamalarını Paylaş menüsünde göstermez). PDF'te yazı katmanı varsa (e-Arşiv fatura PDF'leri) doğrudan o okunur; yoksa sayfa görüntüye çevrilip yazı tanımayla okunur. PDF okuyucu (pdf.js, ~1,8 MB) yalnız PDF seçildiğinde bir kez indirilir.

Her durumda kaydetmeden önce kontrol penceresi açılır; tutar, tarih, kategori, hesap ve kişi değiştirilebilir. Ürün barkodları fiyat içermez; gider için fişin karekodu ya da yazısı gerekir.

Yapay zekâyı açmak için DeepSeek API anahtarınızı (`sk-...`, platform.deepseek.com) sunucuya kaydedin:

```bash
npx wrangler secret put DEEPSEEK_API_KEY     # anahtarı yapıştırın
```

Model sunucunun listesinden kendiliğinden seçilir; belirli bir model için `wrangler.toml` `[vars]` altına `DEEPSEEK_MODEL = "..."` ekleyin. Günlük sınır: `RECEIPT_DAILY_LIMIT = "100"`. Kapatmak için `npx wrangler secret delete DEEPSEEK_API_KEY`.

## Banka SMS'leriyle otomatik kayıt (iPhone Kestirmeler)

Bankalar uygulama dışına veri vermediği için (açık bankacılık yalnız lisanslı kurumlara açık) hareketler bankanın SMS'inden alınır:

1. Eşitleme açık olmalı. Her telefonda **Ayarlar > 🏦 Bankadan Otomatik Kayıt > 📱 SMS > Bu Telefonda Kur** deyin; o telefona (ve kişiye) özel bir bağlantı oluşur.
2. Kestirmeler > Otomasyon > + > **Mesaj** ("Gönderen" filtresini silip **Filtre Ekle → Mesaj içeriyor `TL`**) > **Hemen Çalıştır** > **URL İçeriğini Al**: bağlantı, Yöntem **POST**, İstek Gövdesi **JSON**, alan `text` = **Kestirme Girişi**. Adımlar uygulamada da gösterilir.
3. SMS gelince metin `POST /v1/sms/<anahtar>` ile gelen kutusuna düşer; açık uygulamalar anında, kapalı olanlar açılınca kutuyu çeker, metni **telefonda** çözümler ve kutudan siler.

- Şifre/doğrulama kodu SMS'leri, tutar içermeyen ve banka hareketine benzemeyen mesajlar sunucuda **hiç saklanmaz**. Diğerleri uygulama alana kadar (en çok 14 gün) bekler. Kestirmeler şifreleme yapamadığından bu kısa süre boyunca metin sunucuda açık durur.
- Bağlantı yalnız ekleme yapabilir; kasa verisini okuyamaz. Kapatınca/yeniden kurunca eskisi geçersiz olur.
- Kart/hesap eşleşmesi: hesabı düzenleyip **son 4 hane** girin; ya da ilk SMS'i Özet'teki onay listesinden bir kez hesap seçerek ekleyin (son 4 hane öğrenilir). Banka adı hesap adında geçiyorsa (ör. "Akbank Axess") o da kullanılır.
- Elle/fişle girilmiş aynı hareket tekrar eklenmez; maaş SMS'i tekrarlayan maaş kaydını gerçek tutar ve tarihle günceller. Kart borcu ödemesi, ATM, yabancı para ve aile içi aktarımlar onaya düşer.
- Android'de SMS'i bir adrese ileten otomasyon uygulamalarıyla (ör. MacroDroid) aynı bağlantı kullanılabilir.

## Banka e-postalarıyla otomatik kayıt (Gmail)

Bazı bankalar (ör. Akbank) işlem bildirimini SMS yerine yalnız kendi uygulamasından ve e-postayla gönderir. iPhone başka uygulamaların bildirimlerini okutmaz; e-posta ise kişinin kendi Google hesabında çalışan küçük bir **Google Apps Script** betiğiyle alınır:

1. Eşitleme açık olmalı. **Ayarlar > 🏦 Bankadan Otomatik Kayıt > 📧 Gmail'den Al** deyin. Kişiye özel bağlantı (`gmailbox_<kişi>` etiketi) oluşur ve kurulum penceresi açılır.
2. Bilgisayarda **script.google.com > Yeni proje**. **Proje Ayarları**'nda "appsscript.json manifest dosyasını göster"i işaretleyin; `appsscript.json` ve `Kod.gs` içeriğini pencerede verilen metinlerle değiştirip kaydedin.
3. **kur** işlevini ▶ Çalıştır'la bir kez çalıştırın ve izin verin. "Google bu uygulamayı doğrulamadı" uyarısı beklenir: betik sizin. **Gelişmiş > … projesine git > İzin ver**.
4. `kur` 5 dakikada bir çalışan bir tetikleyici kurar ve bir deneme iletisi gönderir. Uygulamada "✓ Gmail bağlantısı çalışıyor" ve kartta "Son e-posta: … · ✓ alındı" görünür.

- **İzin salt okunur.** İzinler `gmail.readonly`, `script.external_request` ve `script.scriptapp`'tir. Betik yalnız `ARAMA`'ya uyan e-postaları okur (varsayılan `from:akbank newer_than:2d`); e-posta silemez, değiştiremez, gönderemez. Başka banka için ARAMA satırına `OR from:...` eklenir.
- Betik e-postayı (gönderen, konu, gövde) bağlantıya POST eder: `{"text": …, "source": "email", "id": <Gmail ileti kimliği>}`. HTML'in stil ve öznitelikleri Google tarafında atılır.
- **Sunucu yalnız işlem satırlarını saklar** (tutar, işyeri, kart, tarih). Selamlama ("Sayın …"), kart sahibinin adı ("… adına ait"), onay/doğrulama kodu satırları, "görüntüleyemiyorsanız tıklayınız" gibi şablon satırlar, kampanya, imza ve yasal metin hiç kaydedilmez. İşlem satırı olmayan e-postalar (kampanya, duyuru) saklanmaz. Saklanan metin SMS'le aynı yoldan işlenir.
- Betik e-postanın Gmail'e geldiği anı da gönderir; metne "E-posta tarihi: gg.aa.yyyy ss:dd" (Türkiye saati) satırı eklenir. İşlem tarihi yazmayan e-postalar bu tarihle kaydedilir.
- **Akbank** e-postası ("Kredi kartı harcamanız") işyeri adı yazmaz. Tutar `1,426.78 TL` biçimindedir; kalan limit tutarı harcama sayılmaz. Hareket "Akbank kart harcaması" notu ve **Diğer** kategorisiyle eklenir; kategori sonradan değiştirilebilir.
- Aynı e-posta Gmail kimliğiyle tanınır. Betik yeniden kurulsa da ikinci kez eklenmez; kimlik özetleri 28 günde silinir. Sunucu hata verirse e-posta 5 dakika sonra yeniden denenir.
- Aynı hareket hem SMS hem e-postayla gelirse tek kayıt olur. İşlem listesinde kaynak 📧 E-posta olarak görünür.
- Durum (son e-posta, sonucu) sunucudan okunur. Betik bilgisayardan kurulsa da telefonda görünür. Başka cihazda **Yeni Betik Oluştur** denirse eski kod geçersiz olur; yeni kodu Google'daki projeye yapıştırmak gerekir. **Gmail'i Kapat** bağlantıyı hemen geçersiz kılar.

## Ekstre içe aktarma

**İşlemler > 🏦 Ekstre Yükle**: bankanın internet şubesinden/uygulamasından indirilen hesap hareketleri ya da kredi kartı ekstresi (**PDF, Excel .xlsx, Excel görünümlü .xls, CSV**). Dosya telefonda okunur, hiçbir yere gönderilmez. Önizlemede hesap seçilir, satırlar işaretlenir, tutara dokunarak gelir/gider değiştirilir, kategori düzeltilir. Daha önce kayıtlı (elle, SMS, fiş) hareketler ve kart borcu ödemesi satırları baştan işaretsiz gelir; özet satırları (dönem borcu, asgari ödeme, devreden…) alınmaz. Eski ikili `.xls` biçimi okunamaz; PDF ya da `.xlsx` indirin.

Hesabın uygulamaya eklendiği (ya da bakiyesinin elle bankayla eşitlendiği) günden önceki satırlar **bakiyeyi değiştirmez**: o gün girilen bakiyenin içinde zaten vardır. Gelir/gider olarak kendi ayına yazılır; önizlemede "bakiye değişmez", listede "bakiye değişmedi" etiketiyle görünür. Böylece eski bir kart ekstresi yüklemek borcu ikinci kez artırmaz.

## Güncelleme

Depoda yeni sürüm olduğunda kodu indirin, `wrangler.toml` içine `database_id` ve `VAPID_SUBJECT` değerlerinizi yeniden yazın (gizli anahtarlar Cloudflare'de kalır, tekrar girilmez) ve:

```bash
cd worker
npm install
npm run db:init      # yeni tablolar varsa ekler; mevcut veriye dokunmaz
npm run deploy
```

Uygulama dosyaları Worker ile birlikte yayınlanır.

### Otomatik yükleme (GitHub Actions, isteğe bağlı)

`.github/workflows/deploy.yml` ana dala her birleştirmede aynı yüklemeyi kendisi yapar. Elle `npm run deploy` gerekmez. Bir kez GitHub'da **Settings > Secrets and variables > Actions > New repository secret** ile dört değer eklenir:

| Ad | Nereden |
|----|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens > Create Token > **Edit Cloudflare Workers** şablonu (ücretsiz) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare > Workers & Pages sayfasında sağdaki **Account ID** |
| `D1_DATABASE_ID` | `wrangler.toml`'a elle yazdığınız `database_id` (`npx wrangler d1 list`) |
| `VAPID_SUBJECT` | `wrangler.toml`'daki değer, ör. `mailto:siz@ornek.com` |

Gizli anahtarlar (`VAPID_PRIVATE_JWK`, `DEEPSEEK_API_KEY`) Cloudflare'de kalır, GitHub'a eklenmez. Secret eklenmemişse iş hata vermez, uyarıyla atlanır. Hemen yüklemek için: **Actions > Cloudflare'e yükle > Run workflow**.

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
| POST | `/v1/sms/:anahtar` | Banka SMS'i (Kestirme) ya da e-postası (Gmail betiği, `source:"email"`) gelen kutusuna; anahtar yalnız ekleme yapabilir |
| PUT/DELETE | `/v1/vault/:id/sms-key/:etiket` | SMS/Gmail bağlantısı (anahtarın SHA-256 özeti) |
| GET | `/v1/vault/:id/inbox` | Bekleyen SMS/e-postalar ve her bağlantının son istek sonucu |
| POST | `/v1/vault/:id/inbox/ack` | İşlenenleri gelen kutusundan siler |

Kimlik doğrulama `Authorization: Bearer <belirteç>` başlığıyla yapılır. Belirteç, eşitleme anahtarından türetilir.
