import { ease, lerp, progressAt, type EasingName } from '../core/easing.ts'
import { center, makePolyline, polylineToPath, unionBoxes, boundsOf, type Point } from '../core/geometry.ts'
import type { Scene, Storyboard } from '../storyboard/schema.ts'
import { frameSize } from '../storyboard/schema.ts'
import { baseHandScale } from '../drawing/hand.ts'
import { buildElement, safeArea, type BuildContext } from './build.ts'
import type {
  Built,
  CameraKeyResolved,
  CompiledItem,
  CompiledScene,
  Drawable,
  HandWindow,
  NarrationTiming,
  TimedLine
} from './types.ts'

const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

/** Seconds from scene start when `phrase` is spoken, or undefined if not found. */
export const cueTime = (
  phrase: string,
  narration: NarrationTiming | undefined
): { time: number; estimated: boolean } | undefined => {
  if (!narration?.text) return undefined
  if (narration.words?.length) {
    const target = phrase.split(/\s+/).map(normalizeWord).filter(Boolean)
    const words = narration.words.map(w => normalizeWord(w.word))
    for (let i = 0; i + target.length <= words.length; i++)
      if (target.every((t, k) => words[i + k] === t))
        return { time: narration.offset + narration.words[i].start, estimated: false }
  }
  const index = narration.text.toLowerCase().indexOf(phrase.toLowerCase())
  if (index < 0) return undefined
  return { time: narration.offset + (index / narration.text.length) * narration.duration, estimated: true }
}

const isInk = (type: string) => type === 'draw' || type === 'handwrite'

/** Raw item durations (seconds) before scaling to the element's duration. */
const rawDurations = (b: Built, sb: Storyboard) => {
  const { drawSpeed, writeSpeed } = sb.style
  const out: number[] = []
  let previous: string | undefined
  for (const item of b.items) {
    let d = 0
    if (item.kind === 'stroke') {
      d = Math.max(0.06, makePolyline(item.points).length / drawSpeed) + (previous === 'stroke' ? 0.05 : 0)
    } else if (item.kind === 'glyph') {
      const len = item.contours.reduce((s, c) => s + makePolyline(c).length, 0)
      const weight = Math.min(1.8, Math.max(0.5, Math.sqrt(len / (item.fontSize * 2.5))))
      d = weight / writeSpeed + (item.wordStart ? 0.6 / writeSpeed : 0) + (previous === 'glyph' ? 0.03 : 0)
    }
    if (item.kind !== 'fill') previous = item.kind
    out.push(d)
  }
  return out
}

const timedLine = (points: Point[], t0: number, t1: number): TimedLine => ({
  d: polylineToPath(points),
  line: makePolyline(points),
  t0,
  t1
})

/** Assigns start times and durations, then converts geometry to timed SVG items. */
const schedule = (built: Built[], sb: Storyboard, narration: NarrationTiming | undefined, warnings: string[], sceneId: string) => {
  let cursor = sb.style.startDelay
  let estimatedCues = false
  const drawables: Drawable[] = []
  built.forEach((b, index) => {
    const a = b.animation
    const raw = isInk(a.type) ? rawDurations(b, sb) : []
    const natural = isInk(a.type) ? Math.min(12, Math.max(0.3, raw.reduce((s, d) => s + d, 0))) : a.type === 'none' ? 0 : 0.6
    const duration = a.duration ?? natural
    let start: number
    if (a.start !== undefined) start = a.start
    else if (a.cue) {
      const cue = cueTime(a.cue, narration)
      if (cue) {
        start = cue.time
        estimatedCues ||= cue.estimated
      } else {
        warnings.push(`${sceneId}: cue "${a.cue}" for element "${b.id}" was not found in the narration`)
        start = cursor + (a.delay ?? sb.style.gap)
      }
    } else start = cursor + (a.delay ?? (index === 0 ? 0 : sb.style.gap))
    const items: CompiledItem[] = []
    const rawTotal = raw.reduce((s, d) => s + d, 0)
    const scale = rawTotal > 0 ? duration / rawTotal : 0
    let t = start
    const pendingFills: { index: number; item: Extract<Built['items'][number], { kind: 'fill' }> }[] = []
    b.items.forEach((item, i) => {
      const d = isInk(a.type) ? raw[i] * scale : 0
      const t0 = isInk(a.type) ? t : start
      const t1 = isInk(a.type) ? t + d : start
      if (item.kind === 'stroke') {
        items.push({
          kind: 'stroke',
          ...timedLine(item.points, t0, t1),
          color: item.color,
          width: item.width,
          opacity: item.opacity,
          hand: item.hand && isInk(a.type),
          linecap: item.linecap ?? 'round',
          blend: item.blend
        })
      } else if (item.kind === 'glyph') {
        const lengths = item.contours.map(c => makePolyline(c).length)
        const total = lengths.reduce((s, l) => s + l, 0) || 1
        // Keep 15% of the glyph's time for pen lifts between contours
        const lift = item.contours.length > 1 ? (d * 0.15) / (item.contours.length - 1) : 0
        const ink = d - lift * (item.contours.length - 1)
        let ct = t0
        const contours = item.contours.map((c, k) => {
          const cd = (ink * lengths[k]) / total
          const line = timedLine(c, ct, ct + cd)
          ct += cd + lift
          return line
        })
        items.push({
          kind: 'glyph',
          fillD: item.contours.map(c => polylineToPath(c, true)).join(''),
          contours,
          color: item.color,
          brush: item.brush,
          box: boundsOf(item.contours.flat()),
          t0,
          t1,
          hand: item.hand && isInk(a.type)
        })
      } else if (item.kind === 'fill') {
        pendingFills.push({ index: items.length, item })
        items.push({ kind: 'fill', d: item.polygons.map(p => polylineToPath(p, true)).join(''), color: item.color, opacity: item.opacity, t0: start, t1: start })
      } else items.push({ ...item })
      t += d
    })
    // A fill fades in once the outline drawn right after it is complete
    for (const { index: fi } of pendingFills) {
      const next = items.slice(fi + 1).find(it => it.kind === 'stroke') ?? items.find(it => it.kind === 'stroke')
      const fill = items[fi] as Extract<CompiledItem, { kind: 'fill' }>
      if (isInk(a.type) && next && next.kind === 'stroke') {
        fill.t0 = next.t1
        fill.t1 = next.t1 + 0.35
      }
    }
    const end = start + duration
    cursor = Math.max(cursor, end)
    drawables.push({
      id: b.id,
      type: b.type,
      box: b.box,
      items,
      anim: {
        type: a.type,
        start,
        duration,
        easing: (a.easing ?? (a.type === 'scale' ? 'easeOutBack' : 'easeInOut')) as EasingName,
        from: a.from
      },
      exit: b.exit,
      opacity: b.opacity,
      textual: b.textual,
      decorative: b.decorative
    })
  })
  const contentEnd = drawables.reduce((m, d) => Math.max(m, d.anim.start + d.anim.duration, ...d.items.map(i => ('t1' in i ? i.t1 : 0))), 0)
  return { drawables, contentEnd, estimatedCues }
}

const resolveCamera = (scene: Scene, registry: Map<string, Built>, design: { width: number; height: number }, narration: NarrationTiming | undefined, warnings: string[]) => {
  const keys: CameraKeyResolved[] = []
  let estimated = false
  let previousCenter: Point = [design.width / 2, design.height / 2]
  for (const k of scene.camera) {
    let at = k.at
    if (at === undefined && k.cue) {
      const cue = cueTime(k.cue, narration)
      if (cue) {
        at = cue.time
        estimated ||= cue.estimated
      } else warnings.push(`${scene.id}: camera cue "${k.cue}" was not found in the narration`)
    }
    if (at === undefined) {
      warnings.push(`${scene.id}: a camera keyframe needs "at" or a matching "cue"; it was skipped`)
      continue
    }
    let c = k.center ?? previousCenter
    let zoom = k.zoom ?? 1
    if (k.focus) {
      const target = registry.get(k.focus)
      if (!target) warnings.push(`${scene.id}: camera focus "${k.focus}" is not an element id`)
      else {
        c = center(target.box)
        if (k.zoom === undefined)
          zoom = Math.min(2.5, Math.max(1, Math.min(design.width / (target.box.width * 1.5), design.height / (target.box.height * 1.6))))
      }
    }
    keys.push({ at, duration: k.duration, zoom, center: c, easing: k.easing })
    previousCenter = c
  }
  keys.sort((a, b) => a.at - b.at)
  return { keys, estimated }
}

export interface CameraState {
  zoom: number
  cx: number
  cy: number
}

/** Camera position at time t; the viewport stays inside the board when zoomed in. */
export const cameraAt = (keys: CameraKeyResolved[], t: number, width: number, height: number): CameraState => {
  let state: CameraState = { zoom: 1, cx: width / 2, cy: height / 2 }
  for (const k of keys) {
    if (t <= k.at) break
    const p = ease(k.easing, progressAt(t, k.at, k.duration))
    state = { zoom: lerp(state.zoom, k.zoom, p), cx: lerp(state.cx, k.center[0], p), cy: lerp(state.cy, k.center[1], p) }
    if (p < 1) break
  }
  if (state.zoom >= 1) {
    const hw = width / (2 * state.zoom)
    const hh = height / (2 * state.zoom)
    state.cx = Math.min(Math.max(state.cx, hw), width - hw)
    state.cy = Math.min(Math.max(state.cy, hh), height - hh)
  }
  return state
}

export const toScreen = (cam: CameraState, p: Point, width: number, height: number): Point => [
  (p[0] - cam.cx) * cam.zoom + width / 2,
  (p[1] - cam.cy) * cam.zoom + height / 2
]

const handWindows = (drawables: Drawable[]): HandWindow[] => {
  const windows: HandWindow[] = []
  for (const d of drawables)
    for (const item of d.items) {
      if (item.kind === 'stroke' && item.hand && item.t1 > item.t0) windows.push({ t0: item.t0, t1: item.t1, line: item.line })
      if (item.kind === 'glyph' && item.hand)
        for (const c of item.contours) if (c.t1 > c.t0) windows.push({ t0: c.t0, t1: c.t1, line: c.line })
    }
  return windows.sort((a, b) => a.t0 - b.t0)
}

export interface CompileOptions {
  baseDir: string
  narration?: NarrationTiming
}

/** Compiles one whiteboard scene into timed drawables, camera keys and hand windows. */
export const compileScene = (sb: Storyboard, scene: Scene, options: CompileOptions): CompiledScene => {
  const { designWidth, designHeight } = frameSize(sb)
  const design = { width: designWidth, height: designHeight }
  const warnings: string[] = []
  const ctx: BuildContext = {
    style: sb.style,
    design,
    safe: safeArea(designWidth, designHeight),
    baseDir: options.baseDir,
    sceneId: scene.id,
    registry: new Map(),
    deferred: [],
    warnings,
    autoId: 0
  }
  const built = scene.elements.flatMap(el => buildElement(el, ctx))
  for (const fn of ctx.deferred) fn()
  const { drawables, contentEnd, estimatedCues } = schedule(built, sb, options.narration, warnings, scene.id)
  const camera = resolveCamera(scene, ctx.registry, design, options.narration, warnings)
  return {
    id: scene.id,
    designWidth,
    designHeight,
    background: scene.background ?? sb.style.background,
    drawables,
    camera: camera.keys,
    handWindows: sb.style.hand.enabled ? handWindows(drawables) : [],
    handScale: baseHandScale * sb.style.hand.scale * (Math.min(designWidth, designHeight) / 1080),
    contentEnd,
    warnings,
    estimatedCues: estimatedCues || camera.estimated
  }
}

/** Union of every drawable's box, for layout checks. */
export const contentBounds = (scene: CompiledScene) => unionBoxes(scene.drawables.map(d => d.box))
