import { describe, expect, it } from 'vitest'
import { chunkSentence, segmentNarration, splitSentences, wrapLines } from '../src/subtitles/segment.ts'
import { parseSrt, toAss, toSrt } from '../src/subtitles/format.ts'
import { checkSubtitles } from '../src/validation/inspect.ts'

const o = { maxLines: 2, maxCharsPerLine: 42, minDuration: 1.5 }

describe('caption segmentation', () => {
  it('splits sentences', () => {
    expect(splitSentences('One. Two? Three! Four')).toEqual(['One.', 'Two?', 'Three!', 'Four'])
  })

  it('wraps into balanced lines without ending on a weak word', () => {
    const lines = wrapLines('Your browser asks a DNS server to turn the name into an IP address', 42, 2)
    expect(lines).toHaveLength(2)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(42)
    expect(lines[0].split(' ').at(-1)).not.toMatch(/^(the|a|to|an)$/)
  })

  it('chunks long sentences to caption capacity', () => {
    const sentence = 'Next, it sends a request to that server, which builds the page, often with help from a database, and then sends the finished page all the way back to your browser.'
    const chunks = chunkSentence(sentence, 84)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(84)
    expect(chunks.join(' ')).toBe(sentence)
  })

  it('uses word timestamps when they match the text', () => {
    const words = 'Hello there. General greeting.'.split(' ').map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 }))
    const caps = segmentNarration({ text: 'Hello there. General greeting.', start: 10, duration: 2, words, estimated: false }, o)
    expect(caps).toHaveLength(2)
    expect(caps[0].estimated).toBe(false)
    expect(caps[0].start).toBe(10)
    expect(caps[1].start).toBe(11)
  })

  it('never extends captions past the end of speech', () => {
    const caps = segmentNarration({ text: 'Short. Lines. Here.', start: 0, duration: 1.2, estimated: true }, o)
    expect(caps.at(-1)!.end).toBeLessThanOrEqual(1.2 + 1e-9)
    for (let i = 1; i < caps.length; i++) expect(caps[i].start).toBeGreaterThanOrEqual(caps[i - 1].end)
    expect(caps.every(c => c.estimated)).toBe(true)
  })

  it('extends short captions toward the minimum when there is silence', () => {
    const caps = segmentNarration({ text: 'Hi. This is a much longer sentence that follows the greeting.', start: 0, duration: 6, estimated: true }, o)
    expect(caps[0].end - caps[0].start).toBeGreaterThanOrEqual(0.5)
    expect(caps[0].end).toBeLessThanOrEqual(caps[1].start)
  })
})

describe('subtitle files', () => {
  const caps = [
    { start: 0.3, end: 2.5, lines: ['Hello'], estimated: true },
    { start: 2.6, end: 4, lines: ['World', 'again'], estimated: true }
  ]

  it('round-trips SRT', () => {
    const { entries, errors } = parseSrt(toSrt(caps))
    expect(errors).toEqual([])
    expect(entries.map(e => [e.start, e.end, e.lines])).toEqual([[0.3, 2.5, ['Hello']], [2.6, 4, ['World', 'again']]])
  })

  it('writes ASS with a boxed style', () => {
    const ass = toAss(caps, { width: 1920, height: 1080, fontSize: 48, color: '#ffffff', boxColor: '#111111', boxOpacity: 0.7, position: 'bottom', marginV: 60 })
    expect(ass).toContain('PlayResX: 1920')
    expect(ass).toContain('World\\Nagain')
    expect(ass).toMatch(/Style: Default,Lato,48,&H00FFFFFF/)
  })

  it('detects overlaps and too many lines', () => {
    const { entries } = parseSrt('1\n00:00:00,000 --> 00:00:03,000\na\nb\nc\n\n2\n00:00:02,000 --> 00:00:04,000\nd\n')
    const checks = checkSubtitles(entries, [], { duration: 10, maxLines: 2, maxCharsPerLine: 42, minDuration: 1.5 })
    const status = Object.fromEntries(checks.map(c => [c.id, c.status]))
    expect(status['subtitles.overlap']).toBe('fail')
    expect(status['subtitles.lines']).toBe('fail')
    expect(status['subtitles.bounds']).toBe('pass')
  })
})
