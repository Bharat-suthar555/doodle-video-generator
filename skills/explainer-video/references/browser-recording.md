# Recording a Local Web App (Optional)

The `record` command drives a Chromium-based browser through scripted steps and saves an MP4 with a visible cursor. Use it only for apps the user owns or is authorized to demonstrate, with sample data.

## Requirements

- `playwright-core` installed next to the toolkit: `npm install --prefix <toolkit install folder> playwright-core` (ask first; it downloads a package)
- Chrome, Chromium, Brave or Edge, found automatically or passed with `--browser <path>`

## Script

```json
{
  "url": "http://localhost:3000/leads",
  "viewport": { "width": 1920, "height": 1080 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": "#new-lead" },
    { "action": "type", "selector": "#name", "text": "Riley Sample" },
    { "action": "typeSecret", "selector": "#password", "env": "DEMO_PASSWORD" },
    { "action": "mark", "name": "saved" }
  ]
}
```

Actions: `goto`, `wait`, `waitFor`, `move`, `hover`, `click`, `type`, `typeSecret`, `press`, `scroll`, `mark`. The cursor glides to each element before clicking or typing.

## Safety Rules Built In

- Only `localhost`, `127.0.0.1`, `::1`, `*.localhost` and `file:` URLs open by default. A site the user owns needs `--allow-host <hostname>`, which a recording script cannot grant itself
- Requests to any other host are blocked, so the page can't load third-party trackers or leak data; `--allow-external-resources` allows subresources but never navigation
- Typed text is never logged; `typeSecret` reads from an environment variable and logs only the variable name
- The command refuses to overwrite an existing file unless you pass `--overwrite`

## Run

```bash
dvg record recording.json --output footage/demo.mp4
```

It writes the MP4 and `demo.marks.json` with the time of each `mark` step (accurate to about 0.1s), which helps set `footage.trim`.
