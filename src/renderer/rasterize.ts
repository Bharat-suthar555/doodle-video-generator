import { Resvg } from '@resvg/resvg-js'

const options = { font: { loadSystemFonts: false }, shapeRendering: 2 as const, imageRendering: 0 as const }

/** Rasterizes SVG to premultiplied RGBA pixels at the SVG's width and height. */
export const rasterize = (svg: string): Buffer => new Resvg(svg, options).render().pixels

export const rasterizePng = (svg: string): Buffer => new Resvg(svg, options).render().asPng()
