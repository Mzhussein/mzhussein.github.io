/**
 * Tetris leaderboard API - Cloudflare Worker
 *
 * A tiny shared backend so everyone who plays the game (any device,
 * any browser) sees and adds to the same top-10 list, instead of each
 * browser keeping its own local high scores.
 *
 * Storage: a single Workers KV namespace holding one JSON array under
 * the key "top_scores". That's enough for a top-10 list - no database
 * needed.
 *
 * Routes:
 *   GET  /leaderboard         -> [{name, score}, ...]  (current top 10)
 *   POST /leaderboard         -> body {name, score}, returns the
 *                                 updated top 10 after inserting it
 *
 * Bind a KV namespace named LEADERBOARD to this Worker (see README.md
 * in this folder for exact steps) before deploying.
 */

const MAX_ENTRIES = 10;
const NAME_MAX_LEN = 12;
const MAX_SCORE = 100000000; // sanity ceiling, well above anything reachable legitimately

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
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
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

    if (url.pathname === '/leaderboard' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: 'invalid json body' }, 400);
      }

      const name = String(body.name || '').trim().slice(0, NAME_MAX_LEN).toUpperCase() || 'ANON';
      const score = Number(body.score);
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
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
