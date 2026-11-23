# Storyboard Format

A storyboard is one JSON object. The toolkit validates it with a strict schema (unknown fields are errors) and publishes the schema as `schema/storyboard.schema.json` in the toolkit package; run `doodle-video-generator schema` for its path.

## Top Level

- **`project`**: `title` (required), `purpose`, `audience`, `language`
- **`format`**: `aspect` (`16:9`, `9:16`, `1:1`), optional `width` and `height` (for example 1280x720), `fps` (default 30)
- **`style`**: colors, font, marker width, roughness, seed, hand, pacing (see the `doodle-animation` skill)
- **`narration`**: `wordsPerMinute`, `leadIn`, `tail`
- **`subtitles`**: `enabled`, `burnIn`, `position` (`bottom` or `top`), `maxLines` (2), `maxCharsPerLine` (42 for 16:9, 28 for 9:16), `minDuration` (1.5s), `fontSize`, colors
- **`audio`**: `narrationVolume`, `music` (`file`, `license`, `volume`, `fadeIn`, `fadeOut`, `duck`, `loop`), `normalize` (`targetLufs` -16, `truePeak` -1.5)
- **`export`**: `output` path, `crf`, `preset`, `audioBitrate`, `fadeIn`, `fadeOut`, `fadeColor`
- **`youtube`**: `title`, `description`, `tags`, `thumbnailConcept`
- **`sources`**: material the narration is based on
- **`scenes`**: one or more scenes, in order

## Scene

- **`id`**: unique; letters, digits, `-`, `_`
- **`type`**: `whiteboard` (default) or `footage`
- **`chapter`**: YouTube chapter title starting at this scene
- **`duration`**: seconds, or `"auto"` (default)
- **`narration`**: `text`, optional `audio` (WAV or MP3), `offset`, `words` (word timestamps JSON), `provenance`, `sourceIds`
- **`elements`**: whiteboard drawing (see the `doodle-animation` skill)
- **`camera`**: zoom and pan keyframes
- **`transition`**: how this scene enters from the previous one
- **`footage`**: for footage scenes (see the `explainer-video` skill)
- **`notes`**: visual direction for whoever builds the scene
- **`shot`**: `description`, `url`, `steps`: what to record

## Word Timestamps

`narration.words` points to a JSON array such as `[{ "word": "Next", "start": 0.0, "end": 0.32 }, …]`, with times relative to the narration audio. Speech-to-text tools can produce it. With it, cues and subtitles are exact; without it, they are estimated and reported as estimated.
