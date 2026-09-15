/**
 * Shared-password gate for Dodge The Su.
 *
 * Unlike the other three games on this site (Tetris/Asteroids/Snake, all
 * public), this one uses real photos of specific friends (not just the
 * one who agreed to be the game's "Su" chaser) plus a gory crash
 * animation, so it isn't meant to be openly public. This Worker is the
 * actual entry point for the dodge-the-su-game Worker (see wrangler.toml)
 * and sits in front of the static asset bundle: every request has to
 * present a cookie matching the GATE_PASSWORD secret before it's allowed
 * through to env.ASSETS.fetch(). No cookie/wrong password -> a plain
 * password prompt, always - never a peek at the game underneath.
 *
 * This is a shared-passphrase gate, not per-person login: good enough to
 * keep search engines and random visitors out, not a defense against a
 * targeted attacker who gets the password. See ../../dodge-the-su/GATE.md
 * for the one-time setup step (setting GATE_PASSWORD) and for upgrading
 * to real per-person login (Cloudflare Access) later if that's ever
 * needed.
 */

const COOKIE_NAME = 'dodge_gate';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function loginPage(errorMessage) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dodge The Su</title>
<style>
  body{background:#0c0b0a;color:#f0ece4;font-family:'Courier New','Consolas',monospace;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box;}
  form{background:#161311;border:2px solid #3a322a;padding:26px 24px;text-align:center;width:min(320px, 100%);}
  h1{color:#ffb020;letter-spacing:0.12em;font-size:1.15rem;margin:0 0 16px;text-shadow:0 0 8px rgba(255,176,32,0.35);}
  input{font-family:inherit;background:#000;color:#ffb020;border:2px solid #3a322a;padding:9px 10px;
    font-size:0.9rem;margin-bottom:12px;width:100%;box-sizing:border-box;text-align:center;}
  input:focus{outline:none;border-color:#ffb020;}
  button{font-family:inherit;background:#161311;color:#f0ece4;border:2px solid #3a322a;
    padding:9px 18px;cursor:pointer;font-size:0.85rem;width:100%;}
  button:hover{border-color:#ffb020;color:#ffb020;}
  p.err{color:#ff4d4d;font-size:0.75rem;margin:0 0 12px;}
  p.hint{color:#8a8078;font-size:0.65rem;margin:14px 0 0;}
</style>
</head><body>
<form method="POST" action="/__gate_login">
  <h1>DODGE THE SU</h1>
  ${errorMessage ? `<p class="err">${errorMessage}</p>` : ''}
  <input type="password" name="password" placeholder="passphrase" autofocus required autocomplete="current-password">
  <button type="submit">ENTER</button>
  <p class="hint">friends-and-family only - ask for the passphrase</p>
</form>
</body></html>`;
}

function html(body, status) {
  return new Response(body, { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.GATE_PASSWORD) {
      // Fail closed, not open - see GATE.md for the one-time setup step.
      return new Response(
        'This game is gated behind a passphrase, but GATE_PASSWORD isn\'t set yet on this Worker. See dodge-the-su/GATE.md.',
        { status: 503 }
      );
    }

    if (url.pathname === '/__gate_login' && request.method === 'POST') {
      let password = '';
      try {
        const form = await request.formData();
        password = String(form.get('password') || '');
      } catch (e) { /* malformed body - falls through to the wrong-password response */ }

      if (password && password === env.GATE_PASSWORD) {
        const headers = new Headers({ Location: '/' });
        headers.append(
          'Set-Cookie',
          `${COOKIE_NAME}=${encodeURIComponent(password)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
        );
        return new Response(null, { status: 302, headers });
      }
      return html(loginPage('Wrong passphrase.'), 401);
    }

    const cookie = readCookie(request, COOKIE_NAME);
    if (cookie !== env.GATE_PASSWORD) {
      return html(loginPage());
    }

    return env.ASSETS.fetch(request);
  },
};
