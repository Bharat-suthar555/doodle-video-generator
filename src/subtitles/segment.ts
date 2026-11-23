import type { WordTiming } from '../timeline/plan.ts'

export interface Caption {
  start: number
  end: number
  lines: string[]
  /** True when timing came from proportional estimates, not word timestamps. */
  estimated: boolean
}

export interface SegmentOptions {
  maxLines: number
  maxCharsPerLine: number
  minDuration: number
}

export interface NarrationSpan {
  text: string
  /** Absolute start of speech in the video, seconds. */
  start: number
  duration: number
  /** Word timestamps relative to `start`. */
  words?: WordTiming[]
  estimated: boolean
}

// Words that read badly at the end of a caption line
const weakEnds = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'is', 'are', 'your', 'our', 'their', 'its', 'this', 'that', 'but', 'if', 'so'])

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

export const splitSentences = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[^\s])/)
    .filter(Boolean)

/** Cost of breaking after word index i (lower is better). */
const breakCost = (words: string[], i: number) => {
  const w = words[i]
  let cost = 0
  if (/[,;:]$/.test(w)) cost -= 4
  if (weakEnds.has(w.toLowerCase().replace(/[^a-z']/g, ''))) cost += 6
  return cost
}

/** Splits text into one or more lines no longer than max, balanced and avoiding weak line ends. */
export const wrapLines = (text: string, maxChars: number, maxLines: number): string[] => {
  const words = text.split(' ').filter(Boolean)
  if (text.length <= maxChars || words.length < 2 || maxLines < 2) return [text]
  let best: { lines: string[]; score: number } | undefined
  for (let i = 0; i < words.length - 1; i++) {
    const a = words.slice(0, i + 1).join(' ')
    const b = words.slice(i + 1).join(' ')
    const rest = maxLines > 2 && b.length > maxChars ? wrapLines(b, maxChars, maxLines - 1) : [b]
    const lines = [a, ...rest]
    const over = lines.reduce((s, l) => s + Math.max(0, l.length - maxChars), 0)
    const score = over * 100 + Math.abs(a.length - b.length) * 0.5 + breakCost(words, i)
    if (!best || score < best.score) best = { lines, score }
  }
  return best!.lines
}

/** Splits a sentence into caption-sized chunks, preferring breaks after punctuation. */
export const chunkSentence = (sentence: string, capacity: number): string[] => {
  if (sentence.length <= capacity) return [sentence]
  const chunks: string[][] = [[]]
  const len = (c: string[]) => c.join(' ').length
  for (const word of sentence.split(' ')) {
    let current = chunks[chunks.length - 1]
    if (current.length && len(current) + 1 + word.length > capacity) {
      current = [word]
      chunks.push(current)
    } else current.push(word)
    if (/[,;:]$/.test(word) && len(current) >= capacity * 0.55) chunks.push([])
  }
  const out = chunks.filter(c => c.length)
  for (let i = 0; i < out.length - 1; i++) {
    // Move a weak trailing word ("the", "to"…) to the next chunk when it fits
    const last = out[i][out[i].length - 1]
    if (out[i].length > 1 && weakEnds.has(norm(last)) && len(out[i + 1]) + 1 + last.length <= capacity)
      out[i + 1].unshift(out[i].pop()!)
  }
  const tail = out[out.length - 1]
  const prev = out[out.length - 2]
  // Rebalance a very short final chunk with the one before it
  while (prev && prev.length > 1 && len(tail) < capacity * 0.3 && len(tail) + 1 + prev[prev.length - 1].length <= len(prev) - prev[prev.length - 1].length)
    tail.unshift(prev.pop()!)
  return out.map(c => c.join(' '))
}

/** Captions for one narration span. Timing never extends past the span's speech. */
export const segmentNarration = (span: NarrationSpan, o: SegmentOptions): Caption[] => {
  const capacity = o.maxCharsPerLine * o.maxLines
  const chunks = splitSentences(span.text).flatMap(s => chunkSentence(s, capacity))
  if (!chunks.length) return []
  const speechEnd = span.start + span.duration
  let timed: { start: number; end: number }[] | undefined
  let estimated = span.estimated
  if (span.words?.length) {
    const tokens = chunks.map(c => c.split(' ').map(norm).filter(Boolean))
    const flat = span.words.map(w => norm(w.word)).filter(Boolean)
    const total = tokens.reduce((s, t) => s + t.length, 0)
    if (total === flat.length) {
      const words = span.words.filter(w => norm(w.word))
      let k = 0
      timed = tokens.map(t => {
        const first = words[k]
        k += t.length
        const last = words[k - 1]
        return { start: span.start + first.start, end: span.start + last.end }
      })
      estimated = false
    }
  }
  if (!timed) {
    // Proportional to characters, with extra weight for sentence-ending pauses
    const weights = chunks.map(c => c.length + (/[.!?…]$/.test(c) ? 6 : /[,;:]$/.test(c) ? 3 : 0))
    const sum = weights.reduce((a, b) => a + b, 0)
    let acc = 0
    timed = weights.map(w => {
      const start = span.start + (span.duration * acc) / sum
      acc += w
      return { start, end: span.start + (span.duration * acc) / sum }
    })
    estimated = true
  }
  const captions: Caption[] = chunks.map((text, i) => ({
    start: timed![i].start,
    end: timed![i].end,
    lines: wrapLines(text, o.maxCharsPerLine, o.maxLines),
    estimated
  }))
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i]
    const limit = Math.min(captions[i + 1] ? captions[i + 1].start - 0.04 : Infinity, speechEnd)
    if (c.end - c.start < o.minDuration) c.end = Math.max(c.end, Math.min(c.start + o.minDuration, limit))
    if (captions[i + 1] && c.end > captions[i + 1].start - 0.04) c.end = Math.max(c.start + 0.1, captions[i + 1].start - 0.04)
  }
  return captions
}

export const defaultCharsPerLine = (aspect: '16:9' | '9:16' | '1:1') => (aspect === '9:16' ? 28 : aspect === '1:1' ? 34 : 42)
