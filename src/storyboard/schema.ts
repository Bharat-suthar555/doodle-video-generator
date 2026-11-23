import { z } from 'zod'
import { easingNames } from '../core/easing.ts'

// The storyboard is plain data: no expressions, scripts or remote URLs are
// ever evaluated, so an untrusted storyboard can only reference local files.

const color = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use a hex color such as "#1d1d1f"')
const seconds = z.number().min(0).max(36000)
const point = z.tuple([z.number(), z.number()])
const localFile = z
  .string()
  .min(1)
  .refine(v => !/^[a-z][a-z0-9+.-]*:\/\//i.test(v), 'Use a local file path, not a URL')
const slug = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Use letters, digits, "-" and "_" only')

export const easing = z.enum(easingNames)
export const positionKeywords = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
] as const
export const anchors = positionKeywords

export const animationTypes = [
  'draw',
  'handwrite',
  'reveal',
  'fade',
  'slide',
  'move',
  'scale',
  'none'
] as const

export const AnimationSchema = z.strictObject({
  type: z.enum(animationTypes).optional(),
  /** Seconds from scene start. Omit to start after the previous element. */
  start: seconds.optional(),
  /** Extra wait after the previous element when `start` is omitted. */
  delay: seconds.optional(),
  duration: z.number().min(0.05).max(600).optional(),
  easing: easing.optional(),
  /** Start when this phrase is spoken in the scene narration. */
  cue: z.string().min(1).optional(),
  /** Offset in board units: slide start offset, or move origin offset. */
  from: point.optional()
})

export const ExitSchema = z.strictObject({
  type: z.enum(['erase', 'fade']),
  start: seconds,
  duration: z.number().min(0.05).max(60).default(0.6)
})

const base = {
  id: slug.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  at: z.enum(positionKeywords).optional(),
  anchor: z.enum(anchors).optional(),
  color: color.optional(),
  strokeWidth: z.number().min(0.5).max(60).optional(),
  opacity: z.number().min(0).max(1).optional(),
  animation: AnimationSchema.optional(),
  exit: ExitSchema.optional(),
  /** Set false to hide the drawing hand while this element animates. */
  hand: z.boolean().optional()
}

export const fontNames = ['hand', 'sans', 'sans-bold'] as const

const TextElement = z.strictObject({
  ...base,
  type: z.literal('text'),
  text: z.string().min(1).max(2000),
  fontSize: z.number().min(8).max(400).optional(),
  font: z.enum(fontNames).optional(),
  maxWidth: z.number().min(20).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(0.8).max(3).optional()
})

const LineElement = z.strictObject({
  ...base,
  type: z.enum(['line', 'arrow']),
  from: point,
  to: point,
  /** Bend as a fraction of the length; positive bends left of the direction. */
  curve: z.number().min(-1).max(1).optional(),
  head: z.enum(['end', 'start', 'both', 'none']).optional(),
  dashed: z.boolean().optional()
})

const RectElement = z.strictObject({
  ...base,
  type: z.literal('rect'),
  width: z.number().positive(),
  height: z.number().positive(),
  radius: z.number().min(0).optional(),
  fill: color.optional()
})

const CircleElement = z.strictObject({
  ...base,
  type: z.enum(['circle', 'ellipse']),
  radius: z.number().positive().optional(),
  rx: z.number().positive().optional(),
  ry: z.number().positive().optional(),
  fill: color.optional()
})

const IconElement = z.strictObject({
  ...base,
  type: z.literal('icon'),
  name: z.string().min(1),
  size: z.number().positive().optional()
})

const SvgElement = z.strictObject({
  ...base,
  type: z.literal('svg'),
  file: localFile,
  size: z.number().positive().optional()
})

const ImageElement = z.strictObject({
  ...base,
  type: z.literal('image'),
  file: localFile,
  width: z.number().positive(),
  height: z.number().positive().optional()
})

export const nodeShapes = ['rect', 'round', 'pill', 'diamond', 'circle'] as const

const NodeElement = z.strictObject({
  ...base,
  type: z.literal('node'),
  label: z.string().max(200).default(''),
  shape: z.enum(nodeShapes).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  fill: color.optional(),
  icon: z.string().optional(),
  fontSize: z.number().min(8).max(200).optional()
})

const ConnectorElement = z.strictObject({
  ...base,
  type: z.literal('connector'),
  from: slug,
  to: slug,
  label: z.string().max(120).optional(),
  curve: z.number().min(-1).max(1).optional(),
  head: z.enum(['end', 'start', 'both', 'none']).optional(),
  dashed: z.boolean().optional()
})

const FlowchartElement = z.strictObject({
  ...base,
  type: z.literal('flowchart'),
  direction: z.enum(['row', 'column']).default('row'),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  nodeWidth: z.number().positive().optional(),
  nodeHeight: z.number().positive().optional(),
  fontSize: z.number().min(8).max(200).optional(),
  nodes: z
    .array(
      z.strictObject({
        id: slug,
        label: z.string().max(200),
        shape: z.enum(nodeShapes).optional(),
        icon: z.string().optional(),
        fill: color.optional()
      })
    )
    .min(1)
    .max(40),
  edges: z
    .array(
      z.strictObject({
        from: slug,
        to: slug,
        label: z.string().max(120).optional(),
        curve: z.number().min(-1).max(1).optional(),
        dashed: z.boolean().optional()
      })
    )
    .default([])
})

const ChartElement = z.strictObject({
  ...base,
  type: z.literal('chart'),
  kind: z.enum(['bar', 'line', 'pie']),
  width: z.number().positive().default(700),
  height: z.number().positive().default(420),
  data: z
    .array(z.strictObject({ label: z.string().max(40), value: z.number().min(0) }))
    .min(1)
    .max(24),
  max: z.number().positive().optional(),
  colors: z.array(color).optional(),
  fontSize: z.number().min(8).max(120).optional()
})

const HighlightElement = z.strictObject({
  ...base,
  type: z.literal('highlight'),
  target: slug,
  style: z.enum(['underline', 'circle', 'box', 'marker']).default('underline')
})

export type ElementInput =
  | z.input<typeof TextElement>
  | z.input<typeof LineElement>
  | z.input<typeof RectElement>
  | z.input<typeof CircleElement>
  | z.input<typeof IconElement>
  | z.input<typeof SvgElement>
  | z.input<typeof ImageElement>
  | z.input<typeof NodeElement>
  | z.input<typeof ConnectorElement>
  | z.input<typeof FlowchartElement>
  | z.input<typeof ChartElement>
  | z.input<typeof HighlightElement>
  | GroupInput

export type Element =
  | z.output<typeof TextElement>
  | z.output<typeof LineElement>
  | z.output<typeof RectElement>
  | z.output<typeof CircleElement>
  | z.output<typeof IconElement>
  | z.output<typeof SvgElement>
  | z.output<typeof ImageElement>
  | z.output<typeof NodeElement>
  | z.output<typeof ConnectorElement>
  | z.output<typeof FlowchartElement>
  | z.output<typeof ChartElement>
  | z.output<typeof HighlightElement>
  | Group

const groupFields = {
  ...base,
  type: z.literal('group' as const),
  scale: z.number().positive().max(10).optional(),
  /** Auto-arranges children in a row or column, centered on the group's x/y. */
  layout: z
    .strictObject({
      type: z.enum(['row', 'column']),
      gap: z.number().min(0).default(40)
    })
    .optional()
}

export interface Group {
  type: 'group'
  id?: string
  x?: number
  y?: number
  at?: (typeof positionKeywords)[number]
  anchor?: (typeof anchors)[number]
  color?: string
  strokeWidth?: number
  opacity?: number
  animation?: z.output<typeof AnimationSchema>
  exit?: z.output<typeof ExitSchema>
  hand?: boolean
  scale?: number
  layout?: { type: 'row' | 'column'; gap: number }
  children: Element[]
}

type GroupInput = Omit<Group, 'children' | 'layout' | 'exit'> & {
  layout?: { type: 'row' | 'column'; gap?: number }
  exit?: z.input<typeof ExitSchema>
  children: ElementInput[]
}

export const ElementSchema: z.ZodType<Element, ElementInput> = z.lazy(() =>
  z.discriminatedUnion('type', [
    TextElement,
    LineElement,
    RectElement,
    CircleElement,
    IconElement,
    SvgElement,
    ImageElement,
    NodeElement,
    ConnectorElement,
    FlowchartElement,
    ChartElement,
    HighlightElement,
    GroupSchema
  ])
) as unknown as z.ZodType<Element, ElementInput>

const GroupSchema = z.strictObject({
  ...groupFields,
  children: z.array(ElementSchema).min(1).max(200)
})

export const transitionTypes = [
  'cut',
  'fade',
  'crossfade',
  'dissolve',
  'fade-black',
  'fade-white',
  'wipe-left',
  'wipe-right',
  'slide-left',
  'slide-up',
  'zoom-in',
  'whiteboard-to-screen',
  'screen-to-whiteboard'
] as const

const TransitionSchema = z.strictObject({
  type: z.enum(transitionTypes),
  duration: z.number().min(0).max(5).default(0.6)
})

const CameraKeyframe = z.strictObject({
  at: seconds.optional(),
  cue: z.string().min(1).optional(),
  duration: z.number().min(0).max(60).default(1),
  /** Omit with `focus` to fit the focused element automatically. */
  zoom: z.number().min(0.25).max(8).optional(),
  center: point.optional(),
  focus: slug.optional(),
  easing: easing.default('easeInOutCubic')
})

export const provenanceValues = ['user', 'source', 'generated'] as const

const NarrationSchema = z.strictObject({
  text: z.string().max(10000).optional(),
  /** User-provided or generated narration audio (WAV, MP3, M4A…). */
  audio: localFile.optional(),
  /** Seconds from scene start to the first word. */
  offset: seconds.optional(),
  /** Word timestamps: JSON array of { word, start, end } relative to the audio. */
  words: localFile.optional(),
  /** Where the words came from: the user, a cited source, or generated text. */
  provenance: z.enum(provenanceValues).default('generated'),
  sourceIds: z.array(z.string()).optional()
})

const FootageSchema = z.strictObject({
  source: localFile.optional(),
  provenance: z.enum(['user-recording', 'browser-recording', 'mock']),
  /** On-screen label. Required for mock footage so viewers know it's fictional. */
  label: z.string().max(80).optional(),
  trim: z.strictObject({ start: seconds.default(0), end: seconds.optional() }).prefault({}),
  crop: z
    .strictObject({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: z.number().int().min(16),
      height: z.number().int().min(16)
    })
    .optional(),
  fit: z.enum(['contain', 'cover']).default('contain'),
  padColor: color.default('#ffffff'),
  zoom: z
    .array(
      z.strictObject({
        at: seconds,
        duration: z.number().min(0.05).max(30).default(0.8),
        zoom: z.number().min(1).max(4),
        /** Focus point in board units (the final frame). */
        center: point.optional(),
        easing: easing.default('easeInOut')
      })
    )
    .default([]),
  masks: z
    .array(
      z.strictObject({
        /** Rectangle in source-video pixels, applied before crop and zoom. */
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        width: z.number().int().min(2),
        height: z.number().int().min(2),
        start: seconds.optional(),
        end: seconds.optional(),
        style: z.enum(['blur', 'pixelate', 'solid']).default('blur')
      })
    )
    .default([]),
  callouts: z.array(ElementSchema).default([]),
  audio: z
    .strictObject({ keep: z.boolean().default(false), volume: z.number().min(-60).max(12).default(-12) })
    .prefault({}),
  freezeLastFrame: z.boolean().default(true)
})

const ShotSchema = z.strictObject({
  description: z.string().max(2000),
  url: z.string().optional(),
  steps: z.array(z.string().max(500)).default([])
})

export const SceneSchema = z.strictObject({
  id: slug,
  type: z.enum(['whiteboard', 'footage']).default('whiteboard'),
  chapter: z.string().max(100).optional(),
  duration: z.union([z.number().min(0.2).max(3600), z.literal('auto')]).default('auto'),
  holdAfter: seconds.optional(),
  background: color.optional(),
  narration: NarrationSchema.optional(),
  elements: z.array(ElementSchema).max(400).default([]),
  camera: z.array(CameraKeyframe).max(100).default([]),
  transition: TransitionSchema.optional(),
  footage: FootageSchema.optional(),
  notes: z.string().max(4000).optional(),
  shot: ShotSchema.optional()
})

export const aspectSizes = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080]
} as const

export const StoryboardSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1).default(1),
  project: z.strictObject({
    title: z.string().min(1).max(200),
    purpose: z.string().max(1000).optional(),
    audience: z.string().max(500).optional(),
    language: z.string().default('en')
  }),
  format: z
    .strictObject({
      aspect: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
      width: z.number().int().min(160).max(7680).optional(),
      height: z.number().int().min(160).max(7680).optional(),
      fps: z.number().int().min(12).max(60).default(30)
    })
    .prefault({}),
  style: z
    .strictObject({
      background: color.default('#fbfaf7'),
      ink: color.default('#1d1d1f'),
      accent: color.default('#e4572e'),
      palette: z.array(color).default(['#2b6cb0', '#2f855a', '#c05621', '#6b46c1', '#b83280']),
      font: z.enum(fontNames).default('hand'),
      strokeWidth: z.number().min(0.5).max(40).default(5),
      roughness: z.number().min(0).max(4).default(1),
      seed: z.number().int().default(1),
      hand: z
        .strictObject({
          enabled: z.boolean().default(true),
          scale: z.number().min(0.2).max(3).default(1)
        })
        .prefault({}),
      /** Board units per second when drawing shapes. */
      drawSpeed: z.number().min(50).max(20000).default(1400),
      /** Characters per second when handwriting. */
      writeSpeed: z.number().min(1).max(200).default(14),
      gap: seconds.default(0.25),
      startDelay: seconds.default(0.4),
      hold: seconds.default(1.2)
    })
    .prefault({}),
  narration: z
    .strictObject({
      wordsPerMinute: z.number().min(60).max(300).default(150),
      leadIn: seconds.default(0.4),
      tail: seconds.default(0.6)
    })
    .prefault({}),
  subtitles: z
    .strictObject({
      enabled: z.boolean().default(true),
      burnIn: z.boolean().default(true),
      position: z.enum(['bottom', 'top']).default('bottom'),
      maxLines: z.number().int().min(1).max(3).default(2),
      maxCharsPerLine: z.number().int().min(16).max(80).optional(),
      minDuration: z.number().min(0.3).max(10).default(1.5),
      maxDuration: z.number().min(1).max(15).default(6),
      fontSize: z.number().min(12).max(160).optional(),
      color: color.default('#ffffff'),
      boxColor: color.default('#111111'),
      boxOpacity: z.number().min(0).max(1).default(0.72)
    })
    .prefault({}),
  audio: z
    .strictObject({
      narrationVolume: z.number().min(-30).max(12).default(0),
      music: z
        .strictObject({
          file: localFile,
          /** Who licensed the track, e.g. "user-provided" or a license name. */
          license: z.string().min(2).max(300),
          volume: z.number().min(-60).max(0).default(-18),
          fadeIn: seconds.default(2),
          fadeOut: seconds.default(3),
          duck: z.boolean().default(true),
          loop: z.boolean().default(true)
        })
        .optional(),
      normalize: z
        .strictObject({
          enabled: z.boolean().default(true),
          targetLufs: z.number().min(-36).max(-8).default(-16),
          truePeak: z.number().min(-9).max(0).default(-1.5)
        })
        .prefault({})
    })
    .prefault({}),
  export: z
    .strictObject({
      output: z.string().default('output/video.mp4'),
      crf: z.number().int().min(0).max(51).default(18),
      preset: z
        .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower'])
        .default('medium'),
      audioBitrate: z.string().regex(/^\d{2,3}k$/).default('192k'),
      fadeIn: seconds.default(0),
      fadeOut: seconds.default(0),
      fadeColor: z.enum(['white', 'black']).default('white')
    })
    .prefault({}),
  youtube: z
    .strictObject({
      title: z.string().max(100).optional(),
      description: z.string().max(4500).optional(),
      tags: z.array(z.string().max(60)).max(40).default([]),
      thumbnailConcept: z.string().max(1000).optional()
    })
    .prefault({}),
  sources: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        description: z.string().max(1000),
        kind: z.enum(['user-provided', 'documentation', 'website', 'other']).default('user-provided')
      })
    )
    .default([]),
  scenes: z.array(SceneSchema).min(1).max(500)
})

export type Storyboard = z.output<typeof StoryboardSchema>
export type StoryboardInput = z.input<typeof StoryboardSchema>
export type Scene = z.output<typeof SceneSchema>
export type Footage = z.output<typeof FootageSchema>
export type Animation = z.output<typeof AnimationSchema>
export type Style = Storyboard['style']
export type TransitionType = (typeof transitionTypes)[number]
export type CameraKey = z.output<typeof CameraKeyframe>
export type TextEl = z.output<typeof TextElement>
export type LineEl = z.output<typeof LineElement>
export type RectEl = z.output<typeof RectElement>
export type CircleEl = z.output<typeof CircleElement>
export type IconEl = z.output<typeof IconElement>
export type SvgEl = z.output<typeof SvgElement>
export type ImageEl = z.output<typeof ImageElement>
export type NodeEl = z.output<typeof NodeElement>
export type ConnectorEl = z.output<typeof ConnectorElement>
export type FlowchartEl = z.output<typeof FlowchartElement>
export type ChartEl = z.output<typeof ChartElement>
export type HighlightEl = z.output<typeof HighlightElement>

/** Output size and design (board) size for a storyboard. */
export const frameSize = (sb: Storyboard) => {
  const [dw, dh] = aspectSizes[sb.format.aspect]
  const width = sb.format.width ?? dw
  const height = sb.format.height ?? Math.round((width * dh) / dw)
  return { width, height, designWidth: dw, designHeight: dh, scale: width / dw }
}
