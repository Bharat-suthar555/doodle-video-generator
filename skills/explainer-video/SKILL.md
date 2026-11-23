---
name: explainer-video
description: Use when the user wants a complete explainer, tutorial or product video that combines whiteboard animation with their screen recordings, narration, subtitles and music, exported as a YouTube-ready MP4 with chapters and metadata.
license: MIT
compatibility: Needs Node.js 22.18 or later, FFmpeg 5 or later with ffprobe and libass (for burned-in subtitles), and the doodle-video-generator toolkit (installed by scripts/toolkit.mjs with the user's approval). Optional, for synthesized narration, the demo-narrator skill; optional, for browser recording, playwright-core and a Chromium-based browser.
metadata:
  version: "0.1.0"
---

# Explainer Video

Produce a finished explainer video: whiteboard scenes that set up the problem and solution, the user's screen recordings with zooms, callouts and masks, narration, subtitles, optional music, transitions, a quality report and YouTube metadata. Everything renders locally.

`SKILL_DIR` is the folder that contains this file. Toolkit commands run as `node SKILL_DIR/scripts/toolkit.mjs run -- <command>`; below, `dvg` stands for that prefix.

## When to Use

- "Make an explainer video about …" with whiteboard parts, recordings or both
- A product walkthrough that needs narration, subtitles and chapters
- A YouTube-ready version of an existing script and set of recordings

For a whiteboard-only clip, the `doodle-animation` skill is enough. For planning only, use `video-storyboard`. To check an existing video, use `video-quality-check`.

## Inputs

Required: the topic and goal, and the facts the video may state.

Optional: screen recordings (MP4, or MOV that FFmpeg decodes), narration audio or a voice choice, music the user has rights to, target length, aspect ratio, brand colors, and the output folder.

## Workflow

1. **Check tools**: `node SKILL_DIR/scripts/toolkit.mjs status`. Ask before running `install`; it downloads packages.
2. **Take stock of assets**: list the recordings (`ffprobe` them for length and size), audio, music and documents the user gave you. Note what is missing.
3. **Agree on the plan**: goal, audience, length, format, voice mode (user audio, synthesized, or silent) and music. Recommend defaults.
4. **Script and storyboard**: follow the `video-storyboard` workflow. Start from `dvg init <dir> --template software-demo`. Keep facts to what the user confirmed, and mark provenance.
5. **Whiteboard scenes**: follow the `doodle-animation` workflow; preview with `dvg render <storyboard> --still <s> --scene <id>`.
6. **Footage scenes**: add each recording as a `footage` scene with `trim`, `zoom`, `callouts` and `masks` for anything private. See [references/footage.md](references/footage.md). Without recordings, either record a local app the user owns ([references/browser-recording.md](references/browser-recording.md)), use clearly labeled mock footage, or stay whiteboard-only. Never fabricate footage of a real product.
7. **Narration**: put the user's audio files in `narration.audio`, or generate it with demo-narrator after the user approves the exact text ([references/narration.md](references/narration.md)). Scene lengths follow the measured audio; narration is never sped up.
8. **Subtitles and music**: on by default; see [references/audio-and-subtitles.md](references/audio-and-subtitles.md). Use only music the user supplies or has a license for, and record the license in `audio.music.license`.
9. **Validate**: `dvg validate storyboard.json` until there are no errors.
10. **Build**: `dvg build storyboard.json`. It renders changed scenes, assembles the timeline, mixes audio, burns subtitles, embeds chapters, writes YouTube metadata and runs the quality checks.
11. **Review**: open the extracted frames in `<output>.frames/`, read `<output>.report.json`, and fix failures. A video is done only when the MP4 exists and the report shows no failed checks.
12. **Report**: list every output path, the duration, warnings, which timing is estimated, and what still needs a human: listening to the audio and watching the full video.

## Outputs

Next to `export.output`: the MP4 (H.264, AAC, `yuv420p`, `+faststart`), `.srt`, `.timeline.json`, `.youtube.md` and `.youtube.json` (title, description with chapters, tags, thumbnail concept), `.report.json` and `.frames/`. See [references/youtube.md](references/youtube.md).

## Error Handling

- **Scene failed to render**: other scenes stay cached; fix the cause and run `dvg render` again, or `dvg render <storyboard> --scene <id> --force`
- **Narration longer than its scene**: use `"duration": "auto"` or shorten the text, then get the text approved again
- **No libass**: run `dvg assemble <storyboard> --subtitles srt` for a sidecar subtitle file instead
- **Footage won't decode**: convert it with `ffmpeg -i in.mov -c:v libx264 -crf 16 out.mp4` into a new file; never overwrite the original
- **Quality check fails**: read the failed check's message in the report; it names the measurement and the expected value

## Safety

- Only record and show software the user owns or may demonstrate. The recorder opens local addresses only unless the user passes `--allow-host`
- Mask emails, names and keys with `footage.masks`; use sample data in recordings
- Don't log or display credentials; the recorder's `typeSecret` step reads a value from an environment variable and never prints it
- Don't upload, publish or post the video anywhere. The toolkit writes local files only
- Never claim the video is finished, synchronized or checked beyond what the report shows. It doesn't listen to the audio or watch every frame

## Example

User: "Create a professional 5-minute explainer video about CRM lead management. Start with a whiteboard explanation, show the business problem and solution, include my software screen recordings, add narration and subtitles, and export a YouTube-ready MP4."

1. Inventory the recordings; ask for product facts and the voice choice.
2. Draft about 700 words in 9 scenes: hook, problem, cost, solution flow, 3 footage scenes, recap, call to action. Get approval.
3. `dvg init crm-video --template software-demo`, then write the storyboard with footage scenes pointing at the recordings, with zooms, callouts and masks.
4. Generate or attach narration; `dvg validate`; `dvg build`.
5. Review frames and the report, then deliver the MP4, SRT, YouTube metadata and report paths, noting that a person should still watch and listen to the full video.
