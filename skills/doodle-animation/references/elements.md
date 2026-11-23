# Element Reference

Every element sits in a scene's `elements` array and needs a `type`. All positions use board units: 1920x1080 for 16:9, 1080x1920 for 9:16 and 1080x1080 for 1:1, whatever the output resolution.

## Fields Every Element Accepts

- **`id`**: letters, digits, `-` and `_`. Needed when a connector, highlight or camera refers to the element
- **`x`, `y`**: the anchor point on the board
- **`at`**: a named position in the safe area: `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`. Used when `x` or `y` is missing
- **`anchor`**: which point of the element sits at `x`, `y` (same names as `at`). Defaults to `center`, or to the `at` value when you use `at`
- **`color`**, **`strokeWidth`**, **`opacity`**
- **`animation`**: how the element appears (see [animation.md](animation.md))
- **`exit`**: `{ "type": "erase" | "fade", "start": 5, "duration": 0.6 }`
- **`hand`**: `false` hides the drawing hand while this element draws

## Text

```json
{ "type": "text", "text": "Find the server", "at": "top", "fontSize": 72 }
```

`font` is `hand` (Patrick Hand, the default), `sans` or `sans-bold` (Lato). `maxWidth` wraps lines (defaults to the safe-area width); `align` is `left`, `center` or `right`; `lineHeight` defaults to 1.2. Text draws with the `handwrite` animation: each glyph is revealed along its outline while the hand writes it. Use `\n` for a forced line break.

## Lines and Arrows

```json
{ "type": "arrow", "from": [700, 540], "to": [1200, 540], "curve": -0.2 }
```

`curve` bends the line by that fraction of its length. `head` is `end` (arrow default), `start`, `both` or `none` (line default). `dashed: true` draws dashes.

## Shapes

- **`rect`**: `width`, `height`, optional `radius` and `fill`
- **`circle`**: `radius`; **`ellipse`**: `rx`, `ry`. Both accept `fill`

Fills fade in once the outline is drawn.

## Icons

```json
{ "type": "icon", "name": "laptop", "x": 600, "y": 540, "size": 220 }
```

Run `doodle-video-generator icons` for the 61 built-in names, which include user, users, document, mail, phone, cart, dollar, chart-bar, chart-line, pie, gear, lightbulb, check, cross, clock, calendar, lock, database, server, cloud, globe, laptop, search, warning, funnel, inbox, spreadsheet, rocket, trophy and handshake.

## SVG and Images

- **`svg`**: `file` (local path relative to the storyboard) and `size`. Only outlines are imported and drawn as marker strokes
- **`image`**: `file` (PNG, JPEG, WebP or GIF up to 20 MB), `width`, optional `height`. Appears with `fade` by default

## Flowchart Nodes and Connectors

```json
{ "type": "node", "id": "dns", "label": "DNS server", "icon": "search", "x": 960, "y": 540 }
{ "type": "connector", "from": "browser", "to": "dns", "label": "name?" }
```

Node `shape` is `round` (default), `rect`, `pill`, `diamond` or `circle`. Nodes size themselves to their label unless you set `width` or `height`. Connectors attach to the edges of any two elements with ids, and labels sit outside curved connectors.

## Flowcharts

```json
{
  "type": "flowchart", "id": "flow", "direction": "row", "y": 560,
  "nodes": [{ "id": "a", "label": "Capture", "icon": "inbox" }, { "id": "b", "label": "Win", "icon": "trophy" }],
  "edges": [{ "from": "a", "to": "b", "label": "follow up" }]
}
```

The toolkit ranks nodes by their edges and lays them out in columns (`row`) or rows (`column`) inside `width` x `height` (defaults to the safe area). Nodes draw in order, each followed by its incoming edges. Node ids must be unique in the scene, and camera and highlights can target them.

## Charts

```json
{ "type": "chart", "kind": "bar", "width": 800, "height": 460, "data": [{ "label": "Q1", "value": 12 }, { "label": "Q2", "value": 18 }] }
```

`kind` is `bar`, `line` or `pie`. `max` fixes the scale and `colors` overrides the palette. Use real data from the user; never invent numbers.

## Highlights

```json
{ "type": "highlight", "target": "title", "style": "underline" }
```

`style` is `underline`, `circle`, `box` or `marker` (a translucent yellow highlighter stroke).

## Groups

```json
{ "type": "group", "x": 1400, "y": 560, "layout": { "type": "column", "gap": 30 }, "children": [ … ] }
```

With `layout`, children are arranged in a row or column centered on the group's position. Without it, children's coordinates are offsets from the group's `x`, `y`, and `scale` resizes them. Children draw one after another; a group's `animation.type`, `hand` and `exit` apply to children that don't set their own.
