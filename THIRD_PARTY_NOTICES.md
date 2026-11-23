# Third-Party Notices

This repository's own code, icons and drawing-hand artwork are original work under the MIT license in [LICENSE](LICENSE). This page lists everything else the project ships or uses.

## Bundled Files

| File | Author | License |
| --- | --- | --- |
| `assets/fonts/PatrickHand-Regular.ttf` | Patrick Wagesreiter | SIL Open Font License 1.1, full text in `assets/fonts/PatrickHand-OFL.txt` |
| `assets/fonts/Lato-Regular.ttf`, `assets/fonts/Lato-Bold.ttf` | Łukasz Dziedzic (tyPoland) | SIL Open Font License 1.1, full text in `assets/fonts/Lato-OFL.txt` |

The fonts are redistributed unmodified. The OFL allows bundling them with software; they may not be sold on their own.

## npm Dependencies (Installed, Not Bundled)

| Package | License | Use |
| --- | --- | --- |
| `@resvg/resvg-js` (and its platform binaries) | MPL-2.0 | SVG rasterization |
| `opentype.js` | MIT | Reading font outlines for handwriting |
| `zod` | MIT | Storyboard validation and JSON Schema |
| `playwright-core` (optional peer) | Apache-2.0 | Browser recording, only when installed |

Development only: `typescript` (Apache-2.0), `vitest` (MIT), `@types/node` (MIT).

## External Tools (Not Bundled)

- **FFmpeg and ffprobe**: LGPL-2.1 or GPL-2.0 or later depending on the build; installed by the user
- **demo-narrator** (optional, MIT, github.com/GarvitSolanki/audio-generator): its own dependencies include Kokoro-82M (Apache-2.0) and Piper (GPL-3.0). This project calls it as a separate program and bundles none of it, nor any voice model

## Acknowledgements

The repository layout and the idea of a validation script for skills follow the conventions of the Agent Skills format and of the public `ejekanshjain/skills` repository (MIT). No code was copied from it.

## Media

No music, narration, voice models or third-party images are included. The example footage is recorded locally from the fictional mock app in `examples/software-demo/mock-app/` and is not committed.
