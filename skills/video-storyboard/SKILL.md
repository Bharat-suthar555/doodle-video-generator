---
name: video-storyboard
description: Use when the user wants to plan a video before making it, such as turning a topic or script into scenes, narration, visual directions, timings and a screen-recording shot list, or checking that an existing storyboard is complete and valid.
license: MIT
compatibility: Planning works anywhere. Validation, timelines and shot lists need Node.js 22.18 or later, FFmpeg 5 or later, and the doodle-video-generator toolkit (installed by scripts/toolkit.mjs with the user's approval).
metadata:
  version: "0.1.0"
---

# Video Storyboard

Turn a topic, a script or a pile of notes into a storyboard: an ordered list of scenes, each with narration, visuals, timing and transitions. The storyboard is a JSON file that the `doodle-animation` and `explainer-video` skills render directly.

`SKILL_DIR` is the folder that contains this file. Toolkit commands run as `node SKILL_DIR/scripts/toolkit.mjs run -- <command>`; below, `dvg` stands for that prefix.

## When to Use

- The user has a topic or idea and needs a script and scene plan
- The user has a script and wants it broken into scenes with visuals and timings
- A demo video needs a shot list of screen recordings to capture
- An existing storyboard needs checking before rendering

## Inputs

Required: the topic or script, and the video's goal (what viewers should know or do afterwards).

Optional: audience, target length, aspect ratio, tone, source material (docs, notes, product facts), available recordings and voice plans.

## Facts Versus Generated Content

Keep verified information apart from what you write:

- Mark each scene's `narration.provenance`: `user` for the user's own words, `source` for text based on material they supplied (list it in `sources` and cite it in `narration.sourceIds`), `generated` for text you wrote
- Never invent features, numbers, prices, customers or screenshots of real products. When a claim needs a fact you don't have, ask, or write a placeholder such as `[confirm: monthly price]` and list it in your summary
- Footage scenes of software the user didn't supply must use `provenance: "mock"` with a visible `label`, or be replaced by whiteboard scenes

See [references/provenance.md](references/provenance.md).

## Workflow

1. Agree on the goal, audience, length, format (16:9, 9:16 or 1:1) and voice (recorded, synthesized or silent). Recommend a default for each.
2. Write the script. Use [references/script-writing.md](references/script-writing.md): one idea per scene, about 150 spoken words per minute, a hook in the first 5 seconds.
3. Convert it to a storyboard. Either write JSON from [assets/storyboard-template.json](assets/storyboard-template.json), or write Markdown in the format of [assets/script-template.md](assets/script-template.md) and run `dvg storyboard from-script script.md --out storyboard.json` (add `--generated` when you wrote the words).
4. Add visuals to each scene: elements for whiteboard scenes ([references/storyboard-format.md](references/storyboard-format.md) and the `doodle-animation` skill), or a `footage` section with a `shot` description for screen recordings.
5. Check timing: `dvg storyboard timeline storyboard.json --allow-missing`. Timing from text alone is marked estimated until narration audio exists.
6. Produce the shot list when there are footage scenes: `dvg storyboard shot-list storyboard.json --out shots.md`.
7. Validate: `dvg validate storyboard.json --allow-missing` during planning, and without `--allow-missing` before rendering.
8. Present the plan as a table: scene, chapter, narration, visuals, estimated length, and which facts still need confirming.

## Outputs

- `storyboard.json` that passes `validate`
- A shot list (`shots.md`) when the video needs recordings
- A summary of estimated length, open fact checks and assets the user must supply

## Error Handling

- Schema errors name the field path; unknown fields are rejected so typos don't pass silently
- "narration ends after the scene": shorten the text or use `"duration": "auto"`. Never plan sped-up narration
- If the toolkit isn't installed, you can still write the storyboard; run `node SKILL_DIR/scripts/toolkit.mjs status` for install options and ask before installing

## Safety

- Don't put credentials, private customer data or internal URLs in narration, on-screen text or shot lists
- Plan recordings only of software the user owns or is authorized to show, with sample data
- Cite sources for factual claims and flag anything unverified

## Example

User: "Plan a 5-minute explainer about CRM lead management. I'll record the screens."

1. Ask for the product facts and the screens they can record. Recommend 16:9 with recorded or synthesized narration.
2. Write about 700 words across 8 to 10 scenes: hook, problem, cost of the problem, solution overview, three demo scenes, recap, call to action.
3. Build the storyboard; mark demo scenes as `footage` with `shot` steps; mark narration provenance.
4. Run `dvg storyboard timeline` and `dvg storyboard shot-list`, then present the scene table and the shot list.
