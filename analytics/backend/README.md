# Site analytics backend (Cloudflare Worker + D1)

Tracks visits across all three games (Tetris, Asteroids, Snake) into one
shared database, so you can see a visitor's activity across games instead
of three separate silos. Completely independent of the three leaderboard
Workers/KV namespaces - this is its own Worker, its own storage.

What gets recorded per visit: timestamp, which game, a long-lived visitor
id and a per-session id (both first-party, set by the game's own page -
see each game's index.html), IP address, country/region/city/timezone (from
Cloudflare, no external geo-IP lookup needed), browser/device type
(parsed from the User-Agent), referrer, page path, and screen size.
Fired once per page load via `navigator.sendBeacon` - non-blocking, never
holds up the game loading or playing.

## 1. Create the D1 database

1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **D1 SQL
   Database** (left sidebar, may be under "Storage").
2. Click **Create database**, name it `site_analytics`, create it.
3. Open it and run the contents of `schema.sql` (this folder) in the
   dashboard's **Console** tab (paste the whole file, run it) - this
   creates the `visits` table and its indexes. You only need to do this
   once; re-running it is harmless (`CREATE TABLE IF NOT EXISTS`).
4. Copy the database's **Database ID** (shown on its overview page).

## 2. Wire the ID into the repo

Open `analytics/backend/wrangler.toml` and replace:

```
database_id = "REPLACE_WITH_REAL_D1_DATABASE_ID"
```

with the ID you just copied, then commit to `main`. CI deploys the
Worker with that binding attached from there.

## 3. Set the admin secret

The dashboard at the Worker's root URL is public to load, but the data
behind it needs a secret (sent as the `X-Admin-Secret` header). This
can't live in `wrangler.toml` (that file is in a public repo) - it has
to be set as an actual Cloudflare Worker secret, which needs dashboard
or `wrangler` CLI access:

- **Dashboard**: Worker (`site-analytics`) → **Settings** → **Variables
  and Secrets** → add `ADMIN_SECRET` as a secret (not a plain text var),
  paste in a password of your choosing.
- **CLI** (if you have `wrangler` + the Cloudflare API token locally):
  `cd analytics/backend && wrangler secret put ADMIN_SECRET`, then paste
  the password when prompted.

Pick something you'll remember - there's no recovery flow, just set a
new one the same way if you forget it.

## 4. (Optional) Custom domain

Same one-time step as the three games, if you want a nicer URL than
`site-analytics.<subdomain>.workers.dev`:
**Workers & Pages** → `site-analytics` → **Settings** → **Domains &
Routes** → **Add** → **Custom Domain** (e.g. `analytics.mzhservices.com`).
Not required - the dashboard works fine on the workers.dev URL, it's
just not linked from anywhere public.

## Using the dashboard

Open the Worker's URL in a browser, enter the admin secret from step 3,
click **UNLOCK**. Shows total/unique visitors, visits in the last 24h/7d,
a 14-day trend, breakdowns by game/country/browser/device, new-vs-
returning, and the 50 most recent visits (with IP, geo, referrer).
**REFRESH** re-fetches without reloading the page.

## CI/CD

One GitHub Actions workflow (`deploy-site-analytics.yml`), same pattern
and `CLOUDFLARE_API_TOKEN` secret as the other three games - triggers on
every push to `main` that touches `analytics/backend/**`.

The Worker's deploy will fail until step 2 above is done (the
placeholder D1 id in `wrangler.toml` doesn't point at anything real yet)
- that's expected, not a bug. Each game's own tracking call already
fails silently (see the tracking snippet in each game's index.html) if this Worker isn't reachable yet,
so nothing else breaks in the meantime.

## Notes

- IPs are stored raw (not hashed/truncated) - this was a deliberate
  choice for a small friends project, not a public-facing product. If
  that scope ever changes, revisit `worker.js`'s INSERT and consider
  hashing or dropping the last octet instead.
- No cross-site cookie tricks: each game sets its own first-party
  `visitor_id` cookie on its own domain (tetris.mzhservices.com etc.) -
  browsers would block a third-party cookie set directly by this
  Worker's own domain anyway. The trade-off: the same real person
  playing all three games gets three different `visitor_id`s (one per
  game-domain), correlated only by IP/timing if you need to eyeball
  that, not automatically joined.
- Cost: covered by Cloudflare's free tier (D1's free tier is 5GB storage
  / 5M row reads per day - a friends-project visit log won't get close).
- To reset, `DELETE FROM visits;` in the D1 console (or drop and re-run
  `schema.sql` for a completely clean slate).
