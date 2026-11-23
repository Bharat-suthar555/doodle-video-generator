// The drawing hand: original vector artwork made for this project.
// Local frame: the marker tip is at (0, 0) and the marker body runs along +x.
// The renderer rotates the whole group so the hand enters from the lower right.

const skin = '#f1c7a3'
const skinShade = '#e0a982'
const outline = '#a8704f'
const nail = '#f8e2d2'
const sleeve = '#3d5a80'
const sleeveShade = '#2f4766'
const cuff = '#e9eef5'

const art = `
<g stroke="${outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
  <path d="M462 -112 C700 -130 1200 -190 1900 -250 L1920 290 C1200 210 700 140 462 118 Z" fill="${sleeve}" stroke="${sleeveShade}"/>
  <path d="M560 70 C800 92 1200 140 1900 210" fill="none" stroke="${sleeveShade}" stroke-width="5"/>
  <path d="M444 -110 L494 -114 L494 122 L444 118 Z" fill="${cuff}" stroke="#c9d2de"/>
  <path d="M196 -36 C228 -96 300 -128 370 -126 C420 -124 456 -100 466 -60 L470 70 C452 112 398 124 336 118 C286 114 246 92 214 66 Z" fill="${skin}"/>
  <path d="M330 -40 C370 -30 410 -34 440 -60" fill="none" stroke="${skinShade}" stroke-width="4"/>
  <path d="M150 18 C176 6 214 10 238 24 C250 34 246 58 230 64 C204 72 168 66 150 52 C138 42 138 26 150 18 Z" fill="${skin}"/>
  <path d="M182 46 C206 40 236 46 262 60 C274 70 268 92 250 96 C222 100 192 92 176 78 C166 66 168 52 182 46 Z" fill="${skin}"/>
  <path d="M220 78 C244 74 270 82 290 96 C300 106 292 124 276 126 C252 128 228 118 214 104 C206 94 208 82 220 78 Z" fill="${skinShade}"/>
</g>
<g stroke="#2b2b2b" stroke-width="2.5" stroke-linejoin="round">
  <path d="M0 0 L16 -7 L16 7 Z" fill="#1f1f1f"/>
  <path d="M16 -9 L46 -20 L46 20 L16 9 Z" fill="#d9dde3"/>
  <rect x="46" y="-23" width="262" height="46" rx="8" fill="#f7f8fa"/>
  <rect x="250" y="-23" width="40" height="46" fill="#e4572e" stroke="none"/>
  <rect x="46" y="-23" width="262" height="46" rx="8" fill="none"/>
  <rect x="298" y="-25" width="44" height="50" rx="10" fill="#2f2f33"/>
</g>
<g stroke="${outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
  <path d="M96 10 C120 2 170 4 212 18 C236 26 244 50 228 62 C206 76 150 62 112 46 C90 38 82 18 96 10 Z" fill="${skin}"/>
  <path d="M98 14 C110 10 124 12 132 18 C134 30 124 40 110 38 C98 34 92 22 98 14 Z" fill="${nail}" stroke-width="2"/>
  <path d="M64 -14 C96 -34 164 -46 222 -42 C252 -40 262 -12 244 2 C214 22 140 14 92 6 C66 2 52 -6 64 -14 Z" fill="${skin}"/>
  <path d="M64 -14 C74 -22 90 -24 100 -20 C104 -10 96 0 82 2 C70 2 60 -6 64 -14 Z" fill="${nail}" stroke-width="2"/>
  <path d="M168 -26 C186 -30 204 -28 214 -22" fill="none" stroke="${skinShade}" stroke-width="3"/>
</g>`

/** Angle of the marker body, in degrees clockwise from +x. */
export const handAngle = 52

/**
 * SVG for the hand with its marker tip at (x, y).
 * `scale` sizes the artwork; `sway` adds a few degrees of natural rotation.
 */
export const handSvg = (x: number, y: number, scale: number, sway = 0) =>
  `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)}) rotate(${(handAngle + sway).toFixed(2)})">${art}</g>`

/** The hand's base scale on a 1080-pixel-tall board. */
export const baseHandScale = 0.62
