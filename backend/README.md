# Tetris leaderboard backend (Cloudflare Worker)

This is what makes the leaderboard shared across everyone who plays the
game, instead of each browser keeping its own separate list.

You already have a Cloudflare account, so the easiest path is the
dashboard - no command line needed.

## 1. Create the Worker

1. Go to <https://dash.cloudflare.com> and sign in.
2. In the left sidebar, click **Workers & Pages**.
3. Click **Create** (or **Create application**), then **Create Worker**.
4. Give it a name - `tetris-leaderboard` is a good choice - and click
   **Deploy**. This creates a placeholder "Hello World" Worker first;
   that's expected.
5. Click **Edit code** to open the online editor.
6. Select all the existing placeholder code and delete it, then paste
   in the entire contents of `worker.js` from this folder.
7. Click **Save and deploy**.

## 2. Create the storage (KV namespace)

This is where the top-10 list actually lives.

1. Still in **Workers & Pages**, find **KV** in the left sidebar (it
   may be under a "Storage" section).
2. Click **Create a namespace**, name it `tetris_leaderboard`, and
   create it.

## 3. Connect the Worker to the storage

1. Go back to your Worker (`tetris-leaderboard`) and open its
   **Settings** tab.
2. Find **Bindings** (sometimes labeled "Variables and Bindings" or
   "KV Namespace Bindings") and click **Add binding**.
3. Set:
   - **Variable name**: `LEADERBOARD` (must match exactly - this is
     the name `worker.js` looks for)
   - **KV namespace**: the `tetris_leaderboard` namespace you just
     created
4. Save/deploy the binding.

## 4. Get your Worker's URL

At the top of the Worker's page you'll see a URL that looks like:

```
https://tetris-leaderboard.<your-subdomain>.workers.dev
```

You can sanity-check it works by opening `<that URL>/leaderboard` in
your browser - it should show `[]` (an empty list, since no one has
played yet).

**Send me that URL** and I'll wire it into the game so both
`mzhussein.github.io` and the preview link start using the real shared
leaderboard.

## Anti-cheat

Forged scores (a name and a large number, POSTed straight to the API
with no game ever played) got onto the live leaderboard twice under the
same name - an obvious one (99999999) and a more careful one (100402,
sized to look like a very good but believable score). Fixed by
requiring a single-use session token, issued by `POST /session` when a
game actually starts, and checking the submitted score against how much
real time has passed since that token was issued (see the comment block
at the top of `worker.js` for the full reasoning). This isn't - and for
a client-authoritative game like this, can't be - a perfect defense
against someone willing to script the whole timing dance; it closes the
"one API call, no gameplay" version of the exploit, which is what
actually happened both times.

The plausibility numbers (`MAX_SCORE`, `MAX_SCORE_PER_SECOND`) are
grounded in this build's actual scoring/gravity math plus a real,
verified playtest (28280 points in ~8 minutes, topping out around level
8 - see `worker.js`), not generic "NES Tetris" folklore - the original,
looser numbers were exactly why the 100402 forgery went unnoticed at
first.

## Notes

- This is intentionally simple: no login, no accounts - anyone playing
  just types a name, like an arcade cabinet. There's no sensitive data
  here, just a fun family high-score list.
- Cost: Cloudflare's free plan covers this completely (Workers and KV
  both have generous free tiers, and a family leaderboard is nowhere
  near those limits).
- If you ever want to reset the leaderboard, delete and recreate the
  `top_scores` key in the KV namespace (via the dashboard's KV viewer).
