---
name: doodle-animation
description: Use when the user wants a whiteboard or doodle-style animation, such as hand-drawn text being written, a drawing hand, sketched diagrams, flowcharts, arrows or simple charts, rendered to video from a script or scene description.
license: MIT
compatibility: Needs Node.js 22.18 or later, FFmpeg 5 or later with ffprobe, and the doodle-video-generator toolkit (installed by scripts/toolkit.mjs with the user's approval).
metadata:
  version: "0.1.0"
---

# Doodle Animation

Render whiteboard animations: text that writes itself, a hand holding a marker that follows every stroke, sketched shapes, icons, flowcharts, connectors, charts, highlights and gentle camera moves. Scenes are plain JSON, so nothing in them is ever executed.

`SKILL_DIR` is the folder that contains this file. Run the toolkit through `node SKILL_DIR/scripts/toolkit.mjs run -- <command>`; in the steps below, `dvg` stands for that whole prefix.

## When to Use

- The user asks for a whiteboard, doodle, sketch or "drawn" animation
- A topic needs a diagram explained step by step: a process, a flow, a comparison or a simple chart
- An explainer video needs whiteboard scenes (the `explainer-video` skill calls this workflow)

Use `video-storyboard` first when the user has only a topic and no scene plan, and `explainer-video` when the result must also include screen recordings, narration or music.

## Inputs

Required: what each scene should show, as a script, an outline or a list of points.

Optional: aspect ratio (16:9, 9:16 or 1:1), resolution (1920x1080, 1080x1920 or 1280x720), narration text or audio per scene, style (colors, marker width, drawing speed), whether to show the hand, and the output path.

## Workflow

1. Check the toolkit: `node SKILL_DIR/scripts/toolkit.mjs status`. If it is missing, show the user the install options it prints and run `install` only after they agree, because it downloads packages.
2. Start a project: `dvg init my-video --template whiteboard-explainer` (or `vertical-short` for 9:16). Edit its `storyboard.json` instead of writing one from scratch.
3. Write one scene per idea. Keep 3 to 6 elements per scene and leave the bottom 18% clear when subtitles are on. See [references/elements.md](references/elements.md) for every element type and [references/layout.md](references/layout.md) for positions, safe areas and sizing.
4. Time the drawing: elements draw one after another by default. Use `animation.cue` to start an element when a phrase is spoken, and [references/animation.md](references/animation.md) for entrances, exits, camera and transitions.
5. Validate: `dvg validate storyboard.json`. Fix every error; read every warning (overlaps, clipped content, text under captions).
6. Check layout without rendering everything: `dvg render storyboard.json --still 6 --scene intro --out intro.png`, then look at the PNG.
7. Render and check: `dvg build storyboard.json`. It renders changed scenes only, assembles the MP4 and runs quality checks.
8. Report the output paths, the duration and any warnings. Say plainly when narration timing is estimated.

## Outputs

`build` writes, next to the storyboard's `export.output` path: the MP4, an `.srt` when subtitles are on, `.timeline.json`, `.youtube.md`, `.youtube.json`, `.report.json` and a `.frames/` folder with stills and a contact sheet. Intermediate clips live in `.dvg-work/` next to the storyboard.

## Error Handling

- `validate` prints each problem with a JSON path, such as `scenes[1].elements[2].fontSize`. Fix the field it names.
- "unknown icon": run `dvg icons` for the list, or draw the shape with `svg` from a local SVG file.
- "narration ends after the scene": use `"duration": "auto"` or a longer duration. The toolkit never speeds up narration.
- A failed scene doesn't discard the others: fix it and run `dvg render` again; finished scenes are cached.
- FFmpeg missing: install FFmpeg 5 or later, or set `DVG_FFMPEG` and `DVG_FFPROBE`.

## Safety

- Storyboards reference local files only; URLs are rejected. SVG files are read for outlines only, and their scripts, styles and links are ignored.
- Use only images, SVGs, fonts and logos the user owns or may use. The bundled fonts are OFL-licensed and the icons and hand artwork are original.
- Don't overwrite the user's files: outputs go to the storyboard's `output/` folder, and `assemble` refuses to replace an input or a file it didn't write.

## Example

User: "Make a 20-second vertical doodle that explains the two-minute rule."

1. `dvg init two-minute --template vertical-short`
2. Edit the three scenes: hook text with icons, a column flowchart with a diamond decision, a payoff line.
3. `dvg validate two-minute/storyboard.json`, then `dvg build two-minute/storyboard.json`.
4. Report `two-minute/output/two-minute-rule-short.mp4`, its 1080x1920 size, 20.7s length and the report path.
