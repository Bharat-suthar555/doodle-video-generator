import path from 'node:path'
import { UserError } from '../core/errors.ts'
import {
  boundsOf,
  boxEdgePoint,
  center,
  diamondEdgePoint,
  ellipseEdgePoint,
  inflate,
  unionBoxes,
  type Box,
  type Point
} from '../core/geometry.ts'
import { hash32 } from '../core/hash.ts'
import { createRandom, type Random } from '../core/random.ts'
import { anchorBox, layoutText, measureText, revealBrush, type Anchor, type FontName } from '../drawing/font.ts'
import { icons } from '../drawing/icons.ts'
import { loadImage } from '../drawing/image-size.ts'
import { parsePath } from '../drawing/path-parse.ts'
import {
  arrowHeadPoints,
  dashPolyline,
  diamondPoints,
  ellipsePoints,
  linePoints,
  rectPoints,
  wobble
} from '../drawing/rough.ts'
import { importSvgFile } from '../drawing/svg-import.ts'
import type {
  ChartEl,
  CircleEl,
  ConnectorEl,
  Element,
  FlowchartEl,
  Group,
  HighlightEl,
  IconEl,
  ImageEl,
  LineEl,
  NodeEl,
  RectEl,
  Style,
  SvgEl,
  TextEl
} from '../storyboard/schema.ts'
import type { Built, EntranceType, InkItem, ResolvedAnimation, ShapeKind } from './types.ts'

export interface BuildContext {
  style: Style
  design: { width: number; height: number }
  safe: Box
  baseDir: string
  sceneId: string
  registry: Map<string, Built>
  deferred: (() => void)[]
  warnings: string[]
  autoId: number
}

/** The safe area: 6% side margins and 8% top and bottom margins. */
export const safeArea = (width: number, height: number): Box => ({
  x: width * 0.06,
  y: height * 0.08,
  width: width * 0.88,
  height: height * 0.84
})

const randFor = (ctx: BuildContext, id: string): Random =>
  createRandom(hash32(`${ctx.style.seed}:${ctx.sceneId}:${id}`))

type Positioned = { x?: number; y?: number; at?: Anchor; anchor?: Anchor }

const resolvePosition = (el: Positioned, ctx: BuildContext) => {
  const at = el.at ?? 'center'
  const s = ctx.safe
  const px = at.includes('left') ? s.x : at.includes('right') ? s.x + s.width : s.x + s.width / 2
  const py = at.startsWith('top') ? s.y : at.startsWith('bottom') ? s.y + s.height : s.y + s.height / 2
  return { x: el.x ?? px, y: el.y ?? py, anchor: (el.anchor ?? (el.at ? at : 'center')) as Anchor }
}

const defaultEntrance = (type: string): EntranceType =>
  type === 'text' ? 'handwrite' : type === 'image' ? 'fade' : 'draw'

const resolveAnimation = (el: Element): ResolvedAnimation => ({
  ...el.animation,
  type: el.animation?.type ?? defaultEntrance(el.type)
})

const textGlyphs = (
  text: string,
  o: { font: FontName; fontSize: number; x: number; y: number; anchor: Anchor; align: 'left' | 'center' | 'right'; maxWidth?: number; lineHeight: number; color: string; hand: boolean }
) => {
  const layout = layoutText({ text, ...o })
  const items: InkItem[] = layout.glyphs.map(g => ({
    kind: 'glyph',
    contours: g.contours,
    color: o.color,
    brush: o.fontSize * revealBrush[o.font],
    hand: o.hand,
    wordStart: g.wordStart,
    fontSize: o.fontSize
  }))
  return { items, box: layout.box, lines: layout.lines }
}

const stroke = (points: Point[], color: string, width: number, hand: boolean, opacity = 1): InkItem => ({
  kind: 'stroke',
  points,
  color,
  width,
  opacity,
  hand
})

const baseBuilt = (el: Element, ctx: BuildContext, partial: Partial<Built> & Pick<Built, 'items' | 'box'>): Built => ({
  id: el.id ?? `${el.type}-${++ctx.autoId}`,
  type: el.type,
  shape: 'none',
  animation: resolveAnimation(el),
  exit: el.exit,
  opacity: el.opacity ?? 1,
  textual: false,
  decorative: false,
  ...partial
})

const handFor = (el: { hand?: boolean }, ctx: BuildContext) => (el.hand ?? true) && ctx.style.hand.enabled

const buildText = (el: TextEl, ctx: BuildContext): Built => {
  const font = el.font ?? ctx.style.font
  const fontSize = el.fontSize ?? (font === 'hand' ? 64 : 56)
  const pos = resolvePosition(el, ctx)
  const maxWidth = el.maxWidth ?? ctx.safe.width
  for (const word of el.text.split(/\s+/)) {
    const m = measureText({ text: word, font, fontSize, lineHeight: 1.2 })
    if (m.width > maxWidth)
      ctx.warnings.push(`${ctx.sceneId}: the word "${word}" is wider than its maxWidth (${Math.round(maxWidth)})`)
  }
  const { items, box } = textGlyphs(el.text, {
    font,
    fontSize,
    ...pos,
    align: el.align ?? 'center',
    maxWidth,
    lineHeight: el.lineHeight ?? 1.2,
    color: el.color ?? ctx.style.ink,
    hand: handFor(el, ctx)
  })
  return baseBuilt(el, ctx, { items, box, textual: true })
}

const arrowParts = (
  shaft: Point[],
  head: 'end' | 'start' | 'both' | 'none',
  size: number,
  dashed: boolean
) => {
  const parts: Point[][] = dashed ? dashPolyline(shaft, 18) : [shaft]
  const n = shaft.length
  const back = Math.min(4, n - 1)
  if (head === 'end' || head === 'both') {
    const tip = shaft[n - 1]
    const ref = shaft[n - 1 - back]
    parts.push(arrowHeadPoints(tip, [tip[0] - ref[0], tip[1] - ref[1]], size))
  }
  if (head === 'start' || head === 'both') {
    const tip = shaft[0]
    const ref = shaft[back]
    parts.push(arrowHeadPoints(tip, [tip[0] - ref[0], tip[1] - ref[1]], size))
  }
  return parts
}

const buildLine = (el: LineEl, ctx: BuildContext): Built => {
  const id = el.id ?? `${el.type}-${ctx.autoId + 1}`
  const rand = randFor(ctx, id)
  const width = el.strokeWidth ?? ctx.style.strokeWidth
  const shaft = wobble(linePoints(el.from, el.to, el.curve ?? 0), rand, ctx.style.roughness)
  const head = el.head ?? (el.type === 'arrow' ? 'end' : 'none')
  const color = el.color ?? ctx.style.ink
  const parts = arrowParts(shaft, head, Math.max(18, width * 4.5), el.dashed ?? false)
  const items = parts.map(p => stroke(p, color, width, handFor(el, ctx)))
  return baseBuilt(el, ctx, { items, box: boundsOf(parts.flat()) })
}

const buildRect = (el: RectEl, ctx: BuildContext): Built => {
  const id = el.id ?? `rect-${ctx.autoId + 1}`
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, el.width, el.height, pos.anchor)
  const pts = rectPoints(box.x, box.y, box.width, box.height, el.radius ?? 0, randFor(ctx, id), ctx.style.roughness)
  const items: InkItem[] = []
  if (el.fill) items.push({ kind: 'fill', polygons: [pts], color: el.fill, opacity: 1 })
  items.push(stroke(pts, el.color ?? ctx.style.ink, el.strokeWidth ?? ctx.style.strokeWidth, handFor(el, ctx)))
  return baseBuilt(el, ctx, { items, box, shape: 'rect' })
}

const buildCircle = (el: CircleEl, ctx: BuildContext): Built => {
  const id = el.id ?? `${el.type}-${ctx.autoId + 1}`
  const rx = el.rx ?? el.radius ?? 80
  const ry = el.ry ?? el.radius ?? rx
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, rx * 2, ry * 2, pos.anchor)
  const [cx, cy] = center(box)
  const pts = ellipsePoints(cx, cy, rx, ry, randFor(ctx, id), ctx.style.roughness)
  const items: InkItem[] = []
  if (el.fill) items.push({ kind: 'fill', polygons: [pts], color: el.fill, opacity: 1 })
  items.push(stroke(pts, el.color ?? ctx.style.ink, el.strokeWidth ?? ctx.style.strokeWidth, handFor(el, ctx)))
  return baseBuilt(el, ctx, { items, box, shape: 'ellipse' })
}

/** Strokes for an icon fitted into a box. */
const iconStrokes = (name: string, box: Box, rand: Random, roughness: number): Point[][] => {
  const data = icons[name]
  if (!data) throw new UserError(`Unknown icon "${name}"`, 'Run `doodle-video-generator icons` to list the built-in icons.')
  const s = box.width / 100
  return parsePath(data).map(sp =>
    wobble(
      sp.points.map(([x, y]): Point => [box.x + x * s, box.y + y * s]),
      rand,
      roughness * 0.35,
      sp.closed
    )
  )
}

const buildIcon = (el: IconEl, ctx: BuildContext): Built => {
  const id = el.id ?? `icon-${ctx.autoId + 1}`
  const size = el.size ?? 160
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, size, size, pos.anchor)
  const width = el.strokeWidth ?? Math.max(2.5, ctx.style.strokeWidth * Math.min(1, size / 160))
  const items = iconStrokes(el.name, box, randFor(ctx, id), ctx.style.roughness).map(p =>
    stroke(p, el.color ?? ctx.style.ink, width, handFor(el, ctx))
  )
  return baseBuilt(el, ctx, { items, box })
}

const buildSvg = (el: SvgEl, ctx: BuildContext): Built => {
  const id = el.id ?? `svg-${ctx.autoId + 1}`
  const file = path.resolve(ctx.baseDir, el.file)
  const svg = importSvgFile(file)
  const [vx, vy, vw, vh] = svg.viewBox
  const size = el.size ?? 240
  const s = size / Math.max(vw, vh)
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, vw * s, vh * s, pos.anchor)
  const rand = randFor(ctx, id)
  const items = svg.subpaths.map(sp =>
    stroke(
      wobble(sp.points.map(([x, y]): Point => [box.x + (x - vx) * s, box.y + (y - vy) * s]), rand, ctx.style.roughness * 0.3, sp.closed),
      el.color ?? ctx.style.ink,
      el.strokeWidth ?? ctx.style.strokeWidth,
      handFor(el, ctx)
    )
  )
  return baseBuilt(el, ctx, { items, box })
}

const buildImage = (el: ImageEl, ctx: BuildContext): Built => {
  const img = loadImage(path.resolve(ctx.baseDir, el.file))
  const height = el.height ?? (el.width * img.height) / img.width
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, el.width, height, pos.anchor)
  return baseBuilt(el, ctx, {
    items: [{ kind: 'image', href: img.href, x: box.x, y: box.y, width: box.width, height: box.height }],
    box
  })
}

const outlineFor = (shape: NodeEl['shape'], box: Box, rand: Random, roughness: number): { pts: Point[]; kind: ShapeKind } => {
  switch (shape) {
    case 'rect':
      return { pts: rectPoints(box.x, box.y, box.width, box.height, 0, rand, roughness), kind: 'rect' }
    case 'pill':
      return { pts: rectPoints(box.x, box.y, box.width, box.height, box.height / 2, rand, roughness), kind: 'rect' }
    case 'diamond':
      return { pts: diamondPoints(box.x, box.y, box.width, box.height, rand, roughness), kind: 'diamond' }
    case 'circle': {
      const [cx, cy] = center(box)
      return { pts: ellipsePoints(cx, cy, box.width / 2, box.height / 2, rand, roughness), kind: 'ellipse' }
    }
    default:
      return { pts: rectPoints(box.x, box.y, box.width, box.height, 18, rand, roughness), kind: 'rect' }
  }
}

/** Size a node needs for its label and icon; `width` fixes the width when given. */
export const nodeSize = (
  o: { label: string; icon?: string; shape?: NodeEl['shape']; fontSize?: number; width?: number },
  font: FontName
) => {
  const fontSize = o.fontSize ?? 40
  const textRoom = o.shape === 'diamond' || o.shape === 'circle' ? 0.62 : 1
  const iconSize = o.icon ? Math.min(72, fontSize * 1.6) : 0
  const maxLabel = (o.width ?? 320) * textRoom - 40
  const m = o.label ? measureText({ text: o.label, font, fontSize, maxWidth: maxLabel, lineHeight: 1.15 }) : { width: 0, height: 0 }
  const width = o.width ?? Math.min(440, Math.max(200, m.width / textRoom + 70))
  const height = Math.max(110, (m.height + (iconSize ? iconSize + 12 : 0)) / textRoom + 48)
  return { width, height, iconSize, maxLabel, labelHeight: m.height, fontSize }
}

const buildNode = (el: NodeEl, ctx: BuildContext): Built => {
  const id = el.id ?? `node-${ctx.autoId + 1}`
  const font = ctx.style.font
  const shape = el.shape ?? 'round'
  const size = nodeSize(el, font)
  const { iconSize, maxLabel, fontSize } = size
  const m = { height: size.labelHeight }
  const width = size.width
  const height = el.height ?? size.height
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, width, height, pos.anchor)
  const rand = randFor(ctx, id)
  const { pts, kind } = outlineFor(shape, box, rand, ctx.style.roughness)
  const color = el.color ?? ctx.style.ink
  const hand = handFor(el, ctx)
  const items: InkItem[] = []
  if (el.fill) items.push({ kind: 'fill', polygons: [pts], color: el.fill, opacity: 1 })
  items.push(stroke(pts, color, el.strokeWidth ?? ctx.style.strokeWidth, hand))
  const contentH = m.height + (iconSize ? iconSize + 12 : 0)
  let y = box.y + (box.height - contentH) / 2
  if (el.icon) {
    const iconBox = { x: box.x + (box.width - iconSize) / 2, y, width: iconSize, height: iconSize }
    for (const p of iconStrokes(el.icon, iconBox, rand, ctx.style.roughness)) items.push(stroke(p, color, Math.max(2.5, ctx.style.strokeWidth * 0.75), hand))
    y += iconSize + 12
  }
  if (el.label) {
    const t = textGlyphs(el.label, {
      font,
      fontSize,
      x: box.x + box.width / 2,
      y,
      anchor: 'top',
      align: 'center',
      maxWidth: maxLabel,
      lineHeight: 1.15,
      color,
      hand
    })
    items.push(...t.items)
  }
  return baseBuilt(el, ctx, { items, box, shape: kind, textual: Boolean(el.label) })
}

const edgePoint = (b: Built, toward: Point, pad: number): Point =>
  b.shape === 'ellipse'
    ? ellipseEdgePoint(b.box, toward, pad)
    : b.shape === 'diamond'
      ? diamondEdgePoint(b.box, toward, pad)
      : boxEdgePoint(b.box, toward, pad)

const lookup = (ctx: BuildContext, id: string, by: string): Built => {
  const b = ctx.registry.get(id)
  if (!b) throw new UserError(`${ctx.sceneId}: ${by} refers to "${id}", which is not an element id in this scene`)
  return b
}

const buildConnector = (el: ConnectorEl, ctx: BuildContext): Built => {
  const built = baseBuilt(el, ctx, { items: [], box: { x: 0, y: 0, width: 0, height: 0 }, decorative: true })
  ctx.deferred.push(() => {
    const a = lookup(ctx, el.from, `connector "${built.id}"`)
    const b = lookup(ctx, el.to, `connector "${built.id}"`)
    const pad = 14
    const start = edgePoint(a, center(b.box), pad)
    const end = edgePoint(b, center(a.box), pad)
    const rand = randFor(ctx, built.id)
    const width = el.strokeWidth ?? ctx.style.strokeWidth
    const color = el.color ?? ctx.style.ink
    const shaft = wobble(linePoints(start, end, el.curve ?? 0), rand, ctx.style.roughness)
    const parts = arrowParts(shaft, el.head ?? 'end', Math.max(18, width * 4.5), el.dashed ?? false)
    built.items = parts.map(p => stroke(p, color, width, handFor(el, ctx)))
    if (el.label) {
      const mid = shaft[Math.floor(shaft.length / 2)]
      const dx = end[0] - start[0]
      const dy = end[1] - start[1]
      const len = Math.hypot(dx, dy) || 1
      const horizontal = Math.abs(dx) >= Math.abs(dy)
      // Straight arrows: label above (horizontal) or right (vertical).
      // Curved arrows: label on the outside of the bend, so arcs never cross it.
      const bend = el.curve ?? 0
      let side = horizontal ? -1 : 1
      if (bend !== 0) side = Math.sign(horizontal ? (dx / len) * bend : (-dy / len) * bend) || side
      const nx = horizontal ? 0 : side
      const ny = horizontal ? side : 0
      const anchor: Anchor = horizontal ? (ny < 0 ? 'bottom' : 'top') : nx > 0 ? 'left' : 'right'
      const t = textGlyphs(el.label, {
        font: ctx.style.font,
        fontSize: 30,
        x: mid[0] + nx * 22,
        y: mid[1] + ny * 18,
        anchor,
        align: 'center',
        maxWidth: horizontal ? Math.max(110, len - 24) : 320,
        lineHeight: 1.1,
        color,
        hand: handFor(el, ctx)
      })
      built.items.push(...t.items)
      built.textual = true
      built.box = unionBoxes([boundsOf(parts.flat()), t.box])
    } else built.box = boundsOf(parts.flat())
  })
  return built
}

/** Longest-path ranks for a flowchart; nodes in cycles keep their list order. */
export const flowRanks = (nodes: { id: string }[], edges: { from: string; to: string }[]) => {
  const rank = new Map(nodes.map(n => [n.id, 0]))
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false
    for (const e of edges) {
      const r = (rank.get(e.from) ?? 0) + 1
      if (rank.has(e.to) && r > rank.get(e.to)! && r < nodes.length) {
        rank.set(e.to, r)
        changed = true
      }
    }
    if (!changed) break
  }
  return rank
}

const expandFlowchart = (el: FlowchartEl, ctx: BuildContext): Element[] => {
  const rank = flowRanks(el.nodes, el.edges)
  const ranks = Math.max(...rank.values()) + 1
  const byRank: string[][] = Array.from({ length: ranks }, () => [])
  for (const n of el.nodes) byRank[rank.get(n.id)!].push(n.id)
  const widest = Math.max(...byRank.map(r => r.length))
  const pos = resolvePosition(el, ctx)
  const row = el.direction === 'row'
  const width = el.width ?? (row ? ctx.safe.width : Math.min(ctx.safe.width, widest * 380))
  const height = el.height ?? (row ? Math.min(ctx.safe.height * 0.7, widest * 200) : ctx.safe.height * 0.85)
  const area = anchorBox(pos.x, pos.y, width, height, pos.anchor)
  const mainSlots = ranks
  const mainLen = row ? area.width : area.height
  const crossLen = row ? area.height : area.width
  const nodeW = el.nodeWidth ?? (row ? Math.min(320, (mainLen / mainSlots) * 0.68) : Math.min(340, (crossLen / widest) * 0.8))
  const boxy = el.nodes.filter(n => n.shape !== 'circle' && n.shape !== 'diamond')
  const needed = Math.max(110, ...boxy.map(n => nodeSize({ ...n, fontSize: el.fontSize, width: nodeW }, ctx.style.font).height))
  const nodeH = el.nodeHeight ?? needed
  const out: Element[] = []
  const drawn = new Set<string>()
  const ordered = [...el.nodes].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const inherit = { animation: el.animation, hand: el.hand, color: el.color, strokeWidth: el.strokeWidth }
  const edgeEl = (e: FlowchartEl['edges'][number]): Element => ({
    type: 'connector',
    id: `${e.from}-to-${e.to}`,
    from: e.from,
    to: e.to,
    label: e.label,
    curve: e.curve,
    dashed: e.dashed,
    hand: el.hand,
    color: el.color,
    strokeWidth: el.strokeWidth
  })
  ordered.forEach((n, i) => {
    const r = rank.get(n.id)!
    const slot = byRank[r].indexOf(n.id)
    const count = byRank[r].length
    const main = (row ? area.x : area.y) + mainLen * ((r + 0.5) / mainSlots)
    const cross = (row ? area.y : area.x) + crossLen * ((slot + 0.5) / count)
    for (const e of el.edges)
      if (e.to === n.id && drawn.has(e.from)) out.push(edgeEl(e))
    out.push({
      type: 'node',
      id: n.id,
      label: n.label,
      shape: n.shape,
      icon: n.icon,
      fill: n.fill,
      fontSize: el.fontSize,
      x: row ? main : cross,
      y: row ? cross : main,
      width: nodeW,
      // Circles and diamonds need more room for the same label, so they size themselves
      height: n.shape === 'circle' || n.shape === 'diamond' ? undefined : nodeH,
      ...inherit,
      animation: i === 0 ? el.animation : el.animation ? { ...el.animation, start: undefined, cue: undefined, delay: 0.15 } : { delay: 0.15 }
    })
    drawn.add(n.id)
  })
  for (const e of el.edges) {
    const id = `${e.from}-to-${e.to}`
    if (!out.some(o => o.id === id)) out.push(edgeEl(e))
  }
  return out
}

const buildChart = (el: ChartEl, ctx: BuildContext): Built => {
  const id = el.id ?? `chart-${ctx.autoId + 1}`
  const rand = randFor(ctx, id)
  const pos = resolvePosition(el, ctx)
  const box = anchorBox(pos.x, pos.y, el.width, el.height, pos.anchor)
  const font = ctx.style.font
  const fontSize = el.fontSize ?? 30
  const color = el.color ?? ctx.style.ink
  const width = el.strokeWidth ?? ctx.style.strokeWidth
  const colors = el.colors ?? ctx.style.palette
  const hand = handFor(el, ctx)
  const items: InkItem[] = []
  const label = (text: string, x: number, y: number, anchor: Anchor, size = fontSize) =>
    items.push(...textGlyphs(text, { font, fontSize: size, x, y, anchor, align: 'center', lineHeight: 1.1, color, hand }).items)
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  const values = el.data.map(d => d.value)
  if (el.kind === 'pie') {
    const total = values.reduce((a, b) => a + b, 0) || 1
    const r = Math.min(box.width, box.height) / 2 - fontSize * 1.8
    const [cx, cy] = center(box)
    let a0 = -Math.PI / 2
    const ring = ellipsePoints(cx, cy, r, r, rand, ctx.style.roughness)
    el.data.forEach((d, i) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2
      const poly: Point[] = [[cx, cy]]
      for (let k = 0; k <= 24; k++) {
        const a = a0 + ((a1 - a0) * k) / 24
        poly.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      items.push({ kind: 'fill', polygons: [poly], color: colors[i % colors.length], opacity: 0.35 })
      a0 = a1
    })
    items.push(stroke(ring, color, width, hand))
    a0 = -Math.PI / 2
    el.data.forEach(d => {
      const a1 = a0 + (d.value / total) * Math.PI * 2
      if (el.data.length > 1) items.push(stroke(wobble(linePoints([cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r]), rand, ctx.style.roughness), color, width, hand))
      const mid = (a0 + a1) / 2
      label(`${d.label} ${Math.round((d.value / total) * 100)}%`, cx + Math.cos(mid) * (r + fontSize * 1.1), cy + Math.sin(mid) * (r + fontSize * 0.9), Math.cos(mid) > 0.3 ? 'left' : Math.cos(mid) < -0.3 ? 'right' : 'center')
      a0 = a1
    })
    return baseBuilt(el, ctx, { items, box, textual: true })
  }
  const max = el.max ?? Math.max(...values) * 1.1
  const left = box.x + 8
  const right = box.x + box.width - 8
  const bottom = box.y + box.height - fontSize * 1.7
  const top = box.y + fontSize * 1.5
  items.push(stroke(wobble(linePoints([left, top - fontSize * 0.5], [left, bottom]), rand, ctx.style.roughness), color, width, hand))
  items.push(stroke(wobble(linePoints([left, bottom], [right, bottom]), rand, ctx.style.roughness), color, width, hand))
  const slot = (right - left) / el.data.length
  const yOf = (v: number) => bottom - (v / max) * (bottom - top)
  if (el.kind === 'bar') {
    el.data.forEach((d, i) => {
      const bw = slot * 0.58
      const x = left + slot * i + (slot - bw) / 2
      const y = yOf(d.value)
      const pts = rectPoints(x, y, bw, Math.max(2, bottom - y), 0, rand, ctx.style.roughness * 0.6)
      items.push({ kind: 'fill', polygons: [pts], color: colors[i % colors.length], opacity: 0.4 })
      items.push(stroke(pts, color, width * 0.8, hand))
      label(fmt(d.value), x + bw / 2, y - 8, 'bottom')
      label(d.label, x + bw / 2, bottom + 10, 'top')
    })
  } else {
    const pts: Point[] = el.data.map((d, i) => [left + slot * (i + 0.5), yOf(d.value)])
    const path: Point[] = []
    for (let i = 1; i < pts.length; i++) path.push(...linePoints(pts[i - 1], pts[i]).slice(i > 1 ? 1 : 0))
    items.push(stroke(wobble(path.length ? path : pts, rand, ctx.style.roughness * 0.6), colors[0], width * 1.1, hand))
    el.data.forEach((d, i) => {
      items.push(stroke(ellipsePoints(pts[i][0], pts[i][1], 7, 7, rand, 0), colors[0], width, hand))
      label(fmt(d.value), pts[i][0], pts[i][1] - 14, 'bottom')
      label(d.label, pts[i][0], bottom + 10, 'top')
    })
  }
  return baseBuilt(el, ctx, { items, box, textual: true })
}

const buildHighlight = (el: HighlightEl, ctx: BuildContext): Built => {
  const built = baseBuilt(el, ctx, { items: [], box: { x: 0, y: 0, width: 0, height: 0 }, decorative: true })
  ctx.deferred.push(() => {
    const target = lookup(ctx, el.target, `highlight "${built.id}"`).box
    const rand = randFor(ctx, built.id)
    const color = el.color ?? (el.style === 'marker' ? '#ffd43b' : ctx.style.accent)
    const width = el.strokeWidth ?? ctx.style.strokeWidth * 1.2
    const hand = handFor(el, ctx)
    let pts: Point[]
    if (el.style === 'marker') {
      const y = target.y + target.height * 0.55
      pts = wobble(linePoints([target.x - 6, y], [target.x + target.width + 6, y]), rand, ctx.style.roughness * 0.5)
      built.items = [{ kind: 'stroke', points: pts, color, width: el.strokeWidth ?? target.height * 0.7, opacity: 0.55, hand, linecap: 'butt', blend: 'multiply' }]
    } else {
      if (el.style === 'underline') {
        const y = target.y + target.height + 10
        pts = wobble(linePoints([target.x - 8, y], [target.x + target.width + 8, y + 2], 0.02), rand, ctx.style.roughness)
      } else if (el.style === 'circle') {
        const [cx, cy] = center(target)
        pts = ellipsePoints(cx, cy, target.width / 2 + 34, target.height / 2 + 28, rand, ctx.style.roughness)
      } else {
        const b = inflate(target, 18)
        pts = rectPoints(b.x, b.y, b.width, b.height, 12, rand, ctx.style.roughness)
      }
      built.items = [stroke(pts, color, width, hand)]
    }
    built.box = boundsOf(pts)
  })
  return built
}

const translateBuilt = (b: Built, map: (p: Point) => Point, scale = 1) => {
  const mapAll = (pts: Point[]) => pts.map(map)
  b.items = b.items.map(item => {
    switch (item.kind) {
      case 'stroke':
        return { ...item, points: mapAll(item.points) }
      case 'glyph':
        return { ...item, contours: item.contours.map(mapAll), brush: item.brush * scale, fontSize: item.fontSize * scale }
      case 'fill':
        return { ...item, polygons: item.polygons.map(mapAll) }
      case 'image': {
        const [x, y] = map([item.x, item.y])
        return { ...item, x, y, width: item.width * scale, height: item.height * scale }
      }
    }
  })
  const [x0, y0] = map([b.box.x, b.box.y])
  b.box = { x: x0, y: y0, width: b.box.width * scale, height: b.box.height * scale }
}

const buildGroup = (el: Group, ctx: BuildContext): Built[] => {
  const children = el.children.map((child, i) => {
    const anim = child.animation ?? {}
    const merged = {
      ...child,
      hand: child.hand ?? el.hand,
      exit: child.exit ?? el.exit,
      animation: {
        ...anim,
        type: anim.type ?? el.animation?.type,
        ...(i === 0 && el.animation && anim.start === undefined
          ? { start: el.animation.start, delay: el.animation.delay, cue: el.animation.cue }
          : {})
      }
    } as Element
    return buildElement(merged, ctx)
  })
  const flat = children.flat()
  const scale = el.scale ?? 1
  if (el.layout) {
    const tops = children.map(c => c[0]).filter(c => c.box.width > 0 || c.box.height > 0)
    const boxes = children.map(c => unionBoxes(c.filter(b => b.box.width > 0 || b.box.height > 0).map(b => b.box)))
    const row = el.layout.type === 'row'
    const total =
      boxes.reduce((s, b) => s + (row ? b.width : b.height), 0) * scale + el.layout.gap * Math.max(0, tops.length - 1)
    const cross = Math.max(...boxes.map(b => (row ? b.height : b.width))) * scale
    const pos = resolvePosition(el, ctx)
    const area = anchorBox(pos.x, pos.y, row ? total : cross, row ? cross : total, pos.anchor)
    let cursor = row ? area.x : area.y
    children.forEach((group, i) => {
      const b = boxes[i]
      if (!b.width && !b.height) return
      const tx = row ? cursor : area.x + (cross - b.width * scale) / 2
      const ty = row ? area.y + (cross - b.height * scale) / 2 : cursor
      for (const built of group) translateBuilt(built, ([x, y]) => [tx + (x - b.x) * scale, ty + (y - b.y) * scale], scale)
      cursor += (row ? b.width : b.height) * scale + el.layout!.gap
    })
  } else if (el.x !== undefined || el.y !== undefined || scale !== 1) {
    const ox = el.x ?? 0
    const oy = el.y ?? 0
    for (const built of flat) translateBuilt(built, ([x, y]) => [ox + x * scale, oy + y * scale], scale)
  }
  return flat
}

/** Builds one storyboard element (flowcharts and groups expand to several). */
export const buildElement = (el: Element, ctx: BuildContext): Built[] => {
  let result: Built[]
  switch (el.type) {
    case 'text':
      result = [buildText(el, ctx)]
      break
    case 'line':
    case 'arrow':
      result = [buildLine(el, ctx)]
      break
    case 'rect':
      result = [buildRect(el, ctx)]
      break
    case 'circle':
    case 'ellipse':
      result = [buildCircle(el, ctx)]
      break
    case 'icon':
      result = [buildIcon(el, ctx)]
      break
    case 'svg':
      result = [buildSvg(el, ctx)]
      break
    case 'image':
      result = [buildImage(el, ctx)]
      break
    case 'node':
      result = [buildNode(el, ctx)]
      break
    case 'connector':
      result = [buildConnector(el, ctx)]
      break
    case 'highlight':
      result = [buildHighlight(el, ctx)]
      break
    case 'chart':
      result = [buildChart(el, ctx)]
      break
    case 'flowchart': {
      result = expandFlowchart(el, ctx).flatMap(child => buildElement(child, ctx))
      if (el.id) {
        const box = unionBoxes(result.filter(b => !b.decorative).map(b => b.box))
        ctx.registry.set(el.id, { ...result[0], id: el.id, box, shape: 'rect' })
      }
      return result
    }
    case 'group': {
      result = buildGroup(el, ctx)
      if (el.id) {
        const id = el.id
        const register = () =>
          ctx.registry.set(id, {
            ...result[0],
            id,
            box: unionBoxes(result.filter(b => b.box.width || b.box.height).map(b => b.box)),
            shape: 'rect'
          })
        register()
        ctx.deferred.push(register)
      }
      return result
    }
  }
  for (const b of result) {
    if (ctx.registry.has(b.id) && el.id) ctx.warnings.push(`${ctx.sceneId}: duplicate element id "${b.id}"`)
    ctx.registry.set(b.id, b)
  }
  return result
}
