import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cli, root, tempDir } from './helpers.ts'

describe('command line', () => {
  it('prints help and version', () => {
    const help = cli(['--help'])
    expect(help.code).toBe(0)
    for (const cmd of ['init', 'storyboard', 'validate', 'render', 'assemble', 'build', 'inspect', 'chapters', 'narrate', 'record', 'demo'])
      expect(help.stdout).toContain(cmd)
    expect(cli(['--version']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
    expect(cli(['render', '--help']).stdout).toContain('--still')
  })

  it('fails on unknown commands and options', () => {
    expect(cli(['explode']).code).toBe(1)
    const r = cli(['validate', 'x.json', '--bogus'])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('bogus')
  })

  it('validates the examples', () => {
    const r = cli(['validate', 'examples/whiteboard-explainer/storyboard.json', '--json'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout).ok).toBe(true)
  })

  it('reports invalid storyboards with exit code 1', () => {
    const dir = tempDir()
    const file = path.join(dir, 'bad.json')
    writeFileSync(file, JSON.stringify({ project: { title: 'T' }, scenes: [{ id: 'a', elements: [{ type: 'icon', name: 'unicorn' }] }] }))
    const r = cli(['validate', file])
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('unknown icon')
    writeFileSync(file, '{ not json')
    expect(cli(['validate', file]).stderr).toContain('not valid JSON')
  })

  it('creates projects without overwriting files', () => {
    const dir = tempDir()
    expect(cli(['init', dir, '--template', 'vertical-short']).code).toBe(0)
    const file = path.join(dir, 'storyboard.json')
    writeFileSync(file, '{"mine": true}')
    const again = cli(['init', dir, '--template', 'vertical-short'])
    expect(again.code).toBe(0)
    expect(again.stderr).toContain('kept existing storyboard.json')
    expect(readFileSync(file, 'utf8')).toBe('{"mine": true}')
    expect(cli(['init', dir, '--template', 'nope']).code).toBe(1)
  })

  it('turns a script into a storyboard and refuses to overwrite it', () => {
    const dir = tempDir()
    const script = path.join(dir, 'script.md')
    writeFileSync(script, '# Title\n\n## Part One\nSome narration here.\n')
    const out = path.join(dir, 'sb.json')
    expect(cli(['storyboard', 'from-script', script, '--out', out]).code).toBe(0)
    expect(cli(['validate', out]).code).toBe(0)
    expect(cli(['storyboard', 'from-script', script, '--out', out]).code).toBe(1)
  })

  it('prints chapters and the timeline', () => {
    const r = cli(['chapters', 'examples/whiteboard-explainer/storyboard.json', '--json'])
    expect(JSON.parse(r.stdout).chapters[0]).toMatchObject({ timestamp: '0:00', title: 'The Question' })
    expect(cli(['storyboard', 'timeline', 'examples/vertical-short/storyboard.json']).stdout).toContain('1080x1920')
  })

  it('lists icons and the schema path', () => {
    expect(cli(['icons']).stdout).toContain('laptop')
    const schema = cli(['schema']).stdout.trim()
    expect(existsSync(schema)).toBe(true)
    expect(path.relative(root, schema)).toBe(path.join('schema', 'storyboard.schema.json'))
  })
})
