import { flattenCubic, flattenQuad, type Point } from '../core/geometry.ts'

export interface Subpath {
  points: Point[]
  closed: boolean
}

const tokenRe = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g

/** Converts an SVG arc segment to cubic Bezier segments (SVG spec F.6). */
const arcToCubics = (
  p0: Point,
  rxIn: number,
  ryIn: number,
  angle: number,
  largeArc: boolean,
  sweep: boolean,
  p1: Point
): [Point, Point, Point][] => {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return [[p0, p1, p1]]
  const phi = (angle * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (p0[0] - p1[0]) / 2
  const dy = (p0[1] - p1[1]) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const theta1 = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2))
  const step = delta / segments
  const k = (4 / 3) * Math.tan(step / 4)
  const out: [Point, Point, Point][] = []
  let t = theta1
  const map = (x: number, y: number): Point => [cos * rx * x - sin * ry * y + cx, sin * rx * x + cos * ry * y + cy]
  for (let i = 0; i < segments; i++) {
    const c1 = Math.cos(t)
    const s1 = Math.sin(t)
    const c2 = Math.cos(t + step)
    const s2 = Math.sin(t + step)
    out.push([map(c1 - k * s1, s1 + k * c1), map(c2 + k * s2, s2 - k * c2), map(c2, s2)])
    t += step
  }
  return out
}

/** Parses SVG path data into flattened subpaths. Unknown input is skipped, never evaluated. */
export const parsePath = (d: string, tolerance = 0.5): Subpath[] => {
  const tokens = [...d.matchAll(tokenRe)].map(m => m[0])
  const out: Subpath[] = []
  let current: Point[] = []
  let pos: Point = [0, 0]
  let start: Point = [0, 0]
  let lastCtrl: Point | null = null
  let lastCmd = ''
  let i = 0
  let cmd = ''
  const num = () => Number(tokens[i++])
  const hasNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i])
  const flush = (closed: boolean) => {
    if (current.length > 1) out.push({ points: current, closed })
    current = []
  }
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    else if (!cmd) {
      i++
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? pos[0] : 0
    const oy = rel ? pos[1] : 0
    if (C === 'Z') {
      if (current.length) current.push(start)
      flush(true)
      pos = start
      lastCtrl = null
      lastCmd = 'Z'
      continue
    }
    if (!hasNum()) {
      i++
      continue
    }
    if (C === 'M') {
      flush(false)
      pos = [ox + num(), oy + num()]
      start = pos
      current = [pos]
      cmd = rel ? 'l' : 'L'
      lastCtrl = null
    } else if (C === 'L') {
      pos = [ox + num(), oy + num()]
      current.push(pos)
      lastCtrl = null
    } else if (C === 'H') {
      pos = [ox + num(), pos[1]]
      current.push(pos)
      lastCtrl = null
    } else if (C === 'V') {
      pos = [pos[0], oy + num()]
      current.push(pos)
      lastCtrl = null
    } else if (C === 'C' || C === 'S') {
      let c1: Point
      if (C === 'C') c1 = [ox + num(), oy + num()]
      else
        c1 =
          lastCtrl && /[CS]/.test(lastCmd.toUpperCase())
            ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]]
            : pos
      const c2: Point = [ox + num(), oy + num()]
      const end: Point = [ox + num(), oy + num()]
      if (!current.length) current = [pos]
      current.push(...flattenCubic(pos, c1, c2, end, tolerance))
      lastCtrl = c2
      pos = end
    } else if (C === 'Q' || C === 'T') {
      let c1: Point
      if (C === 'Q') c1 = [ox + num(), oy + num()]
      else
        c1 =
          lastCtrl && /[QT]/.test(lastCmd.toUpperCase())
            ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]]
            : pos
      const end: Point = [ox + num(), oy + num()]
      if (!current.length) current = [pos]
      current.push(...flattenQuad(pos, c1, end, tolerance))
      lastCtrl = c1
      pos = end
    } else if (C === 'A') {
      const rx = num()
      const ry = num()
      const rot = num()
      const large = num() !== 0
      const sweep = num() !== 0
      const end: Point = [ox + num(), oy + num()]
      if (!current.length) current = [pos]
      for (const [c1, c2, e] of arcToCubics(pos, rx, ry, rot, large, sweep, end))
        current.push(...flattenCubic(current[current.length - 1], c1, c2, e, tolerance))
      lastCtrl = null
      pos = end
    } else {
      i++
    }
    lastCmd = cmd
  }
  flush(false)
  return out
}
