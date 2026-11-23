// Built-in line icons drawn for this project, on a 100 x 100 grid.
// Each icon is SVG path data; every subpath becomes one marker stroke.

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`

const rays = (cx: number, cy: number, r1: number, r2: number, count: number, phase = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2
    const f = (n: number) => Math.round(n * 10) / 10
    return `M${f(cx + Math.cos(a) * r1)} ${f(cy + Math.sin(a) * r1)} L${f(cx + Math.cos(a) * r2)} ${f(cy + Math.sin(a) * r2)}`
  }).join(' ')

const star = () => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 16 : 38
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
    return `${Math.round((50 + Math.cos(a) * r) * 10) / 10} ${Math.round((54 + Math.sin(a) * r) * 10) / 10}`
  })
  return `M${pts.join(' L')} Z`
}

export const icons: Record<string, string> = {
  user: `${circle(50, 32, 14)} M22 84 C22 62 36 54 50 54 C64 54 78 62 78 84`,
  users: `${circle(40, 34, 12)} M14 82 C14 62 26 56 40 56 C54 56 66 62 66 82 ${circle(68, 28, 10)} M72 50 C82 52 90 58 90 74`,
  document: 'M28 12 H62 L76 26 V88 H28 Z M62 12 V26 H76 M38 44 H66 M38 56 H66 M38 68 H56',
  folder: 'M14 30 V80 H86 V38 H48 L40 30 Z M14 46 H86',
  mail: 'M14 28 H86 V74 H14 Z M14 28 L50 54 L86 28',
  phone: 'M34 10 H66 A6 6 0 0 1 72 16 V84 A6 6 0 0 1 66 90 H34 A6 6 0 0 1 28 84 V16 A6 6 0 0 1 34 10 Z M46 80 H54',
  chat: 'M16 22 H84 V64 H44 L28 80 V64 H16 Z M30 38 H70 M30 50 H58',
  cart: `M10 20 H22 L32 64 H78 L86 32 H26 ${circle(38, 78, 6)} ${circle(72, 78, 6)}`,
  dollar: `${circle(50, 50, 38)} M62 36 C58 28 42 28 40 38 C38 46 48 48 52 50 C58 52 64 56 60 64 C56 72 42 72 38 64 M50 22 V78`,
  'chart-bar': 'M16 14 V84 H88 M28 84 V56 H38 V84 M48 84 V38 H58 V84 M68 84 V24 H78 V84',
  'chart-line': 'M16 14 V84 H88 M24 70 L42 52 L56 60 L82 28 M70 28 H82 V40',
  pie: `${circle(50, 50, 34)} M50 50 V16 M50 50 L80 66`,
  gear: `${circle(50, 50, 24)} ${circle(50, 50, 9)} ${rays(50, 50, 24, 36, 8)}`,
  lightbulb: 'M38 66 C38 56 28 50 28 38 A22 22 0 0 1 72 38 C72 50 62 56 62 66 Z M40 74 H60 M42 82 H58 M46 50 L50 58 L54 50',
  check: 'M20 52 L40 72 L80 30',
  cross: 'M26 26 L74 74 M74 26 L26 74',
  clock: `${circle(50, 50, 36)} M50 28 V50 L64 60`,
  calendar: 'M16 24 H84 V84 H16 Z M16 40 H84 M32 14 V30 M68 14 V30 M30 54 H38 M46 54 H54 M62 54 H70 M30 68 H38 M46 68 H54',
  lock: 'M26 46 H74 V86 H26 Z M36 46 V34 A14 14 0 0 1 64 34 V46 M50 60 V72',
  key: `${circle(30, 50, 14)} M44 50 H86 M74 50 V62 M84 50 V60`,
  database:
    'M20 24 A30 10 0 1 0 80 24 A30 10 0 1 0 20 24 M20 24 V76 A30 10 0 0 0 80 76 V24 M20 50 A30 10 0 0 0 80 50',
  server: 'M16 14 H84 V38 H16 Z M16 44 H84 V68 H16 Z M28 26 H32 M28 56 H32 M50 74 V86 M30 86 H70',
  cloud: 'M28 74 H72 A16 16 0 0 0 74 42 A22 22 0 0 0 32 38 A18 18 0 0 0 28 74 Z',
  globe: `${circle(50, 50, 36)} M50 14 A16 36 0 0 0 50 86 A16 36 0 0 0 50 14 M14 50 H86 M20 32 H80 M20 68 H80`,
  laptop: 'M22 24 H78 V64 H22 Z M10 72 H90 L84 80 H16 Z',
  search: `${circle(42, 42, 24)} M60 60 L84 84`,
  warning: 'M50 14 L88 82 H12 Z M50 38 V60 M50 70 V72',
  star: star(),
  heart: 'M50 82 C20 62 12 44 22 30 C32 18 46 22 50 34 C54 22 68 18 78 30 C88 44 80 62 50 82 Z',
  target: `${circle(50, 50, 36)} ${circle(50, 50, 22)} ${circle(50, 50, 8)}`,
  flag: 'M24 88 V14 M24 18 H76 L66 34 L76 50 H24',
  truck: `M10 30 H58 V70 H10 Z M58 44 H76 L88 58 V70 H58 ${circle(26, 74, 8)} ${circle(74, 74, 8)}`,
  box: 'M18 34 L50 18 L82 34 V70 L50 86 L18 70 Z M18 34 L50 50 L82 34 M50 50 V86',
  building: 'M24 88 V16 H64 V88 M64 40 H82 V88 M14 88 H90 M34 28 H40 M48 28 H54 M34 44 H40 M48 44 H54 M34 60 H40 M48 60 H54',
  home: 'M16 50 L50 20 L84 50 M26 42 V84 H74 V42 M42 84 V62 H58 V84',
  tag: `M14 50 L46 18 H82 V54 L50 86 Z ${circle(68, 32, 5)}`,
  bell: 'M30 68 V46 A20 20 0 0 1 70 46 V68 L78 76 H22 Z M44 84 A6 6 0 0 0 56 84',
  sun: `${circle(50, 50, 16)} ${rays(50, 50, 24, 36, 8)}`,
  raindrop: 'M50 14 C40 32 26 46 26 62 A24 24 0 0 0 74 62 C74 46 60 32 50 14 Z',
  leaf: 'M20 80 C20 40 50 18 84 16 C82 52 60 80 20 80 Z M20 80 L60 40',
  trophy: 'M32 16 H68 V40 A18 18 0 0 1 32 40 Z M32 24 H20 A10 10 0 0 0 32 42 M68 24 H80 A10 10 0 0 1 68 42 M50 58 V72 M40 72 H60 V84 H40 Z',
  funnel: 'M12 18 H88 L58 54 V82 L42 90 V54 Z',
  link: 'M46 36 L56 26 A14 14 0 0 1 76 46 L66 56 M54 64 L44 74 A14 14 0 0 1 24 54 L34 44 M40 60 L60 40',
  wifi: 'M14 42 A50 50 0 0 1 86 42 M28 56 A30 30 0 0 1 72 56 M41 70 A12 12 0 0 1 59 70 M50 82 V83',
  code: 'M36 28 L14 50 L36 72 M64 28 L86 50 L64 72 M56 20 L44 80',
  question: `${circle(50, 50, 38)} M38 38 A12 12 0 1 1 56 48 C50 52 50 56 50 62 M50 72 V74`,
  info: `${circle(50, 50, 38)} M50 44 V72 M50 30 V32`,
  plus: 'M50 20 V80 M20 50 H80',
  minus: 'M20 50 H80',
  eye: `M10 50 C30 22 70 22 90 50 C70 78 30 78 10 50 Z ${circle(50, 50, 12)}`,
  pencil: 'M20 80 L24 64 L68 20 L80 32 L36 76 Z M60 28 L72 40 M24 64 L36 76',
  megaphone: 'M18 42 V60 H30 L70 80 V22 L30 42 Z M30 60 L36 80 H46 L42 62 M80 40 L88 36 M80 62 L88 66 M82 51 H90',
  'arrow-right': 'M14 50 H84 M66 32 L84 50 L66 68',
  spreadsheet: 'M16 18 H84 V82 H16 Z M16 38 H84 M16 60 H84 M40 18 V82 M62 18 V82',
  inbox: 'M14 56 L26 22 H74 L86 56 V80 H14 Z M14 56 H36 L42 66 H58 L64 56 H86',
  'sticky-note': 'M18 18 H82 V62 L62 82 H18 Z M62 82 V62 H82 M30 34 H70 M30 46 H60',
  shield: 'M50 12 L82 24 V48 C82 68 68 82 50 90 C32 82 18 68 18 48 V24 Z M36 50 L46 60 L66 40',
  rocket: `M50 12 C66 24 70 44 64 68 H36 C30 44 34 24 50 12 Z ${circle(50, 40, 7)} M36 56 L24 72 L36 70 M64 56 L76 72 L64 70 M44 72 L50 86 L56 72`,
  bolt: 'M56 10 L26 56 H48 L42 90 L74 42 H52 Z',
  cycle: 'M78 40 A30 30 0 0 0 24 34 M22 60 A30 30 0 0 0 76 66 M78 22 V40 H60 M22 78 V60 H40',
  handshake:
    'M8 44 L24 30 L40 38 M92 44 L76 30 L58 34 L40 50 A6 6 0 0 0 50 58 L62 48 M24 30 V58 L44 76 A5 5 0 0 0 52 70 M50 66 L58 74 A5 5 0 0 0 66 66 M62 62 L68 68 A5 5 0 0 0 76 60 L76 30'
}

export const iconNames = Object.keys(icons).sort()
