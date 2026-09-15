-- Shared analytics database - one row per page visit, across all three
-- games (Tetris, Asteroids, Snake). See README.md for how to apply this.

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,             -- unix ms, set server-side (authoritative,
                                    -- not trusted from the client)
  game TEXT NOT NULL,              -- 'tetris' | 'asteroids' | 'snake'
  visitor_id TEXT NOT NULL,        -- long-lived id, first-party cookie set by
                                    -- the game's own page (per game-domain -
                                    -- see the tracking snippet inline in each game's index.html)
  session_id TEXT NOT NULL,        -- resets every browser session (tab/
                                    -- window close), sessionStorage-based
  is_new_visitor INTEGER NOT NULL, -- 1 if visitor_id was minted this visit
  ip TEXT,                         -- CF-Connecting-IP
  country TEXT,                    -- request.cf.country
  region TEXT,                     -- request.cf.region
  city TEXT,                       -- request.cf.city
  timezone TEXT,                   -- request.cf.timezone
  colo TEXT,                       -- request.cf.colo (CF edge datacenter)
  user_agent TEXT,
  browser TEXT,                    -- coarse classification, see worker.js
  device_type TEXT,                -- 'desktop' | 'mobile' | 'tablet'
  referrer TEXT,
  path TEXT,
  screen_w INTEGER,
  screen_h INTEGER,
  lang TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);
CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_game ON visits(game);
CREATE INDEX IF NOT EXISTS idx_visits_game_ts ON visits(game, ts);
