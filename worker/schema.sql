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
