# Snake leaderboard backend (Cloudflare Worker)

This is what makes the leaderboard shared across everyone who plays the
game, instead of each browser keeping its own separate list. Same design
as the Tetris and Asteroids leaderboards - a completely separate Worker,
KV namespace, and URL, so nothing here touches either of those.

## Status

The KV namespace (`snake_leaderboard`) already exists and is wired into
`wrangler.toml` in this folder - no setup needed there.

## Remaining one-time step: custom domain

Once the `snake-game` Worker has deployed at least once (CI does this
automatically on every push to `main` that touches `snake/index.html` or
`deploy/snake-game/**`):

1. **Workers & Pages** → `snake-game` → **Settings** → **Domains &
   Routes** → **Add** → **Custom Domain**.
2. Enter `snake.mzhservices.com` and follow the prompts (same as
   `tetris.mzhservices.com` and `asteroids.mzhservices.com` were set up).

## CI/CD

Two GitHub Actions workflows, both trigger on every push to `main`,
using the same `CLOUDFLARE_API_TOKEN` repo secret as Tetris/Asteroids:

- `deploy-snake-game.yml` - stages `snake/index.html` and deploys the
  `snake-game` Worker (the static site).
- `deploy-snake-leaderboard.yml` - deploys this Worker
  (`snake-leaderboard`) whenever `snake/backend/**` changes.

## Anti-cheat

Tetris and Asteroids both had a forged score (a name and a huge number,
POSTed straight to the API with no game ever played) land on their
leaderboards. Fixed here too, pre-emptively: `POST /leaderboard` now
requires a single-use session token, issued by `POST /session` when a
game actually starts, and checks the submitted score against how much
real time has passed since that token was issued. Snake's checked
score is a hard tick-rate bound, not a fuzzy guess - see the comment
block at the top of `worker.js` for why that's exact for this game.
This isn't - and for a client-authoritative game like this, can't be -
a perfect defense against someone willing to script the whole timing
dance; it closes the "one API call, no gameplay" version of the
exploit, which is what hit the other two games.

## Notes

- Same as Tetris/Asteroids: no login, no accounts - type a name, like an
  arcade cabinet.
- Cost: covered entirely by Cloudflare's free tier.
- To reset the leaderboard, delete and recreate the `top_scores` key in
  the KV namespace via the dashboard's KV viewer.
