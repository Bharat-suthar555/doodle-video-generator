# YouTube Outputs

The toolkit writes YouTube metadata from the storyboard and the rendered timeline. It never uploads anything.

## Files

- **`<output>.youtube.md`**: title, description, tags, chapters and thumbnail concept, ready to paste
- **`<output>.youtube.json`**: the same as JSON
- **`<output>.srt`**: upload as the subtitle track
- **`<output>.timeline.json`**: scene start times, frame counts, transitions and narration timing

## Chapters

Scenes with a `chapter` title become chapters at the scene's start in the final timeline (after transition overlaps). Chapters are also embedded in the MP4. YouTube shows chapters only when the first is at 0:00, there are at least three, and each lasts at least 10 seconds; the toolkit warns when a rule fails instead of moving timestamps.

`dvg chapters storyboard.json` prints chapters before rendering. With measured narration audio they match the render; with estimated timing they can shift once audio exists.

## Title, Description and Tags

They come from the storyboard's `youtube` section, which you write with the user. Keep titles under 70 characters where possible (100 is the limit), and only describe what the video shows.

## Export Settings

1920x1080 or 1280x720 at 30 fps for landscape, 1080x1920 for Shorts. H.264 High profile, `yuv420p`, CRF 18 by default (`export.crf`), AAC at 192 kb/s, and `+faststart` for streaming.
