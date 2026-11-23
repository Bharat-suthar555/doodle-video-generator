export const easingNames = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeOutBack',
  'easeInOutCubic'
] as const

export type EasingName = (typeof easingNames)[number]

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

const easings: Record<EasingName, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => t * t * (3 - 2 * t),
  easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutBack: t => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }
}

/** Applies a named easing to progress t, clamping t to [0, 1] first. */
export const ease = (name: EasingName, t: number) => easings[name](clamp01(t))

/** Progress of time `t` through the window [start, start + duration], clamped. */
export const progressAt = (t: number, start: number, duration: number) =>
  duration <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / duration)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
