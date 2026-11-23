# Example: Never Lose a Lead

A 33-second software explainer: two whiteboard scenes, a recording of a fictional CRM, and a whiteboard recap. The footage scene shows trimming, eased zooms, blur masks over email addresses, callouts and the required "Mock demo · fictional data" label.

## Record the Mock Footage

The recording is generated, not committed. `mock-app/index.html` is a self-contained fictional CRM page, and `recording.json` scripts the clicks and typing:

```bash
npm install playwright-core      # next to the toolkit; optional dependency
doodle-video-generator record recording.json --output footage/mock-crm.mp4
```

It needs Chrome, Chromium, Brave or Edge, and writes `footage/mock-crm.marks.json` with the time of each marked step.

## Build

```bash
doodle-video-generator validate storyboard.json
doodle-video-generator build storyboard.json
```

## Notes

- Every name in the mock app is invented, and the email addresses use the reserved `example.com` and `example.org` domains
- Replace the footage scene's `source` with your own recording, set `provenance` to `user-recording`, and remove the `label`, to make a real product video
- The narration is generated: check every claim before publishing a video based on this example
