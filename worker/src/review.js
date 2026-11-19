// Ayın değerlendirmesi (isteğe bağlı): uygulamanın hesapladığı aylık özet (tutarlar, kategoriler, işyeri adları; kişi adı, hesap ve bakiye yok)
// DeepSeek'e gider, okunur bir Türkçe değerlendirme döner. Rakamları model üretmez: uygulama her cümledeki tutarı kendi rakamlarıyla
// karşılaştırır, tutmayan cümleyi göstermez. Fiş okumayla aynı günlük sınırı kullanır.

import { useQuota, refund, pickModel, resetModel, DEFAULT_BASE } from './receipt.js';

export const MAX_FACTS = 16000;

const SYSTEM = `You are a careful family budget coach. You get a JSON summary of one month of a Turkish family's finances, computed by their budgeting app.
Write the monthly review in Turkish, addressing the reader as "sen", plain and friendly, no jargon.
Answer with a single json object only:
{"summary": "...", "budget": "...", "mistakes": ["..."], "review": ["..."], "cuts": ["..."]}
- summary: 2-3 sentences on how the month went.
- budget: 1-2 sentences on the budget limits (field budget). If there are none, say so briefly.
- mistakes: where money leaked: budget overruns, spending above income, fees and interest (leaks), missed saving target, unchecked records (openChecks). At most 4.
- review: spending worth a second look: categories above their 3-month average (spikes, with places), frequent small purchases (frequent), subscriptions (subs). Do not declare anything unnecessary; the family decides. At most 4.
- cuts: concrete, prioritised suggestions taken only from the cuts field, with its monthly amount. Never suggest anything that is not in cuts. At most 4.
- Never suggest reducing fixed or essential costs: rent (Kira), building dues (Aidat), loan and card payments, insurance, taxes, education, health, children, utility bills. A spike with fixed: true is not a saving; mention it only in review as something to check (a raise, a double entry or a missing earlier record).
Strict rules:
- Use only numbers that appear in the JSON. Never add, subtract, multiply or compute new totals, differences or percentages.
- Write money as ₺ with Turkish separators, for example ₺12.345,67 or ₺450. Do not write "bin" or "milyon".
- If partial is true the month is not over yet: say so and do not judge it as a full month.
- Do not mention people, accounts or bank balances. No investment, loan or tax advice.
- Empty list when there is nothing to say. Keep each item to one or two sentences.`;

export function cleanReview(r) {
  // Yalnız metin alınır: model nesne ya da sayı döndürürse "[object Object]" gösterilmesin
  const s = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
  const list = v => (Array.isArray(v) ? v : []).map(x => s(x, 400)).filter(Boolean).slice(0, 5);
  return { summary: s(r && r.summary, 900), budget: s(r && r.budget, 600), mistakes: list(r && r.mistakes), review: list(r && r.review), cuts: list(r && r.cuts) };
}

export async function writeReview(env, vaultId, body, day) {
  const facts = body && body.facts;
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return { status: 400, body: { error: 'no_facts' } };
  const text = JSON.stringify(facts);
  if (text.length > MAX_FACTS) return { status: 413, body: { error: 'too_large' } };
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
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Monthly summary JSON:\n' + text }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1800
      }),
      signal: AbortSignal.timeout(60_000)
    });
  } catch (e) {
    await refund(env, vaultId, day);
    return { status: 503, body: { error: 'ai_unreachable' } };
  }
  if (!res.ok) {
    await refund(env, vaultId, day);
    const detail = await res.text().catch(() => '');
    console.error('review ai', res.status, detail.slice(0, 300));
    if (res.status === 401 || res.status === 403) return { status: 503, body: { error: 'ai_key' } };
    if (res.status === 402) return { status: 503, body: { error: 'ai_billing' } };
    if (res.status === 429 || res.status === 503) return { status: 503, body: { error: 'ai_busy' } };
    if ((res.status === 400 || res.status === 404) && /model/i.test(detail)) resetModel();
    return { status: 502, body: { error: 'ai_error' } };
  }
  let content = '';
  try { const j = await res.json(); content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || ''; } catch (e) {}
  let out;
  try { out = cleanReview(JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, ''))); } catch (e) { out = null; }
  if (!out || !out.summary) { await refund(env, vaultId, day); return { status: 502, body: { error: 'ai_bad_output' } }; }
  return { status: 200, body: Object.assign(out, { used: quota.used, limit: quota.limit }) };
}
