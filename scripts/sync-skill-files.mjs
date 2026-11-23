#!/usr/bin/env node
// Copies scripts/skill-toolkit.mjs into every skill as scripts/toolkit.mjs,
// stamped with the package version, so each installed skill can find the toolkit.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
const source = readFileSync(path.join(root, 'scripts', 'skill-toolkit.mjs'), 'utf8').replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
writeFileSync(path.join(root, 'scripts', 'skill-toolkit.mjs'), source)
const skillsDir = path.join(root, 'skills')
for (const name of readdirSync(skillsDir)) {
  if (!statSync(path.join(skillsDir, name)).isDirectory()) continue
  mkdirSync(path.join(skillsDir, name, 'scripts'), { recursive: true })
  writeFileSync(path.join(skillsDir, name, 'scripts', 'toolkit.mjs'), source)
  console.log(`synced skills/${name}/scripts/toolkit.mjs (${version})`)
}
