# Graph Report - finans-takip  (2026-10-17)

## Corpus Check
- 78 files · ~157,342 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 1, .toml 1)

## Summary
- 1777 nodes · 4914 edges · 87 communities (84 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 110 edges (avg confidence: 0.84)
- Token cost: 203,156 input · 0 output

## Community Hubs (Navigation)
- Uygulama: genel yardımcılar ve Excel
- Eşitleme, e-posta ve push kurulumu
- Worker sunucu API'si
- İşlem ekle/düzenle ve bakiye
- Kredi, borç ve maaş planı
- Sayfa çizimi ve listeler
- Nakit akışı ve ay toplamları
- Bütçe, istatistik ve ay özeti
- Worker belgeleri ve yayın hattı
- Pencereler, para girişi, hedef katkısı
- Para biçimi ve kart ödemesi
- HTML kaçış ve seçim kutuları
- Eşitleme birleştirme ve PDF rapor
- Kart ve bildirim testleri
- Tekrarlayan işlemler
- graphify aracı ve eşitleme testi
- Banka SMS ayrıştırıcı
- Yazı çakışma testi
- Gmail betiği testi
- Banka mesajı onay kuyruğu
- QA denetim raporu bulguları
- Fiş okutma (kamera/PDF)
- Ödeme hesabı ve kamera testleri
- Öneri testleri
- Tarayıcı davranış testi
- Piyasa verisi testleri
- Ekstre içe aktarma testi
- Kart testleri
- Uyarı motoru testleri
- Çift kayıt testleri
- Kart ekstre tarihleri
- Banka SMS testi
- Hesap denetimi testi
- Sağlık puanı testi
- Çocuklar testi
- Banka hareketleri testi
- Maaş günü testi
- Görsel tarama
- Çok ajanlı denetim raporu (2)
- Yayın öncesi kalite raporu (4)
- Eşitleme uçtan uca testleri
- Banka kanal testleri
- Fatura ve enflasyon testi
- Takvim testi
- Para akışı testi
- Mutabakat testi
- 50/30/20 testi
- Etiket testi
- Aktarım testi
- Okunabilirlik testi
- Gezinme ve acil durum
- Özet sayfası testi
- Finans hesap testi
- Hedef testi
- Rapor testi
- Akbank ekstre testi
- Kalite regresyon testi
- Banka mesajı ve aktarım bulguları (5)
- PWA manifest
- Veri testi
- Worker paket ayarları
- Bütçe dönemi testi
- Kart ödemesi testi
- Kredi testi
- Fiş PDF testi
- Ekstre PDF ayrıştırma
- Fiş metni ve karekod
- Denetim 7 testi
- Veri temizleme (normalize)
- Tarih hesap testi
- Dosya testi
- Finans hesap testi 2
- Push bildirim testi
- Ekstre biçim testi
- Arayüz taraması
- Denetim raporu 3
- Takvim (ICS) ve yaklaşan ödemeler
- XSS taraması
- Döviz/altın kurları
- CSV içe aktarma
- Fiş uçtan uca testi
- SMS uçtan uca testi
- graphify kuralları
- Yedekleme
- Tam test paketi kuralı
- Belirsiz not ve çift kayıt
- VAPID anahtar üretimi

## God Nodes (most connected - your core abstractions)
1. `td()` - 104 edges
2. `join()` - 101 edges
3. `toast()` - 100 edges
4. `render()` - 90 edges
5. `roundMoney()` - 84 edges
6. `test()` - 84 edges
7. `fmt()` - 76 edges
8. `add()` - 71 edges
9. `edit()` - 70 edges
10. `compute()` - 70 edges

## Surprising Connections (you probably didn't know these)
- `compute()` --indirect_call--> `D()`  [INFERRED]
  graphify-src/index.html.js → tests/qc-ideas.test.js
- `tests/run-all.sh Full Test Run` --semantically_similar_to--> `Local Development and Testing`  [INFERRED] [semantically similar]
  .github/workflows/test.yml → worker/README.md
- `add()` --indirect_call--> `amt()`  [INFERRED]
  graphify-src/index.html.js → tests/qc-stmt-akbank.test.js
- `edit()` --indirect_call--> `acc()`  [INFERRED]
  graphify-src/index.html.js → tests/browser-behavior.test.js
- `_refresh()` --indirect_call--> `c()`  [INFERRED]
  graphify-src/index.html.js → tests/qc-goals.test.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Bank Transaction Ingest Channels into Inbox** — worker_readme_bank_sms_ingest, worker_readme_bank_notification_ingest, worker_readme_gmail_apps_script, worker_readme_inbox, worker_readme_cross_channel_dedup [EXTRACTED 1.00]
- **CI Test-then-Deploy Pipeline** — _github_workflows_deploy_workflow, _github_workflows_deploy_test, _github_workflows_test_workflow, _github_workflows_deploy_deploy, _github_workflows_deploy_wrangler_deploy [EXTRACTED 1.00]
- **Real-Time Encrypted Sync** — worker_readme_device_sync, worker_readme_client_side_encryption, worker_readme_durable_object_websocket, worker_readme_field_level_merge, worker_readme_vault_api [INFERRED 0.85]
- **Banka SMS/E-posta Ayrıştırma Düzeltmeleri** — docs_denetim_raporu_4_sms_tekrar_denetimi_f6, docs_denetim_raporu_4_sms_taksit_plani_f7, docs_denetim_raporu_4_sms_kutusu_ack_korumasi_f10, docs_denetim_raporu_5_faiz_aidat_gider_g3, docs_denetim_raporu_5_provizyon_onay_g4, docs_denetim_raporu_5_maas_ikramiye_g5, docs_denetim_raporu_5_onay_kuyrugu [INFERRED 0.85]
- **Gider Sayılmayan Hesaplar Arası Aktarım Modeli** — docs_denetim_raporu_3_hesaplar_arasi_transfer, docs_denetim_raporu_4_aktarim_turu_f8, docs_denetim_raporu_5_virman_onay_g8 [INFERRED 0.85]
- **Yayın Öncesi Kalite Kapısı** — docs_denetim_raporu_4_tam_test_ci_f23, docs_denetim_raporu_4_aile_kabul_testi, docs_denetim_raporu_4_geri_donus_plani, docs_denetim_raporu_4_kosullu_hazir_karari [EXTRACTED 1.00]

## Communities (87 total, 3 thin omitted)

### Community 0 - "Uygulama: genel yardımcılar ve Excel"
Cohesion: 0.03
Nodes (100): _accOptions(), _accs(), all(), _body(), _brand(), byBankName(), byMonth(), _calAmt() (+92 more)

### Community 1 - "Eşitleme, e-posta ve push kurulumu"
Cohesion: 0.05
Nodes (83): aesKey(), _aiReady(), api(), available(), b64u(), _bar(), _cache(), canvasMsg() (+75 more)

### Community 2 - "Worker sunucu API'si"
Cohesion: 0.06
Nodes (66): RFC-8030, RFC-8292, b64url(), bearer(), cors(), fetch(), HttpError, istanbulDay() (+58 more)

### Community 3 - "İşlem ekle/düzenle ve bakiye"
Cohesion: 0.10
Nodes (58): activeTagFor(), add(), addAccQuick(), addExpense(), addInternal(), addPlan(), _addTransfer(), adjustBalance() (+50 more)

### Community 4 - "Kredi, borç ve maaş planı"
Cohesion: 0.09
Nodes (47): alerts(), _bal(), balanceAt(), _card(), _cfg(), _cl(), compute(), dateMonth() (+39 more)

### Community 5 - "Sayfa çizimi ve listeler"
Cohesion: 0.09
Nodes (46): active(), addPayment(), _adopt(), _after(), applyExisting(), _bankTxn(), _bannerHtml(), _calItem() (+38 more)

### Community 6 - "Nakit akışı ve ay toplamları"
Cohesion: 0.13
Nodes (39): allTimeTotals(), _bin(), build(), delta(), cards(), catNet(), catRange(), causes() (+31 more)

### Community 7 - "Bütçe, istatistik ve ay özeti"
Cohesion: 0.10
Nodes (36): adjust(), _applyCpi(), average(), calNav(), catTotals(), closeMonthCard(), _compare(), deltaCell() (+28 more)

### Community 8 - "Worker belgeleri ve yayın hattı"
Cohesion: 0.08
Nodes (34): deploy job, Secret Presence and Format Check, deploy.yml test job (reusable test.yml), Cloudflare Deploy Workflow, Write database_id and VAPID_SUBJECT into wrangler.toml, npx wrangler deploy, Local .dev.vars with Fake Keys and Mock Market URLs, test job (+26 more)

### Community 9 - "Pencereler, para girişi, hedef katkısı"
Cohesion: 0.12
Nodes (35): addContrib(), addKumbara(), _askPdfPassword(), close(), closeModal(), contribute(), editCpi(), editPrice() (+27 more)

### Community 10 - "Para biçimi ve kart ödemesi"
Cohesion: 0.15
Nodes (33): accLabel(), _actions(), _barCls(), confirmPay(), _dd(), detail(), exportCSV(), fd() (+25 more)

### Community 11 - "HTML kaçış ve seçim kutuları"
Cohesion: 0.18
Nodes (32): _accOpts(), _bars(), _catOpts(), ci(), esc(), escAttr(), _fillLimitWith(), _fillOwner() (+24 more)

### Community 12 - "Eşitleme birleştirme ve PDF rapor"
Cohesion: 0.08
Nodes (29): _btn(), collect(), _content(), db(), fileMode(), generate(), generateMonth(), _generic() (+21 more)

### Community 13 - "Kart ve bildirim testleri"
Cohesion: 0.06
Nodes (26): base(), open(), open(), open(), open(), at(), fs, http (+18 more)

### Community 14 - "Tekrarlayan işlemler"
Cohesion: 0.16
Nodes (26): _account(), _addD(), autoRun(), _dueDate(), _ensureCat(), f2days(), freq(), inkColor() (+18 more)

### Community 15 - "graphify aracı ve eşitleme testi"
Cohesion: 0.08
Nodes (12): { execFileSync }, path, path, TODAY, path, { execSync }, fs, OUT (+4 more)

### Community 16 - "Banka SMS ayrıştırıcı"
Cohesion: 0.16
Nodes (22): _amounts(), _bank(), bankKind(), _cands(), _cardsKnown(), _cat(), _category(), csvSafe() (+14 more)

### Community 17 - "Yazı çakışma testi"
Cohesion: 0.10
Nodes (17): commonModals, configs, datasets, denseModals, denseSeed, firstModals, firstMonthSeed(), fs (+9 more)

### Community 18 - "Gmail betiği testi"
Cohesion: 0.10
Nodes (14): crypto, { execFileSync }, fs, google(), http, MSGS, path, pw (+6 more)

### Community 19 - "Banka mesajı onay kuyruğu"
Cohesion: 0.18
Nodes (20): accept(), _cardPay(), _dupeXfer(), ingest(), one(), _isMail(), _isPre(), _isPush() (+12 more)

### Community 20 - "QA denetim raporu bulguları"
Cohesion: 0.14
Nodes (19): CSV Dedup İmzası (userId eksik), Açılış Bakiyesi Geçmişten Türetme, F2 İleri Tarihli Kayıt Planlı Bildirimi, FT-001 Gelecek Tarihli İşlem Bakiyeyi Değiştiriyor, FT-003 CSV Import Hesap Kolonunu Okumuyor, FT-004 İşlemde Hesap Seçimi Yok, FT-005 Bakiye Drift (openingBalance Eksik), FT-006 API Anahtarı localStorage'da (+11 more)

### Community 21 - "Fiş okutma (kamera/PDF)"
Cohesion: 0.19
Nodes (19): _ai(), _begin(), _busy(), _found(), _frame(), go(), _hint(), onFile() (+11 more)

### Community 22 - "Ödeme hesabı ve kamera testleri"
Cohesion: 0.11
Nodes (13): fs, http, path, pw, R, srv, fs, http (+5 more)

### Community 23 - "Öneri testleri"
Cohesion: 0.12
Nodes (14): at(), bank(), card(), D(), fs, http, path, pw (+6 more)

### Community 24 - "Tarayıcı davranış testi"
Cohesion: 0.36
Nodes (17): acc(), balances(), eq(), iso(), monthShift(), openApp(), reload(), run() (+9 more)

### Community 25 - "Piyasa verisi testleri"
Cohesion: 0.14
Nodes (7): hits, http, mock, path, { TCMB, TRUNCGIL, TEFAS, CPI }, path, { TCMB, TRUNCGIL, TEFAS, TEFAS_LEGACY, CPI }

### Community 26 - "Ekstre içe aktarma testi"
Cohesion: 0.12
Nodes (12): crc32(), esc(), fs, http, path, pw, R, srv (+4 more)

### Community 27 - "Kart testleri"
Cohesion: 0.13
Nodes (15): cut1, cut2, day(), dayD(), fs, futMonth, http, iso() (+7 more)

### Community 28 - "Uyarı motoru testleri"
Cohesion: 0.13
Nodes (13): d(), fs, http, iso(), M, now, path, pw (+5 more)

### Community 29 - "Çift kayıt testleri"
Cohesion: 0.12
Nodes (11): ACC(), fs, http, path, pw, R, RECV, seed() (+3 more)

### Community 30 - "Kart ekstre tarihleri"
Cohesion: 0.15
Nodes (17): _acc(), _cut(), _d(), dates(), _due(), _floor(), group(), info() (+9 more)

### Community 31 - "Banka SMS testi"
Cohesion: 0.12
Nodes (10): fs, http, now, path, pw, R, srv, today (+2 more)

### Community 32 - "Hesap denetimi testi"
Cohesion: 0.15
Nodes (13): at(), bank(), card(), fs, http, path, pay(), pw (+5 more)

### Community 33 - "Sağlık puanı testi"
Cohesion: 0.12
Nodes (12): bal, fs, http, ME, path, pw, R, SEED (+4 more)

### Community 34 - "Çocuklar testi"
Cohesion: 0.12
Nodes (13): AL, bal, fs, http, NTS, path, pw, R (+5 more)

### Community 35 - "Banka hareketleri testi"
Cohesion: 0.12
Nodes (12): ACC(), fs, http, LOAN, path, pw, R, RECV (+4 more)

### Community 36 - "Maaş günü testi"
Cohesion: 0.12
Nodes (12): bal, fs, http, ME, path, pw, R, SEED (+4 more)

### Community 37 - "Görsel tarama"
Cohesion: 0.12
Nodes (13): auditSrc, configs, fs, http, pages, path, pre, pw (+5 more)

### Community 38 - "Çok ajanlı denetim raporu (2)"
Cohesion: 0.14
Nodes (15): AI Proxy URL Doğrulama (SSRF), Borç settled Float Toleransı, Çoklu Sekme storage Senkronizasyonu, CSP Meta Etiketi, İstemciden DeepSeek API Anahtarı Riski, Finans Takip Çok Ajanlı Denetim Raporu #2, Notification.requestPermission catch İşleyicisi, parseMoney (min .01) (+7 more)

### Community 39 - "Yayın öncesi kalite raporu (4)"
Cohesion: 0.17
Nodes (14): Aile Kabul Testi, Asgari Ödeme Mevzuatı (BDDK), F14 Bağlantı Kapatma Sunucu Onayı, Aile Kasası Yayın Öncesi Kalite Denetimi #4, Yedek, Geçiş ve Geri Dönüş Planı, K1 İade Kategorisi (Gideri Azaltır), F3 Gelecek Taksitlerin Kalan Limitten Düşülmesi, F12 Net Servette Gelecek Taksit Yükümlülüğü (+6 more)

### Community 40 - "Eşitleme uçtan uca testleri"
Cohesion: 0.12
Nodes (6): http, path, TODAY, TOMORROW, crypto, http

### Community 41 - "Banka kanal testleri"
Cohesion: 0.12
Nodes (9): fs, http, now, path, pw, R, srv, today (+1 more)

### Community 42 - "Fatura ve enflasyon testi"
Cohesion: 0.13
Nodes (13): CPI, F(), fs, http, path, pw, R, SEED (+5 more)

### Community 43 - "Takvim testi"
Cohesion: 0.12
Nodes (12): A, fs, http, path, pw, R, REC, SEED (+4 more)

### Community 44 - "Para akışı testi"
Cohesion: 0.13
Nodes (13): A, at(), fs, http, path, pw, R, SEED (+5 more)

### Community 45 - "Mutabakat testi"
Cohesion: 0.13
Nodes (11): ACC(), fs, http, path, pw, R, seed(), srv (+3 more)

### Community 46 - "50/30/20 testi"
Cohesion: 0.12
Nodes (12): bal, fs, G, http, path, pw, R, SEED (+4 more)

### Community 47 - "Etiket testi"
Cohesion: 0.12
Nodes (11): A, fs, http, path, pw, R, SEED, srv (+3 more)

### Community 48 - "Aktarım testi"
Cohesion: 0.13
Nodes (11): ACC(), fs, http, path, pw, R, RECV, seed() (+3 more)

### Community 49 - "Okunabilirlik testi"
Cohesion: 0.14
Nodes (12): cutDay, day(), fs, http, iso(), now, path, pw (+4 more)

### Community 50 - "Gezinme ve acil durum"
Cohesion: 0.18
Nodes (15): applyA11y(), avgExpense3mo(), bindEvents(), createEmergency(), handleShortcut(), moneyHint(), nav(), _pdfBlob() (+7 more)

### Community 51 - "Özet sayfası testi"
Cohesion: 0.14
Nodes (12): fs, http, iso(), now, path, pw, R, srv (+4 more)

### Community 52 - "Finans hesap testi"
Cohesion: 0.14
Nodes (11): day(), fs, http, iso(), now, path, pw, R (+3 more)

### Community 53 - "Hedef testi"
Cohesion: 0.13
Nodes (11): c(), fs, G, http, path, pw, R, SEED (+3 more)

### Community 54 - "Rapor testi"
Cohesion: 0.13
Nodes (11): A, fs, http, path, pw, R, SEED, srv (+3 more)

### Community 55 - "Akbank ekstre testi"
Cohesion: 0.14
Nodes (12): CP, ebc(), fs, http, PAGE, path, pw, R (+4 more)

### Community 56 - "Kalite regresyon testi"
Cohesion: 0.16
Nodes (6): escAttrT(), escT(), jsAttrT(), ok(), parseMoney(), roundMoney()

### Community 57 - "Banka mesajı ve aktarım bulguları (5)"
Cohesion: 0.16
Nodes (13): Hesaplar Arası Transfer (İki Bağlı Bacak), F8 Onay Kuyruğunda Aktarım (Gider Değil) Türü, F6 SMS Tekrar Denetimi (İşyeri Adı), Aile Kasası Yayın Öncesi Kalite Denetimi #5, G3 Faiz/Aidat SMS'i Gider Okunur, G9 Gmail Betiği Sayfalama, G1 Testlerde Kurmaca Ad, G5 Aynı Ay Maaş + İkramiye Ayrı Kayıt (+5 more)

### Community 58 - "PWA manifest"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, icons, id, lang, name (+5 more)

### Community 59 - "Veri testi"
Cohesion: 0.14
Nodes (10): fs, http, os, path, pw, R, srv, TMP (+2 more)

### Community 60 - "Worker paket ayarları"
Cohesion: 0.14
Nodes (13): wrangler, devDependencies, wrangler, name, private, scripts, db:init, db:local (+5 more)

### Community 61 - "Bütçe dönemi testi"
Cohesion: 0.14
Nodes (10): fs, http, path, pw, R, SEED, srv, T (+2 more)

### Community 62 - "Kart ödemesi testi"
Cohesion: 0.16
Nodes (11): at(), fs, http, path, pay(), pw, R, srv (+3 more)

### Community 63 - "Kredi testi"
Cohesion: 0.14
Nodes (11): fs, http, L, path, pw, R, SEED, srv (+3 more)

### Community 64 - "Fiş PDF testi"
Cohesion: 0.19
Nodes (11): fs, http, imagePdf(), path, pdf(), pw, R, srv (+3 more)

### Community 65 - "Ekstre PDF ayrıştırma"
Cohesion: 0.21
Nodes (13): _amt(), _analyze(), byBank(), _cutDate(), _date(), _fromLines(), _fromTable(), _guessAccount() (+5 more)

### Community 66 - "Fiş metni ve karekod"
Cohesion: 0.21
Nodes (13): _bestCand(), _canvas(), _cleanName(), _fixNum(), guessCategory(), _isSure(), _merchant(), _merge() (+5 more)

### Community 67 - "Denetim 7 testi"
Cohesion: 0.15
Nodes (9): ACC, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 68 - "Veri temizleme (normalize)"
Cohesion: 0.26
Nodes (12): arr(), cleanDate(), cleanLast4(), cleanStoredId(), cleanStoredRef(), dateFromTs(), normalize(), cleanAllowance() (+4 more)

### Community 70 - "Dosya testi"
Cohesion: 0.17
Nodes (8): fs, http, path, pw, R, srv, today, TYPES

### Community 71 - "Finans hesap testi 2"
Cohesion: 0.17
Nodes (9): ACCS, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 72 - "Push bildirim testi"
Cohesion: 0.17
Nodes (9): ACCS, fs, http, path, pw, R, srv, TYPES (+1 more)

### Community 73 - "Ekstre biçim testi"
Cohesion: 0.17
Nodes (9): fs, http, LINES, path, pw, R, SEED, srv (+1 more)

### Community 74 - "Arayüz taraması"
Cohesion: 0.18
Nodes (9): fs, http, iso(), path, pw, R, seed(), srv (+1 more)

### Community 75 - "Denetim raporu 3"
Cohesion: 0.18
Nodes (11): Çeyrek/Tam Altın 22 Ayar Katsayısı, Bütçe Devri ve Limit Geçmişi, Cloudflare Worker Uçtan Uca Şifreli Eşitleme, CSV Türkçe Excel ve Banka Ekstresi Uyumu, Finans Takip Denetim Raporu #3, Ekran Kilidi PIN (PBKDF2), Silinen İşlemi Geri Alma, TÜFE Serisi TCMB Zincirleme (+3 more)

### Community 76 - "Takvim (ICS) ve yaklaşan ödemeler"
Cohesion: 0.20
Nodes (11): addMonths(), buildCalendar(), cardDues(), daysUntil(), _dt(), _event(), exportAll(), _nextDay() (+3 more)

### Community 77 - "XSS taraması"
Cohesion: 0.20
Nodes (9): fs, http, iso(), path, pw, R, seed(), srv (+1 more)

### Community 78 - "Döviz/altın kurları"
Cohesion: 0.25
Nodes (9): ensureFreshRates(), _fetchFrankfurter(), _fetchTruncgil(), manual(), _mergeRates(), _parseTruncgil(), read(), refreshRates() (+1 more)

### Community 79 - "CSV içe aktarma"
Cohesion: 0.29
Nodes (8): csvAmount(), csvFold(), csvText(), importCSV(), importCSVFile(), col(), _parseCSV(), parseCSVText()

### Community 80 - "Fiş uçtan uca testi"
Cohesion: 0.25
Nodes (4): crypto, http, mock, reply

### Community 82 - "graphify kuralları"
Cohesion: 0.47
Nodes (3): graphify Rules (CLAUDE.md), graphify-out Knowledge Graph, vendor/ Excluded via .graphifyignore

### Community 83 - "Yedekleme"
Cohesion: 0.40
Nodes (5): copy(), download(), maybeRemind(), snapshot(), url()

### Community 84 - "Tam test paketi kuralı"
Cohesion: 0.50
Nodes (3): F23 Her PR'da Tam Test Paketi (test.yml), G2 GitHub Pages İkinci Kopya, run-all.sh script

### Community 85 - "Belirsiz not ve çift kayıt"
Cohesion: 0.50
Nodes (4): _dupes(), _place(), _vague(), vagueNote()

## Ambiguous Edges - Review These
- `Finans Takip Denetim Raporu #3` → `FT-012 Fon/Hisse Güncel Fiyat Eksik`  [AMBIGUOUS]
  docs/qa-denetim-raporu.md · relation: conceptually_related_to

## Knowledge Gaps
- **31 isolated node(s):** `wrangler`, `RFC-8030`, `RFC-8292`, `vendor/ Excluded via .graphifyignore`, `Playwright + Chromium Setup` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 722 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `items()` connect `Nakit akışı ve ay toplamları` to `Uygulama: genel yardımcılar ve Excel`, `Kredi, borç ve maaş planı`, `Sayfa çizimi ve listeler`, `Para biçimi ve kart ödemesi`, `HTML kaçış ve seçim kutuları`, `Takvim (ICS) ve yaklaşan ödemeler`, `Tekrarlayan işlemler`, `Gezinme ve acil durum`, `Öneri testleri`, `Kart ekstre tarihleri`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `render()` (e.g. with `_card()` and `cv()`) actually correct?**
  _`render()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `wrangler`, `RFC-8030`, `RFC-8292` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Uygulama: genel yardımcılar ve Excel` be split into smaller, more focused modules?**
  _Cohesion score 0.02734877734877735 - nodes in this community are weakly interconnected._
- **Why does `base()` connect `Kart ve bildirim testleri` to `Uygulama: genel yardımcılar ve Excel`, `Eşitleme, e-posta ve push kurulumu`, `İşlem ekle/düzenle ve bakiye`, `Kredi, borç ve maaş planı`, `Bütçe, istatistik ve ay özeti`, `Banka SMS ayrıştırıcı`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `Eşitleme, e-posta ve push kurulumu` be split into smaller, more focused modules?**
  _Cohesion score 0.0502497796062298 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Finans Takip Denetim Raporu #3` and `FT-012 Fon/Hisse Güncel Fiyat Eksik`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._