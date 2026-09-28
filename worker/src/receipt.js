// Fiş okuma (isteğe bağlı): telefonun çektiği fiş fotoğrafını Claude'a gönderir, mağaza/tarih/toplam/kalemleri JSON alır.
// Yalnız ANTHROPIC_API_KEY tanımlıysa açıktır ve yalnız eşitlemedeki cihazlar (kasa belirteci) kullanabilir.
// Fotoğraf sunucuda saklanmaz; kasa başına günlük sınır maliyeti ve kötüye kullanımı sınırlar.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';
export const MAX_IMAGE_B64 = 1_400_000; // ~1 MB JPEG
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_DAILY_LIMIT = 30;

const SYSTEM = `You read photos of shop receipts (mostly Turkish "fiş" and e-Arşiv invoices) and return the purchase as JSON.
- total: the final amount paid (TOPLAM / GENEL TOPLAM / ÖDENECEK). Not the KDV (tax) line, not a subtotal, not the change (PARA ÜSTÜ).
- Turkish receipts write numbers as 1.234,56 (dot = thousands, comma = decimals). Return plain numbers, e.g. 1234.56.
- date: the purchase date as YYYY-MM-DD; empty string if not visible.
- merchant: the shop's short trade name as printed at the top (e.g. "Migros", "BİM", "Opet"), not the full legal company title.
- items: purchased lines with their line totals. Skip tax, discount summaries, payment and change lines. Empty list if unreadable.
- category: pick the single best match from the allowed list for the whole receipt.
- readable: false when the photo is not a receipt or the total cannot be read; then use total 0.`;

function schema(categories) {
  return {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      merchant: { type: 'string' },
      date: { type: 'string' },
      total: { type: 'number' },
      category: { type: 'string', enum: categories },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, amount: { type: 'number' } },
          required: ['name', 'amount'],
          additionalProperties: false
        }
      }
    },
    required: ['readable', 'merchant', 'date', 'total', 'category', 'items'],
    additionalProperties: false
  };
}

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
  const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : 0; };
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

export async function readReceipt(env, vaultId, body, day) {
  const image = String(body && body.image || '');
  const mediaType = MEDIA_TYPES.includes(body && body.mediaType) ? body.mediaType : 'image/jpeg';
  if (!image || image.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image)) return { status: 400, body: { error: 'bad_image' } };
  const categories = cleanCategories(body && body.categories);
  const quota = await useQuota(env, vaultId, day);
  if (!quota.ok) return { status: 429, body: { error: 'daily_limit', limit: quota.limit } };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, maxRetries: 1, timeout: 90_000 });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Fiş okumak basit bir çıkarım işi: düşük efor maliyeti ve süreyi azaltır
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(categories) } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Read this receipt. Allowed categories: ' + categories.join(', ') }
        ]
      }]
    });
  } catch (e) {
    // En özelden genele: yoğunluk / anahtar-bakiye sorunu / bağlantı / diğer API hataları
    if (e instanceof Anthropic.RateLimitError) return { status: 503, body: { error: 'ai_busy' } };
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error('receipt ai auth', e.status); return { status: 503, body: { error: 'ai_key' } }; }
    if (e instanceof Anthropic.APIConnectionError) return { status: 503, body: { error: 'ai_unreachable' } };
    if (e instanceof Anthropic.APIError) { console.error('receipt ai', e.status, e.type, e.message); return { status: 502, body: { error: e.status === 402 ? 'ai_billing' : 'ai_error' } }; }
    throw e;
  }
  if (response.stop_reason === 'refusal') return { status: 422, body: { error: 'ai_refused' } };
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { status: 502, body: { error: 'ai_bad_output' } }; }
  return { status: 200, body: Object.assign(cleanResult(parsed, categories), { used: quota.used, limit: quota.limit }) };
}
