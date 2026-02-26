import type { TaskTreeData, DayTimerState, MetaData, PlanningSettings, PlanningDayData } from '@/types'

const TREE_PREFIX = 'tt:tree:'
const DAY_PREFIX = 'tt:day:'
const META_KEY = 'tt:meta'
const PLANNING_KEY = 'tt:planning'
const PLAN_PREFIX = 'tt:plan:'

export function loadTree(dateKey: string): TaskTreeData {
  try {
    const raw = localStorage.getItem(TREE_PREFIX + dateKey)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { roots: [], version: 1 }
}

export function saveTree(dateKey: string, tree: TaskTreeData): void {
  localStorage.setItem(TREE_PREFIX + dateKey, JSON.stringify(tree))
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

export function loadPlanningSettings(): PlanningSettings {
  try {
    const raw = localStorage.getItem(PLANNING_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { enabled: false, dailyLimitMs: 8 * 60 * 60 * 1000 }
}

export function savePlanningSettings(s: PlanningSettings): void {
  localStorage.setItem(PLANNING_KEY, JSON.stringify(s))
}

export function loadPlanningDay(dateKey: string): PlanningDayData {
  try {
    const raw = localStorage.getItem(PLAN_PREFIX + dateKey)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { startOfDayMinutes: null, roots: [] }
}

export function savePlanningDay(dateKey: string, data: PlanningDayData): void {
  localStorage.setItem(PLAN_PREFIX + dateKey, JSON.stringify(data))
}
