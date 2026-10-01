// Banka SMS gelen kutusu: iPhone Kestirmeler otomasyonu, bankadan gelen SMS'in metnini buraya POST eder; uygulama açılınca
// kutuyu çeker, metni telefonda çözümleyip işlem olarak ekler ve kutudan siler.
//
// - Kestirme yalnız "ekleme" yapabilen ayrı bir anahtar kullanır (adresin içinde). Bu anahtar kasa verisini okuyamaz/yazamaz.
// - Kestirmeler şifreleme yapamadığı için metin sunucuda kısa süre açık durur: uygulama alınca siler, alınmayanlar 14 günde silinir.
// - Tek kullanımlık şifre/doğrulama kodu SMS'leri ve tutar içermeyen mesajlar hiç saklanmaz.

export const SMS_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const LABEL_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_TEXT = 1000;
const MAX_PENDING = 300;          // kasa başına bekleyen SMS sınırı (kötüye kullanım)
const MAX_KEYS = 10;              // kasa başına SMS anahtarı (cihaz/kişi)
const KEEP_MS = 14 * 86400_000;
const DUP_MS = 10 * 60_000;       // otomasyon aynı SMS'i iki kez gönderirse tek kayıt

const fold = s => String(s || '').toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a');
// Şifre/kod mesajı: "şifre/kod" sözcüğünün hemen yanında 4-8 haneli bir sayı (kart son 4 hanesi değil) ya da açık OTP ifadesi.
// "Bankamız şifre sormaz" gibi uyarı satırları tek başına mesajı elemez.
const SECRET_RE = /(tek kullanimlik|dogrulama kod|onay kod|guvenlik kod|3d secure|3d ?sifre|\botp\b|passcode|verification code)|(sifre|parola|kod|code)\D{0,15}\b\d{4,8}\b(?!\s*(ile biten|ile sonlanan|nolu|no'lu|numarali))|\b\d{4,8}\b\D{0,12}(sifre|parola|kodu|code)/;
const BANK_RE = /(kart|hesab|harcama|alisveris|odeme|\beft\b|\bfast\b|havale|virman|maas|isyeri|bakiye|tutar|banka|akbank|yapi ?kredi|world|axess|bonus|iade|cekil|cekim|yatir|tahsil|borc|provizyon|islem)/;
const AMOUNT_RE = /\d[\d.,]*\s*(tl|try|₺|usd|eur|gbp)\b|(tl|try|₺)\s*\d/;

export function screenSms(text) {
  const t = String(text || '').replace(/\u0000/g, '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (t.length > MAX_TEXT) return { ok: false, reason: 'too_long' };
  const f = fold(t);
  if (SECRET_RE.test(f)) return { ok: false, reason: 'secret' };
  if (!AMOUNT_RE.test(f)) return { ok: false, reason: 'no_amount' };
  // Otomasyon "TL" geçen her SMS'te çalışabilir: banka hareketine benzemeyen kişisel mesajlar saklanmaz
  if (!BANK_RE.test(f) && !f.includes('ailekasasi-test')) return { ok: false, reason: 'not_bank' };
  return { ok: true, text: t };
}

// Tablolar ilk kullanımda kendiliğinden oluşur (güncellemeden sonra ayrıca "db:init" çalıştırmak gerekmez)
let _schema = null;
export function ensureSchema(env) {
  if (!_schema) _schema = env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sms_keys (key_hash TEXT PRIMARY KEY, vault_id TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS sms_keys_vault ON sms_keys(vault_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sms_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, vault_id TEXT NOT NULL, label TEXT NOT NULL, text TEXT NOT NULL, text_hash TEXT NOT NULL, received_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS sms_inbox_vault ON sms_inbox(vault_id, received_at)')
  ]).then(() => Promise.all(['last_at INTEGER', 'last_reason TEXT'].map(c => env.DB.prepare('ALTER TABLE sms_keys ADD COLUMN ' + c).run().catch(() => {}))))
    .catch(e => { _schema = null; throw e; });
  return _schema;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Kestirmeler gövdeyi JSON, form ya da düz metin olarak gönderebilir
async function readText(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > 8000) return null;
  const raw = await request.text();
  if (raw.length > 8000) return null;
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (type.includes('json') || /^\s*\{/.test(raw)) {
    try { const j = JSON.parse(raw); const v = j && (j.text ?? j.mesaj ?? j.message ?? j.body ?? j.content); return typeof v === 'string' ? v : v != null ? String(v) : ''; } catch (e) { return raw; }
  }
  if (type.includes('x-www-form-urlencoded')) { const p = new URLSearchParams(raw); return p.get('text') ?? p.get('mesaj') ?? raw; }
  if (type.includes('multipart/form-data')) {
    try { const fd = await new Response(raw, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); const v = fd.get('text') ?? fd.get('mesaj'); return typeof v === 'string' ? v : ''; } catch (e) { return ''; }
  }
  return raw;
}

// POST /v1/sms/:key  (herkese açık uç; anahtar = yetki)
export async function postSms(env, key, request, now = Date.now()) {
  await ensureSchema(env);
  if (!SMS_KEY_RE.test(key)) return { status: 404, body: { error: 'not_found' } };
  const row = await env.DB.prepare('SELECT key_hash, vault_id, label FROM sms_keys WHERE key_hash = ?').bind(await sha256Hex('ft-sms|' + key)).first();
  if (!row) return { status: 404, body: { error: 'not_found' } };
  const text = await readText(request);
  // Kurulum tanısı: son gelen isteğin zamanı ve sonucu (metin değil) uygulamada gösterilir
  const mark = reason => env.DB.prepare('UPDATE sms_keys SET last_at = ?, last_reason = ? WHERE key_hash = ?').bind(now, reason, row.key_hash).run().catch(() => {});
  if (text === null) { await mark('too_large'); return { status: 413, body: { error: 'too_large' } }; }
  const s = screenSms(text);
  // Saklanmayan mesajlar için de 200: Kestirme hata vermesin, kullanıcıyı rahatsız etmesin
  if (!s.ok) { await mark(s.reason); return { status: 200, body: { stored: false, reason: s.reason } }; }
  const hash = await sha256Hex(s.text);
  const dup = await env.DB.prepare('SELECT id FROM sms_inbox WHERE vault_id = ? AND text_hash = ? AND received_at > ?').bind(row.vault_id, hash, now - DUP_MS).first();
  if (dup) { await mark('duplicate'); return { status: 200, body: { stored: false, reason: 'duplicate' } }; }
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM sms_inbox WHERE vault_id = ?').bind(row.vault_id).first();
  if (cnt && cnt.n >= MAX_PENDING) { await mark('inbox_full'); return { status: 429, body: { error: 'inbox_full' } }; }
  await mark('stored');
  await env.DB.prepare('INSERT INTO sms_inbox (vault_id, label, text, text_hash, received_at) VALUES (?, ?, ?, ?, ?)').bind(row.vault_id, row.label, s.text, hash, now).run();
  return { status: 200, body: { stored: true }, vault: row.vault_id };
}

// Kasa sahibi (Bearer kasa belirteci) uçları: /v1/vault/:id/sms-key/:label (PUT/DELETE), /v1/vault/:id/inbox (GET), /inbox/ack (POST)
export async function putSmsKey(env, vaultId, label, body, now = Date.now()) {
  await ensureSchema(env);
  if (!LABEL_RE.test(label)) return { status: 400, body: { error: 'bad_label' } };
  const hash = String(body && body.keyHash || '');
  if (!/^[0-9a-f]{64}$/.test(hash)) return { status: 400, body: { error: 'bad_key' } };
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(label = ?) AS mine FROM sms_keys WHERE vault_id = ?').bind(label, vaultId).first();
  if (cnt && !cnt.mine && cnt.n >= MAX_KEYS) return { status: 429, body: { error: 'too_many_keys' } };
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sms_keys WHERE vault_id = ? AND label = ?').bind(vaultId, label),
    env.DB.prepare('INSERT OR REPLACE INTO sms_keys (key_hash, vault_id, label, created_at) VALUES (?, ?, ?, ?)').bind(hash, vaultId, label, now)
  ]);
  return { status: 200, body: { ok: true } };
}

export async function deleteSmsKey(env, vaultId, label) {
  await ensureSchema(env);
  if (!LABEL_RE.test(label)) return { status: 400, body: { error: 'bad_label' } };
  await env.DB.prepare('DELETE FROM sms_keys WHERE vault_id = ? AND label = ?').bind(vaultId, label).run();
  return { status: 200, body: { ok: true } };
}

export async function listInbox(env, vaultId) {
  await ensureSchema(env);
  const rs = await env.DB.prepare('SELECT id, label, text, received_at FROM sms_inbox WHERE vault_id = ? ORDER BY id LIMIT 200').bind(vaultId).all();
  const keys = await env.DB.prepare('SELECT label, last_at, last_reason FROM sms_keys WHERE vault_id = ?').bind(vaultId).all();
  const kr = keys.results || [];
  return { status: 200, body: { items: (rs.results || []).map(r => ({ id: r.id, label: r.label, text: r.text, receivedAt: r.received_at })), labels: kr.map(k => k.label), keys: kr.map(k => ({ label: k.label, lastAt: k.last_at || 0, lastReason: k.last_reason || '' })) } };
}

export async function ackInbox(env, vaultId, body) {
  await ensureSchema(env);
  const ids = (Array.isArray(body && body.ids) ? body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
  if (!ids.length) return { status: 200, body: { deleted: 0 } };
  const r = await env.DB.prepare('DELETE FROM sms_inbox WHERE vault_id = ? AND id IN (' + ids.map(() => '?').join(',') + ')').bind(vaultId, ...ids).run();
  return { status: 200, body: { deleted: r.meta.changes || 0 } };
}

export async function purgeOldSms(env, now = Date.now()) {
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM sms_inbox WHERE received_at < ?').bind(now - KEEP_MS).run();
}
