# Finans Takip — Çok Ajanlı Denetim Raporu #2

**Tarih:** 2026-06-01
**Yöntem:** 4 paralel uzman ajan (Güvenlik · Finansal Hesaplama · PWA/Offline · Kod Kalitesi/A11y).
Her bulgu `index.html` / `sw.js` üzerinde `grep`/`read` ile elle doğrulandı; yanlış pozitifler ayıklandı.
**Baseline:** `tests/date-math` 37/37, `tests/quality-regression` 50/50 (yeşil).

## Skor Tablosu (doğrulanmış)

| Alan | Kritik | Yüksek | Orta/Düşük |
|------|:------:|:------:|:----------:|
| Güvenlik | 1 | 3 | 4 |
| Finansal Hesaplama | 0 | 2 | 4 |
| PWA / Offline / Veri | 2 | 3 | 3 |
| Kod Kalitesi / A11y | 1 | 3 | 4 |

---

## Kritik / Yüksek — Doğrulanmış Gerçek Bulgular

1. **CSP yok** — `index.html <head>`. XSS için tarayıcı seviyesi savunma katmanı eksikti. → **DÜZELTİLDİ**
2. **Çoklu sekme veri kaybı** — `storage` event listener yoktu; iki sekme çakışınca veri kaybı. → **DÜZELTİLDİ**
3. **API anahtarı doğrudan istemciden DeepSeek'e** — `index.html:1831`, sessionStorage düz metin. (Mimari; proxy modu önerilir — açık.)
4. **AI proxy URL doğrulanmıyor (SSRF)** — `index.html` `saveApiSettings`; iç IP engellenmiyordu. → **DÜZELTİLDİ**
5. **`Notification.requestPermission().then()` `.catch` yok** — `index.html:2430`. → **DÜZELTİLDİ**
6. **Borç kapanışı `>= d.amount` float karşılaştırması** — `index.html:1447,1453`; kuruş birikimi tam ödenen borcu açık gösterebilir. → **DÜZELTİLDİ**
7. **Portföy/yıllık fon kalem yuvarlaması yok** — `index.html:2003,2167`; gösterimde ±1 kuruş sapma. (Açık — düşük öncelik.)

## Orta / Düşük — Doğrulanmış (Açık)

- Offline/online durum bildirimi yok (`online`/`offline` listener yok).
- SW kayıt hatası sessiz — `index.html:2453` yalnız `console.warn`.
- CSV dedup imzası `userId` içermiyor — `index.html:1351`.
- QuotaExceeded kısmen yönetiliyor (bayrak+toast var, arşivleme yok).
- Şema migration yok (yedek `version:2`).
- `prompt()`/`confirm()` yaygın — modal tercih edilmeli.
- Vendor `chart.umd.min.js` için SRI yok; `manifest start_url` `./index.html`.

## Ayıklanan Yanlış Pozitifler (ajan hataları)

- ❌ "`MAX_MONEY` tanımsız" — yanlış, `index.html:788`'de tanımlı.
- ❌ "`it.act` onclick injection/XSS" — yanlış, statik dizi + `esc()` mevcut.
- ❌ "0 TL işlem kabul" — yanlış, `parseMoney` varsayılanı `min:.01`.
- ⚠️ "QuotaExceeded hiç işlenmiyor" — abartılı, yakalanıp toast veriliyor.
- ⚠️ "Gelecek tarih engellenmeli" — ileri tarihli gelir bilinçli özellik.

---

## Bu Turda Uygulanan Düzeltmeler (1–5)

| # | Düzeltme | Yer |
|---|----------|-----|
| 1 | Çoklu sekme `storage` senkronizasyonu + `renderAllViews()` çıkarımı | init / global |
| 2 | Borç `settled` float toleransı (`>= amount - 0.005`) | `Debts.addPayment`, `removePayment` |
| 3 | `Notification.requestPermission` `.catch` handler | `Notifications.enable` |
| 4 | CSP meta etiketi (`connect-src 'self' https:`, `object-src 'none'` vb.) | `<head>` |
| 5 | Proxy URL doğrulama (`new URL`, https zorunlu, iç IP/localhost engeli) | `Portfolio.saveApiSettings` |

**Doğrulama:** satır içi JS `node --check` geçti; mevcut 87 test yeşil.

## Sonraki Öneriler (açık)

- online/offline bildirimi + SW kayıt hatası toast'ı.
- Portföy/fon kalem bazlı `roundMoney()`.
- API anahtarı için yalnızca proxy modu zorunluluğu.
- CSV dedup imzasına `userId` eklenmesi; yedek için şema migration.
