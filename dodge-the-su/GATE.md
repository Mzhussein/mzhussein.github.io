# Access gate

Unlike Tetris/Asteroids/Snake (all public), Dodge The Su is **not** meant
to be openly public: the traffic obstacles are real photos of specific
friends (not just the one who agreed to be the game's "Su" chaser), with
a gory crash animation on top. So the deployed site sits behind a shared
passphrase - see `../deploy/dodge-the-su-game/gate-worker.js` for how the
check works (a plain HttpOnly cookie compared against a secret; nothing
fancier, since the threat model here is "keep search engines and random
visitors out," not "defend against a targeted attacker").

## One-time setup: set the passphrase

The gate Worker checks every request against a `GATE_PASSWORD` secret. It
is **not** in `wrangler.toml` (that file is committed to this public
repo) - it has to be set directly on the Worker, once, via the Cloudflare
dashboard:

1. Go to <https://dash.cloudflare.com> and sign in.
2. **Workers & Pages** → `dodge-the-su-game` → **Settings** →
   **Variables and Secrets**.
3. Add a variable named `GATE_PASSWORD`, type **Secret**, value = whatever
   passphrase you want to share with friends/family.
4. Save - it takes effect immediately, no redeploy needed.

(Or via the CLI, if you have `wrangler` set up locally: `wrangler secret
put GATE_PASSWORD --name dodge-the-su-game`, then paste the value when
prompted.)

Until this is set, the Worker fails **closed**: it returns a plain 503
telling you the gate isn't configured yet, rather than serving the game
unprotected.

## Incident: the gate didn't actually run at first

The first deploy of this Worker had `gate-worker.js` as `main` but was
still missing `run_worker_first = true` in the `[assets]` block of
`deploy/dodge-the-su-game/wrangler.toml`. Without that setting, Cloudflare
serves any request matching a file in the static bundle directly from its
edge - which is everything here (`/` → `index.html`, every path under
`assets/img/` and `assets/audio/`) - **without ever invoking
gate-worker.js's fetch handler**. The password check itself was never
wrong; it just never ran. This was caught live (an unauthenticated
request to `assets/img/9_sprite_police.png` returned the real file, not
a 401/503) before `GATE_PASSWORD` was even set, and the `workers.dev`
subdomain was disabled immediately as containment while the fix
(`run_worker_first = true`, now in wrangler.toml) deployed. Verify this
class of bug directly, live, on any future change here - don't just trust
that a Worker with an `[assets]` binding routes through your `fetch`
handler by default. It doesn't.

## Incident 2: run_worker_first was correct but a stale edge cache wasn't

After the fix above deployed and was verified live-and-correct (a
never-before-requested path correctly got a 503 from `gate-worker.js`,
proving the Worker ran unconditionally), `/` and the one specific asset
path that had been requested *during* incident 1's exposure window kept
returning `200` with the real content anyway - same `ETag`, even with a
cache-busting query string.

Cause: the Workers Static Assets binding serves files with long-lived,
effectively-immutable `Cache-Control` by default. The vulnerable deploy
served `/` and that image with those headers before `run_worker_first`
existed; Cloudflare's edge cached those exact responses. A cache **hit**
is served straight from the edge before the Worker is ever invoked, for
any request - `run_worker_first` only affects what happens on a cache
*miss*. Since nothing about that deploy's HTML/image *content* changed
(only routing config did), the new deploy produced byte-identical
responses, so Cloudflare correctly kept treating the cached copies as
still valid. No `run_worker_first` setting, by itself, can retroactively
un-cache a response that was already cached before it existed. A
`*.workers.dev` host also isn't a purgeable zone, so the normal
Cache-Purge-by-URL API doesn't reach it either.

Two-part fix, both in this repo, no dashboard/API purge needed:
- `gate-worker.js` now forces `Cache-Control: private, no-store` (and
  strips `ETag`/`Last-Modified`) on **every** response it returns,
  including whatever `env.ASSETS.fetch()` hands back - so nothing this
  Worker ever serves is cacheable anywhere again, closing this off for
  good regardless of what Cloudflare's asset-serving defaults do.
- The asset paths moved from `assets/img/`, `assets/audio/` to
  `assets/v2/img/`, `assets/v2/audio/` (see the comment above
  `ASSET_BASE` in `index.html`) - every URL under the old paths is now
  one nothing serves, so the already-cached copies are simply orphaned
  rather than something to race a purge against, and every new path is a
  guaranteed cache miss that has to go through the (now correctly
  no-store'd) Worker.

If this ever needs to happen a third time, bump the asset path again
(`v3`, etc.) rather than reusing an old one, and confirm the `no-store`
header is actually present on a live response before trusting it.

## Changing or rotating the passphrase

Repeat the steps above with a new value. Anyone with the old passphrase's
cookie stays logged in until it expires (180 days) or they clear cookies
for the site - there's no server-side session list to revoke individual
visitors from with a shared-passphrase gate like this one. If that ever
matters, see "Upgrading" below.

## Upgrading to per-person login later

If a shared passphrase ever stops being enough (it leaks, or you want to
revoke one specific person without changing it for everyone), the
straightforward upgrade is **Cloudflare Access** (part of Cloudflare Zero
Trust, free for small teams): an email-allowlist login wall applied at
the edge, in front of the domain, with no code changes to this Worker at
all - just a Zero Trust dashboard policy naming which email addresses may
in. That's a bigger, separate setup step (and was intentionally not the
first move here), not something this gate-worker.js needs to anticipate.
