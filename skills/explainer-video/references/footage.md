# Screen Recordings

Footage scenes play a recording with optional trim, crop, fit, zoom, masks and callouts. The original file is only read, never changed.

## Footage Section

```json
{
  "id": "demo",
  "type": "footage",
  "narration": { "text": "…" },
  "footage": {
    "source": "recordings/add-lead.mp4",
    "provenance": "user-recording",
    "trim": { "start": 2.0, "end": 18.5 },
    "crop": { "x": 0, "y": 80, "width": 1920, "height": 1000 },
    "fit": "contain",
    "zoom": [{ "at": 3, "duration": 0.8, "zoom": 1.6, "center": [700, 420] }, { "at": 9, "duration": 0.7, "zoom": 1 }],
    "masks": [{ "x": 1100, "y": 330, "width": 460, "height": 170, "style": "blur", "start": 0, "end": 6 }],
    "callouts": [{ "type": "text", "text": "Saved", "x": 1000, "y": 760, "animation": { "type": "fade", "start": 7 } }],
    "audio": { "keep": false, "volume": -12 },
    "freezeLastFrame": true
  }
}
```

- **`provenance`**: `user-recording`, `browser-recording` or `mock`. Mock footage needs a `label`, drawn on every frame
- **`trim`**: seconds in the source; scene time 0 is `trim.start`
- **`crop`**: source pixels, applied first
- **`fit`**: `contain` pads to the frame with `padColor`; `cover` fills and crops
- **`zoom`**: keyframes in scene seconds; `center` is in board units (1920x1080 for 16:9). Zoom eases between levels; hold each level for 2 seconds or more
- **`masks`**: rectangles in source pixels with `blur`, `pixelate` or `solid`, optionally limited to `start`..`end` scene seconds. Masks apply before crop and zoom, so they stay on the private content
- **`callouts`**: any whiteboard elements, drawn over the video in board units without the hand
- **`audio.keep`**: mixes the recording's own sound at `volume` dB
- **`freezeLastFrame`**: when narration outlasts the clip, holds the last frame

## Frame Rate and Formats

Recordings are normalized to the storyboard's frame rate and scaled with Lanczos. Variable-frame-rate screen recordings work; FFmpeg resamples them to constant frames.

## Finding Coordinates

Grab a frame with `ffmpeg -ss 5 -i recording.mp4 -frames:v 1 frame.png` and read pixel positions from it. For masks use source pixels; for callouts and zoom centers use board units (equal to pixels when the recording is 1920x1080 and `fit` is `contain`).

## Splitting a Recording

Use several footage scenes with the same `source` and different `trim` ranges, with whiteboard scenes or transitions between them.
