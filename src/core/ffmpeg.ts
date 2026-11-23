import { spawn, spawnSync } from 'node:child_process'
import { UserError } from './errors.ts'

// FFmpeg and FFprobe come from PATH unless DVG_FFMPEG / DVG_FFPROBE point elsewhere.
export const ffmpegBin = () => process.env.DVG_FFMPEG || 'ffmpeg'
export const ffprobeBin = () => process.env.DVG_FFPROBE || 'ffprobe'

const missing = (bin: string) =>
  new UserError(
    `${bin} was not found.`,
    'Install FFmpeg 5 or later (it includes ffprobe), or set DVG_FFMPEG and DVG_FFPROBE to the executables.'
  )

let checked = false

/** Throws a UserError when ffmpeg or ffprobe can't run. */
export const requireFfmpeg = () => {
  if (checked) return
  for (const bin of [ffmpegBin(), ffprobeBin()]) {
    const result = spawnSync(bin, ['-version'], { encoding: 'utf8' })
    if (result.error || result.status !== 0) throw missing(bin)
  }
  checked = true
}

const filterCache = new Map<string, boolean>()

/** True when this FFmpeg build includes the named filter (e.g. `ass`). */
export const hasFilter = (name: string) => {
  if (!filterCache.has(name)) {
    const result = spawnSync(ffmpegBin(), ['-hide_banner', '-filters'], { encoding: 'utf8' })
    const found = (result.stdout ?? '')
      .split('\n')
      .some(line => line.trim().split(/\s+/)[1] === name)
    filterCache.set(name, found)
  }
  return filterCache.get(name)!
}

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** Runs a command to completion and collects its output. */
export const run = (
  bin: string,
  args: string[],
  options: { cwd?: string; input?: Buffer | string } = {}
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', d => out.push(d))
    child.stderr.on('data', d => err.push(d))
    child.on('error', error =>
      reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? missing(bin) : error)
    )
    child.on('close', code =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8')
      })
    )
    child.stdin.on('error', () => {})
    if (options.input !== undefined) child.stdin.end(options.input)
    else child.stdin.end()
  })

/** Runs ffmpeg and throws with the tail of its log when it fails. */
export const ffmpeg = async (args: string[], options: { cwd?: string } = {}) => {
  const result = await run(ffmpegBin(), ['-hide_banner', '-nostdin', ...args], options)
  if (result.code !== 0) {
    const tail = result.stderr.trim().split('\n').slice(-12).join('\n')
    throw new Error(`ffmpeg failed (exit ${result.code}):\n${tail}`)
  }
  return result
}

export interface ProbeStream {
  index: number
  codec_type: 'video' | 'audio' | 'subtitle' | 'data'
  codec_name?: string
  profile?: string
  width?: number
  height?: number
  pix_fmt?: string
  r_frame_rate?: string
  avg_frame_rate?: string
  nb_frames?: string
  sample_rate?: string
  channels?: number
  duration?: string
  color_space?: string
  field_order?: string
}

export interface ProbeResult {
  format: { duration?: string; format_name?: string; bit_rate?: string; size?: string }
  streams: ProbeStream[]
  chapters?: { start_time: string; end_time: string; tags?: { title?: string } }[]
}

export const probe = async (file: string): Promise<ProbeResult> => {
  const result = await run(ffprobeBin(), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    '-show_chapters',
    file
  ])
  if (result.code !== 0)
    throw new UserError(`ffprobe could not read ${file}: ${result.stderr.trim()}`)
  return JSON.parse(result.stdout) as ProbeResult
}

/** Duration of a media file in seconds. */
export const mediaDuration = async (file: string) => {
  const info = await probe(file)
  const d = Number(info.format.duration ?? info.streams[0]?.duration)
  if (!Number.isFinite(d)) throw new UserError(`Could not read the duration of ${file}`)
  return d
}

/** Parses "30000/1001" style rates. */
export const parseRate = (rate?: string) => {
  if (!rate) return 0
  const [n, d] = rate.split('/').map(Number)
  return d ? n / d : n
}

/**
 * Starts an ffmpeg process that reads raw RGBA frames on stdin.
 * `write` respects backpressure; `finish` resolves once ffmpeg exits cleanly.
 */
export const startFrameEncoder = (args: string[]) => {
  const child = spawn(ffmpegBin(), ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], {
    stdio: ['pipe', 'ignore', 'pipe']
  })
  const err: Buffer[] = []
  child.stderr.on('data', d => err.push(d))
  let failure: Error | undefined
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', error => {
      failure = (error as NodeJS.ErrnoException).code === 'ENOENT' ? missing(ffmpegBin()) : error
      reject(failure)
    })
    child.on('close', code => {
      if (code === 0) resolve()
      else {
        failure = new Error(
          `ffmpeg encoder failed (exit ${code}): ${Buffer.concat(err).toString().trim().slice(-800)}`
        )
        reject(failure)
      }
    })
  })
  exited.catch(() => {})
  child.stdin.on('error', () => {})
  return {
    write: (frame: Buffer) =>
      new Promise<void>((resolve, reject) => {
        if (failure) return reject(failure)
        if (child.stdin.write(frame)) resolve()
        else child.stdin.once('drain', resolve)
      }),
    finish: async () => {
      child.stdin.end()
      await exited
    },
    abort: () => child.kill('SIGKILL')
  }
}
