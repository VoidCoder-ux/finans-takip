// Fiş okuma (isteğe bağlı): telefonun fişten okuduğu YAZIYI DeepSeek'e gönderir, mağaza/tarih/toplam/kalemleri JSON alır.
// Fotoğraf gönderilmez (DeepSeek'in genel modelleri metin tabanlıdır). Yalnız DEEPSEEK_API_KEY tanımlıysa açıktır ve yalnız
// eşitlemedeki cihazlar (kasa belirteci) kullanabilir. Kasa başına günlük sınır maliyeti ve kötüye kullanımı sınırlar.

const DEFAULT_BASE = 'https://api.deepseek.com';
// Model adları zamanla değişiyor (deepseek-chat 2026'da emekliye ayrıldı); sunucunun listesinden ilk uygun olan seçilir
const PREFERRED = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'deepseek-chat'];
export const MAX_TEXT = 8000;
const DEFAULT_DAILY_LIMIT = 50;

const SYSTEM = `You extract purchase details from the OCR text of a shop receipt (usually a Turkish "fiş" or e-Arşiv invoice).
The OCR text can contain misread characters (O instead of 0, broken lines). Answer with a single json object only, like:
{"readable": true, "merchant": "Migros", "date": "2026-09-27", "total": 296.40, "category": "Market", "items": [{"name": "Süt 1 L", "amount": 34.90}]}
Rules:
- total: the final amount paid (TOPLAM / GENEL TOPLAM / ÖDENECEK). Not KDV/TOPKDV (tax), not ARA TOPLAM (subtotal), not PARA ÜSTÜ (change), not the cash handed over.
- Turkish numbers use 1.234,56 (dot = thousands, comma = decimals). Output plain numbers such as 1234.56.
- date: purchase date as YYYY-MM-DD, or "" if absent.
- merchant: the shop's short trade name (e.g. "Migros", "BİM", "Opet"), not the legal company title.
- items: purchased lines with their line totals; skip tax, discount summary, payment and change lines. [] if unclear.
- category: exactly one value from the allowed list given by the user.
- readable: false if this is not a receipt or the total cannot be determined; then total 0.`;

export function cleanCategories(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const s = String(c || '').trim().slice(0, 40);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 60) break;
  }
  if (!out.includes('Diğer')) out.push('Diğer');
  return out;
}

// Modelin döndürdüğü değerleri uygulamanın beklediği sınırlara çeker
export function cleanResult(r, categories) {
  const num = v => { const n = Number(typeof v === 'string' ? v.replace(/\s/g, '') : v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : 0; };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r && r.date || '')) ? r.date : '';
  const items = (Array.isArray(r && r.items) ? r.items : []).slice(0, 80)
    .map(i => ({ name: String(i && i.name || '').trim().slice(0, 80), amount: num(i && i.amount) }))
    .filter(i => i.name);
  return {
    readable: !!(r && r.readable) && num(r.total) > 0,
    merchant: String(r && r.merchant || '').trim().slice(0, 80),
    date,
    total: num(r && r.total),
    category: categories.includes(r && r.category) ? r.category : 'Diğer',
    items
  };
}

async function useQuota(env, vaultId, day) {
  const limit = Math.max(1, Number(env.RECEIPT_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT);
  const row = await env.DB.prepare(`INSERT INTO receipt_usage (vault_id, day, n) VALUES (?, ?, 1)
    ON CONFLICT(vault_id, day) DO UPDATE SET n = n + 1 RETURNING n`).bind(vaultId, day).first();
  return { ok: !row || row.n <= limit, used: row ? row.n : 1, limit };
}

let _model = null;
async function pickModel(env, base) {
  if (env.DEEPSEEK_MODEL) return env.DEEPSEEK_MODEL;
  if (_model) return _model;
  try {
    const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY } });
    if (r.ok) {
      const ids = ((await r.json()).data || []).map(m => m && m.id).filter(Boolean);
      _model = PREFERRED.find(id => ids.includes(id)) || ids.find(id => /flash/.test(id) && !/vision/.test(id)) || ids.find(id => !/vision|reason/.test(id)) || null;
    }
  } catch (e) {}
  return _model || PREFERRED[0];
}

export async function readReceipt(env, vaultId, body, day) {
  const text = String(body && body.text || '').replace(/\u0000/g, '').trim();
  if (text.length < 10) return { status: 400, body: { error: 'no_text' } };
  if (text.length > MAX_TEXT) return { status: 413, body: { error: 'too_large' } };
  const categories = cleanCategories(body && body.categories);
  const quota = await useQuota(env, vaultId, day);
  if (!quota.ok) return { status: 429, body: { error: 'daily_limit', limit: quota.limit } };

  const base = String(env.DEEPSEEK_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model = await pickModel(env, base);
  let res;
  try {
    res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.DEEPSEEK_API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: 'Allowed categories: ' + categories.join(', ') + '\n\nReceipt OCR text:\n' + text }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 2000
      }),
      signal: AbortSignal.timeout(60_000)
    });
  } catch (e) {
    return { status: 503, body: { error: 'ai_unreachable' } };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('receipt ai', res.status, detail.slice(0, 300));
    if (res.status === 401 || res.status === 403) return { status: 503, body: { error: 'ai_key' } };
    if (res.status === 402) return { status: 503, body: { error: 'ai_billing' } };
    if (res.status === 429 || res.status === 503) return { status: 503, body: { error: 'ai_busy' } };
    if ((res.status === 400 || res.status === 404) && /model/i.test(detail)) _model = null;
    return { status: 502, body: { error: 'ai_error' } };
  }
  let content = '';
  try { const j = await res.json(); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || ''; } catch (e) {}
  let parsed;
  try { parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { return { status: 502, body: { error: 'ai_bad_output' } }; }
  return { status: 200, body: Object.assign(cleanResult(parsed, categories), { used: quota.used, limit: quota.limit }) };
}
