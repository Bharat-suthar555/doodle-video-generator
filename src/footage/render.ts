import { renderFrameSvg } from '../animation/frame.ts'
import type { CompiledScene } from '../animation/types.ts'
import { ffmpegBin } from '../core/ffmpeg.ts'
import { spawn } from 'node:child_process'
import type { Footage } from '../storyboard/schema.ts'
import { colorTags, rawInput } from '../renderer/encode.ts'
import { rasterize } from '../renderer/rasterize.ts'

export interface FootageClipJob {
  footage: Footage
  source: string
  trimStart: number
  available: number
  overlay?: CompiledScene
  frames: number
  fps: number
  width: number
  height: number
  designWidth: number
  out: string
  onFrame?: (done: number) => void
}

const num = (v: number) => (Math.round(v * 10000) / 10000).toString()

/** Eased sum-of-steps expression: value starts at `initial` and moves at each key. */
export const steppedExpr = (initial: number, keys: { at: number; duration: number; value: number }[], time = 't') => {
  let expr = num(initial)
  let previous = initial
  for (const k of keys) {
    const delta = k.value - previous
    if (Math.abs(delta) > 1e-9) {
      const p = `clip((${time}-${num(k.at)})/${num(Math.max(k.duration, 0.001))},0,1)`
      expr += `+${num(delta)}*(${p})*(${p})*(3-2*(${p}))`
    }
    previous = k.value
  }
  return expr
}

/** Builds the FFmpeg filter graph for a footage scene. Exported for tests. */
export const footageFilter = (job: Omit<FootageClipJob, 'out' | 'onFrame' | 'source'>) => {
  const { footage: f, width: W, height: H, fps } = job
  const parts: string[] = []
  let label = '[0:v]'
  let n = 0
  const next = () => `[v${n++}]`
  for (const m of f.masks) {
    const enable = m.start !== undefined || m.end !== undefined ? `:enable='between(t,${num(m.start ?? 0)},${num(m.end ?? 1e6)})'` : ''
    if (m.style === 'solid') {
      const out = next()
      parts.push(`${label}drawbox=x=${m.x}:y=${m.y}:w=${m.width}:h=${m.height}:color=0x202020:t=fill${enable}${out}`)
      label = out
    } else {
      const base = next()
      const region = next()
      const out = next()
      const effect =
        m.style === 'blur'
          ? `gblur=sigma=${Math.max(8, Math.round(Math.min(m.width, m.height) / 6))}`
          : `scale=max(1\\,iw/16):max(1\\,ih/16),scale=${m.width}:${m.height}:flags=neighbor`
      parts.push(`${label}split${base}${region}`)
      parts.push(`${region}crop=${m.width}:${m.height}:${m.x}:${m.y},${effect}${region.replace(']', 'b]')}`)
      parts.push(`${base}${region.replace(']', 'b]')}overlay=${m.x}:${m.y}${enable}${out}`)
      label = out
    }
  }
  const chain: string[] = []
  if (f.crop) chain.push(`crop=${f.crop.width}:${f.crop.height}:${f.crop.x}:${f.crop.y}`)
  chain.push(`fps=${fps}`)
  if (f.fit === 'cover') chain.push(`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}`)
  else
    chain.push(
      `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${f.padColor.replace('#', '0x')}`
    )
  chain.push('setsar=1')
  if (f.zoom.length) {
    const scale = W / job.designWidth
    const keys = [...f.zoom].sort((a, b) => a.at - b.at)
    let cx = W / 2
    let cy = H / 2
    const centers = keys.map(k => {
      if (k.center) {
        cx = k.center[0] * scale
        cy = k.center[1] * scale
      }
      return { cx, cy }
    })
    // zoompan keeps a fixed output size (crop can't follow a changing input size).
    // It positions the window in whole pixels, so a 2x upscale halves the step jitter.
    const time = `(on/${fps})`
    const z = steppedExpr(1, keys.map(k => ({ at: k.at, duration: k.duration, value: k.zoom })), time)
    const x = steppedExpr(W / 2, keys.map((k, i) => ({ at: k.at, duration: k.duration, value: centers[i].cx })), time)
    const y = steppedExpr(H / 2, keys.map((k, i) => ({ at: k.at, duration: k.duration, value: centers[i].cy })), time)
    chain.push(
      `scale=${W * 2}:${H * 2}:flags=lanczos`,
      `zoompan=z='${z}':x='clip((${x})*iw/${W}-iw/zoom/2,0,iw-iw/zoom)':y='clip((${y})*ih/${H}-ih/zoom/2,0,ih-ih/zoom)':d=1:s=${W}x${H}:fps=${fps}`
    )
  }
  const clipFrames = Math.floor(job.available * fps)
  if (job.frames > clipFrames && f.freezeLastFrame)
    chain.push(`tpad=stop_mode=clone:stop_duration=${num((job.frames - clipFrames) / fps + 1)}`)
  const scaled = next()
  parts.push(`${label}${chain.join(',')}${scaled}`)
  label = scaled
  if (job.overlay) {
    const out = next()
    parts.push(`[1:v]format=rgba[ov]`, `${label}[ov]overlay=0:0:alpha=premultiplied:shortest=0:eof_action=pass${out}`)
    label = out
  }
  parts.push(`${label}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[vout]`)
  return parts.join(';')
}

/** Renders a footage scene: trims, masks, fits, zooms and overlays callouts. */
export const renderFootageClip = (job: FootageClipJob) =>
  new Promise<void>((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-ss',
      num(job.trimStart),
      '-t',
      num(job.available),
      '-i',
      job.source,
      ...(job.overlay ? rawInput(job.width, job.height, job.fps) : []),
      '-filter_complex',
      footageFilter(job),
      '-map',
      '[vout]',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '12',
      ...colorTags,
      '-r',
      String(job.fps),
      '-frames:v',
      String(job.frames),
      '-y',
      job.out
    ]
    const child = spawn(ffmpegBin(), args, { stdio: [job.overlay ? 'pipe' : 'ignore', 'ignore', 'pipe'] })
    const err: Buffer[] = []
    child.stderr!.on('data', d => err.push(d))
    child.on('error', reject)
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed on footage ${job.source} (exit ${code}): ${Buffer.concat(err).toString().trim().slice(-900)}`))
    )
    if (job.overlay) {
      const stdin = child.stdin!
      stdin.on('error', () => {})
      const overlay = job.overlay
      void (async () => {
        let previousSvg = ''
        let previous: Buffer | undefined
        for (let f = 0; f < job.frames; f++) {
          const svg = renderFrameSvg(overlay, f / job.fps, { width: job.width, height: job.height, transparent: true, noCamera: true, showHand: false })
          if (svg !== previousSvg || !previous) {
            previous = rasterize(svg)
            previousSvg = svg
          }
          if (!stdin.write(previous)) await new Promise(r => stdin.once('drain', r))
          job.onFrame?.(f + 1)
        }
        stdin.end()
      })().catch(reject)
    }
  })
