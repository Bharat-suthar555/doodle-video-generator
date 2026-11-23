import type { Point } from '../core/geometry.ts'
import { signed, type Random } from '../core/random.ts'

// Hand-drawn primitives. Each returns point lists; small seeded wobble makes
// lines look marker-drawn while staying identical across renders.

/** Smooth low-frequency noise over t in [0, 1], amplitude about ±1. */
const smoothNoise = (rand: Random) => {
  const waves = [1, 2, 3].map(k => ({ k, a: signed(rand) / k, p: rand() * Math.PI * 2 }))
  return (t: number) => waves.reduce((sum, w) => sum + w.a * Math.sin(2 * Math.PI * w.k * t + w.p), 0) * 0.6
}

const samplesFor = (length: number) => Math.max(6, Math.min(240, Math.ceil(length / 12)))

/** Applies perpendicular wobble to a polyline, scaled by roughness. */
export const wobble = (points: Point[], rand: Random, roughness: number, closed = false): Point[] => {
  if (roughness <= 0 || points.length < 2) return points
  const noise = smoothNoise(rand)
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  const amp = roughness * Math.min(3.2, 0.6 + total * 0.004)
  let acc = 0
  return points.map((p, i) => {
    if (i > 0) acc += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    let nx = -(next[1] - prev[1])
    let ny = next[0] - prev[0]
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    const t = total ? acc / total : 0
    // Fade the wobble at open ends so endpoints land where they were asked to
    const fade = closed ? 1 : Math.min(1, t * 6, (1 - t) * 6)
    const off = noise(t) * amp * fade
    return [p[0] + nx * off, p[1] + ny * off]
  })
}

/** Straight or bent line from a to b. `curve` bends by that fraction of length. */
export const linePoints = (a: Point, b: Point, curve = 0): Point[] => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = samplesFor(length)
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  // Normal to the left of the direction a -> b (screen coordinates)
  const nx = length ? (a[1] - b[1]) / length : 0
  const ny = length ? (b[0] - a[0]) / length : 0
  const cx = mx + nx * curve * length
  const cy = my + ny * curve * length
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    pts.push([
      mt * mt * a[0] + 2 * mt * t * cx + t * t * b[0],
      mt * mt * a[1] + 2 * mt * t * cy + t * t * b[1]
    ])
  }
  return pts
}

/** Rectangle outline, optionally rounded, starting top-left and overshooting slightly. */
export const rectPoints = (
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  rand: Random,
  roughness: number
): Point[] => {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const pts: Point[] = []
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const n = samplesFor(Math.hypot(bx - ax, by - ay))
    for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n])
  }
  const corner = (cx: number, cy: number, from: number) => {
    if (r === 0) return
    for (let i = 0; i < 8; i++) {
      const a = from + (Math.PI / 2) * (i / 8)
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  edge(x + r, y, x + w - r, y)
  corner(x + w - r, y + r, -Math.PI / 2)
  edge(x + w, y + r, x + w, y + h - r)
  corner(x + w - r, y + h - r, 0)
  edge(x + w - r, y + h, x + r, y + h)
  corner(x + r, y + h - r, Math.PI / 2)
  edge(x, y + h - r, x, y + r)
  corner(x + r, y + r, Math.PI)
  pts.push([x + r, y])
  // A short overshoot past the start reads as a single marker stroke
  const over = Math.min(w * 0.08, 18) * (roughness > 0 ? 1 : 0)
  if (over > 0) pts.push([x + r + over, y + signed(rand) * roughness])
  return wobble(pts, rand, roughness, true)
}

/** Ellipse outline that starts at a random angle and overlaps its start a little. */
export const ellipsePoints = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rand: Random,
  roughness: number
): Point[] => {
  const start = -Math.PI / 2 + signed(rand) * 0.6
  const overlap = roughness > 0 ? 0.18 + rand() * 0.12 : 0
  const n = Math.max(24, Math.min(200, Math.ceil(((rx + ry) * Math.PI) / 10)))
  const noise = smoothNoise(rand)
  const amp = roughness * 0.025
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = start + t * (Math.PI * 2 + overlap)
    const k = 1 + noise(t) * amp
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  return pts
}

/** Diamond outline through the midpoints of the box edges. */
export const diamondPoints = (x: number, y: number, w: number, h: number, rand: Random, roughness: number): Point[] => {
  const top: Point = [x + w / 2, y]
  const right: Point = [x + w, y + h / 2]
  const bottom: Point = [x + w / 2, y + h]
  const left: Point = [x, y + h / 2]
  const pts = [
    ...linePoints(top, right).slice(0, -1),
    ...linePoints(right, bottom).slice(0, -1),
    ...linePoints(bottom, left).slice(0, -1),
    ...linePoints(left, top)
  ]
  return wobble(pts, rand, roughness, true)
}

/** An arrowhead as one stroke: wing, tip, wing. `dir` points along the arrow. */
export const arrowHeadPoints = (tip: Point, dir: Point, size: number): Point[] => {
  const len = Math.hypot(dir[0], dir[1]) || 1
  const ux = dir[0] / len
  const uy = dir[1] / len
  const spread = 0.5
  const wing = (sign: number): Point => {
    const c = Math.cos(Math.PI - spread * sign)
    const s = Math.sin(Math.PI - spread * sign)
    return [tip[0] + (ux * c - uy * s) * size, tip[1] + (ux * s + uy * c) * size]
  }
  return [wing(1), tip, wing(-1)]
}

/** Splits a polyline into dashes of the given length with equal gaps. */
export const dashPolyline = (points: Point[], dash: number): Point[][] => {
  const out: Point[][] = []
  let current: Point[] = [points[0]]
  let drawing = true
  let left = dash
  for (let i = 1; i < points.length; i++) {
    let [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    let seg = Math.hypot(x1 - x0, y1 - y0)
    while (seg > left) {
      const k = left / seg
      const px = x0 + (x1 - x0) * k
      const py = y0 + (y1 - y0) * k
      if (drawing) {
        current.push([px, py])
        out.push(current)
      }
      current = [[px, py]]
      drawing = !drawing
      seg -= left
      x0 = px
      y0 = py
      left = dash
    }
    left -= seg
    if (drawing) current.push([x1, y1])
  }
  if (drawing && current.length > 1) out.push(current)
  return out
}
