-- Finans Takip eşitleme sunucusu (Cloudflare D1)
-- Sunucu yalnız şifreli veri tutar; anahtar hiçbir zaman sunucuya gelmez.

CREATE TABLE IF NOT EXISTS vaults (
  id          TEXT PRIMARY KEY,          -- istemcinin ürettiği rastgele kasa kimliği (base64url)
  token_hash  TEXT NOT NULL,             -- SHA-256(erişim belirteci); belirtecin kendisi saklanmaz
  version     INTEGER NOT NULL DEFAULT 0,-- iyimser eşzamanlılık: her yazmada +1
  data        TEXT NOT NULL,             -- AES-GCM ile şifrelenmiş (ve sıkıştırılmış) veri, base64
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs (
  vault_id    TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  endpoint    TEXT NOT NULL,             -- tarayıcının push servis adresi
  ping_days   TEXT NOT NULL DEFAULT '[]',-- bildirim gönderilecek günler (YYYY-MM-DD, İstanbul saati); ödeme içeriği yok
  last_sent   TEXT,                      -- aynı gün iki kez göndermemek için
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (vault_id, device_id)
);

CREATE INDEX IF NOT EXISTS push_subs_vault ON push_subs(vault_id);

-- Fiş okuma (yapay zekâ) günlük kullanım sayacı: kasa başına sınır; fotoğraf saklanmaz
CREATE TABLE IF NOT EXISTS receipt_usage (
  vault_id    TEXT NOT NULL,
  day         TEXT NOT NULL,             -- YYYY-MM-DD (İstanbul)
  n           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vault_id, day)
);

-- Herkese açık piyasa verileri (kur, altın, fon fiyatları, TÜFE); kişisel veri yok
CREATE TABLE IF NOT EXISTS market (
  key         TEXT PRIMARY KEY,          -- 'rates' | 'funds' | 'cpi'
  data        TEXT NOT NULL DEFAULT 'null',
  updated_at  INTEGER NOT NULL DEFAULT 0,-- son başarılı çekim
  error       TEXT,                      -- son denemenin hatası (başarılıysa boş)
  checked_at  INTEGER NOT NULL DEFAULT 0 -- son deneme
);

-- Banka SMS gelen kutusu (iPhone Kestirmeler). Anahtar yalnız ekleme yapar; metin uygulama alınca silinir, en geç 14 günde temizlenir.
CREATE TABLE IF NOT EXISTS sms_keys (
  key_hash    TEXT PRIMARY KEY,          -- SHA-256('ft-sms|' + anahtar); anahtarın kendisi saklanmaz
  vault_id    TEXT NOT NULL,
  label       TEXT NOT NULL,             -- SMS'in kime ait olduğu (uygulamadaki profil kimliği)
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sms_keys_vault ON sms_keys(vault_id);

CREATE TABLE IF NOT EXISTS sms_inbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id    TEXT NOT NULL,
  label       TEXT NOT NULL,
  text        TEXT NOT NULL,
  text_hash   TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sms_inbox_vault ON sms_inbox(vault_id, received_at);

-- Gmail betiğinden alınmış e-postaların kimlik özeti (aynı e-posta ikinci kez eklenmesin); 28 günde temizlenir
CREATE TABLE IF NOT EXISTS sms_seen (
  hash        TEXT PRIMARY KEY,          -- SHA-256('mail|' + kasa + '|' + Gmail ileti kimliği)
  vault_id    TEXT NOT NULL,
  at          INTEGER NOT NULL
);
