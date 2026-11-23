# How the Renderer Works

This page explains how a storyboard becomes an MP4, for contributors changing the toolkit. Each stage is a plain function, so it can be tested on its own.

## Pipeline

1. **Load** (`storyboard/load.ts`): parse JSON and validate it with the Zod schema in `storyboard/schema.ts`. Unknown fields are errors, and file fields reject URLs
2. **Plan** (`timeline/plan.ts`): measure narration audio with ffprobe (or estimate it from text), compile each whiteboard scene, compute scene lengths in whole frames, subtract transition overlaps and derive chapter times. Each scene gets a hash of everything that affects its pixels
3. **Compile** (`animation/compile.ts`, `animation/build.ts`): turn elements into ink items (strokes, glyphs, fills, images) in board units, then assign each item a start and end time
4. **Render scenes** (`renderer/render.ts`): worker threads render scenes in parallel. Whiteboard scenes build an SVG per frame (`animation/frame.ts`), rasterize it with resvg and pipe RGBA frames to FFmpeg. Footage scenes run one FFmpeg filter graph (`footage/render.ts`) and receive callouts as a second RGBA stream. Clips are cached by hash under `.dvg-work/`
5. **Assemble** (`timeline/assemble.ts`): join clips with `xfade` (or `concat` for cuts) at frame-exact offsets, burn subtitles with libass, mix the soundtrack (`audio/mix.ts`), embed chapters and write the MP4 plus sidecar files
6. **Inspect** (`validation/inspect.ts`): FFprobe metadata plus one FFmpeg pass with `blackdetect`, `astats`, `silencedetect` and `ebur128`, then subtitle, chapter and timeline checks

## Handwriting

Glyph outlines come from the bundled fonts through opentype.js and are flattened to polylines. While a glyph is being written, its filled outline is shown through a mask: a wide brush stroke that traces the outline with a growing dash. Because the brush is wider than twice the stroke weight of the letters, tracing the outline fills the letter. Finished glyphs are drawn as plain fills.

## The Hand

The marker tip follows the active stroke's point at the current progress. Between strokes it travels for gaps up to 0.8s; for longer gaps it swoops off screen and back, taking 0.3 to 0.6s depending on distance. Its position is a centered 50 ms moving average, so it is smooth without lagging behind the line. It is drawn in screen space, so camera zoom doesn't resize it.

## Timing Without Drift

Every scene length is a whole number of frames. Scene start frames are integers computed once in the plan, and the assembly, narration placement, subtitles and chapters all read the same plan. Audio is mixed into one WAV of exactly the video length.

## Caching

A scene's cache key covers the scene definition, style, format, narration timing, referenced file sizes and times, and a fingerprint of the toolkit's own files. Change any of these and only that scene renders again.
