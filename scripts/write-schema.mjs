#!/usr/bin/env node
// Writes schema/storyboard.schema.json from the Zod schema in dist/.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const root = path.resolve(import.meta.dirname, '..')
const { StoryboardSchema } = await import(path.join(root, 'dist', 'storyboard', 'schema.js'))
const schema = z.toJSONSchema(StoryboardSchema, { io: 'input', unrepresentable: 'any', cycles: 'ref' })
schema.$id = 'https://github.com/OWNER/doodle-video-generator/schema/storyboard.schema.json'
schema.title = 'doodle-video-generator storyboard'
mkdirSync(path.join(root, 'schema'), { recursive: true })
writeFileSync(path.join(root, 'schema', 'storyboard.schema.json'), `${JSON.stringify(schema, null, 2)}\n`)
