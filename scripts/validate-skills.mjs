#!/usr/bin/env node
// Checks every skill against the Agent Skills format and this repository's rules.
// Exits 1 when anything fails.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const skillsDir = path.join(root, 'skills')
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
const toolkitSource = readFileSync(path.join(root, 'scripts', 'skill-toolkit.mjs'), 'utf8')
const problems = []
const fail = (where, message) => problems.push(`${where}: ${message}`)

/** Parses the frontmatter subset used here: scalars and one nested map. */
export const parseFrontmatter = text => {
  const data = {}
  let parent
  for (const line of text.split('\n')) {
    const nested = line.match(/^ {2}([a-z][\w-]*):\s*(.*)$/)
    const top = line.match(/^([a-z][\w-]*):\s*(.*)$/)
    const unquote = v => v.trim().replace(/^["'](.*)["']$/, '$1')
    if (nested && parent) data[parent][nested[1]] = unquote(nested[2])
    else if (top) {
      if (top[2].trim() === '') {
        parent = top[1]
        data[parent] = {}
      } else {
        parent = undefined
        data[top[1]] = unquote(top[2])
      }
    }
  }
  return data
}

const filesIn = dir =>
  readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? (name === 'node_modules' ? [] : filesIn(file)) : [file]
  })

const skills = readdirSync(skillsDir).filter(d => statSync(path.join(skillsDir, d)).isDirectory()).sort()
for (const dir of skills) {
  const where = `skills/${dir}`
  const file = path.join(skillsDir, dir, 'SKILL.md')
  if (!existsSync(file)) {
    fail(where, 'missing SKILL.md')
    continue
  }
  const text = readFileSync(file, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    fail(where, 'SKILL.md must start with YAML frontmatter between --- lines')
    continue
  }
  const meta = parseFrontmatter(match[1])
  const body = match[2]
  if (!meta.name) fail(where, 'frontmatter needs a name')
  else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.name) || meta.name.length > 64) fail(where, `name "${meta.name}" must be lowercase words joined by single hyphens, 64 characters at most`)
    if (meta.name !== dir) fail(where, `name "${meta.name}" must equal the folder name`)
  }
  if (!meta.description) fail(where, 'frontmatter needs a description')
  else {
    if (meta.description.length > 1024) fail(where, `description is ${meta.description.length} characters; the limit is 1024`)
    if (!meta.description.startsWith('Use when')) fail(where, 'description should start with "Use when" so agents know when to activate the skill')
  }
  if (meta.license !== 'MIT') fail(where, 'frontmatter needs license: MIT')
  if (meta.compatibility && meta.compatibility.length > 500) fail(where, 'compatibility is longer than 500 characters')
  if (meta.metadata?.version !== version) fail(where, `metadata.version must be "${version}" (package.json)`)
  const lines = body.split('\n').length
  if (lines > 500) fail(where, `body is ${lines} lines; keep it under 500`)
  for (const heading of ['## When to Use', '## Workflow', '## Error Handling', '## Safety', '## Example'])
    if (!body.includes(heading)) fail(where, `missing section "${heading}"`)
  const prose = body.replace(/```[\s\S]*?```/g, '')
  for (const [, target] of prose.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(target) || target.startsWith('/')) continue
    if (!existsSync(path.join(skillsDir, dir, target))) fail(where, `link to ${target} points at a missing file`)
  }
  const toolkit = path.join(skillsDir, dir, 'scripts', 'toolkit.mjs')
  if (!existsSync(toolkit)) fail(where, 'missing scripts/toolkit.mjs (run npm run sync:skills)')
  else if (readFileSync(toolkit, 'utf8') !== toolkitSource) fail(where, 'scripts/toolkit.mjs differs from scripts/skill-toolkit.mjs (run npm run sync:skills)')
  for (const f of filesIn(path.join(skillsDir, dir))) {
    const rel = path.relative(root, f)
    if (/\.m?js$/.test(f)) {
      const check = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
      if (check.status !== 0) fail(rel, check.stderr.trim().split('\n').slice(0, 3).join(' '))
    }
    if (/\.json$/.test(f)) {
      try {
        JSON.parse(readFileSync(f, 'utf8'))
      } catch (error) {
        fail(rel, `invalid JSON: ${error.message}`)
      }
    }
    if (/\.(md|json|mjs)$/.test(f) && /(\/home\/[a-z]|\/Users\/[A-Za-z]|C:\\Users\\)/.test(readFileSync(f, 'utf8'))) fail(rel, 'contains an absolute home-directory path')
  }
}

const manifestFile = path.join(root, '.claude-plugin', 'marketplace.json')
if (existsSync(manifestFile)) {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const listed = new Set(manifest.plugins.flatMap(p => p.skills ?? []).map(s => path.basename(s)))
  for (const dir of skills) if (!listed.has(dir)) fail('.claude-plugin/marketplace.json', `does not list skills/${dir}`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(p => `- ${p}`).join('\n')}`)
  process.exit(1)
}
console.log(`${skills.length} skills valid: ${skills.join(', ')}`)
