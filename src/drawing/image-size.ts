import { readFileSync } from 'node:fs'
import path from 'node:path'
import { UserError } from '../core/errors.ts'

export interface LoadedImage {
  href: string
  width: number
  height: number
}

const mimeFor: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Reads pixel dimensions from PNG, JPEG, GIF or WebP headers. */
const dimensions = (buf: Buffer): [number, number] | null => {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)]
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
      i += 2 + len
    }
  }
  return null
}

/** Loads a raster image (max 20 MB) as a data URI with its dimensions. */
export const loadImage = (file: string): LoadedImage => {
  const mime = mimeFor[path.extname(file).toLowerCase()]
  if (!mime) throw new UserError(`Unsupported image type: ${file}`, 'Use PNG, JPEG, WebP or GIF.')
  let buf: Buffer
  try {
    buf = readFileSync(file)
  } catch {
    throw new UserError(`Image not found: ${file}`)
  }
  if (buf.length > 20 * 1024 * 1024) throw new UserError(`Image is larger than 20 MB: ${file}`)
  const dims = dimensions(buf)
  if (!dims) throw new UserError(`Could not read the size of ${file}`)
  return { href: `data:${mime};base64,${buf.toString('base64')}`, width: dims[0], height: dims[1] }
}
