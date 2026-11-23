# Narration

Narration can come from the user's recordings, from a local text-to-speech engine, or be absent (a silent video with captions). Scene lengths follow the measured narration, and the toolkit never speeds narration up.

## Mode A: The User's Audio

Put one file per scene in `narration.audio` (WAV, MP3 or M4A). Keep `narration.text` as the exact words so subtitles match. For exact subtitle and cue timing, add word timestamps in `narration.words` (a JSON array of `{ word, start, end }`, seconds relative to the audio).

## Mode B: demo-narrator (Optional)

The free demo-narrator skill (Kokoro or Piper text-to-speech, local) can voice the narration:

1. The user installs it, for example `npx skills add GarvitSolanki/audio-generator --skill demo-narrator`, and runs its `setup.sh` once.
2. Run `dvg narrate storyboard.json`. The first run writes demo-narrator's `script.json` under `narration/` and exits with code 2.
3. Show the user every line of narration. Only after they approve the exact text, run the `--approve` command that `narrate` printed. Never approve on the user's behalf.
4. Run `dvg narrate storyboard.json` again. It generates one WAV per scene with `--max-speed 1.0` (no speed-up) and writes `storyboard.narrated.json` next to the original, with `narration.audio` filled in.
5. Validate and build the narrated storyboard. Any text change invalidates the approval.

Options: `--voice af_heart` (Kokoro voices such as `am_michael`, `bf_emma`), `--engine piper`, `--narrator <dir>` when the skill is installed elsewhere.

## Mode C: Silent

Leave out `narration.audio`. Subtitles show the narration text with estimated timing (from `narration.wordsPerMinute`), and the timeline marks it as estimated. Tell the user the video is silent and the caption timing is an estimate.

## Timing Rules

- Each scene's narration starts at `narration.offset` (default `narration.leadIn`, 0.4s)
- `"duration": "auto"` makes the scene long enough for the narration plus `narration.tail`
- A fixed duration shorter than the narration is a validation error
- Use `animation.cue` and camera `cue` to sync visuals with phrases
