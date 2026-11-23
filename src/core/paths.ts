import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The package root: works from `src/` (tests) and from `dist/` (installed). */
export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)

export const assetPath = (...parts: string[]) =>
  path.join(packageRoot, 'assets', ...parts)

export const examplesPath = (...parts: string[]) =>
  path.join(packageRoot, 'examples', ...parts)

export const toolVersion: string = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
).version

/** Resolves a storyboard-relative path; absolute paths pass through. */
export const resolveFrom = (baseDir: string, file: string) =>
  path.isAbsolute(file) ? file : path.resolve(baseDir, file)

export const fileExists = (file: string) => existsSync(file)

let fingerprint: string | undefined

/**
 * Identifies the exact toolkit code in use (sizes and times of its own files),
 * so cached scene clips re-render after the renderer changes.
 */
export const codeFingerprint = () => {
  if (fingerprint) return fingerprint
  const hash = createHash('sha256').update(toolVersion)
  const codeDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else {
        const s = statSync(file)
        hash.update(`${path.relative(codeDir, file)}:${s.size}:${s.mtimeMs}`)
      }
    }
  }
  walk(codeDir)
  fingerprint = hash.digest('hex').slice(0, 12)
  return fingerprint
}
