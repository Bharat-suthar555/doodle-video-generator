# Provenance and Fact Checking

Viewers trust explainer videos, so every claim needs a known origin. The storyboard records where each scene's words come from, and `validate` reports the totals.

## Narration Provenance

- **`user`**: the user wrote or dictated these words
- **`source`**: based on material the user supplied. Add the material to `sources` and list the ids in `narration.sourceIds`; `validate` rejects unknown ids
- **`generated`**: you wrote it. `validate` prints a reminder to check every factual claim before publishing

## Rules for Real Products

- Describe only features the user confirmed or that appear in the material they supplied
- Never invent metrics, prices, customer names, testimonials or release dates
- Never make up screens. Use the user's recordings, a recording of a fictional mock app with a visible label, or whiteboard drawings
- When a fact is missing, write `[confirm: …]` in the narration and list it in your summary; don't render until it is resolved

## Mock Footage

Footage scenes with `provenance: "mock"` must have a `label` (for example "Mock demo · fictional data"), which the renderer draws on every frame. Use names and addresses that are obviously fictional, such as `example.com` addresses.
