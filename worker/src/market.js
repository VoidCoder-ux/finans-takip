// Piyasa verileri: sunucu düzenli çeker, D1'e kaydeder, uygulamalar /v1/market'ten alır.
// Kaynak adresleri test için ortam değişkeniyle değiştirilebilir (MARKET_*_URL).
//
// - Döviz: TCMB günlük kurlar (resmî, ForexBuying)
// - Altın: Truncgil (gram/çeyrek/tam; TCMB perakende altın yayınlamaz)
// - Fon: TEFAS, tüm yatırım + emeklilik fonlarının son fiyatı (sunucu kimin hangi fonu tuttuğunu bilmez)
// - TÜFE: TCMB tüketici fiyatları tablosu (aylık % değişim)

const UA = 'Mozilla/5.0 (compatible; FinansTakip/1.0; +https://github.com/VoidCoder-ux/finans-takip)';
const SRC = {
  tcmb: 'https://www.tcmb.gov.tr/kurlar/today.xml',
  truncgil: 'https://finans.truncgil.com/v4/today.json',
  tefas: 'https://www.tefas.gov.tr/api/DB/BindHistoryInfo',
  cpi: 'https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari'
};
// Yenileme aralıkları: kurlar saatlik, fonlar ve TÜFE günlük
const MAX_AGE = { rates: 55 * 60e3, funds: 20 * 3600e3, cpi: 20 * 3600e3 };

export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  // "1.234,56" → 1234.56 ; "28.580" → 28580 (Türkçe binlik) ; "1234.56" / "41.6583" → ondalık ; "1,5" → 1.5
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// TCMB today.xml → {USD, EUR, GBP} (döviz alış, birim başına)
export function parseTcmbXml(xml) {
  const out = {};
  const re = /<Currency\b[^>]*\bKod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g;
  let m;
  while ((m = re.exec(String(xml)))) {
    if (!['USD', 'EUR', 'GBP'].includes(m[1])) continue;
    const unit = num((m[2].match(/<Unit>([^<]*)<\/Unit>/) || [])[1]) || 1;
    const buy = num((m[2].match(/<ForexBuying>([^<]*)<\/ForexBuying>/) || [])[1]);
    if (buy > 0) out[m[1]] = buy / unit;
  }
  const d = String(xml).match(/<Tarih_Date[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"/);
  return { rates: out, date: d ? d[3] + '-' + d[2] + '-' + d[1] : '' };
}

// Truncgil v4 → altın (alış öncelikli: elde tutulan varlık bozdurunca alınacak fiyatla değerlenir) + yedek döviz
export function parseTruncgil(data) {
  const pick = (keys) => {
    for (const k of keys) {
      const x = data && data[k];
      if (!x || typeof x !== 'object') continue;
      const v = num(x.Buying ?? x['Alış'] ?? x.alis ?? x.buy ?? x.Selling ?? x['Satış'] ?? x.satis ?? x.sell);
      if (v > 0) return v;
    }
    return 0;
  };
  const r = {
    USD: pick(['USD', 'DOLAR']), EUR: pick(['EUR', 'EURO']), GBP: pick(['GBP', 'STERLIN']),
    GOLD_GRAM: pick(['GRA', 'gram-altin', 'Gram Altın', 'HAS']),
    GOLD_QUARTER: pick(['CEYREKALTIN', 'ceyrek-altin', 'Çeyrek Altın']),
    GOLD_FULL: pick(['TAMALTIN', 'tam-altin', 'Tam Altın'])
  };
  Object.keys(r).forEach(k => { if (!r[k]) delete r[k]; });
  return r;
}

// TEFAS BindHistoryInfo → {KOD: [fiyat, ad]} (aynı fon birden çok günle gelirse en yeni tarih)
export function parseTefas(json) {
  const rows = (json && Array.isArray(json.data)) ? json.data : [];
  const out = {}, seen = {};
  let latest = 0;
  for (const r of rows) {
    const code = String(r.FONKODU || '').trim().toUpperCase();
    const price = num(r.FIYAT);
    const t = Number(r.TARIH) || 0;
    if (!/^[A-Z0-9]{2,5}$/.test(code) || !(price > 0)) continue;
    if (seen[code] && seen[code] >= t) continue;
    seen[code] = t; out[code] = [price, String(r.FONUNVAN || '').trim().slice(0, 90)];
    if (t > latest) latest = t;
  }
  return { prices: out, date: latest ? new Date(latest + 3 * 3600e3).toISOString().slice(0, 10) : '' };
}

// TCMB tüketici fiyatları sayfası → {'YYYY-MM': aylık % değişim}. Satırlar: "MM-YYYY | yıllık % | aylık %"
export function parseCpiHtml(html) {
  const out = {};
  // Hücre dışındaki tüm etiketler (<p>, <strong>, <span>…) atılır; yalnız td/th sınırları kalır
  const text = String(html).replace(/&nbsp;/g, ' ').replace(/<(?!\/?t[dh]\b)[^>]*>/gi, '');
  const re = /(\d{2})-(\d{4})\s*<\/t[dh]>\s*<t[dh][^>]*>\s*(-?[\d.,]+)\s*<\/t[dh]>\s*<t[dh][^>]*>\s*(-?[\d.,]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const mon = +m[1], y = +m[2], monthly = num(m[4]);
    if (mon < 1 || mon > 12 || y < 2000 || y > 2100) continue;
    if (!(monthly > -20 && monthly < 50)) continue;
    out[m[2] + '-' + m[1]] = monthly;
  }
  return out;
}

async function get(url, init) {
  const res = await fetch(url, Object.assign({ headers: { 'User-Agent': UA, Accept: '*/*' }, cf: { cacheTtl: 0 } }, init || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}

function trDate(d) { return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + d.getUTCFullYear(); }

async function fetchRates(env) {
  const out = { provider: [], date: '' };
  const errors = [];
  try {
    const t = parseTcmbXml(await (await get(env.MARKET_TCMB_URL || SRC.tcmb)).text());
    if (!t.rates.USD) throw new Error('boş yanıt');
    Object.assign(out, t.rates); out.date = t.date; out.provider.push('TCMB');
  } catch (e) { errors.push('TCMB: ' + e.message); }
  try {
    const g = parseTruncgil(await (await get(env.MARKET_TRUNCGIL_URL || SRC.truncgil)).json());
    if (!g.GOLD_GRAM && !g.USD) throw new Error('boş yanıt');
    for (const k of Object.keys(g)) if (k.startsWith('GOLD_') || !out[k]) out[k] = g[k];
    out.provider.push('Truncgil');
  } catch (e) { errors.push('Truncgil: ' + e.message); }
  // Mantık kontrolü: yanlış ayrıştırılmış değer yayılmasın (çeyrek ≈ 1,6 gram, tam ≈ 6,4 gram; kurlar makul aralıkta)
  for (const k of ['USD', 'EUR', 'GBP']) if (out[k] && !(out[k] > 1 && out[k] < 10000)) { errors.push(k + ' makul değil'); delete out[k]; }
  if (out.GOLD_GRAM && !(out.GOLD_GRAM > 100 && out.GOLD_GRAM < 1e6)) { errors.push('gram altın makul değil'); delete out.GOLD_GRAM; }
  const ratio = { GOLD_QUARTER: [1.3, 2.0], GOLD_FULL: [5.5, 7.5] };
  for (const k of Object.keys(ratio)) if (out[k] && (!out.GOLD_GRAM || out[k] / out.GOLD_GRAM < ratio[k][0] || out[k] / out.GOLD_GRAM > ratio[k][1])) { errors.push(k + ' makul değil'); delete out[k]; }
  if (!out.USD && !out.GOLD_GRAM) throw new Error(errors.join(' · ') || 'kaynak yok');
  out.provider = out.provider.join(' + ');
  return { data: out, warn: errors.join(' · ') };
}

async function fetchFunds(env, now) {
  const url = env.MARKET_TEFAS_URL || SRC.tefas;
  const all = {};
  let date = '';
  // Hafta sonu/tatilde veri yok: bugünden geriye en fazla 7 gün, her fon türü için ilk dolu gün
  for (const type of ['YAT', 'EMK']) {
    for (let back = 0; back < 7; back++) {
      const d = trDate(new Date(now + 3 * 3600e3 - back * 86400e3));
      const body = new URLSearchParams({ fontip: type, sfontur: '', fonkod: '', fongrup: '', bastarih: d, bittarih: d, fonturkod: '', fonunvantip: '' });
      const res = await get(url, { method: 'POST', body, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx', Accept: 'application/json, text/javascript, */*' } });
      const p = parseTefas(await res.json());
      if (Object.keys(p.prices).length) { Object.assign(all, p.prices); if (p.date > date) date = p.date; break; }
    }
  }
  if (!Object.keys(all).length) throw new Error('TEFAS boş yanıt');
  return { data: { date, count: Object.keys(all).length, prices: all, provider: 'TEFAS' } };
}

async function fetchCpi(env) {
  const months = parseCpiHtml(await (await get(env.MARKET_CPI_URL || SRC.cpi)).text());
  if (Object.keys(months).length < 3) throw new Error('TÜFE tablosu okunamadı');
  return { data: { monthly: months, provider: 'TCMB' } };
}

const FETCHERS = { rates: fetchRates, funds: fetchFunds, cpi: fetchCpi };

export async function readMarket(env) {
  const { results } = await env.DB.prepare('SELECT key, data, updated_at, error, checked_at FROM market').all();
  const out = {};
  for (const r of results || []) {
    let data = null; try { data = JSON.parse(r.data || 'null'); } catch (e) {}
    out[r.key] = { data, updated: r.updated_at || 0, error: r.error || '', checked: r.checked_at || 0 };
  }
  return out;
}

// Eskimiş kalemleri yeniler. Başarısız çekimde son iyi veri korunur, yalnız hata ve deneme zamanı yazılır.
export async function refreshMarket(env, opts = {}) {
  const now = opts.now || Date.now();
  const cur = await readMarket(env);
  const report = {};
  for (const key of opts.keys || Object.keys(FETCHERS)) {
    const c = cur[key];
    const fresh = c && c.data && now - c.updated < MAX_AGE[key];
    const recentTry = c && now - (c.checked || 0) < 10 * 60e3; // hata sonrası 10 dk beklemeden tekrar deneme
    if (!opts.force && (fresh || (recentTry && c.error))) { report[key] = 'fresh'; continue; }
    try {
      const r = await FETCHERS[key](env, now);
      await env.DB.prepare(`INSERT INTO market (key, data, updated_at, error, checked_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, error = excluded.error, checked_at = excluded.checked_at`)
        .bind(key, JSON.stringify(r.data), now, r.warn || '', now).run();
      report[key] = 'ok';
    } catch (e) {
      const msg = String(e && e.message || e).slice(0, 300);
      await env.DB.prepare(`INSERT INTO market (key, data, updated_at, error, checked_at) VALUES (?, 'null', 0, ?, ?)
        ON CONFLICT(key) DO UPDATE SET error = excluded.error, checked_at = excluded.checked_at`).bind(key, msg, now).run();
      report[key] = 'error: ' + msg;
    }
  }
  return report;
}

export function isStale(entry, key, now = Date.now()) {
  return !entry || !entry.data || now - entry.updated > MAX_AGE[key];
}
