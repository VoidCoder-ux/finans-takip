# Graph Report - finans-takip  (2026-10-17)

## Corpus Check
- 74 files · ~169,343 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 1, .toml 1)

## Summary
- 981 nodes · 1258 edges · 61 communities (56 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e0970754`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- qc-budget-period.test.js
- gmail-script.test.js
- ui-scan.js
- statement-import.test.js
- Diğer Bulgular
- ref_http
- text-overlap.test.js
- browser-behavior.test.js
- cards.test.js
- market-e2e.test.js
- insights.test.js
- qc-audit.test.js
- qc-dupes.test.js
- bank-sms.test.js
- qc-calendar.test.js
- qc-health.test.js
- qc-kids.test.js
- qc-moves.test.js
- qc-payday.test.js
- qc-visual.js
- qc-bank.test.js
- qc-bills.test.js
- qc-flow.test.js
- qc-reconcile.test.js
- qc-report.test.js
- qc-data.test.js
- qc-stmt-akbank.test.js
- qc-tags.test.js
- qc-transfers.test.js
- readability.test.js
- ref_fs
- ozet-summary.test.js
- qc-cardpay.test.js
- qc-finance.test.js
- qc-goals.test.js
- Finans Takip — Cloudflare kurulumu
- src/market.js
- manifest.json
- scripts
- qc-loans.test.js
- receipt-pdf.test.js
- ref_path
- qc-push.test.js
- Aile Kasası — Yayın Öncesi Kalite Denetimi (#5)
- qc-audit7.test.js
- Aile Kasası — Yayın Öncesi Kalite Denetimi (#4)
- xss-scan.js
- Finans Takip — Denetim Raporu #3
- gen-vapid.mjs
- sw.js
- CLAUDE.md
- run-all.sh
- qc-files.test.js
- qc-stmt-format.test.js
- quality-regression.test.js
- Finans Takip — Çok Ajanlı Denetim Raporu #2
- date-math.test.js
- 1. Uygulama Envanteri
- Kritik Finans Hataları
- Hesaplama / Render / Entegrasyon Fonksiyonları

## God Nodes (most connected - your core abstractions)
1. `route()` - 22 edges
2. `Finans Takip — Cloudflare kurulumu` - 13 edges
3. `openApp()` - 11 edges
4. `Aile Kasası — Yayın Öncesi Kalite Denetimi (#5)` - 11 edges
5. `Diğer Bulgular` - 11 edges
6. `eq()` - 10 edges
7. `Aile Kasası — Yayın Öncesi Kalite Denetimi (#4)` - 10 edges
8. `acc()` - 9 edges
9. `reload()` - 9 edges
10. `ensureSchema()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Hesaplama / Render / Entegrasyon Fonksiyonları` --references--> `addMonths()`  [INFERRED]
  docs/qa-denetim-raporu.md → tests/date-math.test.js
- `Hesaplama / Render / Entegrasyon Fonksiyonları` --references--> `td()`  [INFERRED]
  docs/qa-denetim-raporu.md → tests/date-math.test.js
- `Hesaplama / Render / Entegrasyon Fonksiyonları` --references--> `reconcileInstallments()`  [INFERRED]
  docs/qa-denetim-raporu.md → tests/quality-regression.test.js
- `Ayıklanan Yanlış Pozitifler (ajan hataları)` --references--> `esc()`  [INFERRED]
  docs/denetim-raporu-2.md → tests/statement-import.test.js
- `FT-008` --references--> `validDate()`  [INFERRED]
  docs/qa-denetim-raporu.md → tests/quality-regression.test.js

## Import Cycles
- None detected.

## Communities (61 total, 5 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.08
Nodes (52): RFC-8030, RFC-8292, b64url(), bearer(), cors(), fetch(), HttpError, istanbulDay() (+44 more)

### Community 1 - "qc-budget-period.test.js"
Cohesion: 0.14
Nodes (10): fs, http, path, pw, R, SEED, srv, T (+2 more)

### Community 2 - "gmail-script.test.js"
Cohesion: 0.05
Nodes (27): crypto, { execFileSync }, fs, google(), http, MSGS, path, pw (+19 more)

### Community 3 - "ui-scan.js"
Cohesion: 0.18
Nodes (9): fs, http, iso(), path, pw, R, seed(), srv (+1 more)

### Community 4 - "statement-import.test.js"
Cohesion: 0.12
Nodes (13): Sayfa Bazlı Kapsama Notları, crc32(), esc(), fs, http, path, pw, R (+5 more)

### Community 5 - "Diğer Bulgular"
Cohesion: 0.20
Nodes (10): Diğer Bulgular, FT-006, FT-007, FT-009, FT-010, FT-011, FT-012, FT-013 (+2 more)

### Community 6 - "ref_http"
Cohesion: 0.05
Nodes (19): bal, fs, G, http, path, pw, R, SEED (+11 more)

### Community 7 - "text-overlap.test.js"
Cohesion: 0.10
Nodes (17): commonModals, configs, datasets, denseModals, denseSeed, firstModals, firstMonthSeed(), fs (+9 more)

### Community 8 - "browser-behavior.test.js"
Cohesion: 0.36
Nodes (17): acc(), balances(), eq(), iso(), monthShift(), openApp(), reload(), run() (+9 more)

### Community 9 - "cards.test.js"
Cohesion: 0.13
Nodes (15): cut1, cut2, day(), dayD(), fs, futMonth, http, iso() (+7 more)

### Community 10 - "market-e2e.test.js"
Cohesion: 0.16
Nodes (10): TEFAS, TEFAS_LEGACY, TRUNCGIL, hits, http, mock, path, { TCMB, TRUNCGIL, TEFAS, CPI } (+2 more)

### Community 11 - "insights.test.js"
Cohesion: 0.13
Nodes (13): d(), fs, http, iso(), M, now, path, pw (+5 more)

### Community 12 - "qc-audit.test.js"
Cohesion: 0.14
Nodes (13): at(), bank(), card(), fs, http, path, pay(), pw (+5 more)

### Community 13 - "qc-dupes.test.js"
Cohesion: 0.12
Nodes (11): ACC(), fs, http, path, pw, R, RECV, seed() (+3 more)

### Community 14 - "bank-sms.test.js"
Cohesion: 0.12
Nodes (10): fs, http, now, path, pw, R, srv, today (+2 more)

### Community 15 - "qc-calendar.test.js"
Cohesion: 0.12
Nodes (12): A, fs, http, path, pw, R, REC, SEED (+4 more)

### Community 16 - "qc-health.test.js"
Cohesion: 0.12
Nodes (12): bal, fs, http, ME, path, pw, R, SEED (+4 more)

### Community 17 - "qc-kids.test.js"
Cohesion: 0.12
Nodes (13): AL, bal, fs, http, NTS, path, pw, R (+5 more)

### Community 18 - "qc-moves.test.js"
Cohesion: 0.12
Nodes (12): ACC(), fs, http, LOAN, path, pw, R, RECV (+4 more)

### Community 19 - "qc-payday.test.js"
Cohesion: 0.12
Nodes (12): bal, fs, http, ME, path, pw, R, SEED (+4 more)

### Community 20 - "qc-visual.js"
Cohesion: 0.12
Nodes (13): auditSrc, configs, fs, http, pages, path, pre, pw (+5 more)

### Community 21 - "qc-bank.test.js"
Cohesion: 0.12
Nodes (9): fs, http, now, path, pw, R, srv, today (+1 more)

### Community 22 - "qc-bills.test.js"
Cohesion: 0.13
Nodes (13): CPI, F(), fs, http, path, pw, R, SEED (+5 more)

### Community 23 - "qc-flow.test.js"
Cohesion: 0.13
Nodes (13): A, at(), fs, http, path, pw, R, SEED (+5 more)

### Community 24 - "qc-reconcile.test.js"
Cohesion: 0.13
Nodes (11): ACC(), fs, http, path, pw, R, seed(), srv (+3 more)

### Community 25 - "qc-report.test.js"
Cohesion: 0.12
Nodes (11): A, fs, http, path, pw, R, SEED, srv (+3 more)

### Community 26 - "qc-data.test.js"
Cohesion: 0.13
Nodes (10): fs, http, os, path, pw, R, srv, TMP (+2 more)

### Community 27 - "qc-stmt-akbank.test.js"
Cohesion: 0.14
Nodes (13): amt(), CP, ebc(), fs, http, PAGE, path, pw (+5 more)

### Community 28 - "qc-tags.test.js"
Cohesion: 0.12
Nodes (11): A, fs, http, path, pw, R, SEED, srv (+3 more)

### Community 29 - "qc-transfers.test.js"
Cohesion: 0.13
Nodes (11): ACC(), fs, http, path, pw, R, RECV, seed() (+3 more)

### Community 30 - "readability.test.js"
Cohesion: 0.14
Nodes (12): cutDay, day(), fs, http, iso(), now, path, pw (+4 more)

### Community 31 - "ref_fs"
Cohesion: 0.05
Nodes (28): fs, http, path, pw, R, srv, ACCS, fs (+20 more)

### Community 32 - "ozet-summary.test.js"
Cohesion: 0.14
Nodes (12): fs, http, iso(), now, path, pw, R, srv (+4 more)

### Community 33 - "qc-cardpay.test.js"
Cohesion: 0.15
Nodes (11): at(), fs, http, path, pay(), pw, R, srv (+3 more)

### Community 34 - "qc-finance.test.js"
Cohesion: 0.14
Nodes (11): day(), fs, http, iso(), now, path, pw, R (+3 more)

### Community 35 - "qc-goals.test.js"
Cohesion: 0.13
Nodes (10): fs, G, http, path, pw, R, SEED, srv (+2 more)

### Community 36 - "Finans Takip — Cloudflare kurulumu"
Cohesion: 0.13
Nodes (14): API özeti, Banka e-postalarıyla otomatik kayıt (Gmail), Banka SMS'leriyle otomatik kayıt (iPhone Kestirmeler), Banka uygulaması bildirimleriyle otomatik kayıt (iPhone, iOS 27+), Ekstre içe aktarma, Finans Takip — Cloudflare kurulumu, Fiş okutma, Geliştirme ve test (+6 more)

### Community 37 - "src/market.js"
Cohesion: 0.26
Nodes (14): fetchCpi(), FETCHERS, fetchFunds(), fetchRates(), get(), MAX_AGE, num(), parseCpiHtml() (+6 more)

### Community 38 - "manifest.json"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, icons, id, lang, name (+5 more)

### Community 39 - "scripts"
Cohesion: 0.14
Nodes (13): wrangler, devDependencies, wrangler, name, private, scripts, db:init, db:local (+5 more)

### Community 40 - "qc-loans.test.js"
Cohesion: 0.14
Nodes (11): fs, http, L, path, pw, R, SEED, srv (+3 more)

### Community 41 - "receipt-pdf.test.js"
Cohesion: 0.19
Nodes (11): fs, http, imagePdf(), path, pdf(), pw, R, srv (+3 more)

### Community 42 - "ref_path"
Cohesion: 0.06
Nodes (15): fs, http, path, pw, R, srv, TYPES, USERS (+7 more)

### Community 43 - "qc-push.test.js"
Cohesion: 0.15
Nodes (9): ACCS, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 44 - "Aile Kasası — Yayın Öncesi Kalite Denetimi (#5)"
Cohesion: 0.17
Nodes (11): 10. Karar: **Şu koşullarla hazır**, 1. Kapsam ve doğrulama tablosu, 2. Bulunan ve düzeltilen sorunlar, 3. Karar gerektiren konular, 4. Çalıştırılan testler, 5. Gerçek cihaz / dış hizmet olmadan doğrulanamayanlar, 6. Kayıp ya da çalınan telefon (yeni), 7. Aile kabul testi (~20 dakika) (+3 more)

### Community 45 - "qc-audit7.test.js"
Cohesion: 0.14
Nodes (9): ACC, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 46 - "Aile Kasası — Yayın Öncesi Kalite Denetimi (#4)"
Cohesion: 0.18
Nodes (10): 1. Kapsam ve doğrulama tablosu, 2. Bulunan ve düzeltilen sorunlar, 3. Karar gerektiren konular, 4. Çalıştırılan testler, 5. Gerçek cihaz / dış hizmet olmadan doğrulanamayanlar, 6. Aile kabul testi (ilk kurulumdan, ~20 dakika), 7. Yedek, geçiş ve geri dönüş planı, 8. Değişiklik özeti (+2 more)

### Community 47 - "xss-scan.js"
Cohesion: 0.20
Nodes (9): fs, http, iso(), path, pw, R, seed(), srv (+1 more)

### Community 48 - "Finans Takip — Denetim Raporu #3"
Cohesion: 0.33
Nodes (5): 1. Hesaplama ve veri hataları (düzeltildi), 2. Eklenen özellikler, 3. Arayüz / erişilebilirlik taraması, 4. Bilinen sınırlar (açık), Finans Takip — Denetim Raporu #3

### Community 53 - "qc-files.test.js"
Cohesion: 0.17
Nodes (8): fs, http, path, pw, R, srv, today, TYPES

### Community 54 - "qc-stmt-format.test.js"
Cohesion: 0.17
Nodes (9): fs, http, LINES, path, pw, R, SEED, srv (+1 more)

### Community 55 - "quality-regression.test.js"
Cohesion: 0.22
Nodes (4): escAttrT(), escT(), jsAttrT(), ok()

### Community 56 - "Finans Takip — Çok Ajanlı Denetim Raporu #2"
Cohesion: 0.22
Nodes (9): Ayıklanan Yanlış Pozitifler (ajan hataları), Bu Turda Uygulanan Düzeltmeler (1–5), Finans Takip — Çok Ajanlı Denetim Raporu #2, Kritik / Yüksek — Doğrulanmış Gerçek Bulgular, Orta / Düşük — Doğrulanmış (Açık), Skor Tablosu (doğrulanmış), Sonraki Öneriler (açık), parseMoney() (+1 more)

### Community 58 - "1. Uygulama Envanteri"
Cohesion: 0.25
Nodes (7): 1. Uygulama Envanteri, Butonlar, Düzeltme Sonrası Regresyon Listesi, Finans Takip QA / PWA / Finansal Hesaplama Denetimi, Formlar ve Alanlar, localStorage Anahtarları, Sayfalar

### Community 59 - "Kritik Finans Hataları"
Cohesion: 0.33
Nodes (6): FT-001, FT-002, FT-003, FT-004, FT-005, Kritik Finans Hataları

### Community 60 - "Hesaplama / Render / Entegrasyon Fonksiyonları"
Cohesion: 0.33
Nodes (6): FT-008, Hesaplama / Render / Entegrasyon Fonksiyonları, addMonths(), td(), reconcileInstallments(), validDate()

## Knowledge Gaps
- **3 isolated node(s):** `wrangler`, `RFC-8030`, `RFC-8292`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 744 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `validDate()` connect `Hesaplama / Render / Entegrasyon Fonksiyonları` to `quality-regression.test.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `wrangler`, `RFC-8030`, `RFC-8292` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07595628415300547 - nodes in this community are weakly interconnected._
- **Why does `Hesaplama / Render / Entegrasyon Fonksiyonları` connect `Hesaplama / Render / Entegrasyon Fonksiyonları` to `1. Uygulama Envanteri`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `qc-budget-period.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Why does `esc()` connect `statement-import.test.js` to `Finans Takip — Çok Ajanlı Denetim Raporu #2`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Should `gmail-script.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05226480836236934 - nodes in this community are weakly interconnected._