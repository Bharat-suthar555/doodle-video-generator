import { readFileSync, statSync } from 'node:fs'
import { compileScene } from '../animation/compile.ts'
import { labelBadge } from '../footage/badge.ts'
import type { CompiledScene, NarrationTiming } from '../animation/types.ts'
import { UserError } from '../core/errors.ts'
import { mediaDuration } from '../core/ffmpeg.ts'
import { sha256, stableStringify } from '../core/hash.ts'
import { codeFingerprint, resolveFrom } from '../core/paths.ts'
import type { LoadedStoryboard } from '../storyboard/load.ts'
import { frameSize, type Element, type Scene, type Storyboard, type TransitionType } from '../storyboard/schema.ts'

export interface NarrationPlan extends NarrationTiming {
  /** Absolute narration audio path, when the scene has recorded or generated audio. */
  audioFile?: string
  /** Start of the first word, in seconds from the start of the final video. */
  absoluteStart: number
}

export interface ScenePlan {
  id: string
  index: number
  type: 'whiteboard' | 'footage'
  chapter?: string
  frames: number
  startFrame: number
  /** Seconds from the start of the final video. */
  start: number
  duration: number
  transition?: { type: TransitionType; frames: number }
  narration?: NarrationPlan
  compiled?: CompiledScene
  footage?: { source: string; trimStart: number; available: number }
  /** Cache key: changes whenever anything that affects this scene's pixels changes. */
  hash: string
}

export interface TimelinePlan {
  fps: number
  width: number
  height: number
  designWidth: number
  designHeight: number
  scenes: ScenePlan[]
  totalFrames: number
  duration: number
  chapters: { time: number; title: string; sceneId: string }[]
  warnings: string[]
  errors: string[]
  /** True when any narration duration or cue time is an estimate. */
  estimatedTiming: boolean
}

export interface WordTiming {
  word: string
  start: number
  end: number
}

/** Rough spoken duration of text at a words-per-minute rate, with sentence pauses. */
export const estimateSpeech = (text: string, wpm: number) => {
  const words = text.split(/\s+/).filter(Boolean).length
  const pauses = (text.match(/[.!?;:](\s|$)/g) ?? []).length
  return (words / wpm) * 60 + pauses * 0.25
}

export const readWordTimings = (file: string): WordTiming[] => {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new UserError(`Could not read word timings ${file}: ${(error as Error).message}`)
  }
  const list = Array.isArray(data) ? data : (data as { words?: unknown }).words
  if (!Array.isArray(list)) throw new UserError(`${file} must be a JSON array of { word, start, end }`)
  return list.map((w, i) => {
    const { word, start, end } = w as Partial<WordTiming>
    if (typeof word !== 'string' || typeof start !== 'number' || typeof end !== 'number' || end < start)
      throw new UserError(`${file}: entry ${i} needs a word, a start and an end (seconds, end >= start)`)
    return { word, start, end }
  })
}

const fileStamp = (file: string) => {
  try {
    const s = statSync(file)
    return `${s.size}:${s.mtimeMs}`
  } catch {
    return 'missing'
  }
}

const referencedFiles = (elements: Element[]): string[] =>
  elements.flatMap(el =>
    el.type === 'svg' || el.type === 'image' ? [el.file] : el.type === 'group' ? referencedFiles(el.children) : []
  )

export interface PlanOptions {
  /** Plan even when footage or audio files are missing (for storyboard review). */
  allowMissing?: boolean
}

const narrationFor = async (
  sb: Storyboard,
  scene: Scene,
  baseDir: string,
  options: PlanOptions,
  errors: string[]
): Promise<Omit<NarrationPlan, 'absoluteStart'> | undefined> => {
  const n = scene.narration
  if (!n || (!n.text && !n.audio)) return undefined
  const offset = n.offset ?? sb.narration.leadIn
  let words: WordTiming[] | undefined
  if (n.words) words = readWordTimings(resolveFrom(baseDir, n.words))
  if (n.audio) {
    const audioFile = resolveFrom(baseDir, n.audio)
    try {
      const duration = await mediaDuration(audioFile)
      return { offset, duration, text: n.text, words, estimated: false, audioFile }
    } catch (error) {
      if (!options.allowMissing) {
        errors.push(`${scene.id}: narration audio ${n.audio} could not be read (${(error as Error).message})`)
      }
    }
  }
  if (!n.text) return undefined
  return { offset, duration: estimateSpeech(n.text, sb.narration.wordsPerMinute), text: n.text, words, estimated: true }
}

/** Plans scene durations, frame positions, transitions and chapters for a storyboard. */
export const planTimeline = async (loaded: LoadedStoryboard, options: PlanOptions = {}): Promise<TimelinePlan> => {
  const sb = loaded.storyboard
  const { width, height, designWidth, designHeight } = frameSize(sb)
  const fps = sb.format.fps
  const warnings: string[] = []
  const errors: string[] = []
  let estimatedTiming = false
  const drafts: (Omit<ScenePlan, 'startFrame' | 'start' | 'frames' | 'duration' | 'narration'> & {
    seconds: number
    auto: boolean
    narration?: Omit<NarrationPlan, 'absoluteStart'>
  })[] = []

  for (const [index, scene] of sb.scenes.entries()) {
    const narration = await narrationFor(sb, scene, loaded.baseDir, options, errors)
    if (narration?.estimated) estimatedTiming = true
    const narrationEnd = narration ? narration.offset + narration.duration : 0
    let content = 0
    let compiled: CompiledScene | undefined
    let footage: ScenePlan['footage']
    if (scene.type === 'footage') {
      const f = scene.footage
      if (!f) {
        errors.push(`${scene.id}: footage scenes need a "footage" section`)
        continue
      }
      if (f.provenance === 'mock' && !f.label)
        errors.push(`${scene.id}: mock footage needs a visible "label" such as "Mock demo · fictional data"`)
      if (!f.source) {
        if (!options.allowMissing) errors.push(`${scene.id}: footage has no "source" yet (see the shot list)`)
        content = scene.duration === 'auto' ? Math.max(5, narrationEnd) : scene.duration
      } else {
        const source = resolveFrom(loaded.baseDir, f.source)
        try {
          const total = await mediaDuration(source)
          const end = Math.min(f.trim.end ?? total, total)
          const available = end - f.trim.start
          if (available <= 0) errors.push(`${scene.id}: trim leaves no footage (source is ${total.toFixed(2)}s)`)
          footage = { source, trimStart: f.trim.start, available: Math.max(0, available) }
          content = footage.available
        } catch (error) {
          if (!options.allowMissing) errors.push(`${scene.id}: footage ${f.source} could not be read (${(error as Error).message})`)
          content = Math.max(5, narrationEnd)
        }
      }
      // Callouts may reference narration cues; compile them like a whiteboard layer
      if (f.callouts.length || f.label) {
        const elements = [...(f.label ? labelBadge(f.label, designWidth, designHeight) : []), ...f.callouts]
        const overlayStyle = { ...sb.style, roughness: sb.style.roughness, hand: { ...sb.style.hand, enabled: false } }
        compiled = compileScene({ ...sb, style: overlayStyle }, { ...scene, elements, camera: [] }, { baseDir: loaded.baseDir, narration })
        warnings.push(...compiled.warnings)
      }
    } else {
      try {
        compiled = compileScene(sb, scene, { baseDir: loaded.baseDir, narration })
      } catch (error) {
        if (error instanceof UserError) {
          errors.push(error.message)
          continue
        }
        throw error
      }
      warnings.push(...compiled.warnings)
      if (compiled.estimatedCues) estimatedTiming = true
      content = compiled.contentEnd + (scene.holdAfter ?? sb.style.hold)
    }
    const auto = scene.duration === 'auto'
    const seconds = auto ? Math.max(content, narration ? narrationEnd + sb.narration.tail : 0, 0.5) : (scene.duration as number)
    if (narration && narrationEnd > seconds + 1e-6)
      errors.push(
        `${scene.id}: narration ends at ${narrationEnd.toFixed(2)}s but the scene lasts ${seconds.toFixed(2)}s; ` +
          `use "duration": "auto" or a longer duration (narration is never sped up)`
      )
    if (scene.type === 'whiteboard' && compiled && !auto && compiled.contentEnd > seconds)
      warnings.push(`${scene.id}: animations run until ${compiled.contentEnd.toFixed(2)}s but the scene lasts ${seconds.toFixed(2)}s`)
    const assetStamps = [
      ...referencedFiles(scene.elements),
      ...referencedFiles(scene.footage?.callouts ?? [])
    ].map(f => fileStamp(resolveFrom(loaded.baseDir, f)))
    drafts.push({
      id: scene.id,
      index,
      type: scene.type,
      chapter: scene.chapter,
      transition: scene.transition && scene.transition.type !== 'cut' && index > 0
        ? { type: scene.transition.type, frames: Math.round(scene.transition.duration * fps) }
        : undefined,
      narration,
      compiled,
      footage,
      seconds,
      auto,
      hash: sha256(
        stableStringify({
          code: codeFingerprint(),
          scene,
          style: sb.style,
          format: sb.format,
          narration: narration && { offset: narration.offset, duration: narration.duration, words: narration.words?.length },
          assets: assetStamps,
          footage: footage && { ...footage, stamp: fileStamp(footage.source) }
        })
      ).slice(0, 16)
    })
  }

  // Auto scenes grow by the next transition so the overlap never covers content
  drafts.forEach((d, i) => {
    const next = drafts[i + 1]
    if (d.auto && next?.transition) d.seconds += next.transition.frames / fps
  })

  const scenes: ScenePlan[] = []
  let cursor = 0
  drafts.forEach((d, i) => {
    const frames = Math.max(1, Math.ceil(d.seconds * fps - 1e-9))
    let transition = d.transition
    if (transition && i > 0) {
      const prevFrames = scenes[i - 1].frames
      const maxFrames = Math.min(prevFrames, frames) - 1
      if (transition.frames > maxFrames) {
        warnings.push(`${d.id}: transition shortened to fit the neighboring scenes`)
        transition = maxFrames > 0 ? { ...transition, frames: maxFrames } : undefined
      }
    }
    const startFrame = i === 0 ? 0 : cursor - (transition?.frames ?? 0)
    cursor = startFrame + frames
    const { seconds: _s, auto: _a, narration, ...rest } = d
    scenes.push({
      ...rest,
      transition,
      frames,
      startFrame,
      start: startFrame / fps,
      duration: frames / fps,
      narration: narration && { ...narration, absoluteStart: startFrame / fps + narration.offset }
    })
  })

  const chapters = scenes.filter(s => s.chapter).map(s => ({ time: s.start, title: s.chapter!, sceneId: s.id }))
  return {
    fps,
    width,
    height,
    designWidth,
    designHeight,
    scenes,
    totalFrames: cursor,
    duration: cursor / fps,
    chapters,
    warnings,
    errors,
    estimatedTiming
  }
}

/** Formats seconds as a YouTube timestamp: m:ss, or h:mm:ss past an hour. */
export const youtubeTimestamp = (seconds: number) => {
  const s = Math.floor(seconds + 1e-6)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
