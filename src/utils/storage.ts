import type { TaskTreeData, DayTimerState, MetaData, PlanningSettings, PlanningDayData, WeeklyPlanData } from '@/types'

const TREE_PREFIX = 'tt:tree:'
const DAY_PREFIX = 'tt:day:'
const META_KEY = 'tt:meta'
const PLANNING_KEY = 'tt:planning'
const PLAN_PREFIX = 'tt:plan:'
const WEEK_PREFIX = 'tt:week:'

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
  return { enabled: false }
}

export function hasPlanningDay(dateKey: string): boolean {
  return localStorage.getItem(PLAN_PREFIX + dateKey) !== null
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

/** Weekly plan, keyed by the week's Sunday date key. */
export function loadWeeklyPlan(weekStartKey: string): WeeklyPlanData {
  try {
    const raw = localStorage.getItem(WEEK_PREFIX + weekStartKey)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { markdown: '' }
}

export function saveWeeklyPlan(weekStartKey: string, data: WeeklyPlanData): void {
  if (data.markdown.trim() === '') {
    localStorage.removeItem(WEEK_PREFIX + weekStartKey)
    return
  }
  localStorage.setItem(WEEK_PREFIX + weekStartKey, JSON.stringify(data))
}
