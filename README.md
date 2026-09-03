# 🎯 Clinko — Physics Randomizer

Clinko is a Plinko-style randomizer that uses real 2D physics ([Matter.js](https://brm.io/matter-js/)) to drop a batch of glossy 3D balls, all at once, through a peg field. Every ball funnels into a **single narrow chute** at the bottom — since only one ball can fit through at a time, the order in which balls pass that pinch point *is* the finishing order, and they physically stack up beneath it: 1st place at the very bottom, 2nd on top of that, and so on.

**[Open Clinko](index.html)** — it's a static, single-page app with no build step or server required.

## How it works

1. **Set up** — choose how many balls to drop, how many peg rows the board has (more rows = more chaotic bouncing before the funnel), and optionally paste in a list of names (one per line) to label each ball.
2. **Build Board** — generates a fresh peg lattice sized to your row count, narrowing below into a funnel and then a single-file chute down to the floor.
3. **Drop Balls** — every ball is released **at the same instant**, spread across the top with a randomized starting spot, so each run plays out differently even with identical settings. They bounce down through the pegs under real gravity and collisions, get squeezed together by the funnel, and pass through the neck one at a time.
4. **Standings** — the moment a ball crosses the funnel's neck (the finish line), it's added live to the standings — that crossing order is its final rank, and it can never be passed once it's below the neck, so the on-screen stack always matches the leaderboard.

## Features

- Configurable ball count (1–80) and peg row count (6–20, for a longer or shorter drop)
- All balls drop simultaneously — no staggered releases
- Big, glossy, shaded **3D-look spheres** (radial-gradient rendering) for both balls and pegs, with exaggerated bouncy, slow-motion physics
- A near-full-screen board with a long peg field, so balls travel a good distance before reaching the funnel
- Solid guide walls run flush with the peg field's outer edge the whole way down — there's no gap beside the pegs, so a ball can never just slide down the side and skip the obstacle course
- A single funnel/chute design — no multiple landing zones, just one clean finishing order
- Live-updating standings as each ball crosses the finish line, with an in-board rank tag next to every ball
- Anti-jam nudging so balls arching above the narrow neck (a real granular-flow phenomenon) get jostled loose automatically
- Optional custom names per ball, auto-labeled `Ball N` otherwise
- Rebuild the board or re-run drops with the same settings at any time
- Pure client-side HTML/CSS/JS — works from a local file or any static host

## Files

| File                 | Purpose                                                        |
|----------------------|------------------------------------------------------------------|
| `index.html`         | Page structure and controls                                    |
| `style.css`          | Dark-themed responsive styling                                 |
| `app.js`             | Matter.js physics setup, funnel/finish-line logic, 3D sphere rendering, and standings |
| `vendor/matter.min.js` | Vendored copy of Matter.js so the app runs fully offline      |

## Running locally

Just open `index.html` in a browser — no install or server needed (Matter.js is bundled locally in `vendor/`). For local development with live reload, any static file server works, e.g.:

```bash
npx serve .
```

## Notes on randomness & board size

Results come from chaotic peg collisions plus a randomized starting position for each ball, so outcomes aren't predictable or reproducible run-to-run — similar in spirit to a real-world Galton board. The chute below the funnel grows taller to fit however many balls you drop, so the board (and page) can get tall for large ball counts; the board panel scrolls independently so the rest of the page stays put.
