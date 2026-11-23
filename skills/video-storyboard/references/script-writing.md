# Writing the Script

A good explainer script makes one point per scene and sounds natural read aloud. This page gives the pacing numbers and structure to start from.

## Pacing

- Spoken English runs about 140 to 160 words per minute; the toolkit estimates with `narration.wordsPerMinute` (default 150)
- A 30-second short holds 60 to 75 words; a 5-minute explainer about 700
- Leave 0.3 to 0.6 seconds of silence at scene starts and ends (`narration.leadIn` and `narration.tail`)
- Sentences under 20 words; one idea per sentence

## Structure

1. **Hook** (first 5 seconds): the viewer's problem or a question
2. **Problem**: what goes wrong today, in concrete terms
3. **Solution**: the idea in one sentence, then how it works in steps
4. **Proof or demo**: real screens or a worked example
5. **Recap**: the steps again, shorter
6. **Call to action**: one clear next step

Short vertical videos use hook, one idea and payoff.

## Writing for the Ear

- Use "you" and active verbs
- Spell out numbers the way they are spoken when it helps pronunciation
- Avoid parentheses, lists of more than three items and nested clauses
- Write the visual direction separately (`notes`), not in the narration

## Markdown Format for `storyboard from-script`

```markdown
# Video Title

## Scene Heading (becomes the chapter title)
Narration paragraph for this scene.
[visual: what the whiteboard should show]

## Demo Scene
Narration over the recording.
[footage: what to record]
```

Each `##` heading starts a scene, `[visual: …]` becomes the scene's notes, and `[footage: …]` makes a footage scene with a shot-list entry.
