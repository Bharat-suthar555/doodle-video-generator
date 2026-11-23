import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { UserError } from '../core/errors.ts'
import { run } from '../core/ffmpeg.ts'
import type { LoadedStoryboard } from '../storyboard/load.ts'
import { estimateSpeech } from '../timeline/plan.ts'

// Adapter for the optional demo-narrator skill (github.com/GarvitSolanki/audio-generator),
// which synthesizes speech locally with Kokoro or Piper. This toolkit never stamps
// demo-narrator's approval gate: the person must approve the narration text first.

export interface NarratorLocation {
  dir: string
  python: string
  script: string
}

const candidates = () => {
  const home = homedir()
  return [
    process.env.DEMO_NARRATOR_DIR,
    path.join(home, '.claude', 'skills', 'demo-narrator'),
    path.join(home, '.agents', 'skills', 'demo-narrator'),
    path.join(home, '.codex', 'skills', 'demo-narrator'),
    path.join(process.cwd(), '.claude', 'skills', 'demo-narrator'),
    path.join(process.cwd(), '.agents', 'skills', 'demo-narrator')
  ].filter((d): d is string => Boolean(d))
}

/** Finds an installed demo-narrator skill with its Python environment set up. */
export const findNarrator = (dir?: string): NarratorLocation => {
  const dirs = dir ? [path.resolve(dir)] : candidates()
  for (const d of dirs) {
    const script = path.join(d, 'scripts', 'generate_tts.py')
    if (!existsSync(script)) continue
    const python = [path.join(d, '.venv', 'bin', 'python'), path.join(d, '.venv', 'Scripts', 'python.exe')].find(existsSync)
    if (!python)
      throw new UserError(`demo-narrator is installed at ${d} but its Python environment is missing.`, `Run its setup first: bash "${path.join(d, 'setup.sh')}"`)
    return { dir: d, python, script }
  }
  throw new UserError(
    'demo-narrator was not found.',
    'Install it (npx skills add GarvitSolanki/audio-generator --skill demo-narrator), run its setup.sh, or pass --narrator <dir>. You can also supply your own narration audio files instead.'
  )
}

interface NarratorSegment {
  id: number
  start: number
  end: number
  text: string
}

interface NarratorScript {
  voice: string
  speed: number
  approved: boolean
  approved_digest?: string
  approved_at?: string
  video_duration: number
  segments: NarratorSegment[]
}

export interface NarrateOptions {
  narratorDir?: string
  voice?: string
  engine?: 'auto' | 'kokoro' | 'piper'
  /** Where to write the storyboard with audio references. */
  output?: string
}

export type NarrateResult =
  | { status: 'needs-approval'; scriptFile: string; approveCommand: string; segments: { sceneId: string; text: string }[] }
  | { status: 'done'; storyboardFile: string; clips: { sceneId: string; file: string; duration: number }[]; engine: string }

/**
 * Prepares demo-narrator's script.json from the storyboard narration and, once the
 * person has approved it, generates one WAV per scene and writes a storyboard copy
 * that references them. Clips are never sped up (--max-speed 1.0).
 */
export const narrate = async (loaded: LoadedStoryboard, o: NarrateOptions = {}): Promise<NarrateResult> => {
  const narrator = findNarrator(o.narratorDir)
  const sb = loaded.storyboard
  const scenes = sb.scenes.filter(s => s.narration?.text)
  if (!scenes.length) throw new UserError('No scene has narration text to synthesize.')
  const workDir = path.join(loaded.baseDir, 'narration', path.basename(loaded.file, '.json'))
  mkdirSync(workDir, { recursive: true })
  const scriptFile = path.join(workDir, 'script.json')

  // Wide slots: demo-narrator only uses them to decide on speed-ups, which are disabled
  let cursor = 0.5
  const segments: NarratorSegment[] = scenes.map((s, i) => {
    const slot = estimateSpeech(s.narration!.text!, sb.narration.wordsPerMinute) * 2 + 3
    const seg = { id: i + 1, start: Math.round(cursor * 100) / 100, end: Math.round((cursor + slot - 0.5) * 100) / 100, text: s.narration!.text!.trim() }
    cursor += slot
    return seg
  })
  const script: NarratorScript = { voice: o.voice ?? 'af_heart', speed: 1, approved: false, video_duration: Math.ceil(cursor + 1), segments }
  if (existsSync(scriptFile)) {
    const old = JSON.parse(readFileSync(scriptFile, 'utf8')) as Partial<NarratorScript>
    const same =
      old.segments?.length === segments.length &&
      old.segments.every((s, i) => s.id === segments[i].id && s.text.split(/\s+/).join(' ') === segments[i].text.split(/\s+/).join(' '))
    // Keep the approval stamp only when the approved words are unchanged
    if (same && old.approved) Object.assign(script, { approved: true, approved_digest: old.approved_digest, approved_at: old.approved_at })
    if (old.voice && !o.voice) script.voice = old.voice
  }
  writeFileSync(scriptFile, JSON.stringify(script, null, 2))
  const approveCommand = `"${narrator.python}" "${narrator.script}" "${scriptFile}" --approve`
  if (!script.approved)
    return { status: 'needs-approval', scriptFile, approveCommand, segments: scenes.map(s => ({ sceneId: s.id, text: s.narration!.text! })) }

  const args = [narrator.script, scriptFile, '--max-speed', '1.0', '--engine', o.engine ?? 'auto']
  const result = await run(narrator.python, args)
  if (result.code !== 0) {
    if (/NOT approved|changed since it was approved/.test(result.stderr))
      return { status: 'needs-approval', scriptFile, approveCommand, segments: scenes.map(s => ({ sceneId: s.id, text: s.narration!.text! })) }
    throw new UserError(`demo-narrator failed:\n${(result.stderr || result.stdout).trim().slice(-1500)}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(workDir, 'audio', 'tts.json'), 'utf8')) as {
    engine: string
    segments: { id: number; file: string; duration: number }[]
  }
  const raw = JSON.parse(readFileSync(loaded.file, 'utf8')) as { scenes: { id: string; narration?: { audio?: string } }[] }
  const outFile = path.resolve(o.output ?? loaded.file.replace(/\.json$/i, '.narrated.json'))
  if (outFile === loaded.file) throw new UserError('Choose an --output path different from the input storyboard.')
  if (path.dirname(outFile) !== loaded.baseDir)
    throw new UserError('Write the narrated storyboard next to the original so its relative file paths still work.')
  const clips = manifest.segments.map(seg => {
    const scene = scenes[seg.id - 1]
    const file = path.join(workDir, 'audio', seg.file)
    const target = raw.scenes.find(s => s.id === scene.id)!
    target.narration = { ...target.narration, audio: path.relative(path.dirname(outFile), file) }
    return { sceneId: scene.id, file, duration: seg.duration }
  })
  writeFileSync(outFile, `${JSON.stringify(raw, null, 2)}\n`)
  return { status: 'done', storyboardFile: outFile, clips, engine: manifest.engine }
}
