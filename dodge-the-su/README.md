# Dodge The Su

A ground-up web recreation of an original Game Maker 7 game made years ago
for a small group of friends. The original shipped only as a compiled
Windows `.exe` (`dodge_the_su.exe`) - no source `.gmk` project file
survived - so this version was rebuilt by decoding that executable's
embedded game data directly (GameMaker 6-8.1's exe format is a documented,
if obscure, container: a zlib-compressed, substitution-cipher-encrypted
blob appended after the Delphi "Runner" that GameMaker itself always
shipped). The result is a faithful-as-practical port: real extracted
sprites and sound clips, and gameplay values (speeds, spawn odds, fuel
drain, score-per-frame) read straight out of the original's decoded
object logic rather than guessed from watching a video of it.

No original binary, and no decompiler/third-party tool output, is
shipped here - only the image and audio *assets* it contained (which are
this project's own original art/audio) and hand-written JS reimplementing
the decoded gameplay logic.

## Not public - gated behind a passphrase

Unlike Tetris/Asteroids/Snake on this site, this one is deliberately
**not** open to the public: the regular traffic obstacles turned out to
be real photos of several friends (not just the one who's the game's
named "Su" chaser), with a burst/explosion animation on crash - all kept
exactly as the original had it, at the author's request, but gated rather
than shipped wide open. See `GATE.md` for how the gate works and its
one-time setup step.

## What's faithful vs. approximated

Faithful (read straight from the decoded object/room data):
- Player movement speeds (4-5px/step), road bounds (x: 32-360), fuel
  drain (1/step from a 1000 tank), refuel amount (+400, capped at 1000).
- Traffic spawn lanes/speeds/odds, and how the odds and gas-respawn timer
  scale with score.
- The "Su" chaser: only appears once score > 3000 (with increasing
  frequency after that), homes in on the player's x position, dies either
  to gunfire (cheer + voice line + bonus popup) or by crashing into other
  traffic (no bonus) - see `sprite_manifest.json` and the git history of
  this decode for the underlying trace.
- The sound cues: gunshot on fire, a crash sound on any collision, the
  applause clip on refuel, the chase drone while Su is alive, the two
  taunt voice lines on a gunned-down Su, and the "my name is Suraj"
  voice line at game over.
- Lives (3), respawn-in-place-vs-restart-room behavior on death.

Approximated/modernized (documented in `index.html` comments at each
spot):
- The original had **no vertical bound** on the player at all (an
  oversight in the original, not a deliberate design) - this version
  clamps y to keep the car on-screen.
- The original drew its HUD as canvas text at fixed pixel coordinates;
  this version uses the same HTML side-panel HUD style as the site's
  other games (Tetris/Asteroids/Snake) instead, for visual consistency
  across the site.
- The "+10" bonus popup's exact scoring hook was ambiguous in the decoded
  action list (dead code around it in the original); it's kept here as a
  visual kill-confirmation rather than inventing a score bonus that may
  not have existed.
- `no3.wav` (a third taunt voice line) exists as an extracted asset but
  was never actually wired to any trigger in the original - kept
  available under `assets/audio/` for the remaster pass rather than
  invented a use for it here.

## Music

The original used a real commercial recording (Bob Marley - "Stand Up
Jamrock") as its background track, which can't be redistributed on a
public site. Rather than ship a substitute track, this version ships
**no** background music by default and instead has a "master settings"
panel (the &#9881; button, top right) where you can load your own
MP3/OGG/M4A file - it's read straight into your browser's IndexedDB and
never leaves your device, so you're responsible for whatever you choose
to load, the same way `AUDIO.md` at the repo root already works for the
Tetris theme (that one's a git-commit swap; this one's a live in-page
upload, since a driving/dodging game's "pick your own soundtrack" fits
better as a real control than a repo file).

## Provenance

`assets/sprite_manifest.json` is the full decoded resource manifest (every
sprite/background this game had, with frame counts and dimensions) kept
for reference/provenance, separate from the trimmed subset `index.html`
actually loads.

See `../backend/README.md` (in this folder) for the leaderboard Worker
setup, matching the other three games' pattern exactly (same anti-cheat
session-token defense, same KV-namespace one-time setup step).
