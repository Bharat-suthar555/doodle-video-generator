export type Point = [number, number]

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A polyline stroke with cumulative lengths for constant-speed sampling. */
export interface Polyline {
  points: Point[]
  cumulative: number[]
  length: number
}

export const makePolyline = (points: Point[]): Polyline => {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    cumulative.push(cumulative[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] }
}

/** Point at fraction `f` (0..1) of the polyline's length. */
export const pointAt = (line: Polyline, f: number): Point => {
  const { points, cumulative, length } = line
  if (points.length === 1 || length === 0) return points[0]
  const target = Math.min(Math.max(f, 0), 1) * length
  let lo = 0
  let hi = cumulative.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] <= target) lo = mid
    else hi = mid
  }
  const span = cumulative[hi] - cumulative[lo]
  const k = span === 0 ? 0 : (target - cumulative[lo]) / span
  const [x0, y0] = points[lo]
  const [x1, y1] = points[hi]
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()

/** SVG path data for a polyline. */
export const polylineToPath = (points: Point[], closed = false) => {
  if (points.length === 0) return ''
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  for (let i = 1; i < points.length; i++) d += `L${fmt(points[i][0])} ${fmt(points[i][1])}`
  return closed ? `${d}Z` : d
}

export const boundsOf = (points: Point[]): Box => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export const unionBoxes = (boxes: Box[]): Box => {
  const pts: Point[] = boxes.flatMap(b => [
    [b.x, b.y] as Point,
    [b.x + b.width, b.y + b.height] as Point
  ])
  return boundsOf(pts)
}

export const inflate = (b: Box, by: number): Box => ({
  x: b.x - by,
  y: b.y - by,
  width: b.width + by * 2,
  height: b.height + by * 2
})

/** Area of the intersection of two boxes (0 when they don't overlap). */
export const overlapArea = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export const center = (b: Box): Point => [b.x + b.width / 2, b.y + b.height / 2]

/** Where the ray from the box center toward `toward` leaves the box edge. */
export const boxEdgePoint = (b: Box, toward: Point, pad = 0): Point => {
  const [cx, cy] = center(b)
  const dx = toward[0] - cx
  const dy = toward[1] - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const hw = b.width / 2 + pad
  const hh = b.height / 2 + pad
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh)
  return [cx + dx * scale, cy + dy * scale]
}

/** Where the ray from the ellipse center toward `toward` crosses the ellipse. */
export const ellipseEdgePoint = (b: Box, toward: Point, pad = 0): Point => {
  const [cx, cy] = center(b)
  const dx = toward[0] - cx
  const dy = toward[1] - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const rx = b.width / 2 + pad
  const ry = b.height / 2 + pad
  const k = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
  return [cx + dx * k, cy + dy * k]
}

/** Edge point of a diamond (rhombus) inscribed in the box. */
export const diamondEdgePoint = (b: Box, toward: Point, pad = 0): Point => {
  const [cx, cy] = center(b)
  const dx = toward[0] - cx
  const dy = toward[1] - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const hw = b.width / 2 + pad
  const hh = b.height / 2 + pad
  const k = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
  return [cx + dx * k, cy + dy * k]
}

/** Flattens a quadratic Bezier into points (excluding the start point). */
export const flattenQuad = (p0: Point, p1: Point, p2: Point, tolerance = 0.6): Point[] => {
  const approx = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
  const steps = Math.max(2, Math.min(64, Math.ceil(Math.sqrt(approx / tolerance))))
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    out.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
    ])
  }
  return out
}

/** Flattens a cubic Bezier into points (excluding the start point). */
export const flattenCubic = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance = 0.6
): Point[] => {
  const approx =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
    Math.hypot(p3[0] - p2[0], p3[1] - p2[1])
  const steps = Math.max(2, Math.min(96, Math.ceil(Math.sqrt(approx / tolerance))))
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    const a = mt * mt * mt
    const b = 3 * mt * mt * t
    const c = 3 * mt * t * t
    const d = t * t * t
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
    ])
  }
  return out
}
