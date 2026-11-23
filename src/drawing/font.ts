import { readFileSync } from 'node:fs'
import opentype, { type Font, type PathCommand } from 'opentype.js'
import { assetPath } from '../core/paths.ts'
import {
  flattenCubic,
  flattenQuad,
  type Box,
  type Point
} from '../core/geometry.ts'

export type FontName = 'hand' | 'sans' | 'sans-bold'

const fontFiles: Record<FontName, string> = {
  hand: 'PatrickHand-Regular.ttf',
  sans: 'Lato-Regular.ttf',
  'sans-bold': 'Lato-Bold.ttf'
}

/** Width of the reveal brush, as a fraction of font size, per font. */
export const revealBrush: Record<FontName, number> = {
  hand: 0.2,
  sans: 0.2,
  'sans-bold': 0.26
}

const cache = new Map<FontName, Font>()

export const loadFont = (name: FontName): Font => {
  let font = cache.get(name)
  if (!font) {
    const buf = readFileSync(assetPath('fonts', fontFiles[name]))
    font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    cache.set(name, font)
  }
  return font
}

export interface GlyphShape {
  /** Filled outline, as SVG path data. */
  fillD: string
  /** Outline contours flattened to points, in drawing order. */
  contours: Point[][]
  char: string
  /** True for the first glyph of a word after the first word on a line. */
  wordStart: boolean
}

export interface TextLayout {
  glyphs: GlyphShape[]
  lines: string[]
  box: Box
  fontSize: number
  /** Characters that need writing time (spaces excluded). */
  inkChars: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

const commandsToShape = (commands: PathCommand[], char: string): GlyphShape | null => {
  const contours: Point[][] = []
  let d = ''
  let current: Point[] = []
  let pos: Point = [0, 0]
  let startPt: Point = [0, 0]
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        if (current.length > 1) contours.push(current)
        pos = [c.x, c.y]
        startPt = pos
        current = [pos]
        d += `M${r1(c.x)} ${r1(c.y)}`
        break
      case 'L':
        pos = [c.x, c.y]
        current.push(pos)
        d += `L${r1(c.x)} ${r1(c.y)}`
        break
      case 'Q':
        current.push(...flattenQuad(pos, [c.x1, c.y1], [c.x, c.y]))
        pos = [c.x, c.y]
        d += `Q${r1(c.x1)} ${r1(c.y1)} ${r1(c.x)} ${r1(c.y)}`
        break
      case 'C':
        current.push(...flattenCubic(pos, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]))
        pos = [c.x, c.y]
        d += `C${r1(c.x1)} ${r1(c.y1)} ${r1(c.x2)} ${r1(c.y2)} ${r1(c.x)} ${r1(c.y)}`
        break
      case 'Z':
        current.push(startPt)
        pos = startPt
        d += 'Z'
        break
    }
  }
  if (current.length > 1) contours.push(current)
  if (!contours.length) return null
  return { fillD: d, contours, char, wordStart: false }
}

/** Splits text into lines that fit `maxWidth`, honoring explicit newlines. */
export const wrapText = (font: Font, text: string, fontSize: number, maxWidth?: number) => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!maxWidth) {
      lines.push(paragraph)
      continue
    }
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && font.getAdvanceWidth(candidate, fontSize) > maxWidth) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    lines.push(line)
  }
  return lines
}

export type Anchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/** Top-left corner of a box of the given size whose `anchor` point sits at (x, y). */
export const anchorBox = (x: number, y: number, width: number, height: number, anchor: Anchor): Box => {
  const hx = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5
  const vy = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5
  return { x: x - width * hx, y: y - height * vy, width, height }
}

export interface TextOptions {
  text: string
  font: FontName
  fontSize: number
  x: number
  y: number
  anchor: Anchor
  align: 'left' | 'center' | 'right'
  maxWidth?: number
  lineHeight: number
}

/** Measures text without building glyph outlines. */
export const measureText = (o: Omit<TextOptions, 'x' | 'y' | 'anchor' | 'align'>) => {
  const font = loadFont(o.font)
  const lines = wrapText(font, o.text, o.fontSize, o.maxWidth)
  const width = Math.max(...lines.map(l => font.getAdvanceWidth(l, o.fontSize)), 0)
  const em = (font.ascender - font.descender) / font.unitsPerEm
  const height = (lines.length - 1) * o.lineHeight * o.fontSize + em * o.fontSize
  return { lines, width, height }
}

/** Lays out text as glyph outlines positioned on the board. */
export const layoutText = (o: TextOptions): TextLayout => {
  const font = loadFont(o.font)
  const { lines, width, height } = measureText(o)
  const box = anchorBox(o.x, o.y, width, height, o.anchor)
  const ascent = (font.ascender / font.unitsPerEm) * o.fontSize
  const glyphs: GlyphShape[] = []
  let inkChars = 0
  lines.forEach((line, i) => {
    const lineWidth = font.getAdvanceWidth(line, o.fontSize)
    const offset =
      o.align === 'left' ? 0 : o.align === 'right' ? width - lineWidth : (width - lineWidth) / 2
    const baseline = box.y + ascent + i * o.lineHeight * o.fontSize
    const chars = [...line]
    let index = 0
    let afterSpace = false
    font.forEachGlyph(line, box.x + offset, baseline, o.fontSize, {}, (glyph, gx, gy, size) => {
      const char = chars[index++] ?? ''
      const shape = commandsToShape(glyph.getPath(gx, gy, size).commands, char)
      if (shape) {
        shape.wordStart = afterSpace
        afterSpace = false
        glyphs.push(shape)
        inkChars++
      } else if (/\s/.test(char)) afterSpace = true
    })
  })
  return { glyphs, lines, box, fontSize: o.fontSize, inkChars }
}
