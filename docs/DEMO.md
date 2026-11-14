# Live demo runbook

How to run On the House in front of judges: what to set up, what to click, what to say, and what to do when
something goes wrong. Total time on stage: ~3 minutes, plus waiting for the game result.

---

## The day before

- [ ] Platform wallet has ≥ 1 devnet SOL (`9h3VgL3NVTBZR9NggzA1QUaSYp8BDuVDY6FfSSisbDA1`; top up at faucet.solana.com).
- [ ] Deployed app and engine are up: open the site, `/health` on the engine answers `"geminiMode":"sandbox"`.
- [ ] You can sign in to your shop (Google) and your menu is saved.
- [ ] Phone charged; the site opens on it over cellular, not just Wi-Fi.
- [ ] A printed counter sign from a recent promo (as a prop — the QR on screen works too).

## 30–60 minutes before your slot

1. **Turn the QuickNode stream on** (it bills per block, so only now): `pnpm stream on` with
   `PUBLIC_ENGINE_URL` set to the deployed engine. Check: `pnpm stream status` → `active`.
2. **Find a real Gemini game.** Open `/start` (signed in). If it pre-picks a game **without** the yellow
   "practice game" banner, that's a real Gemini sandbox market — good. Gemini's sandbox only has sellers on games
   closing within roughly the next hour, so check again 10–15 minutes before you go on.
   - Best games: hourly BTC/ETH price games ("Bitcoin vs. $68,400 · final 6 PM ET") priced 15–50¢ — that makes
     "Free" cheap (15–55% of each sale).
   - The promo must launch at least ~20 minutes before the game's final (sales stop 12 minutes before it).
3. **Launch the promo** (offer: Free) and **make one test order** from your phone so the Orders screen and the
   protection page already have content.
4. Open these tabs on the laptop:
   - `/dashboard` (My promos), `/orders/<promo>`, `/proof/<promo>`, and the GitHub README.
   - A terminal with the live feed: `scripts/demo-feed.sh engine.log` — one readable line per QuickNode delivery,
     Solana event, Gemini hedge, settlement and refund.

## On stage (3 minutes)

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page | "Shops love ‘free if your team wins’ promos — but if the team wins, they owe everyone a refund. On the House makes that a small, fixed cost." |
| 0:20 | `/start` → the pre-picked game, the cost line | "I sign in with Google — no wallet, no seed phrase. It suggests the next game and shows exactly what this costs me: 27.5% of each sale, $1.24 on a latte, win or lose." |
| 0:45 | Launch → *You're live* (QR) | "One tap. I get a link and a QR for my counter." |
| 1:00 | Judge scans the QR on their phone, adds demo dollars, orders, pays | "Customers just scan and pay — no app, no account. The receipt says what they get back." |
| 1:30 | Orders screen: the judge's order appears; tap **Mark ready** | "My staff see it instantly, like any order-ahead ticket." (Judge's phone flips to *Ready for pickup ✓*.) |
| 1:50 | `/proof/<promo>`: promised = protected ✓, Gemini's own records | "Within seconds, that refund was covered by a real order on Gemini's prediction market — here's Gemini's own record — and written to Solana. Anyone can audit it." |
| 2:20 | Open “For the curious” → a Solana Explorer link | "Every sale, refund claim, hedge and payout is a Solana transaction. Fully on-chain, zero crypto UX." |
| 2:40 | README section "What Gemini could add" | "One trust step remains — the payout bridge — and Gemini signing its results would remove it." |

**After the final** (if the judges are still around, or in the Q&A): refresh `/proof/<promo>` — it shows Gemini's
result and payout; if the team won, the judge's phone shows *You got $X back* on **My rewards**.

## Fallbacks

| Problem | Do this |
|---|---|
| No real Gemini game has sellers | Launch on the **practice game** (yellow banner). Everything else is identical and still on Solana; say “practice game” out loud. At the end, use **Bitcoin wins** on My promos to show the payout immediately. |
| The game won't finish before your slot ends | Show the result of an earlier promo (My promos → Past promos → Details), or use a practice game's **wins** button. |
| A purchase says "paused for a moment" | Prices moved above the shop's limit — the protection is working. Open Limits, raise "most I'll pay", or pick another game. |
| Devnet is slow / a payment spins | Wait 20–30 s; it usually lands (check the Activity list on the protection page). The engine retries everything. |
| Venue Wi-Fi fails | Phone hotspot. The judge can also open the promo link on cellular. |
| QuickNode stream stopped (status `terminated`) | `pnpm stream on` again (it restarts at the current block). The engine also backfills every 15 s, so no sale is lost. |
| Engine down | Restart it (Railway: redeploy / restart). It catches up on anything it missed from the chain. |

## After the demo

- `pnpm stream off` (stops QuickNode billing).
- `pnpm verify:orders <promo or Gemini order id>` if a judge asks for proof: it matches every hedge against Gemini's
  order history, checks the Solana record stores sha256 of that Gemini order id, and shows Gemini's settlement.
  Works before and after the game settles.
