#!/usr/bin/env node
// Audits the repository before a commit or release: secrets, absolute paths,
// symlinks, large files, Git remotes, dependency licenses and font licenses.
// Extra forbidden terms (for example names of other projects that must not
// leak in) come from AUDIT_FORBIDDEN_TERMS, comma-separated, so they never
// need to be written into the repository. Exits 1 on any finding.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const findings = []
const notes = []
const skipDirs = new Set(['node_modules', '.git', 'dist', 'output', '.dvg-work', 'narration', 'coverage'])

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return skipDirs.has(entry.name) ? [] : walk(file)
    return [file]
  })

// Audit what Git would commit (tracked plus untracked, minus .gitignore); without Git, everything
let files
try {
  files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\0')
    .filter(Boolean)
    .map(f => path.join(root, f))
    .filter(f => existsSync(f) || lstatSync(f, { throwIfNoEntry: false }))
} catch {
  files = walk(root)
}
const textExt = /\.(m?js|ts|json|md|html|css|ya?ml|txt|sh)$|^(\.gitignore|LICENSE)$/
const secretPatterns = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, 'GitLab token'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'API secret key'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'hard-coded credential']
]
const forbidden = (process.env.AUDIT_FORBIDDEN_TERMS ?? '').split(',').map(t => t.trim()).filter(Boolean)

for (const file of files) {
  const rel = path.relative(root, file)
  const stat = lstatSync(file)
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(file), readlinkSync(file))
    if (!target.startsWith(root + path.sep)) findings.push(`${rel}: symlink points outside the repository (${target})`)
    continue
  }
  if (stat.size > 5 * 1024 * 1024) findings.push(`${rel}: ${(stat.size / 1048576).toFixed(1)} MB; keep large media out of Git`)
  if (/\.(mp4|mov|webm|wav|mp3|m4a)$/i.test(rel)) findings.push(`${rel}: generated media should not be committed`)
  if (!textExt.test(path.basename(file))) continue
  const text = readFileSync(file, 'utf8')
  if (rel !== 'scripts/check-repository.mjs')
    for (const [re, what] of secretPatterns) if (re.test(text)) findings.push(`${rel}: looks like a ${what}`)
  if (!rel.startsWith('scripts/') && !rel.startsWith('tests/') && /(\/home\/[a-z][\w-]*\/|\/Users\/[A-Za-z][\w-]*\/|C:\\Users\\)/.test(text))
    findings.push(`${rel}: contains an absolute home-directory path`)
  for (const term of forbidden) if (text.toLowerCase().includes(term.toLowerCase())) findings.push(`${rel}: contains the forbidden term "${term}"`)
}

try {
  const remotes = execFileSync('git', ['remote', '-v'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (remotes) notes.push(`Git remotes are configured:\n${remotes}`)
  else notes.push('No Git remotes configured')
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (path.resolve(top) !== root) findings.push(`the Git repository root is ${top}, not this folder`)
} catch {
  notes.push('Not a Git repository yet')
}

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'MPL-2.0', 'BlueOak-1.0.0', 'CC0-1.0', 'Python-2.0', 'CC-BY-4.0', 'MIT-0'])
const lockFile = path.join(root, 'package-lock.json')
if (existsSync(lockFile)) {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  const prod = Object.entries(lock.packages ?? {}).filter(([k, v]) => k && !v.dev)
  for (const [key, pkg] of prod) {
    const license = pkg.license ?? 'UNKNOWN'
    const ok = String(license).split(/\s+(?:OR|AND)\s+|[()]/).filter(Boolean).some(l => allowed.has(l))
    if (!ok) findings.push(`dependency ${key.replace(/^node_modules\//, '')} has license ${license}; review it`)
  }
  notes.push(`${prod.length} production dependencies checked for licenses`)
}

for (const font of files.filter(f => f.endsWith('.ttf'))) {
  const base = path.basename(font).split('-')[0]
  if (!files.some(f => path.basename(f) === `${base}-OFL.txt`)) findings.push(`${path.relative(root, font)}: no ${base}-OFL.txt license next to it`)
}
if (!existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md'))) findings.push('THIRD_PARTY_NOTICES.md is missing')
if (!existsSync(path.join(root, 'LICENSE'))) findings.push('LICENSE is missing')

for (const n of notes) console.log(`note: ${n}`)
if (findings.length) {
  console.error(`${findings.length} finding${findings.length === 1 ? '' : 's'}:\n${findings.map(f => `- ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`Repository audit passed (${files.length} files, ${forbidden.length} extra forbidden terms).`)
