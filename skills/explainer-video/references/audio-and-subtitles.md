# Audio Mixing and Subtitles

The soundtrack is mixed into one WAV that matches the video length to the sample, and subtitles are segmented from the narration text. Both follow the planned timeline, so nothing drifts.

## Mix

- Narration clips start at their scene's narration time, at `audio.narrationVolume` dB
- Footage audio, when `footage.audio.keep` is true, starts with its scene
- Music (`audio.music`) loops to the video length, fades in and out, and ducks under the narration with a sidechain compressor when `duck` is true
- Loudness normalization (two-pass EBU R128 `loudnorm`) targets `audio.normalize.targetLufs` (-16 LUFS) with a true-peak ceiling of `truePeak` (-1.5 dBTP). Near-silent mixes are left alone
- A video with no narration, footage audio or music gets no audio track

Music must be supplied by the user or licensed for this use; `audio.music.license` is required. The toolkit never downloads music.

## Subtitles

- Sentences split into captions of at most `maxLines` (2) lines of `maxCharsPerLine` characters (42 for 16:9, 28 for 9:16)
- Line breaks balance line lengths and avoid ending a line on words like "the" or "to"
- With word timestamps, captions start and end on the spoken words. Without them, timing is proportional to text length and marked estimated
- A caption is extended toward `minDuration` (1.5s) only into silence before the next caption, never past the end of its narration
- `subtitles.burnIn` draws captions into the video with libass, in a boxed Lato Bold style; an `.srt` sidecar is always written
- `subtitles.position` is `bottom` or `top`; keep important drawings out of that area

## Commands

- `dvg assemble storyboard.json --subtitles srt` writes the sidecar only
- `dvg assemble storyboard.json --subtitles none` skips subtitles
