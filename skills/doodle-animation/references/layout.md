# Layout, Sizing and Style

A whiteboard scene is readable when it has few elements, large text and space around everything. This page lists the numbers the toolkit uses and checks.

## Board Size and Safe Areas

- The board is 1920x1080 (16:9), 1080x1920 (9:16) or 1080x1080 (1:1). Output at 1280x720 scales the same board down
- `at` positions use a safe area with 6% side margins and 8% top and bottom margins
- `validate` reports anything past the frame edge as an error and anything outside a 4% margin as a warning
- With burned-in subtitles at the bottom, keep text out of the bottom 18% (24% for 9:16). `validate` warns when narrated scenes put text there

## Readable Sizes on a 1080-Pixel Board

- Titles: 70 to 90 units. Body text: 48 to 64. Labels: 30 to 40
- Icons: 150 to 260 alone, 60 to 90 inside nodes
- Three to six elements per scene; split a busy scene into two

## Overlap Checks

`validate` warns when text overlaps another element, or when two shapes overlap by more than 25%, while both are visible. A label inside a box, or anything fully inside another element, counts as intentional and is not reported.

## Style Settings

Under the storyboard's `style`:

- **`background`**, **`ink`**, **`accent`**, **`palette`**: hex colors
- **`font`**: default font for text and node labels
- **`strokeWidth`**: marker width (default 5)
- **`roughness`**: 0 for clean lines, 1 for a hand-drawn wobble, up to 4
- **`seed`**: changes the wobble pattern; the same seed always renders the same frames
- **`drawSpeed`**, **`writeSpeed`**, **`gap`**, **`startDelay`**, **`hold`**: pacing

## Preview Before Rendering

`doodle-video-generator render storyboard.json --still <seconds> --scene <id> --out frame.png` writes one frame in about a second. Look at the last moment of each scene to check the finished layout.
