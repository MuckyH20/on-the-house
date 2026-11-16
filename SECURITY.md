# Security

On the House is a hackathon project. Everything runs on Solana devnet and Gemini's sandbox with test money, so
nothing here holds real funds. Bugs still matter to us, especially anything that would break once real money is
involved.

## What we care about

**The Solana program** (`on_the_house`, devnet `4qfLMXZTmKt71eDH4S3VNSDCRFPX7qxpPk3WZZgt2PM2`). Anything that lets
someone:

- take money they shouldn't, or get a refund they aren't owed
- get paid twice for the same claim
- get past a shop's limits (max cost per sale, total refund cap, max uncovered refunds)
- settle a promo or pay out refunds without the operator's signature

**The engine** (`engine/`). Faking a QuickNode delivery, making it buy the wrong amount of protection, or getting it
to trade anywhere other than Gemini's sandbox.

**The web app** (`app/`). Editing another shop's menu or orders, launching a promo as someone else, or ending
another shop's practice game.

Not in scope: rate limits on test faucets, test tokens having no value, Gemini's or QuickNode's own services, and
denial of service by spamming test endpoints.

## Known trust assumption

The operator wallet records each game's result and funds the refund vault after a win. The program makes sure the
vault pays the right people the right amounts, but it can't force the operator to fill it. This is written up in
the README under "What Gemini could add". A report that only restates it isn't new, but a way to abuse it beyond
that is.

## Reporting

Please report privately, not in a public issue:
https://github.com/MuckyH20/on-the-house/security/advisories/new

Helpful to include:

- what you found and what it lets an attacker do
- steps to reproduce (a devnet transaction signature is great)
- the commit or program version you tested

We're a small student team, so expect a reply within a few days rather than a few hours. There's no bug bounty,
but we're happy to credit you in the fix.

When testing, use your own promos and wallets on devnet and leave other people's alone.
