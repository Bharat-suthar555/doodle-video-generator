import { describe, expect, it } from 'vitest'
import { estimateSpeech, planTimeline, youtubeTimestamp } from '../src/timeline/plan.ts'
import { chapterWarnings } from '../src/timeline/metadata.ts'
import type { StoryboardInput } from '../src/storyboard/schema.ts'
import { storyboard } from './helpers.ts'

const loaded = (input: StoryboardInput) => ({ storyboard: storyboard(input), file: '/tmp/sb.json', baseDir: '/tmp' })

describe('timeline planning', () => {
  it('uses whole frames and overlaps transitions exactly', async () => {
    const plan = await planTimeline(
      loaded({
        project: { title: 'T' },
        format: { fps: 30 },
        scenes: [
          { id: 'a', duration: 2.01, chapter: 'One' },
          { id: 'b', duration: 3, chapter: 'Two', transition: { type: 'fade', duration: 0.5 } },
          { id: 'c', duration: 1, transition: { type: 'cut', duration: 0.5 } }
        ]
      })
    )
    expect(plan.scenes.map(s => s.frames)).toEqual([61, 90, 30])
    expect(plan.scenes.map(s => s.startFrame)).toEqual([0, 46, 136])
    expect(plan.scenes[2].transition).toBeUndefined()
    expect(plan.totalFrames).toBe(166)
    expect(plan.duration).toBeCloseTo(166 / 30, 10)
    expect(plan.chapters.map(c => c.time)).toEqual([0, 46 / 30])
  })

  it('stretches auto scenes to fit estimated narration and the next transition', async () => {
    const text = 'One two three four five six seven eight nine ten. Eleven twelve.'
    const plan = await planTimeline(
      loaded({
        project: { title: 'T' },
        narration: { wordsPerMinute: 120, leadIn: 0.5, tail: 0.5 },
        scenes: [
          { id: 'a', narration: { text } },
          { id: 'b', duration: 2, transition: { type: 'fade', duration: 1 } }
        ]
      })
    )
    const speech = estimateSpeech(text, 120)
    expect(plan.scenes[0].narration?.estimated).toBe(true)
    expect(plan.scenes[0].duration).toBeGreaterThanOrEqual(0.5 + speech + 0.5 + 1)
    expect(plan.estimatedTiming).toBe(true)
  })

  it('refuses narration longer than a fixed scene instead of speeding it up', async () => {
    const plan = await planTimeline(
      loaded({ project: { title: 'T' }, scenes: [{ id: 'a', duration: 1, narration: { text: 'This sentence is far too long to fit into one second of video.' } }] })
    )
    expect(plan.errors.join('\n')).toContain('never sped up')
  })

  it('requires a visible label on mock footage', async () => {
    const plan = await planTimeline(loaded({ project: { title: 'T' }, scenes: [{ id: 'f', type: 'footage', footage: { provenance: 'mock' } }] }), { allowMissing: true })
    expect(plan.errors.join('\n')).toContain('label')
  })

  it('formats YouTube timestamps', () => {
    expect(youtubeTimestamp(0)).toBe('0:00')
    expect(youtubeTimestamp(65.9)).toBe('1:05')
    expect(youtubeTimestamp(3725)).toBe('1:02:05')
  })

  it('applies YouTube chapter rules', () => {
    expect(chapterWarnings([{ time: 0 }, { time: 12 }, { time: 30 }], 60)).toEqual([])
    const w = chapterWarnings([{ time: 2 }, { time: 5 }], 20).join('\n')
    expect(w).toContain('0:00')
    expect(w).toContain('at least three')
    expect(w).toContain('at least 10s')
  })
})
