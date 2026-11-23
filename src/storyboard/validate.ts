import { existsSync } from 'node:fs'
import { contentBounds } from '../animation/compile.ts'
import type { CompiledScene, Drawable } from '../animation/types.ts'
import { overlapArea, type Box } from '../core/geometry.ts'
import { resolveFrom } from '../core/paths.ts'
import { icons } from '../drawing/icons.ts'
import { chapterWarnings } from '../timeline/metadata.ts'
import { planTimeline, type TimelinePlan } from '../timeline/plan.ts'
import type { LoadedStoryboard } from './load.ts'
import type { Element } from './schema.ts'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
  notes: string[]
  plan?: TimelinePlan
}

const walk = (elements: Element[], fn: (el: Element) => void) => {
  for (const el of elements) {
    fn(el)
    if (el.type === 'group') walk(el.children, fn)
  }
}

const visibleTogether = (a: Drawable, b: Drawable) => {
  const end = (d: Drawable) => (d.exit ? d.exit.start + d.exit.duration : Infinity)
  return a.anim.start < end(b) && b.anim.start < end(a)
}

const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 2 && inner.y >= outer.y - 2 && inner.x + inner.width <= outer.x + outer.width + 2 && inner.y + inner.height <= outer.y + outer.height + 2

/** Layout problems: content off the board, outside the safe area, under captions, or overlapping. */
export const layoutIssues = (scene: CompiledScene, captionZone?: Box) => {
  const warnings: string[] = []
  const errors: string[] = []
  const W = scene.designWidth
  const H = scene.designHeight
  const safe = { x: W * 0.04, y: H * 0.04, width: W * 0.92, height: H * 0.92 }
  for (const d of scene.drawables) {
    const b = d.box
    if (!b.width && !b.height) continue
    if (b.x < -1 || b.y < -1 || b.x + b.width > W + 1 || b.y + b.height > H + 1)
      errors.push(`${scene.id}: "${d.id}" extends past the edge of the frame and will be clipped`)
    else if (!contains(safe, b)) warnings.push(`${scene.id}: "${d.id}" is outside the 4% safe margin`)
    if (captionZone && d.textual && overlapArea(b, captionZone) > 0)
      warnings.push(`${scene.id}: "${d.id}" sits in the caption area and may be covered by subtitles`)
  }
  const solid = scene.drawables.filter(d => !d.decorative && d.box.width > 0)
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]
      const b = solid[j]
      const area = overlapArea(a.box, b.box)
      if (!area || !visibleTogether(a, b)) continue
      // Something drawn inside a shape (a label in a box) is intentional
      if (contains(a.box, b.box) || contains(b.box, a.box)) continue
      const smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height)
      if ((a.textual || b.textual) && area > smaller * 0.05) warnings.push(`${scene.id}: "${a.id}" and "${b.id}" overlap`)
      else if (area > smaller * 0.25) warnings.push(`${scene.id}: "${a.id}" and "${b.id}" overlap by ${Math.round((area / smaller) * 100)}%`)
    }
  return { warnings, errors }
}

/** Full validation: schema already passed; checks files, references, timing and layout. */
export const validateStoryboard = async (loaded: LoadedStoryboard, options: { allowMissing?: boolean } = {}): Promise<ValidationResult> => {
  const sb = loaded.storyboard
  const errors: string[] = []
  const warnings: string[] = []
  const notes: string[] = []
  const missing = (file: string | undefined, what: string) => {
    if (!file) return
    if (!existsSync(resolveFrom(loaded.baseDir, file))) (options.allowMissing ? warnings : errors).push(`${what} not found: ${file}`)
  }
  const sceneIds = new Set<string>()
  const sourceIds = new Set(sb.sources.map(s => s.id))
  let generated = 0
  let sourced = 0
  for (const scene of sb.scenes) {
    if (sceneIds.has(scene.id)) errors.push(`Duplicate scene id "${scene.id}"`)
    sceneIds.add(scene.id)
    const ids = new Set<string>()
    const check = (el: Element) => {
      if (el.id) {
        if (ids.has(el.id)) errors.push(`${scene.id}: duplicate element id "${el.id}"`)
        ids.add(el.id)
      }
      if (el.type === 'icon' && !icons[el.name]) errors.push(`${scene.id}: unknown icon "${el.name}" (run \`doodle-video-generator icons\`)`)
      if (el.type === 'node' && el.icon && !icons[el.icon]) errors.push(`${scene.id}: unknown icon "${el.icon}"`)
      if (el.type === 'flowchart') {
        for (const n of el.nodes) {
          if (ids.has(n.id)) errors.push(`${scene.id}: duplicate element id "${n.id}"`)
          ids.add(n.id)
          if (n.icon && !icons[n.icon]) errors.push(`${scene.id}: unknown icon "${n.icon}"`)
        }
        for (const e of el.edges)
          if (!el.nodes.some(n => n.id === e.from) || !el.nodes.some(n => n.id === e.to))
            errors.push(`${scene.id}: flowchart edge ${e.from} -> ${e.to} refers to a missing node`)
      }
      if (el.type === 'svg' || el.type === 'image') missing(el.file, `${scene.id}: ${el.type} file`)
    }
    walk(scene.elements, check)
    walk(scene.footage?.callouts ?? [], check)
    missing(scene.narration?.audio, `${scene.id}: narration audio`)
    missing(scene.narration?.words, `${scene.id}: word timings`)
    if (scene.type === 'footage') missing(scene.footage?.source, `${scene.id}: footage`)
    if (scene.type === 'whiteboard' && scene.footage) warnings.push(`${scene.id}: has a footage section but type "whiteboard"; set "type": "footage" to use it`)
    if (scene.type === 'whiteboard' && !scene.elements.length) warnings.push(`${scene.id}: whiteboard scene has no elements`)
    if (scene.narration?.text) {
      if (scene.narration.provenance === 'generated') generated++
      if (scene.narration.provenance === 'source') {
        sourced++
        if (!scene.narration.sourceIds?.length) warnings.push(`${scene.id}: narration provenance is "source" but lists no sourceIds`)
      }
      for (const id of scene.narration.sourceIds ?? []) if (!sourceIds.has(id)) errors.push(`${scene.id}: narration cites unknown source "${id}"`)
    }
    if (scene.footage?.provenance === 'mock') notes.push(`${scene.id}: uses mock footage labeled "${scene.footage.label ?? '(no label)'}"`)
  }
  missing(sb.audio.music?.file, 'Music file')
  if (generated) notes.push(`${generated} scene(s) have generated narration: check every factual claim before publishing`)
  if (sourced) notes.push(`${sourced} scene(s) have narration based on cited sources`)

  let plan: TimelinePlan | undefined
  if (!errors.length) {
    plan = await planTimeline(loaded, { allowMissing: options.allowMissing })
    errors.push(...plan.errors)
    warnings.push(...plan.warnings)
    const burn = sb.subtitles.enabled && sb.subtitles.burnIn
    const zone = (H: number, W: number): Box =>
      sb.subtitles.position === 'top' ? { x: 0, y: 0, width: W, height: H * 0.16 } : { x: 0, y: H * (sb.format.aspect === '9:16' ? 0.76 : 0.82), width: W, height: H * 0.18 }
    for (const s of plan.scenes) {
      if (s.type !== 'whiteboard' || !s.compiled) continue
      const issues = layoutIssues(s.compiled, burn && s.narration?.text ? zone(plan.designHeight, plan.designWidth) : undefined)
      errors.push(...issues.errors)
      warnings.push(...issues.warnings)
      if (!s.compiled.drawables.length) continue
      const b = contentBounds(s.compiled)
      if (b.width < plan.designWidth * 0.2 && b.height < plan.designHeight * 0.2) warnings.push(`${s.id}: content covers a small part of the frame; consider larger elements`)
    }
    warnings.push(...chapterWarnings(plan.chapters, plan.duration))
    if (plan.estimatedTiming) notes.push('Some timing is estimated from text (no narration audio or word timings yet)')
  }
  return { errors, warnings: [...new Set(warnings)], notes, plan }
}
