import type { Storyboard } from '../storyboard/schema.ts'
import { youtubeTimestamp, type TimelinePlan } from './plan.ts'

export interface YoutubeMetadata {
  title: string
  description: string
  tags: string[]
  chapters: { timestamp: string; seconds: number; title: string }[]
  chapterWarnings: string[]
  thumbnailConcept?: string
}

/** YouTube chapter rules: first at 0:00, at least three, each at least 10 seconds long. */
export const chapterWarnings = (chapters: { time: number }[], duration: number) => {
  const w: string[] = []
  if (!chapters.length) return ['No chapters: add "chapter" titles to scenes to get YouTube chapters']
  if (Math.floor(chapters[0].time) !== 0) w.push('YouTube needs the first chapter at 0:00; give the first scene a chapter title')
  if (chapters.length < 3) w.push('YouTube shows chapters only when there are at least three')
  chapters.forEach((c, i) => {
    const end = chapters[i + 1]?.time ?? duration
    if (end - c.time < 10) w.push(`Chapter ${i + 1} lasts ${(end - c.time).toFixed(1)}s; YouTube needs at least 10s per chapter`)
  })
  return w
}

export const youtubeMetadata = (sb: Storyboard, plan: TimelinePlan): YoutubeMetadata => {
  const chapters = plan.chapters.map(c => ({ timestamp: youtubeTimestamp(c.time), seconds: Math.floor(c.time + 1e-6), title: c.title }))
  const warnings = chapterWarnings(plan.chapters, plan.duration)
  const chapterText = chapters.length ? `\n\nChapters\n${chapters.map(c => `${c.timestamp} ${c.title}`).join('\n')}` : ''
  return {
    title: (sb.youtube.title ?? sb.project.title).slice(0, 100),
    description: `${sb.youtube.description ?? sb.project.purpose ?? sb.project.title}${chapterText}`,
    tags: sb.youtube.tags,
    chapters,
    chapterWarnings: warnings,
    thumbnailConcept: sb.youtube.thumbnailConcept
  }
}

export const youtubeMarkdown = (m: YoutubeMetadata, durationSeconds: number) =>
  [
    `# ${m.title}`,
    '',
    `Duration: ${youtubeTimestamp(durationSeconds)} (from the rendered timeline)`,
    '',
    '## Description',
    '',
    m.description,
    '',
    '## Tags',
    '',
    m.tags.length ? m.tags.join(', ') : '(none set in the storyboard)',
    '',
    '## Chapters',
    '',
    ...(m.chapters.length ? m.chapters.map(c => `- ${c.timestamp} ${c.title}`) : ['(none)']),
    ...(m.chapterWarnings.length ? ['', '### Chapter Warnings', '', ...m.chapterWarnings.map(w => `- ${w}`)] : []),
    '',
    '## Thumbnail Concept',
    '',
    m.thumbnailConcept ?? '(none set in the storyboard)',
    ''
  ].join('\n')

/** FFmpeg metadata file that embeds chapters in the MP4. */
export const ffmetadata = (title: string, plan: TimelinePlan) => {
  const esc = (s: string) => s.replace(/([=;#\\\n])/g, '\\$1')
  const lines = [';FFMETADATA1', `title=${esc(title)}`]
  plan.chapters.forEach((c, i) => {
    const end = plan.chapters[i + 1]?.time ?? plan.duration
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.time * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${esc(c.title)}`)
  })
  return `${lines.join('\n')}\n`
}
