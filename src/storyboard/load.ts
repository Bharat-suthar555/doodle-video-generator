import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import { UserError } from '../core/errors.ts'
import { StoryboardSchema, type Storyboard } from './schema.ts'

export interface LoadedStoryboard {
  storyboard: Storyboard
  file: string
  baseDir: string
}

const formatPath = (p: PropertyKey[]) =>
  p.reduce<string>((acc, key) => (typeof key === 'number' ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key)), '')

/** Turns Zod issues into one line per problem, with a JSON path. */
export const formatIssues = (issues: z.core.$ZodIssue[]) =>
  issues.map(i => {
    const where = formatPath(i.path) || '(root)'
    if (i.code === 'unrecognized_keys') return `${where}: unknown field${i.keys.length > 1 ? 's' : ''} ${i.keys.map(k => `"${k}"`).join(', ')}`
    if (i.code === 'invalid_union' && 'note' in i && i.note === 'No matching discriminator')
      return `${where}: unknown element type`
    return `${where}: ${i.message}`
  })

/** Validates parsed JSON against the storyboard schema. */
export const parseStoryboard = (data: unknown): { ok: true; storyboard: Storyboard } | { ok: false; errors: string[] } => {
  const result = StoryboardSchema.safeParse(data)
  if (result.success) return { ok: true, storyboard: result.data }
  return { ok: false, errors: formatIssues(result.error.issues) }
}

export const loadStoryboard = (file: string): LoadedStoryboard => {
  const abs = path.resolve(file)
  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    throw new UserError(`Storyboard not found: ${file}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new UserError(`${file} is not valid JSON: ${(error as Error).message}`)
  }
  const parsed = parseStoryboard(data)
  if (!parsed.ok)
    throw new UserError(`${file} has ${parsed.errors.length} problem${parsed.errors.length > 1 ? 's' : ''}:\n  - ${parsed.errors.join('\n  - ')}`)
  return { storyboard: parsed.storyboard, file: abs, baseDir: path.dirname(abs) }
}
