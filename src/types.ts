import type { InjectionKey } from 'vue'

export interface TaskNode {
  id: string
  name: string
  children: TaskNode[]
  timeLimitMs: number | null
}

export interface TaskTreeData {
  roots: TaskNode[]
  version: number
}

export interface LeafTimerData {
  accumulatedMs: number
}

export interface DayTimerState {
  timers: Record<string, LeafTimerData>
  lastStateChangeAt: number | null
  runningTimerIds: string[]
}

export interface MetaData {
  lastOpenDate: string
}

export interface TimeTracker {
  // Date navigation
  currentDateKey: import('vue').Ref<string>
  isToday: import('vue').ComputedRef<boolean>
  displayDate: import('vue').ComputedRef<string>
  goToPrevDay: () => void
  goToNextDay: () => void
  goToToday: () => void

  // Task tree
  tree: import('vue').Ref<TaskTreeData>
  addRoot: () => void
  addChild: (parentId: string) => void
  addSibling: (nodeId: string) => void
  renameTask: (nodeId: string, name: string) => void
  deleteTask: (nodeId: string) => void
  setTimeLimit: (nodeId: string, limitMs: number | null) => void

  // Timer state & actions
  dayState: import('vue').Ref<DayTimerState>
  switchTimer: (id: string) => void
  stopTimer: (id: string) => void
  shareTimer: (id: string) => void
  stopAll: () => void
  setAccumulatedMs: (id: string, ms: number) => void

  // Display helpers
  getDisplayMs: (id: string) => number
  getSubtreeMs: (node: TaskNode) => number
  getSubtreeLimitMs: (node: TaskNode) => number | null
  getTotalDayMs: () => number
  getTotalDayLimitMs: () => number | null
  isRunning: (id: string) => boolean
  now: import('vue').Ref<number>

  // Notifications
  sendTestNotification: () => void
}

export const TimeTrackerKey: InjectionKey<TimeTracker> = Symbol('TimeTracker')
