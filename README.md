# Token Radar — radar-4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bismilahdestia/token-radar-01-entry-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bismilahdestia/token-radar-01-entry-v3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar I can build: a program that reads a frozen snapshot
of every protocol DefiLlama tracks, finds the ones that record no token yet,
ranks them by what a launch would be worth, and hands in a dashboard that shows
the board, a detail view for each protocol, and the steps to farm it.

## What it does

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`, scores
every rankable pre-token protocol with the radar-4 model in `lib/model.ts`, and
writes `/output/board.json`, `/output/data.js`, the dashboard, three screenshots
and `/output/dossier.json` (via `vendor/makefun-board.ts`).

- **227 rows**: all 40 watchlist protocols, plus 187 early pre-token protocols
  below the $50M floor. Live-token protocols are set aside at their market cap,
  never mixed into the ranking.
- **radar-4 value model**: implied value follows from the snapshot's own figures
  only — TVL, seven-day growth, and how long the protocol has run with no token.
  The base multiple is no longer a flat number: it is the median market-cap-to-TVL
  ratio of the trading protocols in the same category (at least five comparables,
  else the global median, 0.2138x on this snapshot). Every row also carries a
  P10–P90 range from the same comparables' spread, so the board shows what the
  value could be, not just one point. No protocol name is special-cased.
- **Blind test, reported openly**: leave-one-out over the trading protocols —
  each one predicted from its category's other comparables, never from itself.
  Median absolute error 90.3% on this snapshot: the market's dispersion is wide,
  and the dashboard says so instead of hiding it.
- **Farm plans**: 9 steps per protocol, each with its cost and time, derived
  from the protocol's category, chains, TVL and age — including an exit step.
- **Dashboard**: sortable board, search + category + chain + minimum-TVL +
  growing-only filters, Watchlist / Early / Movers views, a rank-1 spotlight,
  a per-protocol detail view with the full model equation and its P10–P90 range,
  a live-token tab, and a model sandbox that re-ranks the board with your own
  numbers.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The run is deterministic: the same snapshot bytes always write the same
output bytes. No network at runtime.

## What changed from radar-3 (v2)

- Model: the flat 0.25 base multiple is gone. The multiple is now the
  per-category median mcap/TVL of trading comparables (minimum five per
  category, else the global median); every row carries a P10–P90 range from
  the comparables' spread; a leave-one-out blind test is run and its median
  error reported openly on the dashboard.
- Farm plans: 8 steps to 9, with a second-feature step and an exit step, and
  capital tiers re-based on TVL ($60/$120/$200/$300).
- Dashboard: the detail view now shows the P10–P90 range beside the point
  estimate, plus the blind-test error; rank-1 spotlight, minimum-TVL and
  growing-only filters, an EARLY badge on non-watchlist rows, show-more
  pagination, and the discovery multiplier in the detail view.
- Screenshots: re-rendered from this dashboard in a real headless browser.
