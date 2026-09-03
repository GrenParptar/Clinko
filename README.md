# 🎯 Clinko — Physics Randomizer

Clinko is a Plinko-style randomizer that uses real 2D physics ([Matter.js](https://brm.io/matter-js/)) to drop a batch of balls through a peg field and funnel them into numbered chutes at the bottom. Where each ball lands determines its finishing place — a fun, visual, verifiably "physical" way to randomize a list of names, raffle entries, draft order, or anything else.

**[Open Clinko](index.html)** — it's a static, single-page app with no build step or server required.

## How it works

1. **Set up** — choose how many balls to drop, how many peg rows the board has (more rows = more chutes = finer-grained results), how fast balls are released, and optionally paste in a list of names (one per line) to label each ball.
2. **Build Board** — generates a fresh triangular peg field sized to your row count, with dividers creating one chute per possible landing column.
3. **Drop Balls** — balls are released one at a time from the top center with a small random horizontal offset, so each run is different even with identical settings. They bounce down through the pegs under real gravity/collision physics and settle into a chute at the bottom.
4. **Standings** — as each ball comes to rest, it's added live to the standings list. Final **rank** is determined primarily by which chute a ball lands in (chute 1 = leftmost by default, or rightmost if you check "Reverse rank direction"), with ties inside the same chute broken by arrival order.

## Features

- Configurable ball count (1–80), peg row count (6–16), and drop pacing
- Optional custom names per ball, auto-labeled `Ball N` otherwise
- Live-updating standings as balls finish
- Reversible ranking direction (left→right or right→left)
- Rebuild the board or re-run drops with the same settings at any time
- Pure client-side HTML/CSS/JS — works from a local file or any static host

## Files

| File         | Purpose                                   |
|--------------|--------------------------------------------|
| `index.html` | Page structure and controls               |
| `style.css`  | Dark-themed responsive styling             |
| `app.js`     | Matter.js physics setup, drop/settle logic, and standings rendering |

## Running locally

Just open `index.html` in a browser — no install or server needed (Matter.js is loaded from a CDN). For local development with live reload, any static file server works, e.g.:

```bash
npx serve .
```

## Notes on randomness

Results are driven by chaotic peg collisions plus a randomized horizontal starting offset for each ball, so outcomes aren't easily predictable or reproducible run-to-run — similar in spirit to a real-world Galton board / Plinko drop.
