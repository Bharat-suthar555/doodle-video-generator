import { readFileSync, statSync } from 'node:fs'
import type { Point } from '../core/geometry.ts'
import { UserError } from '../core/errors.ts'
import { parsePath, type Subpath } from './path-parse.ts'

// Imports only the geometry of an SVG file: path, line, polyline, polygon,
// rect, circle and ellipse outlines. Scripts, styles, images, links and
// external references are ignored, and the file is never embedded.

type Matrix = [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
]

const parseTransform = (value: string | undefined): Matrix => {
  if (!value) return identity
  let m = identity
  for (const [, fn, args] of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number)
    let n: Matrix = identity
    if (fn === 'matrix' && a.length === 6) n = a as Matrix
    else if (fn === 'translate') n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
    else if (fn === 'scale') n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]
    else if (fn === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0]
      n = multiply(
        multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
        [1, 0, 0, 1, -cx, -cy]
      )
    }
    m = multiply(m, n)
  }
  return m
}

const attrs = (tag: string) => {
  const out: Record<string, string> = {}
  for (const [, k, v1, v2] of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    out[k] = v1 ?? v2
  return out
}

const shapeToPath = (name: string, a: Record<string, string>): string | null => {
  const n = (k: string, d = 0) => (a[k] !== undefined ? Number.parseFloat(a[k]) : d)
  switch (name) {
    case 'path':
      return a.d ?? null
    case 'line':
      return `M${n('x1')} ${n('y1')} L${n('x2')} ${n('y2')}`
    case 'polyline':
    case 'polygon': {
      const nums = (a.points ?? '').split(/[\s,]+/).filter(Boolean)
      if (nums.length < 4) return null
      return `M${nums.slice(0, 2).join(' ')} L${nums.slice(2).join(' ')}${name === 'polygon' ? ' Z' : ''}`
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
      return `M${x} ${y} H${x + w} V${y + h} H${x} Z`
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n('cx'), n('cy')]
      const rx = name === 'circle' ? n('r') : n('rx')
      const ry = name === 'circle' ? n('r') : n('ry')
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`
    }
  }
  return null
}

export interface ImportedSvg {
  subpaths: Subpath[]
  viewBox: [number, number, number, number]
}

const skipped = new Set(['script', 'style', 'defs', 'clipPath', 'mask', 'pattern', 'symbol', 'foreignObject', 'metadata', 'title', 'desc'])

export const parseSvgGeometry = (text: string): ImportedSvg => {
  const subpaths: Subpath[] = []
  const stack: Matrix[] = [identity]
  let skipDepth = 0
  let viewBox: [number, number, number, number] | undefined
  for (const [tag, closing, name, , selfClosing] of text.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g)) {
    if (closing) {
      if (skipDepth > 0) skipDepth--
      else if (name === 'g' || name === 'svg') stack.pop()
      continue
    }
    if (skipDepth > 0 || skipped.has(name)) {
      if (!selfClosing) skipDepth++
      continue
    }
    const a = attrs(tag)
    if (name === 'svg' && !viewBox) {
      const vb = (a.viewBox ?? '').split(/[\s,]+/).map(Number)
      viewBox =
        vb.length === 4 && vb.every(Number.isFinite)
          ? (vb as [number, number, number, number])
          : [0, 0, Number.parseFloat(a.width ?? '100'), Number.parseFloat(a.height ?? '100')]
    }
    const m = multiply(stack[stack.length - 1], parseTransform(a.transform))
    if (name === 'g' || name === 'svg') {
      if (!selfClosing) stack.push(m)
      continue
    }
    const d = shapeToPath(name, a)
    if (!d) continue
    for (const sp of parsePath(d)) {
      subpaths.push({
        closed: sp.closed,
        points: sp.points.map(([x, y]): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
      })
    }
  }
  return { subpaths, viewBox: viewBox ?? [0, 0, 100, 100] }
}

/** Reads an SVG file (max 2 MB) and returns its outlines. */
export const importSvgFile = (file: string): ImportedSvg => {
  let size: number
  try {
    size = statSync(file).size
  } catch {
    throw new UserError(`SVG file not found: ${file}`)
  }
  if (size > 2 * 1024 * 1024) throw new UserError(`SVG file is larger than 2 MB: ${file}`)
  const result = parseSvgGeometry(readFileSync(file, 'utf8'))
  if (!result.subpaths.length) throw new UserError(`No drawable outlines found in ${file}`)
  return result
}
