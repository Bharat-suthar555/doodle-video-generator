import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStoryboard } from '../src/storyboard/load.ts'
import { storyboardFromScript } from '../src/storyboard/from-script.ts'
import { shotList } from '../src/storyboard/shot-list.ts'
import { root, storyboard } from './helpers.ts'

describe('storyboard schema', () => {
  it.each(['whiteboard-explainer', 'software-demo', 'vertical-short'])('accepts the %s example', name => {
    const data = JSON.parse(readFileSync(path.join(root, 'examples', name, 'storyboard.json'), 'utf8'))
    expect(parseStoryboard(data).ok).toBe(true)
  })

  it('fills defaults', () => {
    const sb = storyboard({ project: { title: 'T' }, scenes: [{ id: 'a' }] })
    expect(sb.format).toMatchObject({ aspect: '16:9', fps: 30 })
    expect(sb.scenes[0].duration).toBe('auto')
    expect(sb.subtitles.maxLines).toBe(2)
  })

  it('reports problems with JSON paths', () => {
    const result = parseStoryboard({ project: { title: 'T' }, scenes: [{ id: 'a', elements: [{ type: 'text', text: 'x', fontSize: 'big' }] }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('scenes[0].elements[0].fontSize')
  })

  it('rejects unknown fields so typos never pass silently', () => {
    const result = parseStoryboard({ project: { title: 'T' }, scenes: [{ id: 'a', duraton: 4 }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toContain('"duraton"')
  })

  it('rejects remote URLs for files', () => {
    const result = parseStoryboard({
      project: { title: 'T' },
      scenes: [{ id: 'a', elements: [{ type: 'image', file: 'https://example.com/a.png', width: 100 }] }]
    })
    expect(result.ok).toBe(false)
  })

  it('rejects unknown element types and bad colors', () => {
    expect(parseStoryboard({ project: { title: 'T' }, scenes: [{ id: 'a', elements: [{ type: 'video' }] }] }).ok).toBe(false)
    expect(parseStoryboard({ project: { title: 'T' }, style: { ink: 'red' }, scenes: [{ id: 'a' }] }).ok).toBe(false)
  })

  it('accepts nested groups', () => {
    const sb = storyboard({
      project: { title: 'T' },
      scenes: [{ id: 'a', elements: [{ type: 'group', layout: { type: 'row' }, children: [{ type: 'group', children: [{ type: 'icon', name: 'check' }] }] }] }]
    })
    expect(sb.scenes[0].elements[0].type).toBe('group')
  })
})

describe('storyboard from a script', () => {
  const script = `# Lead Basics\n\n## The Problem\nLeads get lost.\n[visual: scattered notes]\n\n## Demo\nWatch it work.\n[footage: add a lead]\n`

  it('creates one scene per heading with notes and footage scenes', () => {
    const { storyboard: sb, summary } = storyboardFromScript(script)
    expect(sb.project.title).toBe('Lead Basics')
    expect(sb.scenes.map(s => s.id)).toEqual(['the-problem', 'demo'])
    expect(sb.scenes[0].notes).toBe('scattered notes')
    expect(sb.scenes[1].type).toBe('footage')
    expect(sb.scenes[0].narration?.provenance).toBe('user')
    expect(parseStoryboard(sb).ok).toBe(true)
    expect(summary[1]).toContain('1 footage scene')
  })

  it('marks narration as generated when asked', () => {
    expect(storyboardFromScript(script, { provenance: 'generated' }).storyboard.scenes[0].narration?.provenance).toBe('generated')
  })

  it('lists footage that still needs recording in the shot list', () => {
    const sb = storyboard(storyboardFromScript(script).storyboard)
    const md = shotList(sb)
    expect(md).toContain('## demo')
    expect(md).toContain('to record')
  })
})
