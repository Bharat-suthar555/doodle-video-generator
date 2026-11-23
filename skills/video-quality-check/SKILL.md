---
name: video-quality-check
description: Use when the user wants a rendered video checked for technical problems before publishing, such as wrong resolution or frame rate, decode errors, black frames, loud or clipped audio, long silences, overlapping or badly timed subtitles, or chapter timestamps that don't match the video.
license: MIT
compatibility: Needs FFmpeg 5 or later with ffprobe. The full report needs Node.js 22.18 or later and the doodle-video-generator toolkit (installed by scripts/toolkit.mjs with the user's approval); without it, use the FFmpeg commands in references/manual-checks.md.
metadata:
  version: "0.1.0"
---

# Video Quality Check

Measure a rendered video against technical requirements and write a machine-readable report. The checks use FFprobe and FFmpeg filters; they measure, they don't watch or listen.

`SKILL_DIR` is the folder that contains this file. Toolkit commands run as `node SKILL_DIR/scripts/toolkit.mjs run -- <command>`; below, `dvg` stands for that prefix.

## When to Use

- Before publishing or delivering any video, including ones from other tools
- After `doodle-animation` or `explainer-video` renders (their `build` command runs these checks automatically)
- When a video plays badly somewhere and the user wants to know why

## Inputs

Required: the video file.

Optional: the expected resolution, frame rate and duration; an `.srt` file; the `.timeline.json` and storyboard from this toolkit; the loudness target (default -16 LUFS).

## Workflow

1. Check tools: `node SKILL_DIR/scripts/toolkit.mjs status`. If the toolkit is missing and the user doesn't want it installed, follow [references/manual-checks.md](references/manual-checks.md) instead.
2. Run the checks:
   - Any video: `dvg inspect video.mp4 --expect-width 1920 --expect-height 1080 --expect-fps 30 --report report.json --frames 8`
   - With subtitles: add `--srt video.srt`
   - A video from this toolkit: `dvg inspect video.mp4 --storyboard storyboard.json --report report.json --frames 8`, which reads expected values, the `.srt` and the `.timeline.json` automatically
3. Read the report. Each check has an `id`, a `status` (`pass`, `warn`, `fail`, `skip`) and a message with the measured value. [references/checks.md](references/checks.md) explains every check and its threshold.
4. Look at the extracted frames (`<video>.frames/` or `--frames-dir`) for readability and layout. Say which frames you looked at.
5. Report: the overall result, every `fail` and `warn` with its measured value, the report path, and what was not checked.

## Outputs

- A JSON report: file metadata, audio statistics, every check, a summary and a `notPerformed` list
- Optional extracted frames and a contact sheet
- Exit code 0 when no check fails, 1 otherwise

## Honesty Rules

- Never say you listened to the audio or reviewed every frame. The report measures loudness, peaks and silence, and you looked only at the extracted frames
- Report failures with their numbers; don't round them away
- A `skip` means the check didn't apply (for example, no audio stream), not that it passed

## Error Handling

- "Video not found" or "ffprobe could not read": check the path; the file may be incomplete or not a video
- Decode errors: the file is damaged or was cut short while writing; render or export it again
- Loudness far from target: normalize the mix (the toolkit does two-pass `loudnorm` during `assemble`)
- Subtitle overlaps: fix the `.srt` timing, or rebuild with this toolkit, which never writes overlapping captions

## Safety

The checks only read the video and write the report and frames you ask for. Nothing is uploaded.

## Example

User: "Is final.mp4 ready for YouTube?"

1. `dvg inspect final.mp4 --expect-width 1920 --expect-height 1080 --expect-fps 30 --srt final.srt --report final.report.json --frames 8`
2. Report: "27 checks passed, 1 warning: true peak is -0.6 dBTP (keep at or below -1). No failures. I looked at the 8 extracted frames; I didn't listen to the audio."
