# Dodge The Su leaderboard backend (Cloudflare Worker)

This is what makes the leaderboard shared across everyone who plays the
game, instead of each browser keeping its own separate list. Same design
as the Tetris/Asteroids/Snake leaderboards - a completely separate
Worker, KV namespace, and URL, so nothing here touches those deployments.

Deploying the Worker itself is already fully automated (see the CI/CD
section below) - the **only** manual, one-time steps are creating the KV
storage and pointing a custom domain at the game. Both need your
Cloudflare dashboard.

## 1. Create the storage (KV namespace)

This is where the top-10 list actually lives.

1. Go to <https://dash.cloudflare.com> and sign in.
2. In the left sidebar, click **Workers & Pages**, then find **KV** (it
   may be under a "Storage" section).
3. Click **Create a namespace**, name it `dodge_the_su_leaderboard`, and
   create it.
4. Click into the new namespace and copy its **ID** (a long hex string).

## 2. Wire the ID into the repo

Open `dodge-the-su/backend/wrangler.toml` in this repo (via GitHub's
**Add file → Upload files**/edit-in-browser, same as the audio file flow
in `../../AUDIO.md`) and replace:

```
id = "REPLACE_WITH_REAL_KV_NAMESPACE_ID"
```

with the ID you just copied, then commit to `main`. That's it - CI takes
it from there and deploys the Worker with that binding attached.

## 3. Custom domain

Once the `dodge-the-su-game` Worker has deployed at least once (CI does
this automatically on every push to `main` that touches
`dodge-the-su/index.html`, `dodge-the-su/assets/**`, or
`deploy/dodge-the-su-game/**`):

1. **Workers & Pages** → `dodge-the-su-game` → **Settings** → **Domains &
   Routes** → **Add** → **Custom Domain**.
2. Pick whatever subdomain you'd like (e.g. `dodgethesu.mzhservices.com`),
   the same way `asteroids.mzhservices.com` and `snake.mzhservices.com`
   were set up.

## CI/CD

Two GitHub Actions workflows, both trigger on every push to `main`, using
the same `CLOUDFLARE_API_TOKEN` repo secret as the other games:

- `deploy-dodge-the-su-game.yml` - stages `dodge-the-su/index.html` and
  `dodge-the-su/assets/` and deploys the `dodge-the-su-game` Worker (the
  static site).
- `deploy-dodge-the-su-leaderboard.yml` - deploys this Worker
  (`dodge-the-su-leaderboard`) whenever `dodge-the-su/backend/**`
  changes.

The leaderboard Worker's deploy will fail until step 2 above is done
(the placeholder KV id in `wrangler.toml` doesn't point at anything real
yet) - that's expected, not a bug. The game itself still deploys and is
fully playable in the meantime; it just falls back to a per-browser local
high-score list until the shared backend is live.

## Anti-cheat

Same session-token defense as the other three games' leaderboards (see
the comment block at the top of `worker.js`), tuned for this game's own
scoring rate.

## Notes

- Same as the others: no login, no accounts - type a name, like an
  arcade cabinet.
- Cost: covered entirely by Cloudflare's free tier.
- To reset the leaderboard, delete and recreate the `top_scores` key in
  the KV namespace via the dashboard's KV viewer.
