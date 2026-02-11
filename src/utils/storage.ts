import type { TaskTreeData, DayTimerState, MetaData } from '@/types'

const TREE_KEY = 'tt:tree'
const DAY_PREFIX = 'tt:day:'
const META_KEY = 'tt:meta'

export function loadTree(): TaskTreeData {
  try {
    const raw = localStorage.getItem(TREE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { roots: [], version: 1 }
}

export function saveTree(tree: TaskTreeData): void {
  localStorage.setItem(TREE_KEY, JSON.stringify(tree))
}

export function loadDayState(dateKey: string): DayTimerState {
  try {
    const raw = localStorage.getItem(DAY_PREFIX + dateKey)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { timers: {}, lastStateChangeAt: null, runningTimerIds: [] }
}

export function saveDayState(dateKey: string, state: DayTimerState): void {
  localStorage.setItem(DAY_PREFIX + dateKey, JSON.stringify(state))
}

export function loadMeta(): MetaData {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { lastOpenDate: '' }
}

export function saveMeta(meta: MetaData): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}
