#!/usr/bin/env bash
# Readable live feed of the engine: QuickNode deliveries, Solana events, Gemini hedges, settlement and refunds.
#   scripts/demo-feed.sh engine.log            follow a log file (start the engine with: pnpm dev:engine | tee engine.log)
#   scripts/demo-feed.sh engine.log --replay   print the whole file first, then follow
#   <anything printing engine JSON logs> | scripts/demo-feed.sh
set -euo pipefail
FILTER='select(type == "object" and (.msg? // "" | test("^(event|hedge order|record_hedge confirmed|quicknode delivery|settled|payout)$")))
  | (.time / 1000 | strflocaltime("%H:%M:%S")) + "  " +
    if .msg == "quicknode delivery" then "QuickNode  delivered \(.transactions) transaction(s) from the Solana stream"
    elif .msg == "event" then "Solana     \(.event) (seen via \(.source))  tx \(.signature[0:10])…"
    elif .msg == "hedge order" then "Gemini     bought \(.res.filledContracts)/\(.contracts) YES contracts @ $\((.res.avgPriceMicros | tonumber) / 1e6) · order \(.res.orderId) (\(.res.state))"
    elif .msg == "record_hedge confirmed" then "Solana     hedge recorded on-chain  tx \(.sig[0:10])…"
    elif .msg == "settled" then "Solana     promo settled — result: \(if .outcome == "yes" then "WON" else "lost" end)  tx \(.sig[0:10])…"
    else "Solana     refund paid: $\((.amount | tonumber) / 1e6) to \(.customer[0:6])…  tx \(.sig[0:10])…" end'
parse() { grep --line-buffered '^{' | jq -r --unbuffered "$FILTER"; }
if [[ $# -ge 1 ]]; then
  if [[ "${2:-}" == "--replay" ]]; then tail -n +1 -F "$1" | parse; else tail -n 0 -F "$1" | parse; fi
else
  parse
fi
