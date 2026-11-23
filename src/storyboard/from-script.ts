import { estimateSpeech } from '../timeline/plan.ts'
import type { StoryboardInput } from './schema.ts'

export interface ScriptOptions {
  title?: string
  aspect?: '16:9' | '9:16' | '1:1'
  wordsPerMinute?: number
  /** Whose words these are: the user's own script by default. */
  provenance?: 'user' | 'generated'
}

const slugify = (s: string, used: Set<string>) => {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scene'
  let id = base
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`
  used.add(id)
  return id
}

/**
 * Converts a Markdown script into a storyboard skeleton. `# Title` names the
 * project, each `## Heading` starts a scene and chapter, paragraphs become
 * narration, `[visual: …]` lines become notes and `[footage: …]` lines make
 * footage scenes with a shot-list entry. Visual elements are left for you to
 * design; only a title card is added so the storyboard renders immediately.
 */
export const storyboardFromScript = (markdown: string, o: ScriptOptions = {}): { storyboard: StoryboardInput; summary: string[] } => {
  const lines = markdown.replace(/\r/g, '').split('\n')
  let title = o.title
  const scenes: StoryboardInput['scenes'] = []
  const used = new Set<string>()
  let current: { heading: string; text: string[]; notes: string[]; footage?: string } | undefined
  const flush = () => {
    if (!current) return
    const text = current.text.join(' ').replace(/\s+/g, ' ').trim()
    const id = slugify(current.heading, used)
    const narration = text ? { text, provenance: o.provenance ?? 'user' } : undefined
    if (current.footage !== undefined)
      scenes.push({
        id,
        type: 'footage',
        chapter: current.heading,
        narration,
        notes: current.notes.join('\n') || undefined,
        footage: { provenance: 'user-recording' },
        shot: { description: current.footage || current.heading, steps: [] }
      })
    else
      scenes.push({
        id,
        chapter: current.heading,
        narration,
        notes: current.notes.join('\n') || undefined,
        elements: [{ type: 'text', id: `${id}-title`, text: current.heading, at: 'top', fontSize: 80 }]
      })
    current = undefined
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (/^#\s+/.test(line)) title ??= line.replace(/^#\s+/, '')
    else if (/^##+\s+/.test(line)) {
      flush()
      current = { heading: line.replace(/^##+\s+/, ''), text: [], notes: [] }
    } else if (!line) continue
    else {
      current ??= { heading: `Part ${scenes.length + 1}`, text: [], notes: [] }
      const visual = line.match(/^\[visual:\s*(.*)\]$/i)
      const footage = line.match(/^\[footage:\s*(.*)\]$/i)
      if (visual) current.notes.push(visual[1])
      else if (footage) current.footage = footage[1]
      else current.text.push(line)
    }
  }
  flush()
  const wpm = o.wordsPerMinute ?? 150
  const total = scenes.reduce((s, sc) => s + (sc.narration?.text ? estimateSpeech(sc.narration.text, wpm) + 1.5 : 4), 0)
  return {
    storyboard: {
      project: { title: title ?? 'Untitled Video' },
      format: { aspect: o.aspect ?? '16:9' },
      narration: { wordsPerMinute: wpm },
      scenes: scenes.length ? scenes : [{ id: 'intro', elements: [{ type: 'text', text: title ?? 'Untitled Video' }] }]
    },
    summary: [
      `${scenes.length} scene(s), about ${Math.round(total)}s at ${wpm} words per minute (an estimate until narration is recorded)`,
      `${scenes.filter(s => s.type === 'footage').length} footage scene(s) need recordings (see the shot list)`
    ]
  }
}
