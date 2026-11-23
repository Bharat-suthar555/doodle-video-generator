import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { UserError } from '../core/errors.ts'
import { ffmpeg, parseRate, probe, requireFfmpeg, run, ffmpegBin, type ProbeResult } from '../core/ffmpeg.ts'
import { toolVersion } from '../core/paths.ts'
import { parseSrt, type SrtEntry } from '../subtitles/format.ts'
import { chapterWarnings } from '../timeline/metadata.ts'

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface Check {
  id: string
  status: CheckStatus
  message: string
  details?: unknown
}

export interface InspectOptions {
  expect?: { width?: number; height?: number; fps?: number; duration?: number; videoCodec?: string; audioCodec?: string }
  srt?: string
  timeline?: string
  /** Subtitle limits. */
  maxLines?: number
  maxCharsPerLine?: number
  minCaptionDuration?: number
  targetLufs?: number
  /** Write this many evenly spaced frames plus a contact sheet into this directory. */
  frames?: { count: number; dir: string }
  /** Treat a missing audio stream as a failure. */
  requireAudio?: boolean
}

export interface InspectReport {
  file: string
  tool: string
  generatedAt: string
  metadata: {
    duration: number
    sizeBytes: number
    video?: { codec?: string; profile?: string; width?: number; height?: number; fps: number; pixFmt?: string; frames?: number }
    audio?: { codec?: string; sampleRate?: number; channels?: number }
    chapters: { start: number; title?: string }[]
  }
  audioStats?: { integratedLufs?: number; truePeakDb?: number; peakDb?: number; silences: { start: number; end: number }[] }
  checks: Check[]
  summary: { pass: number; warn: number; fail: number; skip: number; ok: boolean }
  framesWritten?: string[]
  /** Checks a person still has to do: this tool doesn't watch or listen. */
  notPerformed: string[]
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s))

/** One decoding pass: black frames, loudness, peaks and silence, plus decode errors. */
const analyze = async (file: string, hasAudio: boolean, hasVideo: boolean) => {
  const filters: string[] = []
  if (hasVideo) filters.push('-filter:v', 'blackdetect=d=0.5:pix_th=0.10')
  if (hasAudio) filters.push('-filter:a', 'astats=metadata=0:reset=0:measure_overall=Peak_level+Number_of_samples:measure_perchannel=none,silencedetect=n=-50dB:d=1.5,ebur128=peak=true:framelog=quiet')
  const result = await run(ffmpegBin(), ['-hide_banner', '-nostdin', '-loglevel', 'level+info', '-i', file, ...filters, '-f', 'null', '-'])
  const lines = result.stderr.split('\n')
  const decodeErrors = lines.filter(l => /\[(error|fatal)\]/.test(l) && !/^\s*$/.test(l)).slice(0, 50)
  const black = [...result.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(m => ({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) }))
  const silenceStarts = [...result.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map(m => Number(m[1]))
  const silenceEnds = [...result.stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]))
  const silences = silenceStarts.map((start, i) => ({ start: Math.max(0, start), end: silenceEnds[i] ?? NaN }))
  const summary = result.stderr.slice(result.stderr.lastIndexOf('Summary:'))
  const integrated = summary.match(/I:\s+(-?[\d.]+|-inf) LUFS/)
  const truePeak = summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)
  const peak = [...result.stderr.matchAll(/Peak level dB: (-?[\d.]+|-inf)/g)].pop()
  return {
    code: result.code,
    decodeErrors,
    black,
    silences,
    integratedLufs: integrated && integrated[1] !== '-inf' ? Number(integrated[1]) : undefined,
    truePeakDb: truePeak && truePeak[1] !== '-inf' ? Number(truePeak[1]) : undefined,
    peakDb: peak && peak[1] !== '-inf' ? Number(peak[1]) : undefined
  }
}

export const checkSubtitles = (
  entries: SrtEntry[],
  parseErrors: string[],
  o: { duration?: number; maxLines: number; maxCharsPerLine: number; minDuration: number }
): Check[] => {
  const checks: Check[] = []
  const problems = (id: string, items: string[], failIf: boolean, ok: string, bad: string) =>
    checks.push({ id, status: items.length ? (failIf ? 'fail' : 'warn') : 'pass', message: items.length ? `${bad} (${items.length})` : ok, details: items.length ? items.slice(0, 20) : undefined })
  problems('subtitles.parse', parseErrors, true, `${entries.length} captions parsed`, 'Malformed subtitle blocks')
  problems('subtitles.empty', entries.filter(e => !e.lines.join('').trim()).map(e => `#${e.index}`), true, 'No empty captions', 'Empty captions')
  problems('subtitles.order', entries.slice(1).filter((e, i) => e.start < entries[i].start).map(e => `#${e.index}`), true, 'Captions are in time order', 'Captions out of order')
  problems(
    'subtitles.overlap',
    entries.slice(1).filter((e, i) => e.start < entries[i].end - 0.001).map((e, i) => `#${entries[i].index} ends ${entries[i].end.toFixed(3)}s after #${e.index} starts ${e.start.toFixed(3)}s`),
    true,
    'No overlapping captions',
    'Overlapping captions'
  )
  problems('subtitles.timing', entries.filter(e => e.end <= e.start).map(e => `#${e.index}`), true, 'Every caption ends after it starts', 'Captions with zero or negative duration')
  problems(
    'subtitles.min-duration',
    entries.filter(e => e.end - e.start < o.minDuration - 0.001).map(e => `#${e.index}: ${(e.end - e.start).toFixed(2)}s`),
    false,
    `Every caption lasts at least ${o.minDuration}s`,
    `Captions shorter than ${o.minDuration}s (allowed when speech is that short)`
  )
  problems('subtitles.lines', entries.filter(e => e.lines.length > o.maxLines).map(e => `#${e.index}: ${e.lines.length} lines`), true, `No caption has more than ${o.maxLines} lines`, `Captions over ${o.maxLines} lines`)
  problems(
    'subtitles.line-length',
    entries.flatMap(e => e.lines.filter(l => l.length > o.maxCharsPerLine).map(l => `#${e.index}: ${l.length} chars`)),
    false,
    `No line is longer than ${o.maxCharsPerLine} characters`,
    `Lines longer than ${o.maxCharsPerLine} characters`
  )
  problems(
    'subtitles.reading-speed',
    entries.filter(e => e.lines.join(' ').length / Math.max(0.001, e.end - e.start) > 20).map(e => `#${e.index}: ${(e.lines.join(' ').length / (e.end - e.start)).toFixed(1)} chars/s`),
    false,
    'Reading speed is at most 20 characters per second',
    'Captions faster than 20 characters per second'
  )
  problems(
    'subtitles.duplicates',
    entries.slice(1).filter((e, i) => e.lines.join(' ') === entries[i].lines.join(' ')).map(e => `#${e.index}`),
    false,
    'No repeated consecutive captions',
    'Consecutive captions with identical text'
  )
  if (o.duration !== undefined)
    problems('subtitles.bounds', entries.filter(e => e.end > o.duration! + 0.05).map(e => `#${e.index} ends at ${e.end.toFixed(2)}s`), true, 'All captions end before the video ends', 'Captions past the end of the video')
  return checks
}

interface TimelineFile {
  fps: number
  width: number
  height: number
  totalFrames: number
  duration: number
  scenes: { id: string; start: number; end: number; startFrame: number; frames: number; transitionIn: { frames: number } | null }[]
  chapters: { seconds: number; title: string }[]
}

export const checkTimeline = (t: TimelineFile, videoDuration: number | undefined): Check[] => {
  const checks: Check[] = []
  const gaps: string[] = []
  t.scenes.forEach((s, i) => {
    if (i === 0) {
      if (s.startFrame !== 0) gaps.push(`${s.id} starts at frame ${s.startFrame}, not 0`)
      return
    }
    const prev = t.scenes[i - 1]
    const expected = prev.startFrame + prev.frames - (s.transitionIn?.frames ?? 0)
    if (s.startFrame !== expected) gaps.push(`${s.id} starts at frame ${s.startFrame}; expected ${expected}`)
  })
  checks.push({ id: 'timeline.continuity', status: gaps.length ? 'fail' : 'pass', message: gaps.length ? 'Gaps or overlaps between scenes' : `${t.scenes.length} scenes join without gaps`, details: gaps.length ? gaps : undefined })
  const last = t.scenes[t.scenes.length - 1]
  const end = last ? last.startFrame + last.frames : 0
  checks.push({ id: 'timeline.total', status: end === t.totalFrames ? 'pass' : 'fail', message: `Scenes end at frame ${end}; timeline total is ${t.totalFrames}` })
  if (videoDuration !== undefined) {
    const diff = Math.abs(videoDuration - t.duration)
    checks.push({
      id: 'timeline.duration-match',
      status: diff <= 1.5 / t.fps ? 'pass' : diff <= 0.25 ? 'warn' : 'fail',
      message: `Video lasts ${videoDuration.toFixed(3)}s; timeline says ${t.duration.toFixed(3)}s (difference ${(diff * 1000).toFixed(0)} ms)`
    })
  }
  const chapterIssues = t.chapters.filter(c => !t.scenes.some(s => Math.floor(s.start + 1e-6) === c.seconds))
  checks.push({
    id: 'chapters.scene-boundaries',
    status: chapterIssues.length ? 'fail' : t.chapters.length ? 'pass' : 'skip',
    message: chapterIssues.length ? 'Chapters that do not match a scene start' : t.chapters.length ? 'Every chapter matches a scene start' : 'No chapters in the timeline',
    details: chapterIssues.length ? chapterIssues : undefined
  })
  if (t.chapters.length) {
    const w = chapterWarnings(t.chapters.map(c => ({ time: c.seconds })), t.duration)
    checks.push({ id: 'chapters.youtube-rules', status: w.length ? 'warn' : 'pass', message: w.length ? w.join('; ') : 'Chapters meet YouTube rules (0:00 start, 3 or more, 10s or longer)' })
  }
  return checks
}

/** Extracts evenly spaced frames and a contact sheet for visual review. */
const writeFrames = async (file: string, duration: number, count: number, dir: string) => {
  mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count
    const out = path.join(dir, `frame-${String(i + 1).padStart(2, '0')}-${t.toFixed(2)}s.png`)
    await ffmpeg(['-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-y', out])
    files.push(out)
  }
  const cols = Math.min(4, count)
  const rows = Math.ceil(count / cols)
  const sheet = path.join(dir, 'contact-sheet.png')
  await ffmpeg(['-i', file, '-vf', `fps=${count}/${duration.toFixed(3)},scale=480:-2,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', '-y', sheet])
  files.push(sheet)
  return files
}

/** Inspects a rendered video and returns a machine-readable report. */
export const inspectVideo = async (file: string, o: InspectOptions = {}): Promise<InspectReport> => {
  requireFfmpeg()
  if (!existsSync(file)) throw new UserError(`Video not found: ${file}`)
  const info: ProbeResult = await probe(file)
  const v = info.streams.find(s => s.codec_type === 'video')
  const a = info.streams.find(s => s.codec_type === 'audio')
  const duration = Number(info.format.duration ?? v?.duration ?? 0)
  const fps = parseRate(v?.avg_frame_rate || v?.r_frame_rate)
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)
  const e = o.expect ?? {}

  add({ id: 'container', status: /mp4/.test(info.format.format_name ?? '') ? 'pass' : 'warn', message: `Container: ${info.format.format_name}` })
  add({ id: 'video.stream', status: v ? 'pass' : 'fail', message: v ? `Video stream: ${v.codec_name} ${v.width}x${v.height}` : 'No video stream' })
  if (v) {
    const codec = e.videoCodec ?? 'h264'
    add({ id: 'video.codec', status: v.codec_name === codec ? 'pass' : 'fail', message: `Video codec ${v.codec_name} (expected ${codec})` })
    add({ id: 'video.pixel-format', status: v.pix_fmt === 'yuv420p' ? 'pass' : 'warn', message: `Pixel format ${v.pix_fmt} (yuv420p plays everywhere)` })
    if (e.width && e.height)
      add({ id: 'video.resolution', status: v.width === e.width && v.height === e.height ? 'pass' : 'fail', message: `Resolution ${v.width}x${v.height} (expected ${e.width}x${e.height})` })
    else add({ id: 'video.resolution', status: 'pass', message: `Resolution ${v.width}x${v.height}` })
    if (e.fps) add({ id: 'video.frame-rate', status: Math.abs(fps - e.fps) < 0.01 ? 'pass' : 'fail', message: `Frame rate ${fps.toFixed(3)} fps (expected ${e.fps})` })
    else add({ id: 'video.frame-rate', status: fps > 0 ? 'pass' : 'fail', message: `Frame rate ${fps.toFixed(3)} fps` })
    const odd = (v.width ?? 0) % 2 || (v.height ?? 0) % 2
    add({ id: 'video.even-dimensions', status: odd ? 'fail' : 'pass', message: odd ? 'Width or height is odd; many players reject this' : 'Width and height are even' })
  }
  if (e.duration !== undefined) {
    const diff = Math.abs(duration - e.duration)
    add({ id: 'duration', status: diff <= 0.1 ? 'pass' : diff <= 0.5 ? 'warn' : 'fail', message: `Duration ${duration.toFixed(3)}s (expected ${e.duration.toFixed(3)}s)` })
  } else add({ id: 'duration', status: duration > 0 ? 'pass' : 'fail', message: `Duration ${duration.toFixed(3)}s` })

  if (a) add({ id: 'audio.codec', status: a.codec_name === (e.audioCodec ?? 'aac') ? 'pass' : 'warn', message: `Audio codec ${a.codec_name}, ${a.sample_rate} Hz, ${a.channels} channels` })
  else add({ id: 'audio.stream', status: o.requireAudio ? 'fail' : 'skip', message: 'No audio stream (silent video)' })

  const analysis = await analyze(file, Boolean(a), Boolean(v))
  add({
    id: 'decode',
    status: analysis.code === 0 && !analysis.decodeErrors.length ? 'pass' : 'fail',
    message: analysis.decodeErrors.length ? `${analysis.decodeErrors.length} decode errors` : 'Decoded every frame without errors',
    details: analysis.decodeErrors.length ? analysis.decodeErrors : undefined
  })
  if (v)
    add({
      id: 'video.black-frames',
      status: analysis.black.length ? 'warn' : 'pass',
      message: analysis.black.length ? `${analysis.black.length} black interval(s) of 0.5s or longer` : 'No black intervals of 0.5s or longer',
      details: analysis.black.length ? analysis.black : undefined
    })
  let audioStats: InspectReport['audioStats']
  if (a) {
    audioStats = { integratedLufs: analysis.integratedLufs, truePeakDb: analysis.truePeakDb, peakDb: analysis.peakDb, silences: analysis.silences }
    const target = o.targetLufs ?? -16
    if (analysis.integratedLufs === undefined) add({ id: 'audio.loudness', status: 'warn', message: 'Audio is silent or too quiet to measure' })
    else {
      const diff = Math.abs(analysis.integratedLufs - target)
      add({ id: 'audio.loudness', status: diff <= 1.5 ? 'pass' : diff <= 4 ? 'warn' : 'fail', message: `Integrated loudness ${analysis.integratedLufs.toFixed(1)} LUFS (target ${target})` })
    }
    if (analysis.peakDb !== undefined)
      add({ id: 'audio.clipping', status: analysis.peakDb >= -0.1 ? 'fail' : 'pass', message: `Sample peak ${analysis.peakDb.toFixed(2)} dBFS${analysis.peakDb >= -0.1 ? ' (clipping)' : ''}` })
    if (analysis.truePeakDb !== undefined)
      add({ id: 'audio.true-peak', status: analysis.truePeakDb > -1 ? 'warn' : 'pass', message: `True peak ${analysis.truePeakDb.toFixed(2)} dBTP (keep at or below -1)` })
    const long = analysis.silences.filter(s => (Number.isFinite(s.end) ? s.end : duration) - s.start >= 4)
    add({
      id: 'audio.silence',
      status: long.length ? 'warn' : 'pass',
      message: long.length ? `${long.length} silent stretch(es) of 4s or longer` : 'No silent stretch of 4s or longer',
      details: analysis.silences.length ? analysis.silences : undefined
    })
  }

  if (o.srt) {
    if (!existsSync(o.srt)) add({ id: 'subtitles.file', status: 'fail', message: `Subtitle file not found: ${o.srt}` })
    else {
      const parsed = parseSrt(readFileSync(o.srt, 'utf8'))
      checks.push(...checkSubtitles(parsed.entries, parsed.errors, { duration, maxLines: o.maxLines ?? 2, maxCharsPerLine: o.maxCharsPerLine ?? 42, minDuration: o.minCaptionDuration ?? 1.5 }))
    }
  }
  if (o.timeline) {
    if (!existsSync(o.timeline)) add({ id: 'timeline.file', status: 'fail', message: `Timeline not found: ${o.timeline}` })
    else {
      const t = JSON.parse(readFileSync(o.timeline, 'utf8')) as TimelineFile
      checks.push(...checkTimeline(t, duration))
      if (v && !e.width) add({ id: 'video.matches-timeline', status: v.width === t.width && v.height === t.height && Math.abs(fps - t.fps) < 0.01 ? 'pass' : 'fail', message: `Video ${v.width}x${v.height} at ${fps.toFixed(2)} fps; timeline ${t.width}x${t.height} at ${t.fps} fps` })
      const embedded = info.chapters ?? []
      if (t.chapters.length)
        add({
          id: 'chapters.embedded',
          status: embedded.length === t.chapters.length ? 'pass' : 'warn',
          message: `${embedded.length} chapters embedded in the MP4; timeline lists ${t.chapters.length}`
        })
    }
  }
  const framesWritten = o.frames && v ? await writeFrames(file, duration, o.frames.count, o.frames.dir) : undefined
  const summary = {
    pass: checks.filter(c => c.status === 'pass').length,
    warn: checks.filter(c => c.status === 'warn').length,
    fail: checks.filter(c => c.status === 'fail').length,
    skip: checks.filter(c => c.status === 'skip').length,
    ok: !checks.some(c => c.status === 'fail')
  }
  return {
    file: path.resolve(file),
    tool: `doodle-video-generator ${toolVersion}`,
    generatedAt: new Date().toISOString(),
    metadata: {
      duration,
      sizeBytes: Number(info.format.size ?? 0),
      video: v && { codec: v.codec_name, profile: v.profile, width: v.width, height: v.height, fps, pixFmt: v.pix_fmt, frames: num(v.nb_frames) },
      audio: a && { codec: a.codec_name, sampleRate: num(a.sample_rate), channels: a.channels },
      chapters: (info.chapters ?? []).map(c => ({ start: Number(c.start_time), title: c.tags?.title }))
    },
    audioStats,
    checks,
    summary,
    framesWritten,
    notPerformed: [
      'Listening review: this tool measures loudness, peaks and silence but does not judge voice quality, pronunciation or music fit',
      'Frame-by-frame visual review: open the extracted frames or watch the video to judge readability, layout and pacing'
    ]
  }
}
