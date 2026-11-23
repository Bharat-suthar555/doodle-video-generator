# Example: What Happens When You Open a Website

A 30-second, 1920x1080 whiteboard explainer with handwriting, a drawing hand, icons, a flowchart, labeled connectors, a camera zoom, highlights and four transitions. The `demo` command renders this storyboard.

```bash
doodle-video-generator validate storyboard.json
doodle-video-generator build storyboard.json
```

The output lands in `output/`: the MP4, `.srt`, `.timeline.json`, `.youtube.md`, `.youtube.json`, `.report.json` and a `.frames/` folder.

## Notes

- The narration text is generated and has no audio, so the video is silent and its captions use estimated timing. Add `narration.audio` files, or run `doodle-video-generator narrate storyboard.json`, for a narrated version
- The IP address 203.0.113.7 is from a range reserved for documentation
- Chapters are embedded, but at 30 seconds each chapter is shorter than YouTube's 10-second minimum, so the report warns about it
