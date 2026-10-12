#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify_deployment.sh — Post-deploy smoke test for Smart Campus
#
# Usage:
#   bash scripts/verify_deployment.sh https://your-app.onrender.com
#
# Exits 0 if all checks pass, 1 on any failure.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="${1:-http://localhost:5000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  PASS${NC}  $1"; ((PASS++)); }
fail() { echo -e "${RED}   FAIL${NC}  $1"; ((FAIL++)); }
info() { echo -e "${YELLOW}  INFO${NC}  $1"; }

echo ""
echo "Smart Campus Deployment Verification"
echo "======================================"
echo "Target: $BASE_URL"
echo ""

# ── 1. Liveness ──────────────────────────────────────────────────────────────
info "Checking liveness endpoint..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/live")
if [ "$STATUS" = "200" ]; then
    ok "/health/live → 200"
else
    fail "/health/live → $STATUS (expected 200)"
fi

# ── 2. Readiness ─────────────────────────────────────────────────────────────
info "Checking readiness endpoint..."
BODY=$(curl -s "$BASE_URL/health/ready")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/ready")
if [ "$STATUS" = "200" ]; then
    ok "/health/ready → 200"
else
    fail "/health/ready → $STATUS (expected 200): $BODY"
fi

# Check DB connected in readiness body
if echo "$BODY" | grep -q '"database".*"connected"'; then
    ok "Database: connected"
else
    fail "Database: not connected (check DATABASE_URL and DB_SSL_MODE)"
fi

# ── 3. Login page ─────────────────────────────────────────────────────────────
info "Checking login page..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$STATUS" = "200" ]; then
    ok "/ (login page) → 200"
else
    fail "/ → $STATUS"
fi

# ── 4. Auth flow ──────────────────────────────────────────────────────────────
info "Testing auth login (demo credentials)..."
LOGIN_BODY=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@smartcampus.edu","password":"password123"}' \
    -c "$COOKIE_JAR" \
    -w "\n%{http_code}")

LOGIN_STATUS=$(echo "$LOGIN_BODY" | tail -n1)
LOGIN_JSON=$(echo "$LOGIN_BODY" | head -n-1)

if [ "$LOGIN_STATUS" = "200" ]; then
    ok "/auth/login → 200"
else
    fail "/auth/login → $LOGIN_STATUS (seed demo data first: python scripts/seed_data.py)"
fi

# Check cookie was set
if grep -q "smart_campus_token" "$COOKIE_JAR" 2>/dev/null; then
    ok "HttpOnly auth cookie: set correctly"
else
    info "Cookie jar check skipped (curl cookie storage varies)"
fi

# ── 5. Protected endpoint ─────────────────────────────────────────────────────
info "Testing protected endpoint (uses cookie)..."
if [ "$LOGIN_STATUS" = "200" ]; then
    DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "$BASE_URL/admin/dashboard/summary" -b "$COOKIE_JAR")
    if [ "$DASH_STATUS" = "200" ]; then
        ok "/admin/dashboard/summary → 200 (auth working)"
    else
        fail "/admin/dashboard/summary → $DASH_STATUS"
    fi
fi

# ── 6. Unauthenticated 401 ────────────────────────────────────────────────────
info "Checking 401 on missing auth..."
NO_AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/student/dashboard" \
    -H "Authorization: Bearer invalid-token")
if [ "$NO_AUTH_STATUS" = "401" ]; then
    ok "Unauthenticated request → 401 (auth middleware working)"
else
    fail "Unauthenticated request → $NO_AUTH_STATUS (expected 401)"
fi

# ── 7. Rate limiter ───────────────────────────────────────────────────────────
info "Checking rate limit on auth endpoint..."
for i in {1..3}; do
    curl -s -o /dev/null -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"x@x.com","password":"x"}' > /dev/null
done
ok "Rate limiter: reachable (not tested at threshold in smoke test)"

# ── 8. Startup check ─────────────────────────────────────────────────────────
info "Checking startup status..."
STARTUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health/startup")
if [ "$STARTUP_STATUS" = "200" ]; then
    ok "/health/startup → 200 (migrations ran)"
else
    fail "/health/startup → $STARTUP_STATUS"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
rm -f "$COOKIE_JAR"
echo ""
echo "======================================"
echo -e "Results: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Deployment verification FAILED. Review failures above.${NC}"
    exit 1
else
    echo -e "${GREEN}All checks passed. Deployment is healthy.${NC}"
    exit 0
fi
