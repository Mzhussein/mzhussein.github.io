# Swapping in your own theme music

By default the game plays a synthesized version of the theme (built with the
Web Audio API - no file involved). If you'd rather use a real recording you
have the rights to, you can swap it in with a few clicks, right in the
browser - no git required.

## How (browser, no git)

1. Go to the repo: https://github.com/Mzhussein/mzhussein.github.io
2. Click **Add file → Upload files** (top right of the file list).
3. Drag your audio file into the box.
4. Click the file name in the upload preview and rename it to exactly:

   ```
   audio/tetris-theme.mp3
   ```

   (typing the `audio/` prefix creates that folder for you if it doesn't
   exist yet).
5. Scroll down - "Commit directly to the **main** branch" should already be
   selected - and click **Commit changes**.

That's it. Within about a minute the site rebuilds and starts using your
file automatically.

**To replace it later**, repeat the same steps with a new file at the same
path - GitHub will ask to confirm you're replacing the existing one.

**To go back to the synthesized theme**, open
[`audio/tetris-theme.mp3`](https://github.com/Mzhussein/mzhussein.github.io/blob/main/audio/tetris-theme.mp3)
in the repo, click the trash icon, and commit the deletion the same way.

## How (git, if you prefer the command line)

```
mkdir -p audio
cp /path/to/your/file.mp3 audio/tetris-theme.mp3
git add audio/tetris-theme.mp3
git commit -m "Add custom theme music"
git push
```

## Notes

- **Format**: MP3, any bitrate. (For another format like `.ogg` or `.m4a`,
  change the `CUSTOM_MUSIC_URL` constant in `index.html`'s
  `// ---------- optional user-supplied music file ----------` section to
  match the filename you use.)
- **Looping**: the file loops automatically, so trim it to loop cleanly if
  that matters to you - the game doesn't crossfade or trim silence for you.
- **Volume**: fixed at `CUSTOM_MUSIC_VOLUME` in `index.html` (default `0.5`).
  Adjust that constant if it's too loud or quiet next to the sound effects.
- **Rights**: this repo and the deployed site are both public - only add a
  file here that you actually have the right to host and redistribute.
