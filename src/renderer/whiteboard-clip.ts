import { renderFrameSvg } from '../animation/frame.ts'
import type { CompiledScene } from '../animation/types.ts'
import { startFrameEncoder } from '../core/ffmpeg.ts'
import { intermediateVideo, rawInput, rgbToYuv } from './encode.ts'
import { rasterize } from './rasterize.ts'

export interface WhiteboardClipJob {
  scene: CompiledScene
  frames: number
  fps: number
  width: number
  height: number
  out: string
  onFrame?: (done: number) => void
}

/** Renders a compiled whiteboard scene to an intermediate H.264 clip. */
export const renderWhiteboardClip = async (job: WhiteboardClipJob) => {
  const encoder = startFrameEncoder([
    ...rawInput(job.width, job.height, job.fps),
    '-vf',
    rgbToYuv,
    ...intermediateVideo,
    '-frames:v',
    String(job.frames),
    '-y',
    job.out
  ])
  let previousSvg = ''
  let previous: Buffer | undefined
  try {
    for (let f = 0; f < job.frames; f++) {
      const svg = renderFrameSvg(job.scene, f / job.fps, { width: job.width, height: job.height })
      // Holds produce identical SVG; reuse the pixels instead of rasterizing again
      if (svg !== previousSvg || !previous) {
        previous = rasterize(svg)
        previousSvg = svg
      }
      await encoder.write(previous)
      job.onFrame?.(f + 1)
    }
    await encoder.finish()
  } catch (error) {
    encoder.abort()
    throw error
  }
}
