// Minimal types for the parts of opentype.js 2.x this project uses.
declare module 'opentype.js' {
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' }

  export interface Glyph {
    name?: string
    unicode?: number
    getPath(x: number, y: number, fontSize: number): { commands: PathCommand[] }
  }

  export interface Font {
    unitsPerEm: number
    ascender: number
    descender: number
    getAdvanceWidth(text: string, fontSize: number, options?: object): number
    forEachGlyph(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options: object,
      callback: (glyph: Glyph, x: number, y: number, fontSize: number) => void
    ): number
  }

  const opentype: { parse(buffer: ArrayBuffer): Font }
  export default opentype
}
