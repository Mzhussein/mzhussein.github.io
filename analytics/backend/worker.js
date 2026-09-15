/**
 * Site analytics API - Cloudflare Worker
 *
 * One shared backend for visit tracking across all three games (Tetris,
 * Asteroids, Snake) - a single D1 database so a visitor's activity can be
 * correlated across games, instead of three separate silos. Completely
 * independent of the three leaderboard Workers/KV namespaces.
 *
 * Routes:
 *   POST /track          -> body {game, visitor_id, session_id,
 *                            is_new_visitor, path, referrer, screen_w,
 *                            screen_h, lang}. Public, fire-and-forget from
 *                            each game's page (see the tracking snippet inline in each
 *                            game's index.html). Combines what the client
 *                            reports with what Cloudflare already knows
 *                            about the request (IP, geo, edge colo, real
 *                            User-Agent) into one row in D1.
 *   GET  /                -> the admin dashboard page (static HTML/JS,
 *                            embedded below). The page itself is public;
 *                            the data it displays is not - see /admin/*.
 *   GET  /admin/summary   -> aggregate stats as JSON. Requires the
 *                            X-Admin-Secret header to match the ADMIN_SECRET
 *                            Worker secret (see README.md) - wrong or
 *                            missing secret gets a generic 401, same
 *                            shape either way (no oracle for guessing it).
 *
 * Bind a D1 database named DB to this Worker, and set the ADMIN_SECRET
 * secret, before deploying (see README.md in this folder).
 */

const KNOWN_GAMES = new Set(['tetris', 'asteroids', 'snake']);
const STR_MAX = 512; // defensive cap on any client-supplied string field

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function clip(s) {
  return String(s == null ? '' : s).slice(0, STR_MAX);
}

// Deliberately simple, no-dependency User-Agent classification - not a
// full UA parser, just enough to group the dashboard's "device" and
// "browser" breakdowns into something readable. Order matters: more
// specific tokens are checked before ones they're substrings of (e.g.
// Edge and Chrome both contain "Safari" in their UA string).
function classifyUA(ua) {
  ua = ua || '';
  let device = 'desktop';
  if (/iPad|Tablet/i.test(ua)) device = 'tablet';
  else if (/Mobi|Android|iPhone/i.test(ua)) device = 'mobile';

  let browser = 'other';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/CriOS\//.test(ua)) browser = 'Chrome (iOS)';
  else if (/FxiOS\//.test(ua)) browser = 'Firefox (iOS)';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Version\/.*Safari\//.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/.test(ua)) browser = 'IE';

  return { device, browser };
}

async function handleTrack(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid json body' }, 400);
  }

  const game = clip(body.game);
  if (!KNOWN_GAMES.has(game)) {
    return json({ error: 'invalid game' }, 400);
  }
  const visitorId = clip(body.visitor_id);
  const sessionId = clip(body.session_id);
  if (!visitorId || !sessionId) {
    return json({ error: 'missing id' }, 400);
  }

  const cf = request.cf || {};
  const { device, browser } = classifyUA(request.headers.get('User-Agent'));

  await env.DB.prepare(
    `INSERT INTO visits
      (ts, game, visitor_id, session_id, is_new_visitor, ip, country, region,
       city, timezone, colo, user_agent, browser, device_type, referrer,
       path, screen_w, screen_h, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Date.now(),
    game,
    visitorId,
    sessionId,
    body.is_new_visitor ? 1 : 0,
    request.headers.get('CF-Connecting-IP') || null,
    cf.country || null,
    cf.region || null,
    cf.city || null,
    cf.timezone || null,
    cf.colo || null,
    clip(request.headers.get('User-Agent')),
    browser,
    device,
    clip(body.referrer),
    clip(body.path),
    Number.isInteger(body.screen_w) ? body.screen_w : null,
    Number.isInteger(body.screen_h) ? body.screen_h : null,
    clip(body.lang)
  ).run();

  return json({ ok: true });
}

function isAuthorized(request, env) {
  const provided = request.headers.get('X-Admin-Secret') || '';
  // env.ADMIN_SECRET is unset until the one-time `wrangler secret put`
  // step in README.md - fail closed (never "no secret configured = open").
  return !!env.ADMIN_SECRET && provided === env.ADMIN_SECRET;
}

async function handleSummary(request, env) {
  if (!isAuthorized(request, env)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const db = env.DB;

  const [
    totals, uniqueVisitors, byGame, last24h, last7d,
    byCountry, dailySeries, newVsReturning, byBrowser, byDevice, recent,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM visits').first(),
    db.prepare('SELECT COUNT(DISTINCT visitor_id) AS c FROM visits').first(),
    db.prepare('SELECT game, COUNT(*) AS visits, COUNT(DISTINCT visitor_id) AS unique_visitors FROM visits GROUP BY game').all(),
    db.prepare('SELECT COUNT(*) AS c FROM visits WHERE ts > ?').bind(now - DAY).first(),
    db.prepare('SELECT COUNT(*) AS c FROM visits WHERE ts > ?').bind(now - 7 * DAY).first(),
    db.prepare("SELECT country, COUNT(*) AS c FROM visits WHERE country IS NOT NULL GROUP BY country ORDER BY c DESC LIMIT 15").all(),
    db.prepare(
      `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, COUNT(*) AS c
       FROM visits WHERE ts > ? GROUP BY day ORDER BY day`
    ).bind(now - 14 * DAY).all(),
    db.prepare('SELECT is_new_visitor, COUNT(*) AS c FROM visits WHERE ts > ? GROUP BY is_new_visitor').bind(now - 30 * DAY).all(),
    db.prepare('SELECT browser, COUNT(*) AS c FROM visits GROUP BY browser ORDER BY c DESC').all(),
    db.prepare('SELECT device_type, COUNT(*) AS c FROM visits GROUP BY device_type ORDER BY c DESC').all(),
    db.prepare(
      `SELECT ts, game, visitor_id, session_id, is_new_visitor, ip, country,
              region, city, browser, device_type, referrer, path
       FROM visits ORDER BY ts DESC LIMIT 50`
    ).all(),
  ]);

  return json({
    total_visits: totals.c,
    unique_visitors: uniqueVisitors.c,
    by_game: byGame.results,
    last_24h: last24h.c,
    last_7d: last7d.c,
    by_country: byCountry.results,
    daily_series: dailySeries.results,
    new_vs_returning: newVsReturning.results,
    by_browser: byBrowser.results,
    by_device: byDevice.results,
    recent: recent.results,
  });
}

const ADMIN_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site analytics</title>
<style>
  :root{ --bg:#0b0b0a; --panel:#17170f; --border:#3a3a2a; --text:#e8e6d8; --muted:#8a8a76; --accent:#9bab6a; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--text); font-family:ui-monospace,Menlo,Consolas,monospace; padding:20px; }
  h1{ font-size:1.1rem; letter-spacing:0.1em; color:var(--accent); margin:0 0 4px; }
  .sub{ color:var(--muted); font-size:0.75rem; margin-bottom:20px; }
  #gate{ max-width:320px; margin-top:60px; }
  #gate input{ font-family:inherit; background:#000; color:var(--accent); border:2px solid var(--border); padding:8px 10px; width:100%; margin-bottom:10px; }
  #gate button{ font-family:inherit; background:var(--panel); color:var(--text); border:2px solid var(--border); padding:8px 16px; cursor:pointer; width:100%; }
  #gate button:hover{ border-color:var(--accent); color:var(--accent); }
  #gateError{ color:#f06060; font-size:0.75rem; margin-top:8px; min-height:1em; }
  #dash{ display:none; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:20px; }
  .tile{ background:var(--panel); border:2px solid var(--border); padding:12px 14px; }
  .tile .label{ color:var(--muted); font-size:0.65rem; letter-spacing:0.1em; }
  .tile .value{ color:var(--accent); font-size:1.4rem; margin-top:4px; }
  .panels{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
  .panel{ background:var(--panel); border:2px solid var(--border); padding:14px; overflow-x:auto; }
  .panel h2{ font-size:0.75rem; letter-spacing:0.1em; color:var(--muted); margin:0 0 10px; font-weight:normal; }
  table{ border-collapse:collapse; width:100%; font-size:0.75rem; }
  th,td{ text-align:left; padding:3px 8px 3px 0; white-space:nowrap; }
  th{ color:var(--muted); font-weight:normal; border-bottom:1px solid var(--border); }
  tr:nth-child(even){ background:rgba(255,255,255,0.02); }
  .bar-row{ display:flex; align-items:center; gap:8px; font-size:0.75rem; margin-bottom:4px; }
  .bar-label{ width:80px; flex:0 0 auto; color:var(--muted); }
  .bar-track{ flex:1 1 auto; background:#000; height:14px; position:relative; border:1px solid var(--border); }
  .bar-fill{ background:var(--accent); height:100%; }
  .bar-count{ width:40px; flex:0 0 auto; text-align:right; }
  svg text{ fill:var(--muted); font-size:9px; font-family:inherit; }
  #refreshBtn{ font-family:inherit; background:var(--panel); color:var(--text); border:2px solid var(--border); padding:6px 12px; cursor:pointer; font-size:0.7rem; margin-bottom:16px; }
  #refreshBtn:hover{ border-color:var(--accent); color:var(--accent); }
</style>
</head>
<body>

<div id="gate">
  <h1>SITE ANALYTICS</h1>
  <div class="sub">Tetris / Asteroids / Snake - shared visit log</div>
  <input type="password" id="secretInput" placeholder="admin secret" autocomplete="off">
  <button id="unlockBtn">UNLOCK</button>
  <div id="gateError"></div>
</div>

<div id="dash">
  <h1>SITE ANALYTICS</h1>
  <div class="sub">Tetris / Asteroids / Snake - shared visit log</div>
  <button id="refreshBtn">REFRESH</button>
  <div class="grid" id="tiles"></div>
  <div class="panels">
    <div class="panel"><h2>VISITS - LAST 14 DAYS</h2><div id="dailyChart"></div></div>
    <div class="panel"><h2>BY GAME</h2><div id="byGame"></div></div>
    <div class="panel"><h2>BY COUNTRY</h2><div id="byCountry"></div></div>
    <div class="panel"><h2>BY BROWSER</h2><div id="byBrowser"></div></div>
    <div class="panel"><h2>BY DEVICE</h2><div id="byDevice"></div></div>
    <div class="panel"><h2>NEW VS RETURNING (30d)</h2><div id="newVsReturning"></div></div>
  </div>
  <div class="panel" style="margin-top:14px;">
    <h2>RECENT VISITS</h2>
    <table id="recentTable"><thead><tr>
      <th>TIME</th><th>GAME</th><th>NEW</th><th>COUNTRY</th><th>CITY</th>
      <th>BROWSER</th><th>DEVICE</th><th>IP</th><th>REFERRER</th>
    </tr></thead><tbody></tbody></table>
  </div>
</div>

<script>
(function(){
  "use strict";
  var secret = '';

  function fmtTime(ts){
    var d = new Date(ts);
    return d.toLocaleString();
  }

  function barChart(el, rows, labelKey, countKey){
    var max = rows.reduce(function(m, r){ return Math.max(m, r[countKey]); }, 1);
    el.innerHTML = rows.map(function(r){
      var pct = Math.round((r[countKey] / max) * 100);
      var label = String(r[labelKey] || 'unknown');
      return '<div class="bar-row"><div class="bar-label" title="' + label + '">' + label + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="bar-count">' + r[countKey] + '</div></div>';
    }).join('') || '<div style="color:var(--muted);font-size:0.75rem;">no data yet</div>';
  }

  function lineChart(el, rows){
    if (!rows.length){ el.innerHTML = '<div style="color:var(--muted);font-size:0.75rem;">no data yet</div>'; return; }
    var w = 500, h = 140, pad = 20;
    var max = rows.reduce(function(m, r){ return Math.max(m, r.c); }, 1);
    var stepX = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;
    var pts = rows.map(function(r, i){
      var x = pad + i * stepX;
      var y = h - pad - (r.c / max) * (h - pad * 2);
      return x + ',' + y;
    }).join(' ');
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:140px;">';
    svg += '<polyline points="' + pts + '" fill="none" stroke="#9bab6a" stroke-width="2"/>';
    rows.forEach(function(r, i){
      var x = pad + i * stepX;
      var y = h - pad - (r.c / max) * (h - pad * 2);
      svg += '<circle cx="' + x + '" cy="' + y + '" r="2.5" fill="#9bab6a"/>';
      if (i === 0 || i === rows.length - 1 || i % 3 === 0){
        svg += '<text x="' + x + '" y="' + (h - 4) + '" text-anchor="middle">' + r.day.slice(5) + '</text>';
      }
    });
    svg += '</svg>';
    el.innerHTML = svg;
  }

  function render(data){
    document.getElementById('tiles').innerHTML = [
      ['TOTAL VISITS', data.total_visits],
      ['UNIQUE VISITORS', data.unique_visitors],
      ['LAST 24H', data.last_24h],
      ['LAST 7D', data.last_7d],
    ].map(function(t){
      return '<div class="tile"><div class="label">' + t[0] + '</div><div class="value">' + t[1] + '</div></div>';
    }).join('');

    lineChart(document.getElementById('dailyChart'), data.daily_series);
    barChart(document.getElementById('byGame'), data.by_game, 'game', 'visits');
    barChart(document.getElementById('byCountry'), data.by_country, 'country', 'c');
    barChart(document.getElementById('byBrowser'), data.by_browser, 'browser', 'c');
    barChart(document.getElementById('byDevice'), data.by_device, 'device_type', 'c');

    var nvr = { 0: 0, 1: 0 };
    data.new_vs_returning.forEach(function(r){ nvr[r.is_new_visitor] = r.c; });
    barChart(document.getElementById('newVsReturning'),
      [{ k: 'new', c: nvr[1] || 0 }, { k: 'returning', c: nvr[0] || 0 }], 'k', 'c');

    var tbody = document.querySelector('#recentTable tbody');
    tbody.innerHTML = data.recent.map(function(r){
      return '<tr><td>' + fmtTime(r.ts) + '</td><td>' + r.game + '</td><td>' +
        (r.is_new_visitor ? 'yes' : '') + '</td><td>' + (r.country || '') + '</td><td>' +
        (r.city || '') + '</td><td>' + (r.browser || '') + '</td><td>' + (r.device_type || '') +
        '</td><td>' + (r.ip || '') + '</td><td>' + (r.referrer || '(direct)') + '</td></tr>';
    }).join('');
  }

  async function load(){
    var res = await fetch('/admin/summary', { headers: { 'X-Admin-Secret': secret } });
    if (res.status === 401){
      document.getElementById('gate').style.display = '';
      document.getElementById('dash').style.display = 'none';
      document.getElementById('gateError').textContent = 'Wrong secret.';
      return;
    }
    var data = await res.json();
    document.getElementById('gate').style.display = 'none';
    document.getElementById('dash').style.display = '';
    render(data);
  }

  document.getElementById('unlockBtn').addEventListener('click', function(){
    secret = document.getElementById('secretInput').value;
    load();
  });
  document.getElementById('secretInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter') document.getElementById('unlockBtn').click();
  });
  document.getElementById('refreshBtn').addEventListener('click', load);
})();
</script>
</body>
</html>
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/track' && request.method === 'POST') {
      return handleTrack(request, env);
    }

    if (url.pathname === '/admin/summary' && request.method === 'GET') {
      return handleSummary(request, env);
    }

    if ((url.pathname === '/' || url.pathname === '/admin') && request.method === 'GET') {
      return new Response(ADMIN_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return json({ error: 'not found' }, 404);
  },
};
