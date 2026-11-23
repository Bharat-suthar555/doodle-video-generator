import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cli, hasFfmpeg, tempDir } from './helpers.ts'

// Real renders at 320x180 keep these smoke tests to a few seconds each.
describe.skipIf(!hasFfmpeg)('rendering', () => {
  it('builds a whiteboard video with captions, chapters and a passing report', () => {
    const dir = tempDir()
    const sb = {
      project: { title: 'Smoke' },
      format: { aspect: '16:9', width: 320, height: 180, fps: 15 },
      style: { drawSpeed: 4000, writeSpeed: 40 },
      export: { output: 'out/smoke.mp4', preset: 'ultrafast' },
      scenes: [
        { id: 'a', chapter: 'A', narration: { text: 'Hello there.' }, elements: [{ type: 'text', text: 'Hi', fontSize: 120 }, { type: 'arrow', from: [500, 800], to: [1400, 800] }] },
        { id: 'b', chapter: 'B', transition: { type: 'fade', duration: 0.4 }, elements: [{ type: 'icon', name: 'check', size: 400 }] }
      ]
    }
    const file = path.join(dir, 'storyboard.json')
    writeFileSync(file, JSON.stringify(sb))
    const r = cli(['build', file, '--jobs', '2', '--frames', '2', '-q'])
    expect(r.code, r.stderr).toBe(0)
    const video = path.join(dir, 'out', 'smoke.mp4')
    expect(existsSync(video)).toBe(true)
    const report = JSON.parse(readFileSync(path.join(dir, 'out', 'smoke.report.json'), 'utf8'))
    expect(report.summary.fail).toBe(0)
    expect(report.metadata.video).toMatchObject({ width: 320, height: 180, fps: 15, codec: 'h264' })
    expect(report.metadata.chapters).toHaveLength(2)
    expect(readFileSync(path.join(dir, 'out', 'smoke.srt'), 'utf8')).toContain('Hello there.')
    const timeline = JSON.parse(readFileSync(path.join(dir, 'out', 'smoke.timeline.json'), 'utf8'))
    expect(timeline.scenes[1].startFrame).toBe(timeline.scenes[0].frames - 6)

    // A second render reuses every cached scene
    expect(cli(['render', file]).stderr).toContain('up to date')
    // assemble refuses to replace a file it didn't write
    const foreign = path.join(dir, 'foreign.mp4')
    writeFileSync(foreign, 'not a video')
    expect(cli(['assemble', file, '--output', foreign]).code).toBe(1)
    expect(readFileSync(foreign, 'utf8')).toBe('not a video')
    // a PNG still for quick layout checks
    expect(cli(['render', file, '--still', '1', '--scene', 'a', '--out', path.join(dir, 'still.png')]).code).toBe(0)
    expect(readFileSync(path.join(dir, 'still.png')).subarray(1, 4).toString()).toBe('PNG')
  }, 120000)

  it('renders footage with trim, mask, zoom, callouts and a label', () => {
    const dir = tempDir()
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'clip.mp4')])
    const sb = {
      project: { title: 'Footage' },
      format: { width: 320, height: 180, fps: 30 },
      subtitles: { enabled: false },
      export: { output: 'out/f.mp4', preset: 'ultrafast' },
      scenes: [{
        id: 'f',
        type: 'footage',
        duration: 3,
        footage: {
          source: 'clip.mp4',
          provenance: 'mock',
          label: 'Mock demo',
          trim: { start: 0.5, end: 2.5 },
          zoom: [{ at: 0.5, duration: 0.5, zoom: 1.5, center: [960, 540] }],
          masks: [{ x: 0, y: 0, width: 200, height: 100, style: 'blur' }],
          callouts: [{ type: 'arrow', from: [200, 200], to: [600, 600], animation: { start: 0.2 } }]
        }
      }]
    }
    const file = path.join(dir, 'storyboard.json')
    writeFileSync(file, JSON.stringify(sb))
    const r = cli(['build', file, '--frames', '1', '-q'])
    expect(r.code, r.stderr).toBe(0)
    const report = JSON.parse(readFileSync(path.join(dir, 'out', 'f.report.json'), 'utf8'))
    expect(report.metadata.duration).toBeCloseTo(3, 1)
    expect(report.summary.fail).toBe(0)
    // the original recording is untouched
    expect(existsSync(path.join(dir, 'clip.mp4'))).toBe(true)
  }, 120000)

  it('inspects any video against expectations', () => {
    const dir = tempDir()
    const video = path.join(dir, 'v.mp4')
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=24:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
    const r = cli(['inspect', video, '--expect-width', '320', '--expect-height', '180', '--json'])
    expect(r.code).toBe(1)
    const report = JSON.parse(r.stdout)
    expect(report.checks.find((c: { id: string }) => c.id === 'video.resolution').status).toBe('fail')
    expect(report.checks.find((c: { id: string }) => c.id === 'audio.codec').status).toBe('pass')
    expect(report.notPerformed.length).toBeGreaterThan(0)
  }, 60000)
})
