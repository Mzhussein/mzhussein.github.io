# Setting the shared background music

No default track ships in this repo (the original used a commercial
Bob Marley recording that can't be redistributed - see `README.md`). By
default the game plays silently unless someone loads a personal track
via the in-game &#9881; settings panel, and that's local to their own
browser only - nobody else hears it.

To set a track that **everyone** who plays hears automatically, by
default, with no action needed on their end, check a file into the repo
at this exact path - same git-commit mechanic as the root site's
`../AUDIO.md` (Tetris theme), just a different target file.

## How (browser, no git)

1. Go to the repo: https://github.com/Mzhussein/mzhussein.github.io
2. Navigate into the `dodge-the-su/assets/v2/audio/` folder.
3. Click **Add file → Upload files**.
4. Drag your audio file into the box.
5. Click the file name in the upload preview and rename it to exactly:

   ```
   bg-music.mp3
   ```

6. Scroll down - "Commit directly to the **main** branch" should already
   be selected - and click **Commit changes**.

Within about a minute CI redeploys the site and everyone visiting from
then on hears it automatically, looped, at a moderate default volume -
no per-visitor upload needed. Anyone who's already loaded their own
personal track via the settings panel keeps hearing their own choice
instead (a personal upload always overrides the shared default, on that
one browser only) - that's what "Remove my upload" in the settings panel
is for, to switch back to hearing the shared one.

**To replace it later**, repeat the same steps with a new file at the
same path - GitHub will ask to confirm you're replacing the existing
one.

**To go back to no shared music**, open
[`dodge-the-su/assets/v2/audio/bg-music.mp3`](https://github.com/Mzhussein/mzhussein.github.io/blob/main/dodge-the-su/assets/v2/audio/bg-music.mp3)
in the repo, click the trash icon, and commit the deletion the same way.
There's no procedural fallback theme for this game the way Tetris has -
removing the file just means silence again by default (personal
per-browser uploads via settings are unaffected either way).

## How (git, if you prefer the command line)

```
cp /path/to/your/file.mp3 dodge-the-su/assets/v2/audio/bg-music.mp3
git add dodge-the-su/assets/v2/audio/bg-music.mp3
git commit -m "Add shared theme music for Dodge The Su"
git push
```

(Remember: this repo's own designated-branch workflow means pushing
straight to `main` isn't how a Claude Code session does this part - see
the rest of this repo's history - but it's exactly how *you* do it by
hand or via the GitHub web UI above.)

## Notes

- **Format**: MP3. For `.ogg` or `.m4a` instead, use that extension for
  the uploaded file AND change the `DEFAULT_MUSIC_URL` constant in
  `index.html`'s `// ---------- background music: shared default +
  personal override ----------` section to match.
- **Looping**: loops automatically with no crossfade - trim it to loop
  cleanly if that matters to you.
- **Volume**: shared-default listeners get `customMusicVolume`'s default
  (0.5) unless they open settings and move the slider themselves -
  adjust that constant in `index.html` if 0.5 is off for your track.
- **Rights**: this repo is public on GitHub even though the deployed
  site sits behind a passphrase - only add a file here that you actually
  have the right to host and redistribute, same rule as the root site's
  Tetris theme.
