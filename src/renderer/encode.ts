// Shared x264 settings. Intermediate scene clips use a low CRF so the final
// encode starts from near-lossless material.

export const colorTags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

export const rgbToYuv = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p'

export const intermediateVideo = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', ...colorTags]

export const rawInput = (width: number, height: number, fps: number) => [
  '-f',
  'rawvideo',
  '-pix_fmt',
  'rgba',
  '-s',
  `${width}x${height}`,
  '-r',
  String(fps),
  '-i',
  'pipe:0'
]
