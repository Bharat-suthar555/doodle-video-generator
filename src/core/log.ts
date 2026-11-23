// Progress output goes to stderr so stdout stays clean for JSON results.

let quiet = false

export const setQuiet = (value: boolean) => {
  quiet = value
}

export const info = (message: string) => {
  if (!quiet) process.stderr.write(`${message}\n`)
}

export const warn = (message: string) => {
  process.stderr.write(`warning: ${message}\n`)
}

/** Prints a single-line progress bar that redraws in place on a TTY. */
export const progress = (label: string, done: number, total: number) => {
  if (quiet) return
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100
  if (process.stderr.isTTY) {
    process.stderr.write(`\r${label} ${pct}% (${done}/${total})`)
    if (done >= total) process.stderr.write('\n')
  } else if (done >= total || done % Math.max(1, Math.round(total / 4)) === 0) {
    process.stderr.write(`${label} ${pct}% (${done}/${total})\n`)
  }
}
