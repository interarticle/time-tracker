export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
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
