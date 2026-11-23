import { youtubeTimestamp, type TimelinePlan } from '../timeline/plan.ts'
import type { Storyboard } from './schema.ts'

/** Markdown shot list of the screen recordings a storyboard needs. */
export const shotList = (sb: Storyboard, plan?: TimelinePlan) => {
  const rows = sb.scenes
    .filter(s => s.type === 'footage')
    .map(s => {
      const p = plan?.scenes.find(x => x.id === s.id)
      return [
        `## ${s.id}${s.chapter ? `: ${s.chapter}` : ''}`,
        '',
        `- **Status**: ${s.footage?.source ? `recorded (${s.footage.source})` : 'to record'}`,
        `- **Provenance**: ${s.footage?.provenance ?? 'unknown'}${s.footage?.label ? `, labeled "${s.footage.label}"` : ''}`,
        ...(p ? [`- **Planned length**: ${p.duration.toFixed(1)}s, starting at ${youtubeTimestamp(p.start)}`] : []),
        ...(s.shot ? [`- **What to show**: ${s.shot.description}`] : []),
        ...(s.shot?.url ? [`- **Where**: ${s.shot.url}`] : []),
        ...(s.shot?.steps.length ? ['- **Steps**:', ...s.shot.steps.map((st, i) => `  ${i + 1}. ${st}`)] : []),
        ...(s.narration?.text ? [`- **Narration over this shot**: ${s.narration.text}`] : []),
        ''
      ].join('\n')
    })
  return [`# Shot List: ${sb.project.title}`, '', rows.length ? rows.join('\n') : 'No footage scenes: this video is whiteboard only.', ''].join('\n')
}
