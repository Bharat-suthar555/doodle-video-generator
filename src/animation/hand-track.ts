import { ease, lerp } from '../core/easing.ts'
import { pointAt, type Point } from '../core/geometry.ts'
import { cameraAt, toScreen } from './compile.ts'
import type { CompiledScene, HandWindow } from './types.ts'

const travelLimit = 0.8

/** Seconds to swoop on or off screen: longer for longer distances, 0.3 to 0.6s. */
const swoop = (a: Point, b: Point) => Math.min(0.6, Math.max(0.3, Math.hypot(b[0] - a[0], b[1] - a[1]) / 3000))

const lastStartedBefore = (windows: HandWindow[], t: number) => {
  let lo = 0
  let hi = windows.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (windows[mid].t0 <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Unsmoothed marker-tip position in screen (design) units, or null when hidden. */
const rawTip = (scene: CompiledScene, t: number): Point | null => {
  const w = scene.handWindows
  if (!w.length) return null
  const W = scene.designWidth
  const H = scene.designHeight
  const screen = (p: Point, at: number) => toScreen(cameraAt(scene.camera, at, W, H), p, W, H)
  const offscreen: Point = [W * 1.05, H * 1.35]
  const i = lastStartedBefore(w, t)
  if (i >= 0 && t <= w[i].t1) return screen(pointAt(w[i].line, (t - w[i].t0) / (w[i].t1 - w[i].t0)), t)
  const prev = i >= 0 ? w[i] : undefined
  const next = w[i + 1]
  const prevEnd = prev && screen(pointAt(prev.line, 1), prev.t1)
  const nextStart = next && screen(pointAt(next.line, 0), next.t0)
  if (prev && next && prevEnd && nextStart && next.t0 - prev.t1 <= travelLimit) {
    const p = ease('easeInOut', (t - prev.t1) / (next.t0 - prev.t1))
    return [lerp(prevEnd[0], nextStart[0], p), lerp(prevEnd[1], nextStart[1], p)]
  }
  if (prev && prevEnd && t - prev.t1 < swoop(prevEnd, offscreen)) {
    const p = ease('easeInOut', (t - prev.t1) / swoop(prevEnd, offscreen))
    return [lerp(prevEnd[0], offscreen[0], p), lerp(prevEnd[1], offscreen[1], p)]
  }
  if (next && nextStart && next.t0 - t < swoop(offscreen, nextStart)) {
    const p = ease('easeInOut', 1 - (next.t0 - t) / swoop(offscreen, nextStart))
    return [lerp(offscreen[0], nextStart[0], p), lerp(offscreen[1], nextStart[1], p)]
  }
  return null
}

/**
 * Smoothed tip position: a centered moving average over 50 ms. Rendering is
 * offline, so averaging future samples removes jitter without adding lag.
 */
export const handTip = (scene: CompiledScene, t: number): Point | null => {
  if (!rawTip(scene, t)) return null
  let x = 0
  let y = 0
  let n = 0
  for (let k = -2; k <= 2; k++) {
    const p = rawTip(scene, t + k * 0.0125)
    if (p) {
      x += p[0]
      y += p[1]
      n++
    }
  }
  return [x / n, y / n]
}
