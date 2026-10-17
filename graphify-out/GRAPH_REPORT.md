# Graph Report - finans-takip  (2026-10-17)

## Corpus Check
- 77 files · ~205,784 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 1, .toml 1)

## Summary
- 1740 nodes · 4855 edges · 92 communities (86 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 100 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `39a3c592`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- qc-budget-period.test.js
- gmail-script.test.js
- ui-scan.js
- statement-import.test.js
- Diğer Bulgular
- qc-split.test.js
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
- index.html.js
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
- url
- CLAUDE.md
- run-all.sh
- qc-files.test.js
- qc-stmt-format.test.js
- quality-regression.test.js
- refreshRates
- date-math.test.js
- build
- render
- join
- normalize
- toast
- plan
- get
- renderAll
- _rh
- fmt
- nav
- test
- base
- one
- renderCard
- qc-ideas.test.js
- edit
- compute
- prepare
- importCSVFile
- ref_http
- _renderChart
- _round
- td
- decrypt
- isTransfer
- qc-cards.test.js
- qc-finance2.test.js
- normalize
- graphify-update.js
- receipt-e2e.test.js
- roundMoney
- sms-e2e.test.js
- data

## God Nodes (most connected - your core abstractions)
1. `td()` - 104 edges
2. `join()` - 101 edges
3. `toast()` - 100 edges
4. `render()` - 90 edges
5. `roundMoney()` - 84 edges
6. `test()` - 84 edges
7. `fmt()` - 77 edges
8. `add()` - 71 edges
9. `edit()` - 70 edges
10. `compute()` - 70 edges

## Surprising Connections (you probably didn't know these)
- `FT-008` --references--> `fd()`  [INFERRED]
  docs/qa-denetim-raporu.md → graphify-src/index.html.js
- `FT-010` --references--> `addPayment()`  [INFERRED]
  docs/qa-denetim-raporu.md → graphify-src/index.html.js
- `FT-009` --references--> `period()`  [INFERRED]
  docs/qa-denetim-raporu.md → graphify-src/index.html.js
- `Sayfalar` --references--> `fund()`  [INFERRED]
  docs/qa-denetim-raporu.md → graphify-src/index.html.js
- `1. Kapsam ve doğrulama tablosu` --references--> `cards()`  [INFERRED]
  docs/denetim-raporu-4.md → graphify-src/index.html.js

## Import Cycles
- None detected.

## Communities (92 total, 6 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.06
Nodes (66): RFC-8030, RFC-8292, b64url(), bearer(), cors(), fetch(), HttpError, istanbulDay() (+58 more)

### Community 1 - "qc-budget-period.test.js"
Cohesion: 0.14
Nodes (10): fs, http, path, pw, R, SEED, srv, T (+2 more)

### Community 2 - "gmail-script.test.js"
Cohesion: 0.10
Nodes (14): crypto, { execFileSync }, fs, google(), http, MSGS, path, pw (+6 more)

### Community 3 - "ui-scan.js"
Cohesion: 0.18
Nodes (9): fs, http, iso(), path, pw, R, seed(), srv (+1 more)

### Community 4 - "statement-import.test.js"
Cohesion: 0.12
Nodes (12): crc32(), esc(), fs, http, path, pw, R, srv (+4 more)

### Community 5 - "Diğer Bulgular"
Cohesion: 0.06
Nodes (33): 1. Uygulama Envanteri, Butonlar, Diğer Bulgular, Düzeltme Sonrası Regresyon Listesi, Finans Takip QA / PWA / Finansal Hesaplama Denetimi, Formlar ve Alanlar, FT-001, FT-002 (+25 more)

### Community 6 - "qc-split.test.js"
Cohesion: 0.12
Nodes (12): bal, fs, G, http, path, pw, R, SEED (+4 more)

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
Cohesion: 0.15
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
Cohesion: 0.13
Nodes (11): A, fs, http, path, pw, R, SEED, srv (+3 more)

### Community 26 - "qc-data.test.js"
Cohesion: 0.14
Nodes (10): fs, http, os, path, pw, R, srv, TMP (+2 more)

### Community 27 - "qc-stmt-akbank.test.js"
Cohesion: 0.14
Nodes (12): CP, ebc(), fs, http, PAGE, path, pw, R (+4 more)

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
Cohesion: 0.11
Nodes (13): fs, http, path, pw, R, srv, fs, http (+5 more)

### Community 32 - "ozet-summary.test.js"
Cohesion: 0.14
Nodes (12): fs, http, iso(), now, path, pw, R, srv (+4 more)

### Community 33 - "qc-cardpay.test.js"
Cohesion: 0.16
Nodes (11): at(), fs, http, path, pay(), pw, R, srv (+3 more)

### Community 34 - "qc-finance.test.js"
Cohesion: 0.14
Nodes (11): day(), fs, http, iso(), now, path, pw, R (+3 more)

### Community 35 - "qc-goals.test.js"
Cohesion: 0.13
Nodes (11): c(), fs, G, http, path, pw, R, SEED (+3 more)

### Community 36 - "Finans Takip — Cloudflare kurulumu"
Cohesion: 0.13
Nodes (14): API özeti, Banka e-postalarıyla otomatik kayıt (Gmail), Banka SMS'leriyle otomatik kayıt (iPhone Kestirmeler), Banka uygulaması bildirimleriyle otomatik kayıt (iPhone, iOS 27+), Ekstre içe aktarma, Finans Takip — Cloudflare kurulumu, Fiş okutma, Geliştirme ve test (+6 more)

### Community 37 - "index.html.js"
Cohesion: 0.03
Nodes (94): _accs(), alerts(), _bankTxn(), _brand(), byMonth(), calPick(), _cl(), _cmp() (+86 more)

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

### Community 43 - "qc-push.test.js"
Cohesion: 0.17
Nodes (9): ACCS, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 44 - "Aile Kasası — Yayın Öncesi Kalite Denetimi (#5)"
Cohesion: 0.17
Nodes (11): 10. Karar: **Şu koşullarla hazır**, 1. Kapsam ve doğrulama tablosu, 2. Bulunan ve düzeltilen sorunlar, 3. Karar gerektiren konular, 4. Çalıştırılan testler, 5. Gerçek cihaz / dış hizmet olmadan doğrulanamayanlar, 6. Kayıp ya da çalınan telefon (yeni), 7. Aile kabul testi (~20 dakika) (+3 more)

### Community 45 - "qc-audit7.test.js"
Cohesion: 0.15
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

### Community 50 - "url"
Cohesion: 0.25
Nodes (5): copy(), db(), req(), url(), ASSETS

### Community 53 - "qc-files.test.js"
Cohesion: 0.17
Nodes (8): fs, http, path, pw, R, srv, today, TYPES

### Community 54 - "qc-stmt-format.test.js"
Cohesion: 0.17
Nodes (9): fs, http, LINES, path, pw, R, SEED, srv (+1 more)

### Community 55 - "quality-regression.test.js"
Cohesion: 0.16
Nodes (6): escAttrT(), escT(), jsAttrT(), ok(), parseMoney(), roundMoney()

### Community 56 - "refreshRates"
Cohesion: 0.22
Nodes (8): Ayıklanan Yanlış Pozitifler (ajan hataları), Finans Takip — Çok Ajanlı Denetim Raporu #2, Kritik / Yüksek — Doğrulanmış Gerçek Bulgular, Orta / Düşük — Doğrulanmış (Açık), Skor Tablosu (doğrulanmış), Sonraki Öneriler (açık), _parseTruncgil(), read()

### Community 58 - "build"
Cohesion: 0.15
Nodes (26): _bin(), build(), delta(), cardDues(), cards(), _cut(), _dupes(), group() (+18 more)

### Community 59 - "render"
Cohesion: 0.12
Nodes (27): _account(), activeTagFor(), add(), addExpense(), _adopt(), _after(), _applyFunds(), _bankNames() (+19 more)

### Community 60 - "join"
Cohesion: 0.12
Nodes (43): _accOpts(), _bars(), _catOpts(), ci(), _compare(), deltaCell(), esc(), escAttr() (+35 more)

### Community 61 - "normalize"
Cohesion: 0.07
Nodes (40): FT-013, all(), applyA11y(), bindEvents(), _body(), checkDueBills(), _collapsed(), daysUntil() (+32 more)

### Community 62 - "toast"
Cohesion: 0.13
Nodes (37): Bu Turda Uygulanan Düzeltmeler (1–5), accLabel(), addKumbara(), _askPdfPassword(), close(), closeModal(), confirmModal(), confirmPay() (+29 more)

### Community 63 - "plan"
Cohesion: 0.29
Nodes (10): byBankName(), _cfg(), editRates(), _goalByCat(), label(), _own(), plan(), rates() (+2 more)

### Community 64 - "get"
Cohesion: 0.14
Nodes (34): accept(), addAccQuick(), addInternal(), addPlan(), _addTransfer(), adjustBalance(), _apply(), autoPair() (+26 more)

### Community 65 - "renderAll"
Cohesion: 0.13
Nodes (34): addContrib(), addPayment(), applyExisting(), chooseDevice(), contribute(), createEmergency(), _doRemove(), download() (+26 more)

### Community 66 - "_rh"
Cohesion: 0.30
Nodes (15): _addD(), _dueDate(), f2days(), freq(), key(), _lastDue(), _loggedIn(), _logOther() (+7 more)

### Community 67 - "fmt"
Cohesion: 0.11
Nodes (31): _actions(), _barCls(), _calAmt(), _calItem(), _dd(), detail(), _dh(), fd() (+23 more)

### Community 68 - "nav"
Cohesion: 0.16
Nodes (23): _ai(), _begin(), _busy(), _canvas(), _found(), _frame(), go(), guessCategory() (+15 more)

### Community 69 - "test"
Cohesion: 0.09
Nodes (42): _amounts(), _amt(), _analyze(), _bank(), bankKind(), _bestCand(), byBank(), _cands() (+34 more)

### Community 70 - "base"
Cohesion: 0.10
Nodes (17): base(), open(), open(), open(), open(), device(), open(), open() (+9 more)

### Community 71 - "one"
Cohesion: 0.14
Nodes (22): _cardPay(), dismiss(), dismissAll(), _dupeXfer(), ingest(), one(), _isMail(), _isPush() (+14 more)

### Community 72 - "renderCard"
Cohesion: 0.08
Nodes (55): _aiReady(), api(), available(), _cache(), change(), clearFilters(), _closeLive(), configured() (+47 more)

### Community 73 - "qc-ideas.test.js"
Cohesion: 0.12
Nodes (14): at(), bank(), card(), D(), fs, http, path, pw (+6 more)

### Community 74 - "edit"
Cohesion: 0.21
Nodes (19): _accOptions(), allTags(), _catOptions(), edit(), _editInstallment(), _editInternal(), _editLoanPay(), _editTransfer() (+11 more)

### Community 75 - "compute"
Cohesion: 0.16
Nodes (27): average(), calNav(), _card(), catNet(), catTotals(), closeMonthCard(), compute(), dueIn() (+19 more)

### Community 76 - "prepare"
Cohesion: 0.21
Nodes (13): _btn(), fileMode(), generate(), generateMonth(), _opts(), _pages(), pdfFile(), prepare() (+5 more)

### Community 77 - "importCSVFile"
Cohesion: 0.09
Nodes (23): _colIdx(), csvAmount(), csvFold(), csvText(), _ebc(), importCSV(), importCSVFile(), col() (+15 more)

### Community 78 - "ref_http"
Cohesion: 0.12
Nodes (6): http, path, TODAY, TOMORROW, crypto, http

### Community 79 - "_renderChart"
Cohesion: 0.47
Nodes (6): _bar(), canvasMsg(), cv(), _donut(), _drawMsg(), _renderChart()

### Community 80 - "_round"
Cohesion: 0.22
Nodes (14): collect(), _content(), _generic(), _listKey(), mergeList(), visit(), mergeRecord(), mergeSnapshot() (+6 more)

### Community 81 - "td"
Cohesion: 0.17
Nodes (25): _acc(), active(), autoRun(), buildCalendar(), causes(), _d(), dates(), debts() (+17 more)

### Community 82 - "decrypt"
Cohesion: 0.20
Nodes (12): aesKey(), b64u(), cleanUrl(), codeOf(), decrypt(), encrypt(), _newIds(), parseCode() (+4 more)

### Community 83 - "isTransfer"
Cohesion: 0.29
Nodes (14): Hesaplama / Render / Entegrasyon Fonksiyonları, allTimeTotals(), avgExpense3mo(), catRange(), essentialAvg(), flowOf(), isRefund(), isTransfer() (+6 more)

### Community 84 - "qc-cards.test.js"
Cohesion: 0.17
Nodes (9): at(), fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 85 - "qc-finance2.test.js"
Cohesion: 0.17
Nodes (9): ACCS, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 86 - "normalize"
Cohesion: 0.23
Nodes (12): arr(), cleanDate(), cleanLast4(), cleanStoredId(), cleanStoredRef(), dateFromTs(), normalize(), cleanAllowance() (+4 more)

### Community 87 - "graphify-update.js"
Cohesion: 0.12
Nodes (10): { execFileSync }, path, path, { execSync }, fs, OUT, path, R (+2 more)

### Community 88 - "receipt-e2e.test.js"
Cohesion: 0.25
Nodes (4): crypto, http, mock, reply

### Community 89 - "roundMoney"
Cohesion: 0.20
Nodes (12): _bal(), balanceAt(), _history(), _instDue(), monthly(), _moved(), reconcileAccountBalances(), reconcileInstallments() (+4 more)

### Community 91 - "data"
Cohesion: 0.39
Nodes (9): adjust(), _applyCpi(), cpiYoY(), data(), forecast(), indexAt(), isStale(), latestMonth() (+1 more)

## Knowledge Gaps
- **3 isolated node(s):** `wrangler`, `RFC-8030`, `RFC-8292`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 753 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `items()` connect `build` to `_rh`, `fmt`, `index.html.js`, `qc-ideas.test.js`, `edit`, `td`, `isTransfer`, `roundMoney`, `render`, `join`, `normalize`, `toast`, `plan`?**
  _High betweenness centrality (0.295) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `render()` (e.g. with `_card()` and `cv()`) actually correct?**
  _`render()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `wrangler`, `RFC-8030`, `RFC-8292` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05964912280701754 - nodes in this community are weakly interconnected._
- **Why does `base()` connect `base` to `test`, `index.html.js`, `renderCard`, `edit`, `compute`, `qc-cards.test.js`, `plan`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `qc-budget-period.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Why does `Finans Takip — Çok Ajanlı Denetim Raporu #2` connect `refreshRates` to `toast`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._