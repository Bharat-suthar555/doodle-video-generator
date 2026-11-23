import path from 'node:path'
import { UserError } from '../core/errors.ts'
import { ffmpeg, mediaDuration } from '../core/ffmpeg.ts'
import { resolveFrom } from '../core/paths.ts'
import type { LoadedStoryboard } from '../storyboard/load.ts'
import type { TimelinePlan } from '../timeline/plan.ts'

export interface MixResult {
  file: string
  narrationClips: number
  music: boolean
  footageAudio: number
  normalized: boolean
  measured?: { inputI: number; inputTP: number }
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString()

/**
 * Builds the soundtrack as one WAV of exactly the video's length: narration at
 * its planned times, optional footage audio, and music ducked under the voice.
 * Returns undefined when the video has no audio sources at all.
 */
export const mixAudio = async (loaded: LoadedStoryboard, plan: TimelinePlan, workDir: string): Promise<MixResult | undefined> => {
  const sb = loaded.storyboard
  const total = plan.duration
  const inputs: string[] = []
  const filters: string[] = []
  const voice: string[] = []
  const beds: string[] = []
  let index = 0
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'

  for (const scene of plan.scenes) {
    const n = scene.narration
    if (n?.audioFile) {
      inputs.push('-i', n.audioFile)
      const ms = Math.round(n.absoluteStart * 1000)
      filters.push(`[${index}:a]${fmt},volume=${sb.audio.narrationVolume}dB,adelay=${ms}:all=1[n${index}]`)
      voice.push(`[n${index}]`)
      index++
    }
    const f = sb.scenes[scene.index].footage
    if (scene.type === 'footage' && f?.audio.keep && scene.footage) {
      inputs.push('-ss', n3(scene.footage.trimStart), '-t', n3(Math.min(scene.footage.available, scene.duration)), '-i', scene.footage.source)
      const ms = Math.round(scene.start * 1000)
      filters.push(`[${index}:a]${fmt},volume=${f.audio.volume}dB,adelay=${ms}:all=1[f${index}]`)
      beds.push(`[f${index}]`)
      index++
    }
  }
  const music = sb.audio.music
  if (!voice.length && !beds.length && !music) return undefined

  let voiceLabel: string | undefined
  let duckKey: string | undefined
  if (voice.length) {
    filters.push(`${voice.join('')}amix=inputs=${voice.length}:normalize=0:dropout_transition=0[voice]`)
    voiceLabel = '[voice]'
    if (music?.duck) {
      filters.push('[voice]asplit=2[voicemix][voicekey]')
      voiceLabel = '[voicemix]'
      duckKey = '[voicekey]'
    }
  }
  if (music) {
    const file = resolveFrom(loaded.baseDir, music.file)
    await mediaDuration(file).catch(() => {
      throw new UserError(`Music file not found or unreadable: ${music.file}`)
    })
    inputs.push(...(music.loop ? ['-stream_loop', '-1'] : []), '-i', file)
    const fadeOut = Math.min(music.fadeOut, total)
    filters.push(
      `[${index}:a]${fmt},atrim=0:${n3(total)},volume=${music.volume}dB,afade=t=in:st=0:d=${n3(Math.min(music.fadeIn, total))},afade=t=out:st=${n3(Math.max(0, total - fadeOut))}:d=${n3(fadeOut)}[music]`
    )
    if (duckKey) {
      filters.push(`[music]${duckKey}sidechaincompress=threshold=0.02:ratio=6:attack=40:release=450:makeup=1[ducked]`)
      beds.push('[ducked]')
    } else beds.push('[music]')
    index++
  }
  const parts = [...(voiceLabel ? [voiceLabel] : []), ...beds]
  const mixed = parts.length > 1 ? `${parts.join('')}amix=inputs=${parts.length}:normalize=0:dropout_transition=0,` : `${parts[0]}`
  const base = `${mixed}${parts.length > 1 ? '' : 'anull,'}apad=whole_dur=${n3(total)},atrim=0:${n3(total)}`
  const graph = (tail: string) => [...filters, `${base}${tail}[out]`].join(';')
  const out = path.join(workDir, 'soundtrack.wav')
  const norm = sb.audio.normalize
  let normalized = false
  let measured: MixResult['measured']
  let tail = ''
  if (norm.enabled) {
    const pass1 = await ffmpeg([...inputs, '-filter_complex', graph(`,loudnorm=I=${norm.targetLufs}:TP=${norm.truePeak}:LRA=11:print_format=json`), '-map', '[out]', '-f', 'null', '-'])
    const json = pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1)
    const m = JSON.parse(json) as Record<string, string>
    const inputI = Number(m.input_i)
    // Near-silent mixes measure -inf; normalizing them would only amplify noise
    if (Number.isFinite(inputI) && inputI > -70) {
      tail = `,loudnorm=I=${norm.targetLufs}:TP=${norm.truePeak}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`
      normalized = true
      measured = { inputI, inputTP: Number(m.input_tp) }
    }
  }
  await ffmpeg([...inputs, '-filter_complex', graph(tail), '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '48000', '-y', out])
  return { file: out, narrationClips: voice.length, music: Boolean(music), footageAudio: beds.length - (music ? 1 : 0), normalized, measured }
}
