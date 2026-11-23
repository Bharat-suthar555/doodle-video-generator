import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { compileScene } from '../animation/compile.ts'
import { renderFrameSvg } from '../animation/frame.ts'
import { narrate } from '../audio/narrator.ts'
import { formatError, UserError } from '../core/errors.ts'
import { probe } from '../core/ffmpeg.ts'
import { info, setQuiet, warn } from '../core/log.ts'
import { examplesPath, packageRoot, toolVersion } from '../core/paths.ts'
import { iconNames } from '../drawing/icons.ts'
import { loadRecording, recordBrowser } from '../recorder/record.ts'
import { rasterizePng } from '../renderer/rasterize.ts'
import { renderScenes } from '../renderer/render.ts'
import { storyboardFromScript } from '../storyboard/from-script.ts'
import { loadStoryboard, type LoadedStoryboard } from '../storyboard/load.ts'
import { defaultCharsPerLine } from '../subtitles/segment.ts'
import { shotList } from '../storyboard/shot-list.ts'
import { validateStoryboard } from '../storyboard/validate.ts'
import { assemble } from '../timeline/assemble.ts'
import { youtubeMarkdown, youtubeMetadata } from '../timeline/metadata.ts'
import { planTimeline, youtubeTimestamp, type TimelinePlan } from '../timeline/plan.ts'
import { inspectVideo, type InspectReport } from '../validation/inspect.ts'

const templates = ['whiteboard-explainer', 'software-demo', 'vertical-short'] as const

const help: Record<string, string> = {
  main: `doodle-video-generator ${toolVersion}

Render whiteboard doodle animations and explainer videos from a JSON storyboard.

Usage: doodle-video-generator <command> [options]

Commands:
  init [dir]                 Create a project from a template
  storyboard <subcommand>    from-script, shot-list or timeline
  validate <storyboard>      Check a storyboard: schema, files, timing and layout
  render <storyboard>        Render scene clips (cached), or one still frame
  assemble <storyboard>      Join scene clips with transitions, subtitles and audio
  build <storyboard>         render + assemble + inspect in one step
  inspect <video>            Technical quality checks with a JSON report
  chapters <storyboard>      YouTube chapters and metadata from the timeline
  narrate <storyboard>       Generate narration with the optional demo-narrator skill
  record <recording.json>    Record a local web app with a scripted browser (optional)
  demo [--out dir]           Render the built-in 30-second demo and check it
  icons                      List built-in icons
  schema                     Print the storyboard JSON Schema path

Run "doodle-video-generator <command> --help" for command options.`,
  init: `Usage: doodle-video-generator init [dir] [--template <name>]

Copies a template project into dir (default: ./doodle-video). Templates:
  ${templates.join(', ')} (default: whiteboard-explainer)
Existing files are never overwritten.`,
  storyboard: `Usage:
  doodle-video-generator storyboard from-script <script.md> [--out storyboard.json]
      [--title <text>] [--aspect 16:9|9:16|1:1] [--wpm 150] [--generated]
  doodle-video-generator storyboard shot-list <storyboard.json> [--out shots.md]
  doodle-video-generator storyboard timeline <storyboard.json> [--json] [--allow-missing]

from-script: "# Title" names the project, each "## Heading" starts a scene,
paragraphs become narration, "[visual: …]" lines become notes and
"[footage: …]" lines create footage scenes for the shot list. Narration is
marked as the user's words unless you pass --generated.`,
  validate: `Usage: doodle-video-generator validate <storyboard.json> [--allow-missing] [--json]

Checks the schema, referenced files, element ids, icons, narration timing
(narration is never sped up, so it must fit its scene), layout overlaps, the
safe area and the caption area. Exits 1 when there are errors.
--allow-missing  plan even when footage or audio files don't exist yet`,
  render: `Usage: doodle-video-generator render <storyboard.json> [--scene <id>]... [--jobs <n>] [--force]
       doodle-video-generator render <storyboard.json> --still <seconds> --scene <id> [--out frame.png]

Renders each scene to a cached clip in .dvg-work/ next to the storyboard. Only
changed or failed scenes render again. --still writes one PNG frame of a
whiteboard scene for a quick visual check.`,
  assemble: `Usage: doodle-video-generator assemble <storyboard.json> [--output <file.mp4>]
       [--subtitles burn|srt|none] [--overwrite]

Joins the rendered scene clips with their transitions, mixes narration and
music, burns in or writes subtitles, embeds chapters and writes the MP4 plus
.srt, .timeline.json, .youtube.md and .youtube.json next to it. It replaces an
earlier output of this tool, but never another file unless you pass --overwrite.`,
  build: `Usage: doodle-video-generator build <storyboard.json> [--jobs <n>] [--force] [--output <file.mp4>]
       [--subtitles burn|srt|none] [--overwrite] [--frames <n>]

Runs render, assemble and inspect. Writes <output>.report.json and exits 1 if
any quality check fails.`,
  inspect: `Usage: doodle-video-generator inspect <video.mp4> [--storyboard <file>] [--timeline <file>]
       [--srt <file>] [--report <file.json>] [--frames <n>] [--frames-dir <dir>]
       [--expect-width <px>] [--expect-height <px>] [--expect-fps <n>] [--expect-duration <s>]
       [--target-lufs <n>] [--require-audio] [--json]

Runs FFprobe and FFmpeg analysis: codecs, resolution, frame rate, duration,
decode errors, black frames, loudness, true peak, clipping, silence, subtitle
overlaps and timing, chapters and timeline continuity. With --storyboard it
reads the expected values and the sidecar files written by assemble. It
doesn't listen to audio or judge visuals; --frames extracts stills for review.`,
  chapters: `Usage: doodle-video-generator chapters <storyboard.json> [--json] [--write <file.md>] [--allow-missing]

Prints YouTube chapters, title, description and tags from the planned timeline.
Timestamps come from the same plan the renderer uses, so they match the video
once it is rendered with the same narration audio.`,
  narrate: `Usage: doodle-video-generator narrate <storyboard.json> [--narrator <dir>] [--voice <name>]
       [--engine auto|kokoro|piper] [--output <storyboard.narrated.json>]

Uses the optional demo-narrator skill to synthesize one WAV per narrated scene.
The first run writes demo-narrator's script.json and exits with code 2: show
the narration to the person, and only after they approve it run the printed
--approve command, then run narrate again. Clips are never sped up.`,
  record: `Usage: doodle-video-generator record <recording.json> --output <file.mp4>
       [--allow-host <hostname>]... [--browser <path>] [--headed]
       [--allow-external-resources] [--overwrite]

Records a scripted session in a Chromium-based browser (needs the optional
playwright-core package). Only local addresses and file URLs open unless you
pass --allow-host for a site you own or may record. Typed text is never logged;
use typeSecret steps with an environment variable for passwords.`,
  demo: `Usage: doodle-video-generator demo [--out <dir>] [--jobs <n>]

Copies the built-in whiteboard storyboard into <dir> (default ./doodle-demo),
renders a 30-second 1920x1080 video and runs the quality checks.`
}

const showHelp = (text: string, code = 0) => {
  process.stdout.write(`${text}\n`)
  return code
}

const printJson = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

type Values = Record<string, string | boolean | (string | boolean)[] | undefined>

const parse = (args: string[], options: NonNullable<Parameters<typeof parseArgs>[0]>['options']): { values: Values; positionals: string[] } => {
  try {
    const result = parseArgs({ args, options: { help: { type: 'boolean', short: 'h' }, quiet: { type: 'boolean', short: 'q' }, ...options }, allowPositionals: true, strict: true })
    return { values: result.values as Values, positionals: result.positionals }
  } catch (error) {
    throw new UserError((error as Error).message)
  }
}

const needPositional = (positionals: string[], what: string, command: string) => {
  if (!positionals[0]) throw new UserError(`Missing ${what}.`, `Usage: see "doodle-video-generator ${command} --help"`)
  return positionals[0]
}

const numberOpt = (value: unknown, name: string) => {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) throw new UserError(`--${name} must be a number`)
  return n
}

const printIssues = (r: { errors: string[]; warnings: string[]; notes: string[] }) => {
  for (const e of r.errors) process.stderr.write(`error: ${e}\n`)
  for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`)
  for (const n of r.notes) process.stderr.write(`note: ${n}\n`)
}

const timelineTable = (plan: TimelinePlan) => {
  const rows = plan.scenes.map(
    s =>
      `${youtubeTimestamp(s.start).padStart(7)}  ${s.duration.toFixed(2).padStart(6)}s  ${s.type.padEnd(10)} ${s.id}${s.chapter ? `  [${s.chapter}]` : ''}${s.narration ? `  narration ${s.narration.duration.toFixed(1)}s${s.narration.estimated ? ' (estimated)' : ''}` : ''}`
  )
  return [`  start  length   type       scene`, ...rows, `Total: ${plan.duration.toFixed(2)}s, ${plan.totalFrames} frames at ${plan.fps} fps, ${plan.width}x${plan.height}`].join('\n')
}

const reportText = (r: InspectReport) => {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' }
  return [
    `${r.file}`,
    ...r.checks.map(c => `  ${icon[c.status]}  ${c.id}: ${c.message}`),
    `Summary: ${r.summary.pass} passed, ${r.summary.warn} warnings, ${r.summary.fail} failed, ${r.summary.skip} skipped`,
    ...r.notPerformed.map(n => `  Not checked: ${n}`)
  ].join('\n')
}

const sidecars = (video: string) => {
  const base = video.replace(/\.mp4$/i, '')
  return { srt: `${base}.srt`, timeline: `${base}.timeline.json`, report: `${base}.report.json` }
}

const inspectFor = async (video: string, loaded: LoadedStoryboard | undefined, values: Record<string, unknown>) => {
  const side = sidecars(video)
  let expect: NonNullable<Parameters<typeof inspectVideo>[1]>['expect'] = {}
  let subtitleLimits = {}
  let targetLufs = numberOpt(values['target-lufs'], 'target-lufs')
  let requireAudio = Boolean(values['require-audio'])
  if (loaded) {
    const plan = await planTimeline(loaded)
    const sb = loaded.storyboard
    expect = { width: plan.width, height: plan.height, fps: plan.fps, duration: plan.duration }
    subtitleLimits = { maxLines: sb.subtitles.maxLines, maxCharsPerLine: sb.subtitles.maxCharsPerLine ?? defaultCharsPerLine(sb.format.aspect), minCaptionDuration: sb.subtitles.minDuration }
    targetLufs ??= sb.audio.normalize.targetLufs
    requireAudio ||= plan.scenes.some(s => s.narration?.audioFile) || Boolean(sb.audio.music)
  }
  expect = {
    ...expect,
    ...(values['expect-width'] !== undefined && { width: numberOpt(values['expect-width'], 'expect-width') }),
    ...(values['expect-height'] !== undefined && { height: numberOpt(values['expect-height'], 'expect-height') }),
    ...(values['expect-fps'] !== undefined && { fps: numberOpt(values['expect-fps'], 'expect-fps') }),
    ...(values['expect-duration'] !== undefined && { duration: numberOpt(values['expect-duration'], 'expect-duration') })
  }
  const srt = (values.srt as string | undefined) ?? (loaded && existsSync(side.srt) ? side.srt : undefined)
  const timeline = (values.timeline as string | undefined) ?? (loaded && existsSync(side.timeline) ? side.timeline : undefined)
  const frames = numberOpt(values.frames, 'frames')
  return inspectVideo(video, {
    expect,
    srt,
    timeline,
    targetLufs,
    requireAudio,
    ...subtitleLimits,
    frames: frames ? { count: Math.max(1, Math.min(48, Math.round(frames))), dir: (values['frames-dir'] as string | undefined) ?? `${video.replace(/\.mp4$/i, '')}.frames` } : undefined
  })
}

/** Replaces only files this tool wrote, unless --overwrite says otherwise. */
const guardOutput = async (file: string, overwrite: boolean) => {
  if (overwrite || !existsSync(file)) return
  const info = await probe(file).catch(() => undefined)
  const comment = (info?.format as { tags?: { comment?: string } } | undefined)?.tags?.comment ?? ''
  if (!comment.startsWith('Rendered by doodle-video-generator'))
    throw new UserError(`${file} exists and was not written by this tool.`, 'Pass --overwrite to replace it, or choose another --output.')
}

const commands: Record<string, (args: string[]) => Promise<number>> = {
  async init(args) {
    const { values, positionals } = parse(args, { template: { type: 'string', short: 't' } })
    if (values.help) return showHelp(help.init, 0)
    const template = (values.template as string | undefined) ?? 'whiteboard-explainer'
    if (!templates.includes(template as (typeof templates)[number])) throw new UserError(`Unknown template "${template}". Choose one of: ${templates.join(', ')}`)
    const dir = path.resolve(positionals[0] ?? 'doodle-video')
    mkdirSync(dir, { recursive: true })
    const src = examplesPath(template)
    const skipped: string[] = []
    const copied: string[] = []
    const copy = (from: string, to: string) => {
      for (const name of readdirSync(from, { withFileTypes: true })) {
        if (['output', '.dvg-work', 'narration', 'generated'].includes(name.name)) continue
        const a = path.join(from, name.name)
        const b = path.join(to, name.name)
        if (name.isDirectory()) {
          mkdirSync(b, { recursive: true })
          copy(a, b)
        } else if (existsSync(b)) skipped.push(path.relative(dir, b))
        else {
          cpSync(a, b)
          copied.push(path.relative(dir, b))
        }
      }
    }
    copy(src, dir)
    info(`Created ${template} project in ${dir}`)
    for (const f of copied) info(`  + ${f}`)
    for (const f of skipped) warn(`kept existing ${f}`)
    info(`Next: doodle-video-generator validate ${path.relative(process.cwd(), path.join(dir, 'storyboard.json')) || 'storyboard.json'}`)
    return 0
  },

  async storyboard(args) {
    const [sub, ...rest] = args
    const { values, positionals } = parse(rest, {
      out: { type: 'string', short: 'o' },
      title: { type: 'string' },
      aspect: { type: 'string' },
      wpm: { type: 'string' },
      generated: { type: 'boolean' },
      json: { type: 'boolean' },
      'allow-missing': { type: 'boolean' }
    })
    if (!sub || values.help || sub === '--help') return showHelp(help.storyboard, sub ? 0 : 1)
    if (sub === 'from-script') {
      const file = needPositional(positionals, 'script file', 'storyboard')
      const aspect = values.aspect as '16:9' | '9:16' | '1:1' | undefined
      if (aspect && !['16:9', '9:16', '1:1'].includes(aspect)) throw new UserError('--aspect must be 16:9, 9:16 or 1:1')
      const { storyboard, summary } = storyboardFromScript(readFileSync(file, 'utf8'), {
        title: values.title as string | undefined,
        aspect,
        wordsPerMinute: numberOpt(values.wpm, 'wpm'),
        provenance: values.generated ? 'generated' : 'user'
      })
      const out = path.resolve((values.out as string | undefined) ?? 'storyboard.json')
      if (existsSync(out)) throw new UserError(`${out} already exists`, 'Choose another --out path.')
      writeFileSync(out, `${JSON.stringify(storyboard, null, 2)}\n`)
      info(`Wrote ${out}`)
      for (const s of summary) info(`  ${s}`)
      info('Add visual elements to each scene, then run validate.')
      return 0
    }
    const file = needPositional(positionals, 'storyboard file', 'storyboard')
    const loaded = loadStoryboard(file)
    if (sub === 'shot-list') {
      const plan = await planTimeline(loaded, { allowMissing: true })
      const md = shotList(loaded.storyboard, plan)
      if (values.out) {
        writeFileSync(values.out as string, md)
        info(`Wrote ${values.out}`)
      } else process.stdout.write(md)
      return 0
    }
    if (sub === 'timeline') {
      const plan = await planTimeline(loaded, { allowMissing: Boolean(values['allow-missing']) })
      if (values.json)
        printJson({
          duration: plan.duration,
          totalFrames: plan.totalFrames,
          fps: plan.fps,
          estimatedTiming: plan.estimatedTiming,
          scenes: plan.scenes.map(s => ({ id: s.id, type: s.type, start: s.start, duration: s.duration, frames: s.frames, chapter: s.chapter, narration: s.narration && { start: s.narration.absoluteStart, duration: s.narration.duration, estimated: s.narration.estimated } })),
          errors: plan.errors,
          warnings: plan.warnings
        })
      else {
        process.stdout.write(`${timelineTable(plan)}\n`)
        printIssues({ errors: plan.errors, warnings: plan.warnings, notes: plan.estimatedTiming ? ['Timing marked (estimated) uses text length until narration audio exists'] : [] })
      }
      return plan.errors.length ? 1 : 0
    }
    throw new UserError(`Unknown storyboard subcommand "${sub}"`, 'Use from-script, shot-list or timeline.')
  },

  async validate(args) {
    const { values, positionals } = parse(args, { 'allow-missing': { type: 'boolean' }, json: { type: 'boolean' } })
    if (values.help) return showHelp(help.validate, 0)
    const file = needPositional(positionals, 'storyboard file', 'validate')
    let loaded: LoadedStoryboard
    try {
      loaded = loadStoryboard(file)
    } catch (error) {
      if (values.json && error instanceof UserError) {
        printJson({ ok: false, errors: error.message.split('\n  - ').slice(1), warnings: [], notes: [] })
        return 1
      }
      throw error
    }
    const result = await validateStoryboard(loaded, { allowMissing: Boolean(values['allow-missing']) })
    const summary = result.plan && { duration: result.plan.duration, scenes: result.plan.scenes.length, estimatedTiming: result.plan.estimatedTiming }
    if (values.json) printJson({ ok: !result.errors.length, errors: result.errors, warnings: result.warnings, notes: result.notes, summary })
    else {
      printIssues(result)
      if (result.plan) process.stdout.write(`${timelineTable(result.plan)}\n`)
      process.stdout.write(result.errors.length ? `${result.errors.length} error(s): fix them before rendering.\n` : `Storyboard is valid${result.warnings.length ? ` with ${result.warnings.length} warning(s)` : ''}.\n`)
    }
    return result.errors.length ? 1 : 0
  },

  async render(args) {
    const { values, positionals } = parse(args, {
      scene: { type: 'string', multiple: true, short: 's' },
      jobs: { type: 'string', short: 'j' },
      force: { type: 'boolean' },
      still: { type: 'string' },
      out: { type: 'string', short: 'o' }
    })
    if (values.help) return showHelp(help.render, 0)
    if (values.quiet) setQuiet(true)
    const loaded = loadStoryboard(needPositional(positionals, 'storyboard file', 'render'))
    if (values.still !== undefined) {
      const t = numberOpt(values.still, 'still')!
      const ids = (values.scene as string[] | undefined) ?? []
      const scene = ids.length ? loaded.storyboard.scenes.find(s => s.id === ids[0]) : loaded.storyboard.scenes[0]
      if (!scene) throw new UserError(`Unknown scene id: ${ids[0]}`)
      if (scene.type !== 'whiteboard') throw new UserError('--still works on whiteboard scenes only')
      const plan = await planTimeline(loaded, { allowMissing: true })
      const ps = plan.scenes.find(s => s.id === scene.id)
      const compiled = ps?.compiled ?? compileScene(loaded.storyboard, scene, { baseDir: loaded.baseDir })
      const out = path.resolve((values.out as string | undefined) ?? `${scene.id}-${t}s.png`)
      writeFileSync(out, rasterizePng(renderFrameSvg(compiled, t, { width: plan.width, height: plan.height })))
      info(`Wrote ${out}`)
      return 0
    }
    const plan = await planTimeline(loaded)
    for (const w of plan.warnings) warn(w)
    const clips = await renderScenes(loaded, plan, { only: values.scene as string[] | undefined, jobs: numberOpt(values.jobs, 'jobs'), force: Boolean(values.force) })
    for (const c of clips) info(`  ${existsSync(c.file) ? 'ready' : 'missing'}  ${c.id}  ${path.relative(process.cwd(), c.file)}`)
    return 0
  },

  async assemble(args) {
    const { values, positionals } = parse(args, { output: { type: 'string', short: 'o' }, subtitles: { type: 'string' }, overwrite: { type: 'boolean' } })
    if (values.help) return showHelp(help.assemble, 0)
    if (values.quiet) setQuiet(true)
    const loaded = loadStoryboard(needPositional(positionals, 'storyboard file', 'assemble'))
    const mode = values.subtitles as 'burn' | 'srt' | 'none' | undefined
    if (mode && !['burn', 'srt', 'none'].includes(mode)) throw new UserError('--subtitles must be burn, srt or none')
    const plan = await planTimeline(loaded)
    if (plan.errors.length) throw new UserError(`The storyboard has errors:\n  - ${plan.errors.join('\n  - ')}`)
    const output = path.resolve(loaded.baseDir, (values.output as string | undefined) ?? loaded.storyboard.export.output)
    await guardOutput(output, Boolean(values.overwrite))
    const result = await assemble(loaded, plan, { output, subtitles: mode, overwrite: true })
    printJson(result)
    return 0
  },

  async build(args) {
    const { values, positionals } = parse(args, {
      jobs: { type: 'string', short: 'j' },
      force: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      subtitles: { type: 'string' },
      overwrite: { type: 'boolean' },
      frames: { type: 'string' }
    })
    if (values.help) return showHelp(help.build, 0)
    if (values.quiet) setQuiet(true)
    const loaded = loadStoryboard(needPositional(positionals, 'storyboard file', 'build'))
    const validation = await validateStoryboard(loaded)
    printIssues(validation)
    if (validation.errors.length) return 1
    const plan = validation.plan!
    const output = path.resolve(loaded.baseDir, (values.output as string | undefined) ?? loaded.storyboard.export.output)
    await guardOutput(output, Boolean(values.overwrite))
    await renderScenes(loaded, plan, { jobs: numberOpt(values.jobs, 'jobs'), force: Boolean(values.force) })
    const result = await assemble(loaded, plan, { output, subtitles: values.subtitles as 'burn' | 'srt' | 'none' | undefined, overwrite: true })
    info('Checking the video…')
    const report = await inspectFor(result.video, loaded, { frames: values.frames ?? '8' })
    const reportFile = sidecars(result.video).report
    writeFileSync(reportFile, JSON.stringify(report, null, 2))
    process.stdout.write(`${reportText(report)}\n`)
    printJson({ ...result, report: reportFile, ok: report.summary.ok })
    return report.summary.ok ? 0 : 1
  },

  async inspect(args) {
    const { values, positionals } = parse(args, {
      storyboard: { type: 'string' },
      timeline: { type: 'string' },
      srt: { type: 'string' },
      report: { type: 'string' },
      frames: { type: 'string' },
      'frames-dir': { type: 'string' },
      'expect-width': { type: 'string' },
      'expect-height': { type: 'string' },
      'expect-fps': { type: 'string' },
      'expect-duration': { type: 'string' },
      'target-lufs': { type: 'string' },
      'require-audio': { type: 'boolean' },
      json: { type: 'boolean' }
    })
    if (values.help) return showHelp(help.inspect, 0)
    const video = path.resolve(needPositional(positionals, 'video file', 'inspect'))
    const loaded = values.storyboard ? loadStoryboard(values.storyboard as string) : undefined
    const report = await inspectFor(video, loaded, values)
    if (values.report) writeFileSync(values.report as string, JSON.stringify(report, null, 2))
    if (values.json) printJson(report)
    else process.stdout.write(`${reportText(report)}\n${values.report ? `Report: ${values.report}\n` : ''}`)
    return report.summary.ok ? 0 : 1
  },

  async chapters(args) {
    const { values, positionals } = parse(args, { json: { type: 'boolean' }, write: { type: 'string' }, 'allow-missing': { type: 'boolean' } })
    if (values.help) return showHelp(help.chapters, 0)
    const loaded = loadStoryboard(needPositional(positionals, 'storyboard file', 'chapters'))
    const plan = await planTimeline(loaded, { allowMissing: Boolean(values['allow-missing']) })
    const meta = youtubeMetadata(loaded.storyboard, plan)
    if (values.write) writeFileSync(values.write as string, youtubeMarkdown(meta, plan.duration))
    if (values.json) printJson({ ...meta, duration: plan.duration, estimatedTiming: plan.estimatedTiming })
    else {
      process.stdout.write(`${meta.chapters.map(c => `${c.timestamp} ${c.title}`).join('\n') || '(no chapters)'}\n`)
      for (const w of meta.chapterWarnings) warn(w)
      if (plan.estimatedTiming) warn('timing is estimated from text; timestamps can shift once narration audio exists')
    }
    return 0
  },

  async narrate(args) {
    const { values, positionals } = parse(args, { narrator: { type: 'string' }, voice: { type: 'string' }, engine: { type: 'string' }, output: { type: 'string', short: 'o' } })
    if (values.help) return showHelp(help.narrate, 0)
    const loaded = loadStoryboard(needPositional(positionals, 'storyboard file', 'narrate'))
    const engine = values.engine as 'auto' | 'kokoro' | 'piper' | undefined
    if (engine && !['auto', 'kokoro', 'piper'].includes(engine)) throw new UserError('--engine must be auto, kokoro or piper')
    const result = await narrate(loaded, { narratorDir: values.narrator as string | undefined, voice: values.voice as string | undefined, engine, output: values.output as string | undefined })
    if (result.status === 'needs-approval') {
      process.stdout.write(
        [
          'Narration needs approval before any audio is generated.',
          '',
          ...result.segments.map((s, i) => `${i + 1}. [${s.sceneId}] ${s.text}`),
          '',
          `Show this text to the person. Only after they approve it, run:`,
          `  ${result.approveCommand}`,
          'then run this narrate command again.',
          ''
        ].join('\n')
      )
      return 2
    }
    printJson(result)
    return 0
  },

  async record(args) {
    const { values, positionals } = parse(args, {
      output: { type: 'string', short: 'o' },
      'allow-host': { type: 'string', multiple: true },
      browser: { type: 'string' },
      headed: { type: 'boolean' },
      'allow-external-resources': { type: 'boolean' },
      overwrite: { type: 'boolean' }
    })
    if (values.help) return showHelp(help.record, 0)
    const file = path.resolve(needPositional(positionals, 'recording script', 'record'))
    if (!values.output) throw new UserError('Pass --output <file.mp4>')
    const result = await recordBrowser(loadRecording(file), path.dirname(file), {
      output: path.resolve(values.output as string),
      allowHosts: values['allow-host'] as string[] | undefined,
      browser: values.browser as string | undefined,
      headed: Boolean(values.headed),
      allowExternalResources: Boolean(values['allow-external-resources']),
      overwrite: Boolean(values.overwrite)
    })
    printJson(result)
    return 0
  },

  async demo(args) {
    const { values } = parse(args, { out: { type: 'string', short: 'o' }, jobs: { type: 'string', short: 'j' } })
    if (values.help) return showHelp(help.demo, 0)
    const dir = path.resolve((values.out as string | undefined) ?? 'doodle-demo')
    if (path.resolve(dir).startsWith(packageRoot + path.sep)) throw new UserError('Choose an --out directory outside the toolkit folder.')
    mkdirSync(dir, { recursive: true })
    const target = path.join(dir, 'storyboard.json')
    if (!existsSync(target)) cpSync(examplesPath('whiteboard-explainer', 'storyboard.json'), target)
    else info(`Using the existing ${target}`)
    return commands.build([target, '--overwrite', ...(values.jobs ? ['--jobs', values.jobs as string] : [])])
  },

  async icons(args) {
    const { values } = parse(args, { json: { type: 'boolean' } })
    if (values.json) printJson(iconNames)
    else process.stdout.write(`${iconNames.join('\n')}\n`)
    return 0
  },

  async schema(args) {
    const { values } = parse(args, { print: { type: 'boolean' } })
    const file = path.join(packageRoot, 'schema', 'storyboard.schema.json')
    if (values.print) process.stdout.write(readFileSync(file, 'utf8'))
    else process.stdout.write(`${file}\n`)
    return 0
  }
}

/** CLI entry point. Returns the process exit code. */
export const main = async (argv: string[]): Promise<number> => {
  const [command, ...args] = argv
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(`${help.main}\n`)
    return command ? 0 : 1
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${toolVersion}\n`)
    return 0
  }
  const run = commands[command]
  if (!run) {
    process.stderr.write(`Unknown command "${command}".\n\n${help.main}\n`)
    return 1
  }
  try {
    return await run(args)
  } catch (error) {
    process.stderr.write(`error: ${formatError(error)}\n`)
    return 1
  }
}
