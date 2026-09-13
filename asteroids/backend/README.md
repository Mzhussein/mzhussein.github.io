# Asteroids leaderboard backend (Cloudflare Worker)

This is what makes the leaderboard shared across everyone who plays the
game, instead of each browser keeping its own separate list. Same design
as the Tetris leaderboard - a completely separate Worker, KV namespace,
and URL, so nothing here touches the Tetris deployment.

Unlike the original Tetris setup, deploying the Worker itself is already
fully automated (see the CI/CD section below) - the **only** manual,
one-time steps are creating the KV storage and pointing the custom domain
at the game. Both need your Cloudflare dashboard.

## 1. Create the storage (KV namespace)

This is where the top-10 list actually lives.

1. Go to <https://dash.cloudflare.com> and sign in.
2. In the left sidebar, click **Workers & Pages**, then find **KV** (it
   may be under a "Storage" section).
3. Click **Create a namespace**, name it `asteroids_leaderboard`, and
   create it.
4. Click into the new namespace and copy its **ID** (a long hex string).

## 2. Wire the ID into the repo

Open `asteroids/backend/wrangler.toml` in this repo (via GitHub's
**Add file → Upload files**/edit-in-browser, same as the audio file
flow in `../../AUDIO.md`) and replace:

```
id = "REPLACE_WITH_REAL_KV_NAMESPACE_ID"
```

with the ID you just copied, then commit to `main`. That's it - CI takes
it from there and deploys the Worker with that binding attached.

(Or just send me the ID and I'll do this part.)

## 3. Custom domain

Once the `asteroids-game` Worker has deployed at least once (CI does this
automatically on every push to `main` that touches `asteroids/index.html`
or `deploy/asteroids-game/**`):

1. **Workers & Pages** → `asteroids-game` → **Settings** → **Domains &
   Routes** → **Add** → **Custom Domain**.
2. Enter `asteroids.mzhservices.com` and follow the prompts (same as
   `tetris.mzhservices.com` was set up).

## CI/CD

Two GitHub Actions workflows, both trigger on every push to `main`,
using the same `CLOUDFLARE_API_TOKEN` repo secret as Tetris:

- `deploy-asteroids-game.yml` - stages `asteroids/index.html` and
  deploys the `asteroids-game` Worker (the static site).
- `deploy-asteroids-leaderboard.yml` - deploys this Worker
  (`asteroids-leaderboard`) whenever `asteroids/backend/**` changes.

The leaderboard Worker's deploy will fail until step 2 above is done
(the placeholder KV id in `wrangler.toml` doesn't point at anything
real yet) - that's expected, not a bug. The game itself still deploys
and is fully playable in the meantime; it just falls back to a
per-browser local high-score list until the shared backend is live.

## Notes

- Same as Tetris: no login, no accounts - type a name, like an arcade
  cabinet. Not meant to stop a determined stranger from posting a joke
  score.
- Cost: covered entirely by Cloudflare's free tier.
- To reset the leaderboard, delete and recreate the `top_scores` key in
  the KV namespace via the dashboard's KV viewer.
