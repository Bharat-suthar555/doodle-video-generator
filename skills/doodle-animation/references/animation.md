# Animation, Camera and Transitions

Elements draw one after another, so a scene reads like someone sketching it live. This page covers how to change that order and pace, move the camera and join scenes.

## Entrances

Set `animation.type` on an element:

- **`draw`**: strokes appear in order at `style.drawSpeed` board units per second (default for shapes, icons, arrows and nodes)
- **`handwrite`**: glyphs are written at `style.writeSpeed` characters per second (default for text)
- **`reveal`**: a left-to-right wipe
- **`fade`**, **`slide`** (from an offset given in `from`, default `[0, 60]`), **`move`** (from `from`, default `[-200, 0]`), **`scale`** (grows from the center with a small overshoot)
- **`none`**: appears instantly at `start`

The drawing hand follows `draw` and `handwrite` only.

## Timing

- **`start`**: seconds from the scene start. Without it, an element starts after the previous one ends, plus `style.gap` (0.25s)
- **`delay`**: extra wait after the previous element
- **`duration`**: overrides the natural drawing time
- **`cue`**: starts the element when a phrase is spoken. With word timestamps (`narration.words`) the cue is exact; otherwise it is estimated from the phrase's position in the text, and the toolkit reports the timing as estimated
- **`easing`**: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInOutCubic` or `easeOutBack`

Scene `duration` is `"auto"` by default: long enough for every animation plus `style.hold`, and for the narration plus `narration.tail`. It also grows by the next scene's transition so the overlap never hides content.

## Exits

```json
"exit": { "type": "erase", "start": 6.5, "duration": 0.6 }
```

`erase` wipes the element away left to right; `fade` fades it out.

## Camera

```json
"camera": [
  { "cue": "builds the page", "focus": "server", "zoom": 1.25, "duration": 1 },
  { "at": 8, "zoom": 1, "center": [960, 540], "duration": 1 }
]
```

Each keyframe moves the camera from its previous position over `duration` seconds. `focus` centers an element; leave out `zoom` with `focus` to fit the element automatically. When zoomed in, the view never leaves the board. Keep zooms between 1.2 and 1.6 and hold each for at least 2 seconds so viewers can read.

## Transitions Between Scenes

Set `transition` on the scene it leads into:

```json
"transition": { "type": "fade-white", "duration": 0.5 }
```

Types: `cut`, `fade`, `crossfade`, `dissolve`, `fade-black`, `fade-white`, `wipe-left`, `wipe-right`, `slide-left`, `slide-up`, `zoom-in`, `whiteboard-to-screen` (a zoom into the next scene) and `screen-to-whiteboard` (through white). Transitions overlap the end of the previous scene; timestamps and chapters account for it.

## The Drawing Hand

`style.hand.enabled` turns the hand on or off for the whole video, and `style.hand.scale` resizes it (default 1). The hand moves between strokes, leaves the frame during pauses longer than 0.8s and comes back for the next stroke. Its path is smoothed over 50 ms without lagging behind the line.
