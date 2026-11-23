import { parentPort } from 'node:worker_threads'
import { renderFootageClip, type FootageClipJob } from '../footage/render.ts'
import { renderWhiteboardClip, type WhiteboardClipJob } from './whiteboard-clip.ts'

export type SceneJob =
  | ({ kind: 'whiteboard' } & Omit<WhiteboardClipJob, 'onFrame'>)
  | ({ kind: 'footage' } & Omit<FootageClipJob, 'onFrame'>)

export type WorkerMessage = { type: 'frame'; done: number } | { type: 'done' } | { type: 'error'; message: string }

/** Runs one scene job; used in worker threads and inline when jobs = 1. */
export const runSceneJob = async (job: SceneJob, onFrame: (done: number) => void) => {
  if (job.kind === 'whiteboard') await renderWhiteboardClip({ ...job, onFrame })
  else await renderFootageClip({ ...job, onFrame })
}

if (parentPort) {
  const port = parentPort
  port.on('message', (job: SceneJob) => {
    let last = 0
    runSceneJob(job, done => {
      // Report every 10 frames to keep message traffic low
      if (done - last >= 10 || done === job.frames) {
        last = done
        port.postMessage({ type: 'frame', done } satisfies WorkerMessage)
      }
    }).then(
      () => port.postMessage({ type: 'done' } satisfies WorkerMessage),
      (error: Error) => port.postMessage({ type: 'error', message: error.message } satisfies WorkerMessage)
    )
  })
}
