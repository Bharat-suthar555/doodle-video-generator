import type { Caption } from './segment.ts'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

export const srtTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000))
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

export const toSrt = (captions: Caption[]) =>
  captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join('\n')}\n`).join('\n')

export interface SrtEntry {
  index: number
  start: number
  end: number
  lines: string[]
}

const parseTime = (s: string) => {
  const m = s.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!m) return NaN
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000
}

/** Parses SRT text. Malformed blocks are reported, not silently dropped. */
export const parseSrt = (text: string): { entries: SrtEntry[]; errors: string[] } => {
  const entries: SrtEntry[] = []
  const errors: string[] = []
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  blocks.forEach((block, i) => {
    const lines = block.split('\n')
    const timeLine = lines.findIndex(l => l.includes('-->'))
    if (timeLine < 0) {
      errors.push(`block ${i + 1} has no timing line`)
      return
    }
    const [a, b] = lines[timeLine].split('-->')
    const start = parseTime(a)
    const end = parseTime(b.trim().split(/\s+/)[0])
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push(`block ${i + 1} has an invalid timing line: ${lines[timeLine]}`)
      return
    }
    entries.push({ index: Number(lines[0]) || i + 1, start, end, lines: lines.slice(timeLine + 1) })
  })
  return { entries, errors }
}

const assTime = (seconds: number) => {
  const cs = Math.max(0, Math.round(seconds * 100))
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`
}

/** ASS color: &HAABBGGRR with alpha 00 = opaque. */
const assColor = (hex: string, opacity = 1) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6)
  const alpha = Math.round((1 - opacity) * 255)
  return `&H${alpha.toString(16).padStart(2, "0")}${full.slice(4, 6)}${full.slice(2, 4)}${full.slice(0, 2)}`.toUpperCase()
}

export interface AssStyle {
  width: number
  height: number
  fontSize: number
  color: string
  boxColor: string
  boxOpacity: number
  position: 'bottom' | 'top'
  marginV: number
}

/** ASS subtitles with an opaque box behind each line, rendered by libass at burn-in. */
export const toAss = (captions: Caption[], s: AssStyle) => {
  const align = s.position === 'top' ? 8 : 2
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${s.width}`,
    `PlayResY: ${s.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Lato,${Math.round(s.fontSize)},${assColor(s.color)},${assColor(s.color)},${assColor(s.boxColor, s.boxOpacity)},${assColor(s.boxColor, s.boxOpacity)},-1,0,0,0,100,100,0,0,3,${Math.round(s.fontSize * 0.28)},0,${align},${Math.round(s.width * 0.08)},${Math.round(s.width * 0.08)},${Math.round(s.marginV)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const events = captions.map(
    c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.lines.map(l => l.replace(/[{}\\]/g, '')).join('\\N')}`
  )
  return `${[...header, ...events].join('\n')}\n`
}
