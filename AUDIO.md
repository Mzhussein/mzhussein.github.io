# Swapping in your own theme music

By default the game plays a synthesized version of the theme (built with the
Web Audio API - no file involved). If you'd rather use a real recording you
have the rights to, you can swap it in without touching any code.

## How

1. Create a folder called `audio` in the root of this repo (next to
   `index.html`), if it doesn't already exist.
2. Put your file in it named exactly:

   ```
   audio/tetris-theme.mp3
   ```

3. Commit and push to `main`:

   ```
   git add audio/tetris-theme.mp3
   git commit -m "Add custom theme music"
   git push
   ```

That's it. The GitHub Actions workflow (`deploy-tetris-game.yml`) picks up
the `audio/` folder automatically and deploys it alongside the game. The
page itself checks for that exact file at load time - if it's there and
plays, it's used (looping) instead of the synthesized theme; if it's
missing, unreadable, or removed later, the game silently falls back to the
synthesized theme with no errors.

## Notes

- **Format**: MP3, any bitrate. (If you want another format like `.ogg` or
  `.m4a`, change the `CUSTOM_MUSIC_URL` constant in `index.html`'s
  `// ---------- optional user-supplied music file ----------` section to
  match the filename you use.)
- **Looping**: the file loops automatically (`<audio loop>`), so it should
  be trimmed to loop cleanly if that matters to you - the game doesn't
  crossfade or trim silence for you.
- **Volume**: the custom file plays at a fixed volume (`CUSTOM_MUSIC_VOLUME`
  in `index.html`, default `0.5`). Adjust that constant if it's too loud or
  quiet relative to the game's sound effects.
- **Removing it**: delete `audio/tetris-theme.mp3` (or the whole `audio/`
  folder) and push - the game goes back to the synthesized theme
  automatically, no other changes needed.
- **Rights**: this repo is public, and the deployed site is public too -
  only add a file here that you actually have the right to host and
  redistribute.
