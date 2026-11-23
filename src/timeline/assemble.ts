import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { mixAudio, type MixResult } from '../audio/mix.ts'
import { UserError } from '../core/errors.ts'
import { ffmpeg, hasFilter, requireFfmpeg } from '../core/ffmpeg.ts'
import { info } from '../core/log.ts'
import { assetPath, toolVersion } from '../core/paths.ts'
import { clipPathFor, workDirFor } from '../renderer/render.ts'
import { colorTags } from '../renderer/encode.ts'
import type { LoadedStoryboard } from '../storyboard/load.ts'
import { buildCaptions } from '../subtitles/build.ts'
import { toAss, toSrt } from '../subtitles/format.ts'
import { ffmetadata, youtubeMarkdown, youtubeMetadata } from './metadata.ts'
import type { TimelinePlan } from './plan.ts'
import type { TransitionType } from '../storyboard/schema.ts'

const xfadeName: Record<Exclude<TransitionType, 'cut'>, string> = {
  fade: 'fade',
  crossfade: 'fade',
  dissolve: 'dissolve',
  'fade-black': 'fadeblack',
  'fade-white': 'fadewhite',
  'wipe-left': 'wipeleft',
  'wipe-right': 'wiperight',
  'slide-left': 'slideleft',
  'slide-up': 'slideup',
  'zoom-in': 'zoomin',
  'whiteboard-to-screen': 'zoomin',
  'screen-to-whiteboard': 'fadewhite'
}

export interface AssembleOptions {
  output?: string
  subtitles?: 'burn' | 'srt' | 'none'
  /** Overwrite an existing output file. */
  overwrite?: boolean
}

export interface AssembleResult {
  video: string
  srt?: string
  timeline: string
  youtubeMarkdown: string
  youtubeJson: string
  audio?: MixResult
  burnedSubtitles: boolean
  captions: number
}

const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString()

/** The video filter graph that joins scene clips with transitions. Exported for tests. */
export const joinFilter = (plan: TimelinePlan, fade: { in: number; out: number; color: string }, subtitles?: string) => {
  const parts = plan.scenes.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${plan.fps},format=yuv420p[s${i}]`)
  let acc = '[s0]'
  plan.scenes.slice(1).forEach((scene, k) => {
    const i = k + 1
    const out = `[j${i}]`
    if (scene.transition) {
      const d = scene.transition.frames / plan.fps
      const name = xfadeName[scene.transition.type as Exclude<TransitionType, 'cut'>]
      parts.push(`${acc}[s${i}]xfade=transition=${name}:duration=${n4(d)}:offset=${n4(scene.startFrame / plan.fps)}${out}`)
    } else parts.push(`${acc}[s${i}]concat=n=2:v=1:a=0${out}`)
    acc = out
  })
  const tail: string[] = []
  if (fade.in > 0) tail.push(`fade=t=in:st=0:d=${n4(fade.in)}:color=${fade.color}`)
  if (fade.out > 0) tail.push(`fade=t=out:st=${n4(plan.duration - fade.out)}:d=${n4(fade.out)}:color=${fade.color}`)
  if (subtitles) tail.push(`ass=${subtitles}:fontsdir=fonts`)
  tail.push('format=yuv420p')
  parts.push(`${acc}${tail.join(',')}[vout]`)
  return parts.join(';')
}

/** Joins rendered scene clips, burns or writes subtitles, mixes audio and writes the final MP4. */
export const assemble = async (loaded: LoadedStoryboard, plan: TimelinePlan, options: AssembleOptions = {}): Promise<AssembleResult> => {
  requireFfmpeg()
  const sb = loaded.storyboard
  const workDir = workDirFor(loaded)
  const missing = plan.scenes.filter(s => !existsSync(clipPathFor(loaded, plan, s)))
  if (missing.length)
    throw new UserError(`Scene clips are missing for: ${missing.map(s => s.id).join(', ')}`, 'Run `doodle-video-generator render <storyboard>` first.')
  const output = path.resolve(loaded.baseDir, options.output ?? sb.export.output)
  const inputFiles = new Set(
    [loaded.file, ...plan.scenes.flatMap(s => [s.footage?.source, s.narration?.audioFile])].filter(Boolean).map(f => path.resolve(f!))
  )
  if (inputFiles.has(output)) throw new UserError(`Refusing to overwrite an input file: ${output}`)
  if (existsSync(output) && options.overwrite === false)
    throw new UserError(`${output} already exists`, 'Pass --overwrite, or choose another --output path.')
  mkdirSync(path.dirname(output), { recursive: true })
  mkdirSync(workDir, { recursive: true })

  const subtitleMode = options.subtitles ?? (sb.subtitles.enabled ? (sb.subtitles.burnIn ? 'burn' : 'srt') : 'none')
  const captions = subtitleMode === 'none' ? [] : buildCaptions(sb, plan)
  const base = output.replace(/\.mp4$/i, '')
  let srt: string | undefined
  let burn = false
  if (captions.length) {
    srt = `${base}.srt`
    writeFileSync(srt, toSrt(captions))
    if (subtitleMode === 'burn') {
      if (!hasFilter('ass'))
        throw new UserError('This FFmpeg build has no libass, so it cannot burn in subtitles.', 'Use --subtitles srt to write a sidecar file instead.')
      const fontDir = path.join(workDir, 'fonts')
      mkdirSync(fontDir, { recursive: true })
      for (const f of readdirSync(assetPath('fonts')).filter(f => f.startsWith('Lato')))
        copyFileSync(assetPath('fonts', f), path.join(fontDir, f))
      const fontSize = sb.subtitles.fontSize ?? Math.round(Math.min(plan.width, plan.height) * (sb.format.aspect === '9:16' ? 0.05 : 0.044))
      writeFileSync(
        path.join(workDir, 'captions.ass'),
        toAss(captions, {
          width: plan.width,
          height: plan.height,
          fontSize,
          color: sb.subtitles.color,
          boxColor: sb.subtitles.boxColor,
          boxOpacity: sb.subtitles.boxOpacity,
          position: sb.subtitles.position,
          marginV: plan.height * (sb.format.aspect === '9:16' ? 0.14 : 0.06)
        })
      )
      burn = true
    }
  }

  info('Mixing audio…')
  const audio = await mixAudio(loaded, plan, workDir)
  const meta = youtubeMetadata(sb, plan)
  writeFileSync(path.join(workDir, 'chapters.ffmeta'), ffmetadata(meta.title, plan))

  info('Assembling the final video…')
  const clips = plan.scenes.flatMap(s => ['-i', clipPathFor(loaded, plan, s)])
  const audioIndex = plan.scenes.length
  const metaIndex = audioIndex + (audio ? 1 : 0)
  const tmp = path.join(workDir, `final.partial.mp4`)
  await ffmpeg(
    [
      ...clips,
      ...(audio ? ['-i', audio.file] : []),
      '-f',
      'ffmetadata',
      '-i',
      'chapters.ffmeta',
      '-filter_complex',
      joinFilter(plan, { in: sb.export.fadeIn, out: sb.export.fadeOut, color: sb.export.fadeColor }, burn ? 'captions.ass' : undefined),
      '-map',
      '[vout]',
      ...(audio ? ['-map', `${audioIndex}:a`, '-c:a', 'aac', '-b:a', sb.export.audioBitrate, '-ar', '48000'] : []),
      '-map_metadata',
      String(metaIndex),
      '-map_chapters',
      String(metaIndex),
      '-c:v',
      'libx264',
      '-preset',
      sb.export.preset,
      '-crf',
      String(sb.export.crf),
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      ...colorTags,
      '-r',
      String(plan.fps),
      '-frames:v',
      String(plan.totalFrames),
      '-movflags',
      '+faststart',
      '-metadata',
      `comment=Rendered by doodle-video-generator ${toolVersion}`,
      '-y',
      tmp
    ],
    { cwd: workDir }
  )
  rmSync(output, { force: true })
  renameSync(tmp, output)

  const timeline = `${base}.timeline.json`
  writeFileSync(
    timeline,
    JSON.stringify(
      {
        tool: `doodle-video-generator ${toolVersion}`,
        video: path.basename(output),
        fps: plan.fps,
        width: plan.width,
        height: plan.height,
        totalFrames: plan.totalFrames,
        duration: plan.duration,
        estimatedTiming: plan.estimatedTiming,
        subtitles: { file: srt && path.basename(srt), burnedIn: burn, captions: captions.length, estimated: captions.some(c => c.estimated) },
        audio: audio
          ? { narrationClips: audio.narrationClips, music: audio.music, footageAudio: audio.footageAudio, normalized: audio.normalized }
          : null,
        scenes: plan.scenes.map(s => ({
          id: s.id,
          type: s.type,
          chapter: s.chapter ?? null,
          start: s.start,
          end: s.start + s.duration,
          startFrame: s.startFrame,
          frames: s.frames,
          transitionIn: s.transition ? { type: s.transition.type, frames: s.transition.frames } : null,
          narration: s.narration
            ? { start: s.narration.absoluteStart, duration: s.narration.duration, estimated: s.narration.estimated, audio: s.narration.audioFile ? path.basename(s.narration.audioFile) : null }
            : null
        })),
        chapters: meta.chapters,
        warnings: [...plan.warnings, ...meta.chapterWarnings]
      },
      null,
      2
    )
  )
  const youtubeJson = `${base}.youtube.json`
  const youtubeMd = `${base}.youtube.md`
  writeFileSync(youtubeJson, JSON.stringify(meta, null, 2))
  writeFileSync(youtubeMd, youtubeMarkdown(meta, plan.duration))
  return { video: output, srt, timeline, youtubeMarkdown: youtubeMd, youtubeJson, audio, burnedSubtitles: burn, captions: captions.length }
}
