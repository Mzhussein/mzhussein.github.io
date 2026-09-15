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

## Incident 2 (superseded below): a caching theory that looked right, wasn't the cause

After incident 1's fix deployed, `/` and one specific asset path still
came back `200` with real content - including on a brand-new path that
had never been requested before, which is the detail that eventually
disproved the theory below. At the time it looked like a plausible
Cloudflare edge-cache issue (a never-invalidated, effectively-immutable
cached response from before the fix existed), and `gate-worker.js` was
hardened to force `Cache-Control: private, no-store` on every response,
with the asset paths versioned (`assets/img,audio` → `assets/v2/img,audio`)
to guarantee fresh cache keys. Both changes are harmless, reasonable
defense-in-depth and were kept - but they were not the actual fix,
because a brand-new path, never served or cached before, **still**
bypassed the Worker on its very first-ever request. That's not
explainable by any cache theory. See incident 3 for the real cause.

## Incident 3: run_worker_first was never actually applied - wrong Wrangler version

The real cause, found by checking the CI deploy logs directly instead of
trusting that "deploy succeeded" meant the config took effect:

```
⛅️ wrangler 3.90.0 (update available 4.132.0)
▲ [WARNING] Processing wrangler.toml configuration:
    - Unexpected fields found in assets field: "run_worker_first"
```

`cloudflare/wrangler-action@v3` in the deploy workflow is a tag on the
GitHub *Action*, not the Wrangler CLI version it installs - with no
`wranglerVersion` input pinned, that action release defaulted to
installing Wrangler 3.90.0, a version that predates `run_worker_first`
entirely. Wrangler 3.x treats an unrecognized `[assets]` field as a
non-fatal warning, not an error, so `wrangler deploy` exited 0 and every
CI run reported success while `run_worker_first` silently did nothing.
That's why Cloudflare kept serving any request matching a file in the
asset manifest - old path or brand-new - directly from its edge without
ever invoking `gate-worker.js`, regardless of what the source said:
**the deployed Worker was never actually configured the way the
committed `wrangler.toml` claimed.**

Fix: `.github/workflows/deploy-dodge-the-su-game.yml` now pins
`wranglerVersion: '4.132.0'` explicitly on the deploy step - a specific
version, not a floating major, so this can't silently drift again in
either direction. If `run_worker_first` (or anything else version-gated)
ever needs bumping again, check the actual CI logs for
`Unexpected fields found` warnings before assuming a config change took
effect just because the workflow went green.

**The lesson underlying all three incidents**: a green CI run and a
correct-looking committed config are not evidence that a Cloudflare
Worker is actually running the way its source implies. Verify behavior
live, and when live behavior contradicts the source, check the actual
deploy tool's logs before reaching for a caching or platform-limitation
explanation.

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
