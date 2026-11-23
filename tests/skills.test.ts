import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { root, tempDir } from './helpers.ts'

const skillsDir = path.join(root, 'skills')
const skills = readdirSync(skillsDir).filter(d => statSync(path.join(skillsDir, d)).isDirectory())

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]))

describe('skills', () => {
  it('has exactly the four documented skills', () => {
    expect(skills.sort()).toEqual(['doodle-animation', 'explainer-video', 'video-quality-check', 'video-storyboard'])
  })

  it('passes the skill validator', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-skills.mjs')], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
  })

  it('uses the discoverable layout: one SKILL.md per skill folder, none nested', () => {
    for (const s of skills) {
      const found = walk(path.join(skillsDir, s)).filter(f => path.basename(f) === 'SKILL.md')
      expect(found).toEqual([path.join(skillsDir, s, 'SKILL.md')])
      expect(readFileSync(found[0], 'utf8')).toMatch(new RegExp(`^---\\nname: ${s}\\n`))
    }
  })

  it('ships a working toolkit bootstrap in every skill', () => {
    for (const s of skills) {
      const script = path.join(skillsDir, s, 'scripts', 'toolkit.mjs')
      expect(existsSync(script)).toBe(true)
      // With an empty install folder and no DVG_CLI, "run" explains how to install
      const r = spawnSync(process.execPath, [script, 'run', '--', '--version'], {
        cwd: tempDir(),
        encoding: 'utf8',
        env: { ...process.env, DVG_HOME: tempDir(), DVG_CLI: '', PATH: path.dirname(process.execPath) }
      })
      expect(r.status).toBe(127)
      expect(r.stderr).toContain('install --from')
    }
  })

  it('runs the toolkit through DVG_CLI', () => {
    const r = spawnSync(process.execPath, [path.join(skillsDir, 'video-quality-check', 'scripts', 'toolkit.mjs'), 'run', '--', '--version'], {
      encoding: 'utf8',
      env: { ...process.env, DVG_CLI: path.join(root, 'bin', 'doodle-video-generator.js') }
    })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
