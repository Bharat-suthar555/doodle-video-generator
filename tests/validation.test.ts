import { describe, expect, it } from 'vitest'
import { compileScene } from '../src/animation/compile.ts'
import { layoutIssues, validateStoryboard } from '../src/storyboard/validate.ts'
import { checkTimeline } from '../src/validation/inspect.ts'
import { footageFilter } from '../src/footage/render.ts'
import { joinFilter } from '../src/timeline/assemble.ts'
import { planTimeline } from '../src/timeline/plan.ts'
import { storyboard } from './helpers.ts'

describe('storyboard validation', () => {
  it('finds overlapping text and content past the frame edge', () => {
    const sb = storyboard({
      project: { title: 'T' },
      scenes: [{ id: 's', elements: [
        { type: 'text', id: 'a', text: 'Overlapping words', x: 960, y: 540 },
        { type: 'text', id: 'b', text: 'Overlapping words', x: 980, y: 550 },
        { type: 'rect', id: 'off', x: 1900, y: 540, width: 300, height: 100 }
      ] }]
    })
    const issues = layoutIssues(compileScene(sb, sb.scenes[0], { baseDir: '.' }))
    expect(issues.warnings.join('\n')).toContain('"a" and "b" overlap')
    expect(issues.errors.join('\n')).toContain('"off" extends past the edge')
  })

  it('does not report labels inside their shapes', () => {
    const sb = storyboard({ project: { title: 'T' }, scenes: [{ id: 's', elements: [{ type: 'rect', width: 600, height: 300 }, { type: 'text', text: 'Inside' }] }] })
    expect(layoutIssues(compileScene(sb, sb.scenes[0], { baseDir: '.' })).warnings).toEqual([])
  })

  it('reports unknown icons, missing files and unknown sources', async () => {
    const sb = storyboard({
      project: { title: 'T' },
      scenes: [{ id: 's', narration: { text: 'x', provenance: 'source', sourceIds: ['nope'] }, elements: [{ type: 'icon', name: 'unicorn' }, { type: 'svg', file: 'missing.svg' }] }]
    })
    const result = await validateStoryboard({ storyboard: sb, file: '/tmp/x.json', baseDir: '/tmp' })
    const text = result.errors.join('\n')
    expect(text).toContain('unknown icon "unicorn"')
    expect(text).toContain('missing.svg')
    expect(text).toContain('unknown source "nope"')
  })
})

describe('timeline checks', () => {
  const t = {
    fps: 30, width: 1920, height: 1080, totalFrames: 150, duration: 5,
    scenes: [
      { id: 'a', start: 0, end: 2, startFrame: 0, frames: 60, transitionIn: null },
      { id: 'b', start: 1.8, end: 5, startFrame: 54, frames: 96, transitionIn: { frames: 6 } }
    ],
    chapters: [{ seconds: 0, title: 'A' }, { seconds: 1, title: 'B' }]
  }

  it('passes a continuous timeline', () => {
    const status = Object.fromEntries(checkTimeline(t, 5).map(c => [c.id, c.status]))
    expect(status['timeline.continuity']).toBe('pass')
    expect(status['timeline.total']).toBe('pass')
    expect(status['timeline.duration-match']).toBe('pass')
  })

  it('fails gaps and mismatched chapters', () => {
    const broken = { ...t, scenes: [t.scenes[0], { ...t.scenes[1], startFrame: 70 }] }
    const status = Object.fromEntries(checkTimeline(broken, 5.5).map(c => [c.id, c.status]))
    expect(status['timeline.continuity']).toBe('fail')
    expect(status['timeline.duration-match']).toBe('fail')
    expect(status['chapters.scene-boundaries']).toBe('pass')
  })
})

describe('FFmpeg filter graphs', () => {
  it('joins scenes with xfade at frame-exact offsets and concat for cuts', async () => {
    const plan = await planTimeline({
      storyboard: storyboard({ project: { title: 'T' }, scenes: [{ id: 'a', duration: 2 }, { id: 'b', duration: 2, transition: { type: 'fade-white', duration: 0.5 } }, { id: 'c', duration: 1 }] }),
      file: '/tmp/x.json',
      baseDir: '/tmp'
    })
    const graph = joinFilter(plan, { in: 0, out: 0.5, color: 'white' }, 'captions.ass')
    expect(graph).toContain('xfade=transition=fadewhite:duration=0.5:offset=1.5')
    expect(graph).toContain('concat=n=2:v=1:a=0')
    expect(graph).toContain('ass=captions.ass:fontsdir=fonts')
    expect(graph).toContain('fade=t=out:st=4')
  })

  it('builds footage masks, zoom and freeze frames', () => {
    const footage = storyboard({
      project: { title: 'T' },
      scenes: [{ id: 'f', type: 'footage', footage: { provenance: 'user-recording', zoom: [{ at: 1, zoom: 1.5, center: [960, 540] }], masks: [{ x: 10, y: 10, width: 100, height: 40, style: 'pixelate' }] } }]
    }).scenes[0].footage!
    const graph = footageFilter({ footage, trimStart: 0, available: 2, frames: 90, fps: 30, width: 1920, height: 1080, designWidth: 1920 })
    expect(graph).toContain('zoompan=')
    expect(graph).toContain('flags=neighbor')
    expect(graph).toContain('tpad=stop_mode=clone')
  })
})
