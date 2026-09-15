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
