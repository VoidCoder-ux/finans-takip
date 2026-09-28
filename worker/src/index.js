// Finans Takip eşitleme ve bildirim sunucusu (Cloudflare Worker + D1)
//
// - Uygulama dosyalarını (index.html, sw.js …) aynı adresten sunar: /v1/* dışındaki istekler statik varlıklara gider.
// - Veri uçtan uca şifrelidir: istemci AES-GCM ile şifreleyip gönderir, anahtar sunucuya hiç gelmez.
// - Kasa (vault) iyimser eşzamanlılıkla güncellenir: yazma, istemcinin bildiği sürüm güncelse kabul edilir, değilse 409.
// - Bildirim: cihaz yalnız "hangi günlerde haber verilsin" listesini gönderir. Cron o gün içeriksiz bir web push atar;
//   bildirim metnini telefondaki service worker yerel veriden oluşturur.
// - Anlık eşitleme: her kasanın bir VaultHub (Durable Object) örneği vardır; açık uygulamalar ona WebSocket ile bağlanır.
//   Bir cihaz yeni sürüm yazınca hub diğerlerine yalnız {version} haberini yollar, onlar da hemen eşitlenir.

const MAX_BODY = 2_000_000;
const ID_RE = /^[A-Za-z0-9_-]{22,64}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const B64_RE = /^[A-Za-z0-9+/=_-]*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Yalnız tarayıcıların push servislerine istek atılır (sunucu keyfi adreslere istek göndermesin)
const PUSH_HOST_RE = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
const MAX_DEVICES = 10;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
    try {
      const live = url.pathname.match(/^\/v1\/vault\/([A-Za-z0-9_-]{22,64})\/live$/);
      if (live) return await openLive(request, env, live[1], url);
      const res = await route(request, env, url, ctx);
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors(request, env))) h.set(k, v);
      return new Response(res.body, { status: res.status, headers: h });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors(request, env));
      console.error('api error', e && e.stack || e);
      return json({ error: 'server_error' }, 500, cors(request, env));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDuePushes(env));
  }
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Kimlik doğrulama çerez değil Bearer belirteci olduğundan '*' güvenlidir; yine de istenirse kökenler sınırlanabilir
  const allow = !allowed.length ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Register-Key, X-Device',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large');
  try { return JSON.parse(text || '{}'); } catch (e) { throw new HttpError(400, 'bad_json'); }
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/);
  if (!m || !TOKEN_RE.test(m[1])) throw new HttpError(401, 'unauthorized');
  return m[1];
}

// Tarayıcı WebSocket'i başlık gönderemez: belirteç alt protokol olarak gelir ("ft", "<belirteç>"); URL'de/loglarda görünmez
async function openLive(request, env, id, url) {
  if (request.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'websocket_required');
  if (!env.HUB) throw new HttpError(501, 'live_disabled');
  const protos = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
  const token = protos.find(p => TOKEN_RE.test(p));
  if (protos[0] !== 'ft' || !token) throw new HttpError(401, 'unauthorized');
  const row = await loadVault(env, id, token);
  if (!row) throw new HttpError(404, 'no_vault');
  const device = DEVICE_RE.test(url.searchParams.get('device') || '') ? url.searchParams.get('device') : '';
  return env.HUB.get(env.HUB.idFromName(id)).fetch('https://hub/connect?device=' + device, { headers: { Upgrade: 'websocket' } });
}

function notifyHub(env, ctx, id, version, device) {
  if (!env.HUB || !ctx) return;
  ctx.waitUntil(env.HUB.get(env.HUB.idFromName(id)).fetch('https://hub/notify', { method: 'POST', body: JSON.stringify({ version, device }) }).catch(() => {}));
}

// Kasa başına tek örnek; WebSocket Hibernation API ile boştayken ücret/bellek harcamaz
export class VaultHub {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/notify') {
      const { version, device } = await request.json();
      const msg = JSON.stringify({ type: 'version', version });
      for (const ws of this.ctx.getWebSockets()) {
        if (device && this.ctx.getTags(ws).includes(device)) continue; // yazan cihaza haber gerekmez
        try { ws.send(msg); } catch (e) {}
      }
      return new Response('ok');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const device = url.searchParams.get('device');
    this.ctx.acceptWebSocket(server, device ? [device] : []);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'ft' } });
  }
  webSocketMessage() {}
  webSocketClose(ws, code, reason) { try { ws.close(code, reason); } catch (e) {} }
  webSocketError() {}
}

async function loadVault(env, id, token) {
  const row = await env.DB.prepare('SELECT id, token_hash, version, data, updated_at FROM vaults WHERE id = ?').bind(id).first();
  if (!row) return null;
  if (!timingSafeEqualHex(await sha256Hex(token), row.token_hash)) throw new HttpError(403, 'forbidden');
  return row;
}

async function route(request, env, url, ctx) {
  const parts = url.pathname.split('/').filter(Boolean); // ['v1', ...]
  if (parts[1] === 'config' && parts.length === 2 && request.method === 'GET') {
    return json({ api: 1, vapidPublicKey: vapidPublicKey(env), registrationRequired: !!env.REGISTRATION_KEY, live: !!env.HUB });
  }
  if (parts[1] !== 'vault' || !parts[2] || !ID_RE.test(parts[2])) throw new HttpError(404, 'not_found');
  const id = parts[2];
  const token = bearer(request);

  // /v1/vault/:id
  if (parts.length === 3) {
    if (request.method === 'GET') {
      const row = await loadVault(env, id, token);
      if (!row) throw new HttpError(404, 'no_vault');
      const known = Number(url.searchParams.get('known'));
      if (Number.isInteger(known) && known === row.version) return json({ version: row.version, updatedAt: row.updated_at, unchanged: true });
      return json({ version: row.version, updatedAt: row.updated_at, data: row.data });
    }
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const base = Number(body.baseVersion);
      if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'bad_version');
      if (typeof body.data !== 'string' || !body.data || body.data.length > MAX_BODY - 1000 || !B64_RE.test(body.data)) throw new HttpError(400, 'bad_data');
      const now = Date.now();
      const row = await loadVault(env, id, token);
      if (!row) {
        if (base !== 0) return json({ error: 'conflict', version: 0 }, 409);
        if (env.REGISTRATION_KEY && request.headers.get('X-Register-Key') !== env.REGISTRATION_KEY) throw new HttpError(403, 'registration_required');
        const ins = await env.DB.prepare('INSERT OR IGNORE INTO vaults (id, token_hash, version, data, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)')
          .bind(id, await sha256Hex(token), body.data, now, now).run();
        if (!ins.meta.changes) return json({ error: 'conflict', version: -1 }, 409);
        notifyHub(env, ctx, id, 1, request.headers.get('X-Device') || '');
        return json({ version: 1, updatedAt: now }, 201);
      }
      const upd = await env.DB.prepare('UPDATE vaults SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
        .bind(body.data, now, id, base).run();
      if (!upd.meta.changes) {
        const cur = await env.DB.prepare('SELECT version FROM vaults WHERE id = ?').bind(id).first();
        return json({ error: 'conflict', version: cur ? cur.version : 0 }, 409);
      }
      notifyHub(env, ctx, id, base + 1, request.headers.get('X-Device') || '');
      return json({ version: base + 1, updatedAt: now });
    }
    if (request.method === 'DELETE') {
      const row = await loadVault(env, id, token);
      if (!row) return json({ deleted: false });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM push_subs WHERE vault_id = ?').bind(id),
        env.DB.prepare('DELETE FROM vaults WHERE id = ?').bind(id)
      ]);
      return json({ deleted: true });
    }
    throw new HttpError(405, 'method_not_allowed');
  }

  // /v1/vault/:id/push/:deviceId
  if (parts.length === 5 && parts[3] === 'push' && DEVICE_RE.test(parts[4])) {
    const device = parts[4];
    const row = await loadVault(env, id, token);
    if (!row) throw new HttpError(404, 'no_vault');
    if (request.method === 'PUT') {
      const body = await readJson(request);
      let ep;
      try { ep = new URL(String(body.endpoint || '')); } catch (e) { throw new HttpError(400, 'bad_endpoint'); }
      const insecureOk = env.ALLOW_INSECURE_PUSH === '1' && (ep.hostname === '127.0.0.1' || ep.hostname === 'localhost');
      if (!insecureOk && (ep.protocol !== 'https:' || !PUSH_HOST_RE.test(ep.hostname))) throw new HttpError(400, 'bad_endpoint');
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(device_id = ?) AS mine FROM push_subs WHERE vault_id = ?').bind(device, id).first();
      if (cnt && !cnt.mine && cnt.n >= MAX_DEVICES) throw new HttpError(429, 'too_many_devices');
      const days = Array.isArray(body.pingDays) ? body.pingDays.filter(d => typeof d === 'string' && DAY_RE.test(d)).slice(0, 400) : [];
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO push_subs (vault_id, device_id, endpoint, ping_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(vault_id, device_id) DO UPDATE SET endpoint = excluded.endpoint, ping_days = excluded.ping_days, updated_at = excluded.updated_at`)
        .bind(id, device, ep.toString(), JSON.stringify([...new Set(days)].sort()), now, now).run();
      return json({ ok: true, days: days.length });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM push_subs WHERE vault_id = ? AND device_id = ?').bind(id, device).run();
      return json({ ok: true });
    }
    throw new HttpError(405, 'method_not_allowed');
  }
  throw new HttpError(404, 'not_found');
}

// ---- Web Push (içeriksiz; RFC 8030 + VAPID RFC 8292) ----

// Türkiye 2016'dan beri kalıcı UTC+3
export function istanbulDay(now = Date.now()) {
  return new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function b64url(bytes) {
  let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Genel anahtar ayrıca verilmezse gizli anahtarın (JWK) x,y değerlerinden türetilir: 0x04 || x || y
function vapidPublicKey(env) {
  if (env.VAPID_PUBLIC_KEY) return env.VAPID_PUBLIC_KEY;
  try {
    const j = JSON.parse(env.VAPID_PRIVATE_JWK || '');
    const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
    const x = dec(j.x), y = dec(j.y), raw = new Uint8Array(65);
    raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
    return b64url(raw);
  } catch (e) { return ''; }
}

function vapidSubject(env) {
  const s = String(env.VAPID_SUBJECT || '').trim();
  if (!s) return 'mailto:admin@example.com';
  return /^(mailto:|https:)/.test(s) ? s : 'mailto:' + s;
}

let _vapidKey = null;
async function vapidKey(env) {
  if (_vapidKey) return _vapidKey;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  _vapidKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return _vapidKey;
}

export async function vapidAuthHeader(env, endpoint, now = Date.now()) {
  const enc = s => b64url(new TextEncoder().encode(JSON.stringify(s)));
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapidSubject(env) });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
  return 'vapid t=' + unsigned + '.' + b64url(sig) + ', k=' + vapidPublicKey(env);
}

export async function sendDuePushes(env, now = Date.now()) {
  if (!env.VAPID_PRIVATE_JWK || !vapidPublicKey(env)) { console.warn('VAPID anahtarı yok; push atlanıyor'); return { sent: 0, removed: 0, failed: 0 }; }
  const today = istanbulDay(now);
  const { results } = await env.DB.prepare(`SELECT vault_id, device_id, endpoint FROM push_subs
    WHERE ping_days LIKE ? AND (last_sent IS NULL OR last_sent <> ?)`).bind('%"' + today + '"%', today).all();
  let sent = 0, removed = 0, failed = 0;
  for (const s of results || []) {
    try {
      const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidAuthHeader(env, s.endpoint, now), TTL: '86400', Urgency: 'normal', 'Content-Length': '0' } });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM push_subs WHERE vault_id = ? AND device_id = ?').bind(s.vault_id, s.device_id).run(); removed++;
      } else if (res.ok) {
        await env.DB.prepare('UPDATE push_subs SET last_sent = ? WHERE vault_id = ? AND device_id = ?').bind(today, s.vault_id, s.device_id).run(); sent++;
      } else { failed++; console.warn('push', res.status, await res.text().catch(() => '')); }
    } catch (e) { failed++; console.warn('push error', e && e.message); }
  }
  return { sent, removed, failed };
}
