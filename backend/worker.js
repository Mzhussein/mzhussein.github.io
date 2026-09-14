/**
 * Tetris leaderboard API - Cloudflare Worker
 *
 * A tiny shared backend so everyone who plays the game (any device,
 * any browser) sees and adds to the same top-10 list, instead of each
 * browser keeping its own local high scores.
 *
 * Storage: a single Workers KV namespace holding one JSON array under
 * the key "top_scores", plus short-lived session-token entries under
 * "session:<token>" (see the anti-cheat note below). That's enough for
 * a top-10 list - no database needed.
 *
 * Routes:
 *   GET  /leaderboard  -> [{name, score}, ...]  (current top 10)
 *   POST /session      -> {}, returns {token}. Call this once when a
 *                          game actually starts (see README.md) - the
 *                          token is what proves real time passed before
 *                          a score gets submitted.
 *   POST /leaderboard  -> body {name, score, token}, returns the
 *                          updated top 10 after inserting it
 *
 * Anti-cheat: this endpoint is public and can be POSTed to directly,
 * bypassing the page entirely - and was: a forged 99999999 score got in
 * this way, with no game ever played. There's no way to fully verify a
 * score from a client-authoritative game without replaying every move
 * server-side (out of scope here), but POST /leaderboard now requires a
 * single-use token from POST /session and rejects any score that isn't
 * plausible for how much real time has passed since that token was
 * issued (see scoreIsPlausible below). That closes the "one API call,
 * no gameplay" exploit; it doesn't stop someone willing to script the
 * actual timing dance, which is a fundamentally different, much higher
 * effort attack against this class of app. Every rejection - bad score,
 * missing/expired/reused token, not enough elapsed time - returns the
 * exact same generic error, on purpose, so a script probing this API
 * can't tell which check it tripped.
 *
 * Bind a KV namespace named LEADERBOARD to this Worker (see README.md
 * in this folder for exact steps) before deploying.
 */

const MAX_ENTRIES = 10;
const NAME_MAX_LEN = 12;

// ---- anti-cheat tuning ----
// MAX_SCORE: a hard ceiling regardless of anything else. 999999 is the
// classic "six nines" NES Tetris max score convention - generous for any
// real run, and also what retroactively purges the forged 99999999 entry
// (see getLeaderboard's self-heal below).
const MAX_SCORE = 999999;
// A session token (from POST /session) is valid for this long, then KV
// expires it automatically. 30 minutes comfortably covers a long single
// sitting without leaving old tokens farmable indefinitely.
const SESSION_TTL_SECONDS = 1800;
// scoreIsPlausible below allows SCORE_BASE_ALLOWANCE points immediately
// (covers an early lucky big clear before the rate window has accrued
// much), plus MAX_SCORE_PER_SECOND for every second since the session
// token was issued. Both are deliberately generous - tuned to never
// reject genuine play, not to model exact optimal-play scoring.
const SCORE_BASE_ALLOWANCE = 3000;
const MAX_SCORE_PER_SECOND = 1500;

function scoreIsPlausible(score, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  return score <= SCORE_BASE_ALLOWANCE + (elapsedMs / 1000) * MAX_SCORE_PER_SECOND;
}

// Basic profanity guard for the shared, public leaderboard. Not trying to be
// exhaustive - just catches the common cases so the family list doesn't get
// trashed. Checked here (not just in the page) since this endpoint is the
// real enforcement point: anyone can POST to it directly, bypassing the UI.
const BANNED_SUBSTRINGS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'cock', 'asshole',
  'bastard', 'whore', 'slut', 'fag', 'nigger', 'nigga', 'retard', 'rape',
  'nazi', 'hitler', 'kike', 'chink', 'spic', 'wetback', 'tranny',
];
function normalizeForFilter(s) {
  return String(s)
    .toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/[^a-z]/g, '');
}
function isBannedName(name) {
  const n = normalizeForFilter(name);
  return BANNED_SUBSTRINGS.some((w) => n.includes(w));
}

// No hiding on the leaderboard: reject "anon" and its variants (including
// a blank name, which falls back to the literal string "ANON" below and
// so gets caught by the same check).
const ANON_SUBSTRINGS = [
  'anon', 'anonymous', 'unknown', 'nobody', 'noone', 'nameless', 'noname', 'incognito',
];
function isAnonName(name) {
  const n = normalizeForFilter(name);
  return ANON_SUBSTRINGS.some((w) => n.includes(w));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function getLeaderboard(env) {
  const raw = await env.LEADERBOARD.get('top_scores');
  if (!raw) return [];
  let arr;
  try {
    arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [];
  } catch (e) {
    arr = [];
  }
  // Self-healing: silently drop anything that wouldn't pass validation
  // today - forged scores from before this ceiling existed (like the
  // 99999999 entry that prompted this), or this project's own leftover
  // "TEST" entries. Runs on every read, so the very next request cleans
  // the stored list up if it ever needs it.
  const cleaned = arr.filter((e) =>
    e && typeof e.name === 'string' && e.name !== 'TEST' &&
    Number.isInteger(e.score) && e.score >= 0 && e.score <= MAX_SCORE
  );
  if (cleaned.length !== arr.length) {
    await saveLeaderboard(env, cleaned);
  }
  return cleaned;
}

async function saveLeaderboard(env, list) {
  await env.LEADERBOARD.put('top_scores', JSON.stringify(list));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/leaderboard' && request.method === 'GET') {
      const list = await getLeaderboard(env);
      return json(list);
    }

    if (url.pathname === '/session' && request.method === 'POST') {
      const token = crypto.randomUUID();
      await env.LEADERBOARD.put('session:' + token, String(Date.now()), {
        expirationTtl: SESSION_TTL_SECONDS,
      });
      return json({ token });
    }

    if (url.pathname === '/leaderboard' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: 'invalid json body' }, 400);
      }

      const name = String(body.name || '').trim().slice(0, NAME_MAX_LEN).toUpperCase() || 'ANON';
      const score = Number(body.score);
      const token = String(body.token || '');

      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return json({ error: 'invalid score' }, 400);
      }
      if (isBannedName(name)) {
        return json({ error: 'inappropriate name' }, 400);
      }
      if (isAnonName(name)) {
        return json({ error: 'anonymous name' }, 400);
      }

      // Proof-of-session (see the file header comment for the threat this
      // closes). Every failure path here returns the same generic
      // 'invalid score' error as a plain bad score would, so nothing
      // about *why* a submission was rejected leaks back to the caller.
      if (!token) {
        return json({ error: 'invalid score' }, 400);
      }
      const sessionKey = 'session:' + token;
      const issuedAtRaw = await env.LEADERBOARD.get(sessionKey);
      if (!issuedAtRaw) {
        return json({ error: 'invalid score' }, 400);
      }
      await env.LEADERBOARD.delete(sessionKey); // single-use - no replay
      const elapsedMs = Date.now() - Number(issuedAtRaw);
      if (!scoreIsPlausible(score, elapsedMs)) {
        return json({ error: 'invalid score' }, 400);
      }

      const list = await getLeaderboard(env);
      list.push({ name, score });
      list.sort((a, b) => b.score - a.score);
      list.length = Math.min(list.length, MAX_ENTRIES);
      await saveLeaderboard(env, list);

      return json(list);
    }

    return json({ error: 'not found' }, 404);
  },
};
