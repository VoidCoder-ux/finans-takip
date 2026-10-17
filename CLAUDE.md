## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

### Bu depoda graphify

- graphify HTML içindeki betikleri okumadığı için uygulama kodu (`index.html` içindeki betikler) `graphify-src/index.html.js` kopyası üzerinden haritadadır. Kopyada satır numaraları `index.html` ile birebir aynıdır: haritada `graphify-src/index.html.js` L2820 görünen yer, `index.html` 2820. satırdır. Düzenlemeyi her zaman `index.html`'de yapın, kopyayı elle değiştirmeyin.
- Kod değiştirdikten sonra `graphify update .` yerine `node tools/graphify-update.js` çalıştırın: önce kopyayı yeniler, sonra haritayı günceller. `tests/graphify-src.test.js` kopya eskiyse başarısız olur.
- Hazır kütüphaneler (`vendor/`) `.graphifyignore` ile dışarıda bırakıldı.
- `graphify` komutu yoksa (yeni bulut oturumu) sorgu kurallarını atlayın; kurmak için `uv tool install graphifyy`. Kopyayı yine `node tools/graphify-update.js` ile yenileyin (graphify yoksa yalnız kopyayı yazar).
