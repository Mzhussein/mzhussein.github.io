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

## Notes

- Same as Tetris/Asteroids: no login, no accounts - type a name, like an
  arcade cabinet. Not meant to stop a determined stranger from posting a
  joke score.
- Cost: covered entirely by Cloudflare's free tier.
- To reset the leaderboard, delete and recreate the `top_scores` key in
  the KV namespace via the dashboard's KV viewer.
