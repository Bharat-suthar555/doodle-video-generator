# Agent Guide

This repository publishes four Agent Skills (`skills/<name>/SKILL.md`) and the `doodle-video-generator` npm toolkit they run. People install the skills with `npx skills add OWNER/doodle-video-generator`, which copies only each skill's folder, and the toolkit with the skill's `scripts/toolkit.mjs`.

## Layout

- `skills/<name>/`: one skill per folder with `SKILL.md`, `references/`, `assets/` and `scripts/toolkit.mjs`. Never nest a skill inside another
- `src/`: the toolkit in TypeScript, built to `dist/` with `npm run build`. Modules: `storyboard` (schema, validation), `drawing` (fonts, paths, icons, hand), `animation` (layout, scheduling, frames), `renderer` (rasterize and encode), `footage`, `timeline` (planning, assembly, metadata), `audio`, `subtitles`, `validation`, `recorder`, `cli`
- `examples/`: three example projects, also used as `init` templates
- `scripts/`: `validate-skills.mjs`, `check-repository.mjs`, `sync-skill-files.mjs`, `skill-toolkit.mjs` (the source of every skill's `toolkit.mjs`)
- `docs/`: architecture and publishing notes

## Rules for Skills

- `name` equals the folder name; `description` starts with "Use when" and stays under 1024 characters; `license: MIT`; `metadata.version` equals `package.json`
- Keep `SKILL.md` under 500 lines with the sections When to Use, Inputs, Workflow, Outputs, Error Handling, Safety and Example. Put detail in `references/`, linked with relative paths
- Refer to the skill folder as `SKILL_DIR`; never write absolute paths
- Write for any agent: no product-specific tool names
- Document only commands that exist and that tests exercise

## Rules for the Toolkit

- Storyboards are data. Never evaluate expressions or run code from them, and keep rejecting URLs in file fields
- Never overwrite inputs; write intermediates under `.dvg-work/`
- Never speed up narration, never invent timestamps, and mark estimated timing as estimated
- Report what the checks measured; never claim listening or watching happened
- TypeScript uses erasable syntax only and `.ts` import paths (rewritten to `.js` at build)

## Before You Commit

1. `npm test` (builds, then runs Vitest, including real render smoke tests that need FFmpeg)
2. `npm run validate:skills`
3. `npm run check:repo`, with `AUDIT_FORBIDDEN_TERMS` set to any names that must not appear
4. If you changed `scripts/skill-toolkit.mjs` or the version, `npm run sync:skills`
5. Render an example (`node bin/doodle-video-generator.js build examples/whiteboard-explainer/storyboard.json`) and look at its frames when you change drawing or timing code

## Writing

Active voice, present tense, "you" for the reader, sentences under 20 words, no em dashes, Title Case headings.
