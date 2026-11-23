import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { UserError } from '../core/errors.ts'
import { ffmpeg, requireFfmpeg } from '../core/ffmpeg.ts'
import { info } from '../core/log.ts'
import { formatIssues } from '../storyboard/load.ts'

// Optional browser recording for apps you own or are authorized to demonstrate.
// Navigation is limited to local addresses unless the person passes --allow-host,
// requests to other hosts are blocked, and typed text never reaches the log.

const selector = z.string().min(1).max(500)
const Step = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('goto'), url: z.string().min(1) }),
  z.strictObject({ action: z.literal('wait'), ms: z.number().int().min(0).max(120000) }),
  z.strictObject({ action: z.literal('waitFor'), selector, timeout: z.number().int().min(0).max(120000).default(10000) }),
  z.strictObject({ action: z.literal('move'), selector }),
  z.strictObject({ action: z.literal('hover'), selector }),
  z.strictObject({ action: z.literal('click'), selector }),
  z.strictObject({ action: z.literal('type'), selector, text: z.string().max(2000), delay: z.number().int().min(0).max(500).default(55) }),
  /** Types the value of an environment variable; the value is never logged or stored. */
  z.strictObject({ action: z.literal('typeSecret'), selector, env: z.string().regex(/^[A-Z_][A-Z0-9_]*$/) }),
  z.strictObject({ action: z.literal('press'), key: z.string().min(1).max(40) }),
  z.strictObject({ action: z.literal('scroll'), y: z.number().int().min(-20000).max(20000) }),
  /** Records the current time under a name, to find trim points later. */
  z.strictObject({ action: z.literal('mark'), name: z.string().min(1).max(80) })
])

export const RecordingSchema = z.strictObject({
  url: z.string().min(1),
  viewport: z.strictObject({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) }).default({ width: 1920, height: 1080 }),
  fps: z.number().int().min(12).max(60).default(30),
  cursor: z.boolean().default(true),
  steps: z.array(Step).min(1).max(500)
})

export type Recording = z.output<typeof RecordingSchema>

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** True when a URL may be opened: local addresses, file URLs, or explicitly allowed hosts. */
export const urlAllowed = (url: string, allowHosts: string[]) => {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'about:') return true
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return localHosts.has(host) || host.endsWith('.localhost') || allowHosts.map(h => h.toLowerCase()).includes(host)
}

const playwrightBrowsers = () => {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(homedir(), '.cache', 'ms-playwright'), path.join(homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(homedir(), 'AppData', 'Local', 'ms-playwright')]
  const found: string[] = []
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    for (const d of readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse())
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe'])
        found.push(path.join(root, d, sub))
  }
  return found
}

/** Finds a Chromium-based browser: DVG_BROWSER, a Playwright download, or a system install. */
export const findBrowser = (explicit?: string) => {
  const list = [
    explicit,
    process.env.DVG_BROWSER,
    ...playwrightBrowsers(),
    ...(platform() === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : platform() === 'win32'
        ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe']
        : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/brave', '/usr/bin/brave-browser', '/usr/bin/microsoft-edge'])
  ].filter((p): p is string => Boolean(p))
  const hit = list.find(p => existsSync(p))
  if (!hit) throw new UserError('No Chromium-based browser found.', 'Install Chrome, Chromium, Brave or Edge, or pass --browser <path>.')
  return hit
}

// A cursor dot drawn into the page. It is a popover so it can sit in the top
// layer, and it re-enters the top layer above any modal dialog that opens later.
const cursorScript = `(() => {
  const add = () => {
    if (document.getElementById('__dvg_cursor')) return
    const c = document.createElement('div')
    c.id = '__dvg_cursor'
    c.setAttribute('popover', 'manual')
    c.style.cssText = 'position:fixed;inset:auto;margin:0;padding:0;left:-40px;top:-40px;width:22px;height:22px;border-radius:50%;background:rgba(228,87,46,.85);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s;overflow:visible'
    document.body.appendChild(c)
    const raise = () => {
      if (!c.showPopover) return
      if (c.matches(':popover-open')) c.hidePopover()
      c.showPopover()
    }
    raise()
    addEventListener('mousemove', e => {
      c.style.left = e.clientX + 'px'
      c.style.top = e.clientY + 'px'
      if (document.querySelector('dialog[open]')) raise()
    }, true)
    addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.75)' }, true)
    addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%)' }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add)
  else add()
})()`

export interface RecordOptions {
  output: string
  allowHosts?: string[]
  browser?: string
  /** Allow page requests (fonts, scripts) to non-allowed hosts. Navigation stays restricted. */
  allowExternalResources?: boolean
  headed?: boolean
  overwrite?: boolean
}

export const loadRecording = (file: string): Recording => {
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new UserError(`Could not read recording script ${file}: ${(error as Error).message}`)
  }
  const parsed = RecordingSchema.safeParse(data)
  if (!parsed.success) throw new UserError(`${file} has problems:\n  - ${formatIssues(parsed.error.issues).join('\n  - ')}`)
  return parsed.data
}

/** Records a scripted browser session to MP4, plus a marks file with step times. */
export const recordBrowser = async (rec: Recording, baseDir: string, o: RecordOptions) => {
  requireFfmpeg()
  const allowHosts = o.allowHosts ?? []
  const resolveUrl = (u: string) => (/^[a-z]+:/i.test(u) ? u : new URL(u, rec.url).toString())
  const start = /^[a-z]+:/i.test(rec.url) ? rec.url : `file://${path.resolve(baseDir, rec.url)}`
  for (const url of [start, ...rec.steps.flatMap(s => (s.action === 'goto' ? [resolveUrl(s.url)] : []))])
    if (!urlAllowed(url, allowHosts))
      throw new UserError(`Refusing to open ${new URL(url).host || url}: only local addresses are allowed by default.`, 'If you own or are authorized to record this site, pass --allow-host <hostname>.')
  for (const s of rec.steps) if (s.action === 'typeSecret' && process.env[s.env] === undefined) throw new UserError(`Environment variable ${s.env} is not set (needed by a typeSecret step)`)
  if (existsSync(o.output) && !o.overwrite) throw new UserError(`${o.output} already exists`, 'Pass --overwrite or choose another --output.')

  let playwright: typeof import('playwright-core')
  try {
    playwright = await import('playwright-core')
  } catch {
    throw new UserError('Browser recording needs the optional playwright-core package.', 'Install it next to the toolkit: npm install playwright-core')
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'dvg-record-'))
  const browser = await playwright.chromium.launch({ executablePath: findBrowser(o.browser), headless: !o.headed })
  const marks: { name: string; time: number }[] = []
  try {
    const context = await browser.newContext({ viewport: rec.viewport, deviceScaleFactor: 1 })
    if (rec.cursor) await context.addInitScript(cursorScript)
    await context.route('**/*', route => {
      const req = route.request()
      const ok = urlAllowed(req.url(), allowHosts) || (o.allowExternalResources && !req.isNavigationRequest())
      return ok ? route.continue() : route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    // Capture with the DevTools screencast: frames arrive when the page changes,
    // each with a timestamp, and FFmpeg turns them into constant-rate video.
    const cdp = await context.newCDPSession(page)
    const frames: { file: string; t: number }[] = []
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = path.join(tmp, `f${String(frames.length).padStart(6, '0')}.jpg`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 })
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await page.goto(start)
    const t0 = Date.now()
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: rec.viewport.width, maxHeight: rec.viewport.height, everyNthFrame: 1 })
    let mouse = { x: rec.viewport.width / 2, y: rec.viewport.height / 2 }
    const glide = async (sel: string) => {
      const box = await page.locator(sel).first().boundingBox()
      if (!box) throw new UserError(`Element not visible: ${sel}`)
      const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const steps = Math.max(12, Math.round(Math.hypot(target.x - mouse.x, target.y - mouse.y) / 18))
      await page.mouse.move(target.x, target.y, { steps })
      mouse = target
    }
    for (const [i, s] of rec.steps.entries()) {
      const label = `step ${i + 1}/${rec.steps.length}: ${s.action}`
      switch (s.action) {
        case 'goto':
          await page.goto(resolveUrl(s.url))
          info(`${label} ${new URL(resolveUrl(s.url)).pathname}`)
          break
        case 'wait':
          await page.waitForTimeout(s.ms)
          break
        case 'waitFor':
          await page.locator(s.selector).first().waitFor({ timeout: s.timeout })
          break
        case 'move':
        case 'hover':
          await glide(s.selector)
          break
        case 'click':
          await glide(s.selector)
          await page.waitForTimeout(120)
          await page.mouse.down()
          await page.mouse.up()
          break
        case 'type':
          await glide(s.selector)
          await page.locator(s.selector).first().click()
          await page.keyboard.type(s.text, { delay: s.delay })
          info(`${label}: ${s.text.length} characters into ${s.selector}`)
          break
        case 'typeSecret':
          await glide(s.selector)
          await page.locator(s.selector).first().click()
          await page.keyboard.type(process.env[s.env]!, { delay: 40 })
          info(`${label}: value of ${s.env} (hidden)`)
          break
        case 'press':
          await page.keyboard.press(s.key)
          break
        case 'scroll':
          await page.mouse.wheel(0, s.y)
          await page.waitForTimeout(400)
          break
        case 'mark':
          marks.push({ name: s.name, time: (Date.now() - t0) / 1000 })
          break
      }
    }
    await page.waitForTimeout(500)
    await cdp.send('Page.stopScreencast')
    const end = Date.now() / 1000
    await context.close()
    if (!frames.length) throw new UserError('The browser sent no frames; the page may have failed to load.')
    // ffconcat list: each frame lasts until the next one arrives
    const start0 = t0 / 1000
    const list = ['ffconcat version 1.0']
    frames.forEach((f, i) => {
      const from = i === 0 ? start0 : f.t
      const to = frames[i + 1]?.t ?? end
      list.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`)
    })
    list.push(`file '${path.basename(frames[frames.length - 1].file)}'`)
    writeFileSync(path.join(tmp, 'frames.ffconcat'), `${list.join('\n')}\n`)
    await ffmpeg(
      ['-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat', '-vf', `fps=${rec.fps},scale=${rec.viewport.width}:${rec.viewport.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-an', '-movflags', '+faststart', '-y', path.resolve(o.output)],
      { cwd: tmp }
    )
  } finally {
    await browser.close()
    rmSync(tmp, { recursive: true, force: true })
  }
  const marksFile = o.output.replace(/\.mp4$/i, '') + '.marks.json'
  writeFileSync(marksFile, JSON.stringify({ note: 'Times are seconds from the start of the recording, accurate to about 0.1s', marks }, null, 2))
  return { video: o.output, marksFile, marks }
}
