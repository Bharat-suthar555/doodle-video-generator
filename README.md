# Doodle Video Generator

<p>
  <a href="https://skills.sh/Bharat-suthar555/doodle-video-generator"><img alt="skills.sh" src="https://skills.sh/b/Bharat-suthar555/doodle-video-generator?style=for-the-badge" height="28"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0a0a0a.svg?style=for-the-badge" height="28"></a>
</p>

Agent skills and a local rendering toolkit for whiteboard doodle animations and complete explainer videos. Describe a video to your coding agent; it plans the storyboard, renders hand-drawn scenes with a drawing hand, adds your screen recordings, narration, subtitles and music, checks the result with FFmpeg and writes YouTube chapters and metadata. Everything renders on your machine with Node.js, resvg and FFmpeg: no paid API is involved.

The skills follow the [Agent Skills](https://agentskills.io) format, so they work in Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode and other agents that read `SKILL.md` files.

## Skills

| Skill | Use it when |
| --- | --- |
| [doodle-animation](skills/doodle-animation) | You want a whiteboard animation: handwritten text, a drawing hand, sketched diagrams, flowcharts, arrows or simple charts. |
| [video-storyboard](skills/video-storyboard) | You want to plan a video: script, scenes, narration, visuals, timings and a shot list, with facts kept apart from generated text. |
| [explainer-video](skills/explainer-video) | You want a finished explainer that combines whiteboard scenes with your screen recordings, narration, subtitles and music. |
| [video-quality-check](skills/video-quality-check) | You want a rendered video checked for technical problems before you publish it. |

## What It Does

- **Whiteboard drawing**: text written glyph by glyph along its outline, a hand holding a marker that follows every stroke, hand-drawn lines, arrows, rectangles, circles, 61 original icons, SVG outlines, images, flowchart nodes and connectors, auto-laid-out flowcharts, bar, line and pie charts, highlights and grouped layouts
- **Animation**: draw, handwrite, reveal, fade, slide, move and scale entrances; erase and fade exits; easing; cues that start an element when a phrase is spoken; camera pans and zooms that can focus an element
- **Scenes and transitions**: frame-exact timeline, fades through white or black, crossfades, wipes, slides, whiteboard-to-screen zooms; per-scene caching so a changed or failed scene renders again on its own
- **Screen recordings**: trim, crop, contain or cover fitting, eased zooms, blur, pixelate or solid masks for private data, callouts drawn over the video, frame-rate normalization, freeze frames, and a visible label for mock footage
- **Narration**: your audio files, the optional local [demo-narrator](https://github.com/GarvitSolanki/audio-generator) text-to-speech skill (with its approval step), or silent; scenes stretch to fit narration, which is never sped up
- **Subtitles**: two-line captions with balanced line breaks, exact timing from word timestamps or clearly marked estimates, burned in with libass and written as `.srt`
- **Audio**: narration placement, licensed music with fades, looping and ducking, and two-pass EBU R128 loudness normalization
- **Output**: H.264 and AAC MP4 at 1920x1080, 1280x720 or 1080x1920, embedded chapters, a timeline file, YouTube title, description, tags, chapters and thumbnail concept
- **Quality checks**: codec, resolution, frame rate, duration, decode errors, black frames, loudness, true peak, clipping, silence, subtitle overlaps and timing, chapters and timeline continuity, as a JSON report with extracted frames

## Install

### The Skills

Once the repository is public on GitHub, install every skill for the agents on your machine:

```bash
npx skills add Bharat-suthar555/doodle-video-generator
```

Install one skill:

```bash
npx skills add Bharat-suthar555/doodle-video-generator --skill doodle-animation
npx skills add Bharat-suthar555/doodle-video-generator --skill video-storyboard
npx skills add Bharat-suthar555/doodle-video-generator --skill explainer-video
npx skills add Bharat-suthar555/doodle-video-generator --skill video-quality-check
```

Pick an agent with `-a`, for example `-a claude-code` (installs to `.claude/skills/`) or `-a codex` (installs to `.agents/skills/`). Add `-g` to install for your user instead of the current project, and `--list` to see the skills without installing. Replace `OWNER` with the GitHub account that hosts the repository.

Claude Code can also install the skills as plugins:

```text
/plugin marketplace add Bharat-suthar555/doodle-video-generator
/plugin install explainer-video@doodle-video-generator
```

Or copy a skill folder by hand into your agent's skills folder, such as `~/.claude/skills/` or `~/.agents/skills/`.

### The Toolkit

Installing a skill copies only that skill's folder, so the rendering toolkit is a separate npm package. Each skill carries `scripts/toolkit.mjs`, a dependency-free script that finds or installs it:

```bash
node <skill folder>/scripts/toolkit.mjs status     # is it installed? is FFmpeg there?
node <skill folder>/scripts/toolkit.mjs install    # asks npm for doodle-video-generator@0.1.0
node <skill folder>/scripts/toolkit.mjs run -- --help
```

Agents ask you before running `install`, because it downloads packages. The toolkit goes into `~/.cache/doodle-video-generator/0.1.0` (or `DVG_HOME`), so every skill shares one copy. Until the package is on npm, install from a local checkout or a packed tarball:

```bash
node <skill folder>/scripts/toolkit.mjs install --from /path/to/doodle-video-generator-0.1.0.tgz
node <skill folder>/scripts/toolkit.mjs install --from github:Bharat-suthar555/doodle-video-generator#v0.1.0
```

Installing from GitHub builds the package on your machine; npm may print an install-scripts warning about `prepare`, which needs no action (see [Publishing](docs/PUBLISHING.md)). You can also run `npm install doodle-video-generator` in a project, and the skills find it in `node_modules`.

### Requirements

- Node.js 22.18 or later
- FFmpeg 5 or later with ffprobe; burned-in subtitles need FFmpeg built with libass (most builds are)
- Optional: the demo-narrator skill for synthesized narration; `playwright-core` and Chrome, Chromium, Brave or Edge for browser recording

## Quick Start

Render the built-in 30-second demo and its quality report:

```bash
doodle-video-generator demo --out doodle-demo
```

Start your own video from a template, check it, preview a frame, then build it:

```bash
doodle-video-generator init my-video --template whiteboard-explainer
doodle-video-generator validate my-video/storyboard.json
doodle-video-generator render my-video/storyboard.json --still 5 --scene intro --out intro.png
doodle-video-generator build my-video/storyboard.json
```

Through a skill, the same commands run as `node <skill folder>/scripts/toolkit.mjs run -- demo --out doodle-demo`. Templates are `whiteboard-explainer` (16:9, whiteboard only), `software-demo` (whiteboard plus recorded footage) and `vertical-short` (9:16).

## Using the Skills

Ask your agent in plain words; the skill descriptions tell it which one to use.

- **doodle-animation**: "Make a 20-second vertical doodle that explains the two-minute rule." The agent writes the scenes, previews stills, renders and reports the MP4 and its checks
- **video-storyboard**: "Plan a 5-minute explainer about CRM lead management. I'll record the screens." The agent drafts the script, builds a storyboard with provenance on every scene, estimates timing and writes a shot list
- **explainer-video**: "Create a professional 5-minute explainer about CRM lead management with a whiteboard intro, my screen recordings, narration and subtitles, exported for YouTube." The agent runs the whole workflow below
- **video-quality-check**: "Is final.mp4 ready for YouTube?" The agent runs the checks and reports every failure and warning with its measured value

## The Complete Video Workflow

1. Take stock of the assets: recordings, audio, music and documents
2. Agree on the goal, audience, length, format, voice and music
3. Write the script and the storyboard, marking which words are the user's, sourced or generated
4. Plan narration: recorded files, demo-narrator after approval, or silent
5. Draw whiteboard scenes and preview them as stills
6. Add recordings as footage scenes with trims, zooms, callouts and masks
7. Synchronize: scenes stretch to measured narration; cues tie drawing to phrases
8. Assemble the timeline with transitions
9. Add subtitles
10. Mix narration, footage audio and music, then normalize loudness
11. Render the MP4
12. Run the quality checks and look at the extracted frames
13. Write the YouTube title, description, tags, chapters and thumbnail concept
14. Report every output path, the warnings, and what still needs a person: listening and watching

`doodle-video-generator build storyboard.json` runs steps 8 to 13 in one command. A video counts as done only when the MP4 exists and the report shows no failed check.

## Narration

- **Your recordings**: set `narration.audio` per scene. Add `narration.words` (word timestamps) for exact subtitles and cues
- **demo-narrator** (optional, local Kokoro or Piper voices): install it with `npx skills add GarvitSolanki/audio-generator --skill demo-narrator` and run its `setup.sh`. Then `doodle-video-generator narrate storyboard.json` prepares its script and stops for approval. After you approve the exact text, the agent runs the printed `--approve` command, runs `narrate` again and gets `storyboard.narrated.json` with one WAV per scene. Clips are generated with `--max-speed 1.0`, so nothing is sped up
- **Silent**: captions show the narration text with estimated timing, and the timeline marks it as estimated

The toolkit works without demo-narrator installed and bundles no voice models.

## CLI Reference

| Command | What it does |
| --- | --- |
| `init [dir] --template <name>` | Copies a template project; never overwrites files |
| `storyboard from-script <script.md>` | Turns a Markdown script into a storyboard skeleton |
| `storyboard shot-list <storyboard>` | Lists the screen recordings to capture |
| `storyboard timeline <storyboard>` | Prints scene start times and lengths |
| `validate <storyboard>` | Checks schema, files, ids, icons, timing, overlaps, safe area and caption area |
| `render <storyboard>` | Renders scene clips, cached; `--scene`, `--force`, `--jobs`; `--still <s>` for one PNG |
| `assemble <storyboard>` | Joins clips, mixes audio, adds subtitles and chapters, writes metadata |
| `build <storyboard>` | `render`, `assemble` and `inspect` in one step |
| `inspect <video>` | Quality checks with a JSON report; `--storyboard`, `--srt`, `--timeline`, `--frames`, `--expect-*` |
| `chapters <storyboard>` | YouTube chapters and metadata from the plan |
| `narrate <storyboard>` | Narration through demo-narrator, with its approval gate |
| `record <recording.json> --output <mp4>` | Records a local web app in a scripted browser |
| `demo` | Renders and checks the built-in demo |
| `icons`, `schema` | Lists icons; prints the JSON Schema path |

Every command has `--help`. Commands exit 0 on success and 1 on errors or failed checks; `narrate` exits 2 while it waits for approval.

## Example Projects

- [examples/whiteboard-explainer](examples/whiteboard-explainer): "What Happens When You Open a Website", 30 seconds, 1920x1080, whiteboard only. This is the `demo` command's storyboard
- [examples/software-demo](examples/software-demo): "Never Lose a Lead", 33 seconds, whiteboard scenes around a recording of a fictional CRM mock app, labeled as mock footage
- [examples/vertical-short](examples/vertical-short): "The Two-Minute Rule", 21 seconds, 1080x1920 for Shorts and Reels

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `ffmpeg was not found` | Install FFmpeg 5 or later, or set `DVG_FFMPEG` and `DVG_FFPROBE` |
| `This FFmpeg build has no libass` | Use `assemble --subtitles srt` for a sidecar file, or install an FFmpeg build with libass |
| `narration ends at … but the scene lasts …` | Use `"duration": "auto"`, a longer duration, or shorter narration |
| A scene failed to render | Fix the cause and run `render` again; finished scenes are cached |
| Text overlaps or sits under captions | Read the `validate` warnings and preview with `render --still` |
| `Refusing to open …` when recording | Pass `--allow-host <hostname>` for a site you own or may record |
| A skill can't find the toolkit | Run `node <skill>/scripts/toolkit.mjs status`; set `DVG_CLI` to an existing `bin/doodle-video-generator.js` if it is installed elsewhere |

## Supported Agents

Any agent that reads Agent Skills: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Windsurf and others listed by the [skills CLI](https://github.com/vercel-labs/skills). The skills use no tool names specific to one agent.

## Security

- Storyboards are data: no expressions or scripts run, and file fields reject URLs
- SVG files are read for outlines only; scripts, styles, links and external references are ignored
- Outputs never overwrite inputs, and `assemble` replaces only files it wrote unless you pass `--overwrite`
- The recorder opens only local addresses unless you pass `--allow-host`, blocks requests to other hosts, and never logs typed text; `typeSecret` reads passwords from environment variables
- Mock footage must carry a visible label; generated narration is flagged for fact checking
- Nothing is uploaded: the toolkit reads and writes local files only

## How the Skills Appear on skills.sh

[skills.sh](https://skills.sh) lists public repositories whose skills people install with the `skills` CLI, counted through its anonymous install telemetry. After the repository is public at `github.com/Bharat-suthar555/doodle-video-generator`, the repository page is expected at `skills.sh/Bharat-suthar555/doodle-video-generator` and each skill at `skills.sh/Bharat-suthar555/doodle-video-generator/<skill-name>` once installs register. Listing is not immediate or guaranteed. Set `DISABLE_TELEMETRY=1` to opt out of install telemetry yourself.

## Repository Layout

```text
skills/<name>/SKILL.md       instructions the agent reads, with frontmatter
skills/<name>/references/    detailed guides, linked from SKILL.md
skills/<name>/assets/        templates the agent copies
skills/<name>/scripts/       toolkit.mjs: find, install and run the toolkit
src/                         the toolkit (TypeScript, built to dist/)
examples/                    three example projects
assets/fonts/                OFL fonts for handwriting and captions
schema/                      storyboard JSON Schema, generated at build
scripts/                     skill validation, repository audit, skill sync
tests/                       Vitest tests, including real render smoke tests
docs/                        architecture and publishing notes
```

## Contributing

Read [AGENTS.md](AGENTS.md), then run:

```bash
npm install
npm test                    # builds, then runs the test suite
npm run validate:skills
npm run check:repo
```

Change `scripts/skill-toolkit.mjs`, not the copies in the skills, and run `npm run sync:skills`.

## License

[MIT](LICENSE) for the code, icons and hand artwork in this repository. The fonts are under the SIL Open Font License; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
