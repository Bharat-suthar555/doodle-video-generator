import type { Box, Point, Polyline } from '../core/geometry.ts'
import type { EasingName } from '../core/easing.ts'

/** Geometry produced by element builders, before timing is assigned. */
export type InkItem =
  | {
      kind: 'stroke'
      points: Point[]
      color: string
      width: number
      opacity: number
      hand: boolean
      linecap?: 'round' | 'butt'
      blend?: 'multiply'
    }
  | {
      kind: 'glyph'
      contours: Point[][]
      color: string
      brush: number
      hand: boolean
      wordStart: boolean
      fontSize: number
    }
  | { kind: 'fill'; polygons: Point[][]; color: string; opacity: number }
  | { kind: 'image'; href: string; x: number; y: number; width: number; height: number }

export type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'none'

export type EntranceType = 'draw' | 'handwrite' | 'reveal' | 'fade' | 'slide' | 'move' | 'scale' | 'none'

export interface ResolvedAnimation {
  type: EntranceType
  start?: number
  delay?: number
  duration?: number
  easing?: EasingName
  cue?: string
  from?: Point
}

export interface ExitSpec {
  type: 'erase' | 'fade'
  start: number
  duration: number
}

export interface Built {
  id: string
  type: string
  shape: ShapeKind
  items: InkItem[]
  box: Box
  animation: ResolvedAnimation
  exit?: ExitSpec
  opacity: number
  /** Carries readable text, used by the overlap check. */
  textual: boolean
  /** Connector or highlight: overlaps its targets on purpose. */
  decorative: boolean
}

export interface TimedLine {
  d: string
  line: Polyline
  t0: number
  t1: number
}

export type CompiledItem =
  | ({ kind: 'stroke'; color: string; width: number; opacity: number; hand: boolean; linecap: 'round' | 'butt'; blend?: 'multiply' } & TimedLine)
  | { kind: 'glyph'; fillD: string; contours: TimedLine[]; color: string; brush: number; box: Box; t0: number; t1: number; hand: boolean }
  | { kind: 'fill'; d: string; color: string; opacity: number; t0: number; t1: number }
  | { kind: 'image'; href: string; x: number; y: number; width: number; height: number }

export interface Drawable {
  id: string
  type: string
  box: Box
  items: CompiledItem[]
  anim: { type: EntranceType; start: number; duration: number; easing: EasingName; from?: Point }
  exit?: ExitSpec
  opacity: number
  textual: boolean
  decorative: boolean
}

export interface CameraKeyResolved {
  at: number
  duration: number
  zoom: number
  center: Point
  easing: EasingName
}

export interface HandWindow {
  t0: number
  t1: number
  line: Polyline
}

export interface CompiledScene {
  id: string
  designWidth: number
  designHeight: number
  background: string
  drawables: Drawable[]
  camera: CameraKeyResolved[]
  handWindows: HandWindow[]
  handScale: number
  /** When the last entrance animation ends, in seconds from scene start. */
  contentEnd: number
  warnings: string[]
  /** True when any cue time was estimated from text instead of word timings. */
  estimatedCues: boolean
}

/** When narration plays within a scene, used for cues and auto duration. */
export interface NarrationTiming {
  offset: number
  duration: number
  text?: string
  words?: { word: string; start: number; end: number }[]
  estimated: boolean
}
