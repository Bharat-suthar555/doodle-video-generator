import type { Storyboard } from '../storyboard/schema.ts'
import type { TimelinePlan } from '../timeline/plan.ts'
import { defaultCharsPerLine, segmentNarration, type Caption } from './segment.ts'

/** Captions for every narrated scene, on the final video's timeline. */
export const buildCaptions = (sb: Storyboard, plan: TimelinePlan): Caption[] => {
  const o = {
    maxLines: sb.subtitles.maxLines,
    maxCharsPerLine: sb.subtitles.maxCharsPerLine ?? defaultCharsPerLine(sb.format.aspect),
    minDuration: sb.subtitles.minDuration
  }
  const captions: Caption[] = []
  for (const scene of plan.scenes) {
    const n = scene.narration
    if (!n?.text) continue
    // Clip speech to the scene so a caption never outlives its scene
    const sceneEnd = scene.start + scene.duration
    const duration = Math.min(n.duration, sceneEnd - n.absoluteStart)
    captions.push(...segmentNarration({ text: n.text, start: n.absoluteStart, duration, words: n.words, estimated: n.estimated }, o))
  }
  // Scenes can overlap during transitions; keep captions strictly sequential
  for (let i = 1; i < captions.length; i++)
    if (captions[i].start < captions[i - 1].end) captions[i - 1].end = Math.max(captions[i - 1].start + 0.1, captions[i].start - 0.04)
  return captions
}
