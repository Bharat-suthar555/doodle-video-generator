import { describe, expect, it } from 'vitest'
import { compileScene } from '../src/animation/compile.ts'
import { flowRanks } from '../src/animation/build.ts'
import { handTip } from '../src/animation/hand-track.ts'
import { renderFrameSvg } from '../src/animation/frame.ts'
import { makePolyline, pointAt } from '../src/core/geometry.ts'
import { createRandom } from '../src/core/random.ts'
import { layoutText } from '../src/drawing/font.ts'
import { parsePath } from '../src/drawing/path-parse.ts'
import { ellipsePoints, linePoints, wobble } from '../src/drawing/rough.ts'
import { parseSvgGeometry } from '../src/drawing/svg-import.ts'
import { storyboard } from './helpers.ts'

describe('geometry and paths', () => {
  it('samples polylines at constant speed', () => {
    const line = makePolyline([[0, 0], [10, 0], [10, 10]])
    expect(line.length).toBe(20)
    expect(pointAt(line, 0.25)).toEqual([5, 0])
    expect(pointAt(line, 0.75)).toEqual([10, 5])
  })

  it('parses relative commands, curves and arcs', () => {
    const [sp] = parsePath('M10 10 h20 v20 h-20 z')
    expect(sp.closed).toBe(true)
    expect(sp.points.at(-1)).toEqual([10, 10])
    const [arc] = parsePath('M0 50 A50 50 0 0 1 100 50')
    const top = arc.points.reduce((m, p) => Math.min(m, p[1]), Infinity)
    expect(top).toBeCloseTo(0, 0)
    expect(parsePath('M0 0 C10 0 20 10 20 20 S30 40 40 40 Q50 50 60 40 T80 40')[0].points.length).toBeGreaterThan(10)
  })

  it('imports SVG outlines and ignores scripts', () => {
    const svg = parseSvgGeometry('<svg viewBox="0 0 24 24"><script>alert(1)</script><g transform="translate(2 2)"><rect x="0" y="0" width="10" height="10"/><circle cx="5" cy="5" r="3"/></g></svg>')
    expect(svg.viewBox).toEqual([0, 0, 24, 24])
    expect(svg.subpaths).toHaveLength(2)
    expect(svg.subpaths[0].points[0]).toEqual([2, 2])
  })

  it('draws the same wobble for the same seed', () => {
    const a = wobble(linePoints([0, 0], [500, 0]), createRandom(5), 1)
    const b = wobble(linePoints([0, 0], [500, 0]), createRandom(5), 1)
    const c = wobble(linePoints([0, 0], [500, 0]), createRandom(6), 1)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a[0]).toEqual([0, 0])
    expect(ellipsePoints(0, 0, 50, 50, createRandom(1), 1).length).toBeGreaterThan(24)
  })

  it('wraps text to a maximum width', () => {
    const layout = layoutText({ text: 'one two three four five six seven', font: 'hand', fontSize: 60, x: 0, y: 0, anchor: 'top-left', align: 'left', maxWidth: 300, lineHeight: 1.2 })
    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.box.width).toBeLessThanOrEqual(300)
    expect(layout.inkChars).toBe('onetwothreefourfivesixseven'.length)
  })

  it('ranks flowchart nodes by their edges', () => {
    const ranks = flowRanks([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'd' }])
    expect(Object.fromEntries(ranks)).toEqual({ a: 0, b: 1, c: 2, d: 1 })
  })
})

describe('scene animation', () => {
  const sb = storyboard({
    project: { title: 'T' },
    scenes: [
      {
        id: 's',
        narration: { text: 'First we write a title, then we draw the arrow.' },
        elements: [
          { type: 'text', id: 'title', text: 'Hello', at: 'top' },
          { type: 'arrow', id: 'go', from: [400, 540], to: [1400, 540], animation: { cue: 'draw the arrow' } },
          { type: 'node', id: 'n', label: 'Node', x: 960, y: 800 },
          { type: 'highlight', target: 'title' }
        ],
        camera: [{ at: 1, focus: 'n', duration: 0.5 }]
      }
    ]
  })
  const narration = { offset: 0.4, duration: 4, text: sb.scenes[0].narration!.text!, estimated: true }
  const scene = compileScene(sb, sb.scenes[0], { baseDir: '.', narration })

  it('schedules elements in order and honors cues', () => {
    const [title, arrow, node] = scene.drawables
    expect(title.anim.type).toBe('handwrite')
    expect(arrow.anim.start).toBeCloseTo(0.4 + (narration.text.indexOf('draw the arrow') / narration.text.length) * 4, 5)
    expect(node.anim.start).toBeGreaterThanOrEqual(arrow.anim.start + arrow.anim.duration)
    expect(scene.estimatedCues).toBe(true)
  })

  it('auto-fits the camera to a focused element', () => {
    expect(scene.camera[0].zoom).toBeGreaterThan(1)
  })

  it('moves the hand along strokes without jumps', () => {
    let previous: [number, number] | null = null
    let maxStep = 0
    for (let f = 0; f < scene.contentEnd * 30; f++) {
      const tip = handTip(scene, f / 30)
      if (tip && previous) maxStep = Math.max(maxStep, Math.hypot(tip[0] - previous[0], tip[1] - previous[1]))
      previous = tip
    }
    // Drawing moves about 50 units per frame; swoops on and off screen stay under 400
    expect(maxStep).toBeLessThan(400)
  })

  it('hides the hand when nothing is drawing', () => {
    expect(handTip(scene, scene.contentEnd + 2)).toBeNull()
  })

  it('renders deterministic SVG frames', () => {
    const glyph = scene.drawables[0].items[0] as { t0: number; t1: number }
    const t = (glyph.t0 + glyph.t1) / 2
    const a = renderFrameSvg(scene, t, { width: 640, height: 360 })
    const b = renderFrameSvg(scene, t, { width: 640, height: 360 })
    expect(a).toBe(b)
    expect(a).toContain('mask')
    expect(a.startsWith('<svg')).toBe(true)
  })
})
