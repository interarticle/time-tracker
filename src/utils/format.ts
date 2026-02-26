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

/** Parse H:MM or HH:MM as minutes from midnight (for clock times). */
export function parseClockHHMM(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** Parse H:MM or HH:MM as milliseconds (for durations like daily limit). */
export function parseHoursMinutes(input: string): number | null {
  const match = input.trim().match(/^(\d+):(\d{1,2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (m >= 60) return null
  return (h * 3600 + m * 60) * 1000
}

export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim()
  // Try HH:MM:SS
  const hms = trimmed.match(/^(\d+):(\d{1,2}):(\d{1,2})$/)
  if (hms) {
    return (Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])) * 1000
  }
  // Try MM:SS
  const ms = trimmed.match(/^(\d+):(\d{1,2})$/)
  if (ms) {
    return (Number(ms[1]) * 60 + Number(ms[2])) * 1000
  }
  return null
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

export function addDays(dateKey: string, days: number): string {
  const parts = dateKey.split('-').map(Number)
  const date = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
