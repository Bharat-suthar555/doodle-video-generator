import { measureText } from '../drawing/font.ts'
import type { Element } from '../storyboard/schema.ts'

/**
 * Elements for the on-screen footage label, such as "Mock demo · fictional data".
 * The badge sits in the top-left corner of the safe area for the whole scene.
 */
export const labelBadge = (label: string, designWidth: number, designHeight: number): Element[] => {
  const fontSize = Math.round(Math.min(designWidth, designHeight) * 0.026)
  const m = measureText({ text: label, font: 'sans-bold', fontSize, lineHeight: 1.1 })
  const x = designWidth * 0.04
  const y = designHeight * 0.05
  const padX = fontSize * 0.8
  const padY = fontSize * 0.45
  const none = { type: 'none' as const, start: 0 }
  return [
    {
      type: 'rect',
      id: 'footage-label-box',
      x,
      y,
      anchor: 'top-left',
      width: m.width + padX * 2,
      height: m.height + padY * 2,
      radius: fontSize * 0.5,
      fill: '#111111',
      color: '#111111',
      strokeWidth: 1,
      opacity: 0.82,
      hand: false,
      animation: none
    },
    {
      type: 'text',
      id: 'footage-label-text',
      text: label,
      font: 'sans-bold',
      fontSize,
      color: '#ffffff',
      x: x + padX,
      y: y + padY,
      anchor: 'top-left',
      align: 'left',
      hand: false,
      animation: none
    }
  ]
}
