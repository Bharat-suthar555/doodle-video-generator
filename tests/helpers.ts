import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseStoryboard } from '../src/storyboard/load.ts'
import type { StoryboardInput } from '../src/storyboard/schema.ts'

export const root = path.resolve(import.meta.dirname, '..')
export const cliPath = path.join(root, 'bin', 'doodle-video-generator.js')

export const tempDir = (prefix = 'dvg-test-') => mkdtempSync(path.join(tmpdir(), prefix))

/** Runs the built CLI and returns its exit code and output. */
export const cli = (args: string[], cwd = root) => {
  const r = spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8', env: { ...process.env } })
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr }
}

export const storyboard = (input: StoryboardInput) => {
  const parsed = parseStoryboard(input)
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
  return parsed.storyboard
}

export const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
