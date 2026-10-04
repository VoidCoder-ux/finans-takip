#!/usr/bin/env bash
# Tüm testleri sırayla çalıştırır; biri bile başarısızsa çıkış kodu 1.
#   bash tests/run-all.sh                 # yerelde (sunucu yoksa sunucu testleri "atlandı" der)
#   START_SERVER=1 REQUIRE_SERVER=1 bash tests/run-all.sh   # CI: yerel wrangler dev'i başlatır, atlanan test başarısız sayılır
# Yalnız yerel geliştirme sunucusu (127.0.0.1:8787) kullanılır; canlı kasaya, bankaya ya da Gmail'e istek gitmez.
set -u
cd "$(dirname "$0")/.."
BASE=${SYNC_BASE:-http://127.0.0.1:8787}
# Sunucu verisi depo dışında: wrangler depo kökünü (statik varlıklar) izler, içine yazılırsa sürekli yeniden başlar
PERSIST=${PERSIST_DIR:-$(mktemp -d)}
SERVER_PID=""
if [ "${START_SERVER:-0}" = "1" ] && ! curl -s -m 2 "$BASE/v1/config" >/dev/null; then
  (cd worker && npx wrangler d1 execute finans-takip --local --persist-to "$PERSIST" --file=schema.sql >/dev/null 2>&1)
  # Ayrı süreç grubu: sonunda npx/wrangler/workerd alt süreçleriyle birlikte durdurulur
  (cd worker && exec setsid npx wrangler dev --test-scheduled --persist-to "$PERSIST" --port 8787 >"$PERSIST/server.log" 2>&1) &
  SERVER_PID=$!
  for i in $(seq 1 60); do curl -s -m 2 "$BASE/v1/config" >/dev/null && break; sleep 2; done
  curl -s -m 2 "$BASE/v1/config" >/dev/null || { echo "Test sunucusu başlamadı:"; tail -40 "$PERSIST/server.log"; exit 1; }
fi
fail=0; skipped=0; summary=""
for t in ${ONLY:-tests/*.test.js tests/ui-scan.js tests/xss-scan.js tests/qc-visual.js}; do
  out=$(timeout 900 node "$t" 2>&1); code=$?
  last=$(printf '%s\n' "$out" | grep -E 'passed|failed|atlandı|Sorun bulunmadı|sorun|temiz' | tail -1)
  if printf '%s' "$out" | grep -q 'atlandı'; then
    skipped=$((skipped+1))
    if [ "${REQUIRE_SERVER:-0}" = "1" ]; then fail=1; summary="$summary\n✗ $t: atlandı (sunucu/Playwright yok)"; continue; fi
  fi
  if [ $code -ne 0 ] || printf '%s' "$out" | grep -qE '[1-9][0-9]* failed|^✗'; then
    fail=1; summary="$summary\n✗ $t: $last"; printf '%s\n' "$out" | grep -E '^✗' | head -20
  else summary="$summary\n✓ $t: $last"; fi
done
[ -n "$SERVER_PID" ] && { kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null; sleep 1; }
printf "$summary\n"
[ $fail -eq 0 ] && echo "TÜM TESTLER GEÇTİ ($skipped atlandı)" || echo "BAŞARISIZ TEST VAR"
exit $fail
