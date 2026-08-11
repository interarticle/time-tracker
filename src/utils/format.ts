/** Format a countdown: positive = remaining, negative = over (prefixed with -). */
export function formatCountdown(remainingMs: number): string {
  const prefix = remainingMs < 0 ? '-' : ''
  return prefix + formatMs(Math.abs(remainingMs))
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** Format milliseconds as H:MM (no seconds) — for planning totals and headers. */
export function formatMsHM(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Format minutes-from-midnight as HH:MM. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = Math.round(minutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Unified time-input parsing
//
// Every text box that accepts a time goes through `parseTime` below. The three
// public wrappers (`parseTimeInput`, `parseHoursMinutes`, `parseClockHHMM`)
// only differ in their "mode", which controls how colon-separated pieces map
// onto unit slots and what the output unit is.
//
//   hms   — durations at second resolution. Slots [H, M, S]. Returns ms.
//   hm    — durations at minute resolution. Slots [H, M].    Returns ms.
//   clock — a time of day (minutes from midnight). Slots [H, M].
//           Bare digit runs are read clock-style (e.g. "930" → 09:30).
//           Returns minutes from midnight (0–1439).
//
// Supported uniformly across every mode:
//   • Right-aligned shorthand: pieces fill the smallest units first, so a bare
//     number lands in the smallest unit — "60" is 60s (hms) / 60m (hm).
//     ":60" is the same (the leading colon just leaves higher units empty).
//   • Trailing-colon shorthand: "1:" → "1:00" — the number occupies the next
//     unit up and the smallest unit is zero. "15:" in hms is 15 minutes.
//   • Arithmetic: terms joined by + / - are summed left to right, each term
//     parsed with the same rules. "00:15:23+15:" → 00:30:23,
//     "00:10:11-9:" → 00:01:11. Durations clamp at zero; clock times must
//     land in 0:00–23:59.
// ---------------------------------------------------------------------------

export type TimeMode = 'hms' | 'hm' | 'clock'

// Multiplier of each slot (left → right) into the mode's smallest unit:
// hms → seconds, hm/clock → minutes.
const SLOT_MULTIPLIERS: Record<TimeMode, number[]> = {
  hms: [3600, 60, 1],
  hm: [60, 1],
  clock: [60, 1],
}

/** Parse a run of bare digits as a clock time (no colon): "9"→9:00, "930"→9:30, "0930"→9:30. */
function parseClockDigits(digits: string): number | null {
  let h: number
  let m: number
  if (digits.length <= 2) {
    h = Number(digits)
    m = 0
  } else if (digits.length === 3) {
    h = Number(digits[0])
    m = Number(digits.slice(1))
  } else if (digits.length === 4) {
    h = Number(digits.slice(0, 2))
    m = Number(digits.slice(2))
  } else {
    return null
  }
  if (m > 59) return null
  return h * 60 + m
}

/** Parse a single term (no +/-) into the mode's smallest unit. */
function parseTerm(term: string, mode: TimeMode): number | null {
  if (term === '') return null
  // Clock mode: a bare digit run is a clock entry rather than a unit count.
  if (mode === 'clock' && /^\d+$/.test(term)) {
    return parseClockDigits(term)
  }
  if (!/^[\d:]*$/.test(term)) return null
  const mult = SLOT_MULTIPLIERS[mode]
  if (!term.includes(':')) {
    // Bare number → smallest unit.
    return Number(term)
  }
  const parts = term.split(':')
  if (parts.length > mult.length) return null
  // Right-align the typed pieces onto the lowest unit slots.
  const offset = mult.length - parts.length
  let total = 0
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i] ?? ''
    if (piece !== '' && !/^\d+$/.test(piece)) return null
    total += (piece === '' ? 0 : Number(piece)) * mult[offset + i]!
  }
  return total
}

/** Evaluate a full time expression (terms joined by + / -) into smallest units. */
function evaluate(input: string, mode: TimeMode): number | null {
  const compact = input.replace(/\s+/g, '')
  if (compact === '') return null
  const tokens = compact.match(/[+-]?[^+-]+/g)
  if (!tokens) return null
  let total = 0
  for (const token of tokens) {
    const sign = token[0] === '-' ? -1 : 1
    const term = token[0] === '+' || token[0] === '-' ? token.slice(1) : token
    const units = parseTerm(term, mode)
    if (units === null) return null
    total += sign * units
  }
  return total
}

/** Parse a time string in the given mode. Returns ms for durations, minutes for clock. */
export function parseTime(input: string, mode: TimeMode): number | null {
  const units = evaluate(input, mode)
  if (units === null) return null
  if (mode === 'clock') {
    if (units < 0 || units > 23 * 60 + 59) return null
    return units
  }
  const seconds = mode === 'hms' ? units : units * 60
  return Math.max(0, seconds) * 1000
}

/** Parse a clock time (start of day) as minutes from midnight. */
export function parseClockHHMM(input: string): number | null {
  return parseTime(input, 'clock')
}

/** Parse an H:MM duration (e.g. daily limit) as milliseconds. */
export function parseHoursMinutes(input: string): number | null {
  return parseTime(input, 'hm')
}

/** Parse an H:MM:SS duration (task time / limits) as milliseconds. */
export function parseTimeInput(input: string): number | null {
  return parseTime(input, 'hms')
}

/**
 * Format a stored value for display *inside an edit box*. A zero (or unset)
 * value renders as the empty string so editing 0:0:0 always starts blank.
 * `value` is ms for durations, minutes-from-midnight for clock times.
 */
export function formatForEdit(value: number | null | undefined, mode: TimeMode): string {
  if (value === null || value === undefined || value === 0) return ''
  if (mode === 'clock') return formatMinutes(value)
  return mode === 'hms' ? formatMs(value) : formatMsHM(value)
}

export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateDisplay(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Start of the week (Sunday) containing the given date, as a date key. */
export function getWeekStart(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  date.setDate(date.getDate() - date.getDay()) // Sunday = 0
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Short "Sun M/D – Sat M/D" label for the week beginning at the given Sunday. */
export function formatWeekRange(weekStartKey: string): string {
  const md = (key: string) => {
    const p = key.split('-').map(Number)
    return `${p[1]}/${p[2]}`
  }
  return `${md(weekStartKey)} – ${md(addDays(weekStartKey, 6))}`
}

export function addDays(dateKey: string, days: number): string {
  const parts = dateKey.split('-').map(Number)
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
