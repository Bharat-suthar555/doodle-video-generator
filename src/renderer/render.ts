import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { UserError } from '../core/errors.ts'
import { requireFfmpeg } from '../core/ffmpeg.ts'
import { info, progress } from '../core/log.ts'
import type { LoadedStoryboard } from '../storyboard/load.ts'
import type { ScenePlan, TimelinePlan } from '../timeline/plan.ts'
import { runSceneJob, type SceneJob, type WorkerMessage } from './scene-worker.ts'

export interface RenderOptions {
  /** Render only these scene ids. */
  only?: string[]
  /** Parallel scene renders. */
  jobs?: number
  /** Ignore cached clips. */
  force?: boolean
}

export interface SceneClip {
  id: string
  file: string
  cached: boolean
}

/** Work directory for intermediate files: next to the storyboard, one per storyboard. */
export const workDirFor = (loaded: LoadedStoryboard) =>
  path.join(loaded.baseDir, '.dvg-work', path.basename(loaded.file, path.extname(loaded.file)))

export const clipPathFor = (loaded: LoadedStoryboard, plan: TimelinePlan, scene: ScenePlan) =>
  path.join(workDirFor(loaded), 'scenes', `${scene.id}-${scene.hash}-${plan.width}x${plan.height}-${scene.frames}f.mp4`)

const jobFor = (loaded: LoadedStoryboard, plan: TimelinePlan, scene: ScenePlan, out: string): SceneJob => {
  const common = { frames: scene.frames, fps: plan.fps, width: plan.width, height: plan.height, out }
  if (scene.type === 'footage') {
    const footage = loaded.storyboard.scenes[scene.index].footage!
    if (!scene.footage) throw new UserError(`${scene.id}: footage source is missing or unreadable`)
    return {
      kind: 'footage',
      ...common,
      footage,
      source: scene.footage.source,
      trimStart: scene.footage.trimStart,
      available: scene.footage.available,
      overlay: scene.compiled,
      designWidth: plan.designWidth
    }
  }
  return { kind: 'whiteboard', ...common, scene: scene.compiled! }
}

const workerUrl = new URL(`./scene-worker${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`, import.meta.url)

const runInWorker = (job: SceneJob, onFrame: (done: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerUrl)
    worker.on('message', (m: WorkerMessage) => {
      if (m.type === 'frame') onFrame(m.done)
      else {
        void worker.terminate()
        if (m.type === 'done') resolve()
        else reject(new Error(m.message))
      }
    })
    worker.on('error', reject)
    worker.postMessage(job)
  })

/** Renders every scene clip that isn't cached. A failed scene doesn't discard finished ones. */
export const renderScenes = async (loaded: LoadedStoryboard, plan: TimelinePlan, options: RenderOptions = {}) => {
  requireFfmpeg()
  if (plan.errors.length) throw new UserError(`The storyboard can't be rendered yet:\n  - ${plan.errors.join('\n  - ')}`)
  const unknown = (options.only ?? []).filter(id => !plan.scenes.some(s => s.id === id))
  if (unknown.length) throw new UserError(`Unknown scene id: ${unknown.join(', ')}`)
  mkdirSync(path.join(workDirFor(loaded), 'scenes'), { recursive: true })
  const clips: SceneClip[] = []
  const todo: { scene: ScenePlan; out: string }[] = []
  for (const scene of plan.scenes) {
    const out = clipPathFor(loaded, plan, scene)
    const selected = !options.only || options.only.includes(scene.id)
    const cached = existsSync(out) && !(options.force && selected)
    clips.push({ id: scene.id, file: out, cached })
    if (!cached && selected) todo.push({ scene, out })
  }
  if (!todo.length) {
    info('All scene clips are up to date.')
    return clips
  }
  const total = todo.reduce((s, t) => s + t.scene.frames, 0)
  const doneBy = new Map<string, number>()
  const report = () => progress('Rendering scenes', [...doneBy.values()].reduce((a, b) => a + b, 0), total)
  const jobs = Math.max(1, Math.min(options.jobs ?? Math.min(4, Math.max(1, cpus().length - 1)), todo.length))
  info(`Rendering ${todo.length} scene${todo.length > 1 ? 's' : ''} (${total} frames) with ${jobs} parallel job${jobs > 1 ? 's' : ''}…`)
  const failures: string[] = []
  let next = 0
  const runOne = async () => {
    while (next < todo.length) {
      const { scene, out } = todo[next++]
      const tmp = out.replace(/\.mp4$/, '.partial.mp4')
      const job = jobFor(loaded, plan, scene, tmp)
      const onFrame = (done: number) => {
        doneBy.set(scene.id, done)
        report()
      }
      try {
        if (jobs === 1) await runSceneJob(job, onFrame)
        else await runInWorker(job, onFrame)
        renameSync(tmp, out)
      } catch (error) {
        rmSync(tmp, { force: true })
        failures.push(`${scene.id}: ${(error as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, runOne))
  writeFileSync(
    path.join(workDirFor(loaded), 'render-manifest.json'),
    JSON.stringify({ scenes: clips.map(c => ({ ...c, exists: existsSync(c.file) })) }, null, 2)
  )
  if (failures.length)
    throw new UserError(
      `${failures.length} scene${failures.length > 1 ? 's' : ''} failed to render:\n  - ${failures.join('\n  - ')}`,
      'Fix the problem and run render again; finished scenes are cached and not rendered twice.'
    )
  return clips.map(c => ({ ...c, cached: c.cached }))
}
