/** Deterministic PRNG (mulberry32): the same seed always yields the same sequence. */
export const createRandom = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Random = ReturnType<typeof createRandom>

/** Uniform value in [-1, 1). */
export const signed = (rand: Random) => rand() * 2 - 1
