#!/usr/bin/env bash
#
# Go-live status and the operator steps, run from Render's Shell.
#
# ===========================================================================
# WHERE TO PUT THIS
# ===========================================================================
#
#   Render dashboard → your API service (DijiPeople) → **Shell** tab
#
#   The repository is already checked out there and every environment variable
#   is already set, which is the whole reason to run it there rather than from a
#   laptop: it sees exactly what production sees.
#
#     cd /opt/render/project/src
#     bash scripts/go-live.sh            # report only — writes nothing
#     bash scripts/go-live.sh --sync-prices   # also sync plan prices to Stripe
#
#   Do NOT put this in Build Command, Pre-Deploy Command or Start Command. It is
#   a thing an operator runs and reads, once, deliberately.
#
# ===========================================================================
# WHAT IT DOES
# ===========================================================================
#
#   Reports, always:   commit, Stripe mode, purchasable prices, published legal
#                      documents, outbox worker.
#   Writes, only with an explicit flag: the plan-price sync.
#
# It never touches environment variables. Those are set in the Environment tab —
# a change there restarts the service, which is not something a script should do
# behind your back.
#
set -uo pipefail

API="${API_BASE_URL:-http://127.0.0.1:${PORT:-4000}/api}"
SYNC_PRICES=0
for arg in "$@"; do
  case "$arg" in
    --sync-prices) SYNC_PRICES=1 ;;
    -h|--help) sed -n '2,35p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

blockers=0
say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mBLOCK\033[0m %s\n' "$1"; blockers=$((blockers+1)); }
note() { printf '        %s\n' "$1"; }

say "1. Which commit is serving?"
commit=$(curl -fsS "$API/health" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).commitShort' 2>/dev/null || echo unknown)
note "serving $commit"
note "if this is behind main, the last deploy failed — check the Events tab"

say "2. Stripe mode"
if [ "${STRIPE_MODE:-}" = "live" ]; then
  ok "STRIPE_MODE=live"
else
  bad "STRIPE_MODE=${STRIPE_MODE:-unset} — no real payment can be collected"
  note "Environment tab → STRIPE_MODE=live, plus live sk_/pk_ and the whsec_"
  note "for THIS destination. Do that BEFORE syncing prices: stripeEnvironment"
  note "is baked into each price at sync time and must match the runtime mode."
fi

say "3. Can anything be bought?"
plans=$(curl -fsS "$API/public/plans" || echo '{}')
read -r total ready <<<"$(printf '%s' "$plans" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    let prices=[];
    try{const j=JSON.parse(s);const plans=Array.isArray(j)?j:(j.plans??[]);
      prices=plans.flatMap(p=>p.prices??[]);}catch{}
    const ready=prices.filter(p=>p.checkoutReady??p.isCheckoutReady);
    console.log(prices.length+" "+ready.length);
  });')"
if [ "${ready:-0}" -gt 0 ]; then
  ok "$ready of $total active price(s) are checkout-ready"
else
  bad "0 of ${total:-0} active price(s) are checkout-ready — nobody can buy"
  note "run this script again with --sync-prices, or: npm run stripe:sync-prices"
fi

say "4. Are the legal documents published?"
legal=$(curl -fsS "$API/public/legal" || echo '{}')
published=$(printf '%s' "$legal" | node -pe 'try{(JSON.parse(require("fs").readFileSync(0,"utf8")).documents??[]).length}catch{0}' 2>/dev/null || echo 0)
if [ "${published:-0}" -gt 0 ]; then
  ok "$published document(s) published"
else
  bad "no legal document is published — a purchase records no consent"
  note "Publish them in Platform Admin → Settings → Agreements → Legal documents."
  note "Publication refuses text that still calls itself an unreviewed draft;"
  note "the screen shows you exactly which wording is blocking it."
fi

say "5. Is the outbox worker running?"
if [ "${OUTBOX_WORKER_ENABLED:-}" = "true" ]; then
  ok "OUTBOX_WORKER_ENABLED=true"
else
  bad "OUTBOX_WORKER_ENABLED=${OUTBOX_WORKER_ENABLED:-unset}"
  note "Provisioning is an outbox consumer. Without this a customer pays and"
  note "never receives a workspace. Environment tab → set it to true."
fi

say "6. Can Stripe actually reach us?"
#
# The check this script did not have, and the reason ITEM-0094 was filed. On
# 2026-08-24 it reported "1 blocker" — Stripe test mode — while every webhook
# delivery was being rejected with 400 VALIDATION_FAILED (BUG-0989). The single
# most consequential failure in the payment path, a customer charged and the
# platform never told, was invisible to the script written to find exactly that.
#
# Note what is deliberately NOT done here: sending a probe request. A
# deliberately-invalid signature is rejected whether the secret is right or
# wrong, which is precisely why the probe used during that diagnosis could not
# confirm the fix. A green probe would have been worse than no probe.
if [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  case "${STRIPE_WEBHOOK_SECRET}" in
    whsec_*) ok "STRIPE_WEBHOOK_SECRET is set" ;;
    *) bad "STRIPE_WEBHOOK_SECRET does not start with whsec_ — deliveries will be rejected" ;;
  esac
else
  bad "STRIPE_WEBHOOK_SECRET is unset — every Stripe delivery is rejected"
  note "It must be the secret for THIS destination. A secret from another"
  note "endpoint verifies nothing and fails identically."
fi

# Delivery history, when this shell can reach it. `billing/diagnostics` is
# platform-guarded, so without credentials the honest answer is that we do not
# know — never silence reported as health, which is the whole complaint above.
if [ -n "${SYNC_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-}}" ] &&    [ -n "${SYNC_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-}}" ]; then
  diag=$(node scripts/webhook-delivery-health.mjs --api "$API" 2>/dev/null || echo '')
  if [ -n "$diag" ]; then
    verdict=${diag%%|*}
    detail=${diag#*|}
    case "$verdict" in
      OK)   ok "$detail" ;;
      WARN) ok "$detail"; note "not a blocker, but worth a look before taking money" ;;
      *)    bad "$detail" ;;
    esac
  else
    note "delivery history unavailable — could not read billing/diagnostics"
  fi
else
  note "delivery history not checked: no admin credentials in this shell."
  note "Set SYNC_ADMIN_EMAIL and SYNC_ADMIN_PASSWORD to include it."
fi
note "Only one thing proves this end to end, and no script can do it:"
note "Stripe Dashboard → Developers → Webhooks → Recent deliveries → Resend."

if [ "$SYNC_PRICES" = "1" ]; then
  say "7. Syncing plan prices to Stripe"
  if [ "${STRIPE_MODE:-}" != "live" ]; then
    note "STRIPE_MODE is not live — syncing now would stamp every price TEST"
    note "and they would all need re-syncing after the switch. Skipping."
  else
    SYNC_ADMIN_EMAIL="${SYNC_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-}}" \
    SYNC_ADMIN_PASSWORD="${SYNC_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-}}" \
      node scripts/sync-stripe-prices.mjs --api "$API" --confirm --live
  fi
fi

say "Summary"
if [ "$blockers" -eq 0 ]; then
  printf '  \033[32mNo blockers. Run `npm run smoke:deployment` to confirm, then take a\n'
  printf '  real low-value order and refund it.\033[0m\n'
  exit 0
fi
printf '  \033[31m%s blocker(s) between here and go-live.\033[0m\n' "$blockers"
printf '  Order matters: legal copy → Stripe live → sync prices → outbox worker.\n'
exit 1
