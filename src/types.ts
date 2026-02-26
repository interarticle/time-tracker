import type { InjectionKey, Ref, ComputedRef } from 'vue'

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

export interface CommittedNode {
  id: string
  name: string
  children: CommittedNode[]
  durationMs: number | null
}

export interface CommittedTreeData {
  roots: CommittedNode[]
}

export const BUFFER_NAME = 'Lunch / Buffer'

export interface PlanningDayData {
  startOfDayMinutes: number | null
  roots: CommittedNode[]
  bufferLimitMs?: number
}

export interface PlanningSettings {
  enabled: boolean
  dailyLimitMs: number
}

export interface TimeTracker {
  // Date navigation
  currentDateKey: Ref<string>
  isToday: ComputedRef<boolean>
  displayDate: ComputedRef<string>
  goToPrevDay: () => void
  goToNextDay: () => void
  goToToday: () => void

  // Task tree
  tree: Ref<TaskTreeData>
  addRoot: () => void
  addChild: (parentId: string) => void
  addSibling: (nodeId: string) => void
  renameTask: (nodeId: string, name: string) => void
  deleteTask: (nodeId: string) => void
  setTimeLimit: (nodeId: string, limitMs: number | null) => void

  // Timer state & actions
  dayState: Ref<DayTimerState>
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
  now: Ref<number>

  // Notifications
  sendTestNotification: () => Promise<void>

  // Picture-in-Picture
  openPip: (forceReopen?: boolean) => Promise<void>

  // Indent / Dedent
  focusNodeId: Ref<string | null>
  indentTask: (nodeId: string) => string | null
  dedentTask: (nodeId: string) => string | null
}

export const TimeTrackerKey: InjectionKey<TimeTracker> = Symbol('TimeTracker')

export interface Planning {
  // Settings (global)
  planningEnabled: Ref<boolean>
  dailyLimitMs: Ref<number>
  setPlanningLimit: (ms: number) => void
  disablePlanning: () => void
  // Per-day committed tree
  committedTree: Ref<CommittedTreeData>
  startOfDayMinutes: Ref<number | null>
  setStartOfDay: (minutes: number | null) => void
  // Committed tree CRUD
  addCommittedRoot: () => void
  addCommittedChild: (parentId: string) => void
  addCommittedSibling: (nodeId: string) => void
  renameCommitted: (nodeId: string, name: string) => void
  deleteCommitted: (nodeId: string) => void
  setCommittedDuration: (nodeId: string, ms: number | null) => void
  // Indent/dedent
  committedFocusNodeId: Ref<string | null>
  indentCommitted: (nodeId: string) => string | null
  dedentCommitted: (nodeId: string) => string | null
  // Computeds
  committedTotalMs: ComputedRef<number>
  timeAvailableMs: ComputedRef<number>
  endOfDayMinutes: ComputedRef<number | null>
  getCommittedSubtreeMs: (node: CommittedNode) => number
  // Lunch / Buffer item
  bufferLimitMs: Ref<number | undefined>
  setBufferLimit: (ms: number | undefined) => void
  bufferAccumulatedMs: ComputedRef<number>
  bufferIsLive: ComputedRef<boolean>
}

export const PlanningKey: InjectionKey<Planning> = Symbol('Planning')
