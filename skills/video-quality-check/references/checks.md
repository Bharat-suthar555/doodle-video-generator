# Check Reference

Every check in the report, what it measures and when it passes. Thresholds match common delivery specs for YouTube and social platforms.

## File and Video

- **`container`**: MP4 family. Warns otherwise
- **`video.stream`**: a video stream exists. Fails otherwise
- **`video.codec`**: H.264 (or the codec you expect). Fails otherwise
- **`video.pixel-format`**: `yuv420p`, which every player supports. Warns otherwise
- **`video.resolution`**: matches the expected width and height. Fails otherwise
- **`video.frame-rate`**: average frame rate within 0.01 fps of the expected rate. Fails otherwise
- **`video.even-dimensions`**: width and height are even. Fails otherwise
- **`duration`**: within 0.1s of the expected duration passes, within 0.5s warns, beyond fails
- **`decode`**: a full decode reports no errors. Fails on any decoder error
- **`video.black-frames`**: `blackdetect` (0.5s minimum, pixel threshold 0.10). Warns on any black interval

## Audio

- **`audio.codec`**: AAC (or the codec you expect). Warns otherwise. Without an audio stream the check is `skip`, or `fail` with `--require-audio`
- **`audio.loudness`**: EBU R128 integrated loudness within 1.5 LU of the target passes, within 4 LU warns
- **`audio.clipping`**: sample peak at or above -0.1 dBFS fails
- **`audio.true-peak`**: above -1 dBTP warns
- **`audio.silence`**: `silencedetect` at -50 dB; any silent stretch of 4s or longer warns. All silences are listed in the details

## Subtitles

- **`subtitles.parse`**, **`subtitles.empty`**, **`subtitles.order`**, **`subtitles.timing`**: well-formed, non-empty, in order, positive durations. Fail otherwise
- **`subtitles.overlap`**: a caption starting before the previous one ends fails
- **`subtitles.min-duration`**: under 1.5s warns (allowed when the speech itself is that short)
- **`subtitles.lines`**: more than the line limit (2) fails
- **`subtitles.line-length`**: lines over the character limit (42) warn
- **`subtitles.reading-speed`**: more than 20 characters per second warns
- **`subtitles.duplicates`**: consecutive identical captions warn
- **`subtitles.bounds`**: a caption ending after the video fails

## Timeline and Chapters (Toolkit Videos)

- **`timeline.continuity`**: each scene starts exactly where the previous ends, minus its transition. Fails on a gap or overlap
- **`timeline.total`**, **`timeline.duration-match`**: the video length matches the planned frame count (within 1.5 frames passes)
- **`chapters.scene-boundaries`**: every chapter is at a scene start
- **`chapters.youtube-rules`**: first chapter at 0:00, at least three, each 10s or longer. Warns otherwise
- **`chapters.embedded`**: the MP4 carries the same number of chapters as the timeline

## Not Performed

The report always lists what it cannot judge: voice quality, pronunciation, music fit, visual layout and pacing. Those need a person to listen and watch.
