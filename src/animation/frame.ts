import { ease, progressAt } from '../core/easing.ts'
import { inflate } from '../core/geometry.ts'
import { handSvg } from '../drawing/hand.ts'
import { cameraAt } from './compile.ts'
import { handTip } from './hand-track.ts'
import type { CompiledItem, CompiledScene, Drawable } from './types.ts'

export interface FrameOptions {
  /** Output pixel size; the SVG viewBox stays in design units. */
  width: number
  height: number
  /** Transparent background, for overlays on footage. */
  transparent?: boolean
  /** Skip the camera transform (overlays are positioned in frame units). */
  noCamera?: boolean
  showHand?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const n1 = (v: number) => (Math.round(v * 100) / 100).toString()

const strokeAttrs = (color: string, width: number, opacity: number, linecap = 'round') =>
  `fill="none" stroke="${color}" stroke-width="${n1(width)}" stroke-linecap="${linecap}" stroke-linejoin="round"${opacity < 1 ? ` stroke-opacity="${n1(opacity)}"` : ''}`

/** Dash settings that show the first `p` (0..1) of a path of length `len`. */
const partial = (len: number, p: number) => {
  const a = len + 2
  return ` stroke-dasharray="${n1(a)} ${n1(a)}" stroke-dashoffset="${n1(a * (1 - p))}"`
}

let maskCounter = 0

const renderItem = (item: CompiledItem, t: number, ink: boolean, defs: string[]): string => {
  switch (item.kind) {
    case 'stroke': {
      if (ink && t < item.t0) return ''
      const p = ink ? progressAt(t, item.t0, item.t1 - item.t0) : 1
      const blend = item.blend ? ' style="mix-blend-mode:multiply"' : ''
      return `<path d="${item.d}" ${strokeAttrs(item.color, item.width, item.opacity, item.linecap)}${p < 1 ? partial(item.line.length, p) : ''}${blend}/>`
    }
    case 'fill': {
      if (ink && t < item.t0) return ''
      const p = ink ? progressAt(t, item.t0, item.t1 - item.t0) : 1
      return `<path d="${item.d}" fill="${item.color}" fill-opacity="${n1(item.opacity * p)}" stroke="none"/>`
    }
    case 'image':
      return `<image href="${esc(item.href)}" x="${n1(item.x)}" y="${n1(item.y)}" width="${n1(item.width)}" height="${n1(item.height)}" preserveAspectRatio="none"/>`
    case 'glyph': {
      if (ink && t < item.t0) return ''
      if (!ink || t >= item.t1) return `<path d="${item.fillD}" fill="${item.color}"/>`
      // Writing in progress: reveal the filled glyph through a brush that traces its outline
      const id = `m${maskCounter++}`
      const b = inflate(item.box, item.brush)
      const strokes = item.contours
        .filter(c => t >= c.t0)
        .map(c => {
          const p = progressAt(t, c.t0, c.t1 - c.t0)
          return `<path d="${c.d}" ${strokeAttrs('#fff', item.brush, 1)}${p < 1 ? partial(c.line.length, p) : ''}/>`
        })
        .join('')
      defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.width)}" height="${n1(b.height)}">${strokes}</mask>`)
      return `<path d="${item.fillD}" fill="${item.color}" mask="url(#${id})"/>`
    }
  }
}

const renderDrawable = (d: Drawable, t: number, defs: string[]): string => {
  const { anim } = d
  if (t < anim.start && anim.type !== 'none') return ''
  if (anim.type === 'none' && t < anim.start) return ''
  let opacity = d.opacity
  let transform = ''
  let clip = ''
  const ink = anim.type === 'draw' || anim.type === 'handwrite'
  const p = ease(anim.easing, progressAt(t, anim.start, anim.duration))
  const box = inflate(d.box, 24)
  switch (anim.type) {
    case 'fade':
      opacity *= p
      break
    case 'slide': {
      const [dx, dy] = anim.from ?? [0, 60]
      transform = `translate(${n1(dx * (1 - p))} ${n1(dy * (1 - p))})`
      opacity *= Math.min(1, p * 1.5)
      break
    }
    case 'move': {
      const [dx, dy] = anim.from ?? [-200, 0]
      transform = `translate(${n1(dx * (1 - p))} ${n1(dy * (1 - p))})`
      break
    }
    case 'scale': {
      const cx = d.box.x + d.box.width / 2
      const cy = d.box.y + d.box.height / 2
      const s = Math.max(0.001, p)
      transform = `translate(${n1(cx)} ${n1(cy)}) scale(${n1(s)}) translate(${n1(-cx)} ${n1(-cy)})`
      break
    }
    case 'reveal': {
      if (p < 1) {
        const id = `c${maskCounter++}`
        defs.push(`<clipPath id="${id}"><rect x="${n1(box.x)}" y="${n1(box.y)}" width="${n1(box.width * p)}" height="${n1(box.height)}"/></clipPath>`)
        clip = `url(#${id})`
      }
      break
    }
  }
  if (d.exit && t >= d.exit.start) {
    const q = progressAt(t, d.exit.start, d.exit.duration)
    if (q >= 1) return ''
    if (d.exit.type === 'fade') opacity *= 1 - q
    else {
      // Erase wipes from left to right, like an eraser pass
      const id = `c${maskCounter++}`
      defs.push(`<clipPath id="${id}"><rect x="${n1(box.x + box.width * q)}" y="${n1(box.y)}" width="${n1(box.width * (1 - q))}" height="${n1(box.height)}"/></clipPath>`)
      clip = `url(#${id})`
    }
  }
  if (opacity <= 0.001) return ''
  const body = d.items.map(item => renderItem(item, t, ink, defs)).join('')
  if (!body) return ''
  const attrs = [
    transform && `transform="${transform}"`,
    opacity < 1 && `opacity="${n1(opacity)}"`,
    clip && `clip-path="${clip}"`
  ]
    .filter(Boolean)
    .join(' ')
  return attrs ? `<g ${attrs}>${body}</g>` : body
}

/** Builds the SVG for one frame of a compiled scene at time t (seconds). */
export const renderFrameSvg = (scene: CompiledScene, t: number, o: FrameOptions): string => {
  maskCounter = 0
  const W = scene.designWidth
  const H = scene.designHeight
  const defs: string[] = []
  const content = scene.drawables.map(d => renderDrawable(d, t, defs)).join('')
  const cam = o.noCamera ? { zoom: 1, cx: W / 2, cy: H / 2 } : cameraAt(scene.camera, t, W, H)
  const camT =
    cam.zoom === 1 && cam.cx === W / 2 && cam.cy === H / 2
      ? ''
      : `translate(${n1(W / 2)} ${n1(H / 2)}) scale(${cam.zoom.toFixed(4)}) translate(${n1(-cam.cx)} ${n1(-cam.cy)})`
  let hand = ''
  if (o.showHand !== false && scene.handWindows.length) {
    const tip = handTip(scene, t)
    if (tip) hand = handSvg(tip[0], tip[1], scene.handScale, Math.sin(t * 2.3) * 2.5)
  }
  const bg = o.transparent ? '' : `<rect width="${W}" height="${H}" fill="${scene.background}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${W} ${H}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${bg}${camT ? `<g transform="${camT}">${content}</g>` : content}${hand}</svg>`
}
