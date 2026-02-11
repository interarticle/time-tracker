import { ref, computed, watch, onUnmounted } from 'vue'
import type { TaskNode, TaskTreeData, DayTimerState, TimeTracker } from '@/types'
import { todayKey, addDays, formatDateDisplay } from '@/utils/format'
import { loadTree, saveTree, loadDayState, saveDayState, saveMeta } from '@/utils/storage'

let idCounter = Date.now()
function newId(): string {
  return (idCounter++).toString(36)
}

function findNode(roots: TaskNode[], id: string): TaskNode | null {
  for (const node of roots) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

function findParent(roots: TaskNode[], id: string): { parent: TaskNode | null; index: number } {
  for (const node of roots) {
    const idx = node.children.findIndex((c) => c.id === id)
    if (idx !== -1) return { parent: node, index: idx }
    const found = findParent(node.children, id)
    if (found.parent !== null) return found
  }
  return { parent: null, index: -1 }
}

function isLeaf(node: TaskNode): boolean {
  return node.children.length === 0
}

function collectLeafIds(node: TaskNode): string[] {
  if (isLeaf(node)) return [node.id]
  return node.children.flatMap(collectLeafIds)
}

export function useTimeTracker(): TimeTracker {
  // --- Date navigation ---
  const currentDateKey = ref(todayKey())
  const isToday = computed(() => currentDateKey.value === todayKey())
  const displayDate = computed(() => formatDateDisplay(currentDateKey.value))

  function goToPrevDay() {
    currentDateKey.value = addDays(currentDateKey.value, -1)
  }
  function goToNextDay() {
    currentDateKey.value = addDays(currentDateKey.value, 1)
  }
  function goToToday() {
    currentDateKey.value = todayKey()
  }

  // --- Task tree ---
  const tree = ref<TaskTreeData>(loadTree())

  function persistTree() {
    saveTree(tree.value)
  }

  function addRoot() {
    tree.value.roots.push({ id: newId(), name: '', children: [], timeLimitMs: null })
    persistTree()
  }

  function addChild(parentId: string) {
    const parent = findNode(tree.value.roots, parentId)
    if (!parent) return

    // If adding child to a leaf that has accumulated time, transfer it
    if (isLeaf(parent)) {
      flush()
      // Stop the parent timer if running
      const runIdx = dayState.value.runningTimerIds.indexOf(parentId)
      if (runIdx !== -1) {
        dayState.value.runningTimerIds.splice(runIdx, 1)
        if (dayState.value.runningTimerIds.length === 0) {
          dayState.value.lastStateChangeAt = null
        }
      }
      // Transfer accumulated time to the new child
      const existingTimer = dayState.value.timers[parentId]
      const childNode: TaskNode = { id: newId(), name: '', children: [], timeLimitMs: null }
      parent.children.push(childNode)
      if (existingTimer && existingTimer.accumulatedMs > 0) {
        dayState.value.timers[childNode.id] = { accumulatedMs: existingTimer.accumulatedMs }
        delete dayState.value.timers[parentId]
        persistDayState()
      }
    } else {
      parent.children.push({ id: newId(), name: '', children: [], timeLimitMs: null })
    }
    persistTree()
  }

  function addSibling(nodeId: string) {
    const { parent, index } = findParent(tree.value.roots, nodeId)
    if (parent) {
      parent.children.splice(index + 1, 0, {
        id: newId(),
        name: '',
        children: [],
        timeLimitMs: null,
      })
    } else {
      // It's a root node
      const rootIdx = tree.value.roots.findIndex((r) => r.id === nodeId)
      if (rootIdx !== -1) {
        tree.value.roots.splice(rootIdx + 1, 0, {
          id: newId(),
          name: '',
          children: [],
          timeLimitMs: null,
        })
      }
    }
    persistTree()
  }

  function renameTask(nodeId: string, name: string) {
    const node = findNode(tree.value.roots, nodeId)
    if (node) {
      node.name = name
      persistTree()
    }
  }

  function deleteTask(nodeId: string) {
    const node = findNode(tree.value.roots, nodeId)
    if (!node) return

    // Stop any running timers in this subtree
    const leafIds = collectLeafIds(node)
    flush()
    for (const lid of leafIds) {
      const runIdx = dayState.value.runningTimerIds.indexOf(lid)
      if (runIdx !== -1) {
        dayState.value.runningTimerIds.splice(runIdx, 1)
      }
    }
    if (dayState.value.runningTimerIds.length === 0) {
      dayState.value.lastStateChangeAt = null
    }
    persistDayState()

    const { parent, index } = findParent(tree.value.roots, nodeId)
    if (parent) {
      parent.children.splice(index, 1)
    } else {
      const rootIdx = tree.value.roots.findIndex((r) => r.id === nodeId)
      if (rootIdx !== -1) tree.value.roots.splice(rootIdx, 1)
    }
    persistTree()
  }

  function setTimeLimit(nodeId: string, limitMs: number | null) {
    const node = findNode(tree.value.roots, nodeId)
    if (node) {
      node.timeLimitMs = limitMs
      persistTree()
    }
  }

  // --- Day timer state ---
  const dayState = ref<DayTimerState>(loadDayState(currentDateKey.value))

  function persistDayState() {
    saveDayState(currentDateKey.value, dayState.value)
  }

  // Reload day state when date changes
  watch(currentDateKey, (newKey) => {
    dayState.value = loadDayState(newKey)
  })

  // --- Flush pattern ---
  function flush() {
    const state = dayState.value
    if (state.lastStateChangeAt === null || state.runningTimerIds.length === 0) return

    const now = Date.now()
    const elapsed = now - state.lastStateChangeAt
    const share = elapsed / state.runningTimerIds.length

    for (const id of state.runningTimerIds) {
      if (!state.timers[id]) {
        state.timers[id] = { accumulatedMs: 0 }
      }
      state.timers[id].accumulatedMs += share
    }
    state.lastStateChangeAt = now
  }

  function switchTimer(id: string) {
    if (!isToday.value) return
    flush()
    dayState.value.runningTimerIds = [id]
    dayState.value.lastStateChangeAt = Date.now()
    if (!dayState.value.timers[id]) {
      dayState.value.timers[id] = { accumulatedMs: 0 }
    }
    persistDayState()
  }

  function stopTimer(id: string) {
    if (!isToday.value) return
    flush()
    const idx = dayState.value.runningTimerIds.indexOf(id)
    if (idx !== -1) {
      dayState.value.runningTimerIds.splice(idx, 1)
    }
    if (dayState.value.runningTimerIds.length === 0) {
      dayState.value.lastStateChangeAt = null
    }
    persistDayState()
  }

  function shareTimer(id: string) {
    if (!isToday.value) return
    flush()
    if (!dayState.value.runningTimerIds.includes(id)) {
      dayState.value.runningTimerIds.push(id)
    }
    if (!dayState.value.timers[id]) {
      dayState.value.timers[id] = { accumulatedMs: 0 }
    }
    if (dayState.value.lastStateChangeAt === null) {
      dayState.value.lastStateChangeAt = Date.now()
    }
    persistDayState()
  }

  function stopAll() {
    if (!isToday.value) return
    flush()
    dayState.value.runningTimerIds = []
    dayState.value.lastStateChangeAt = null
    persistDayState()
  }

  function setAccumulatedMs(id: string, ms: number) {
    if (!dayState.value.timers[id]) {
      dayState.value.timers[id] = { accumulatedMs: 0 }
    }
    dayState.value.timers[id].accumulatedMs = ms
    persistDayState()
  }

  // --- Display helpers ---
  const now = ref(Date.now())

  function getDisplayMs(id: string): number {
    const timer = dayState.value.timers[id]
    const base = timer ? timer.accumulatedMs : 0
    if (
      dayState.value.runningTimerIds.includes(id) &&
      dayState.value.lastStateChangeAt !== null
    ) {
      const elapsed = now.value - dayState.value.lastStateChangeAt
      return base + elapsed / dayState.value.runningTimerIds.length
    }
    return base
  }

  function getSubtreeMs(node: TaskNode): number {
    if (isLeaf(node)) return getDisplayMs(node.id)
    return node.children.reduce((sum, child) => sum + getSubtreeMs(child), 0)
  }

  /** Returns the sum of all leaf limits in the subtree, or null if no leaf has a limit. */
  function getSubtreeLimitMs(node: TaskNode): number | null {
    if (isLeaf(node)) return node.timeLimitMs
    let total = 0
    let hasAny = false
    for (const child of node.children) {
      const childLimit = getSubtreeLimitMs(child)
      if (childLimit !== null) {
        total += childLimit
        hasAny = true
      }
    }
    return hasAny ? total : null
  }

  function getTotalDayMs(): number {
    return tree.value.roots.reduce((sum, root) => sum + getSubtreeMs(root), 0)
  }

  function getTotalDayLimitMs(): number | null {
    let total = 0
    let hasAny = false
    for (const root of tree.value.roots) {
      const rootLimit = getSubtreeLimitMs(root)
      if (rootLimit !== null) {
        total += rootLimit
        hasAny = true
      }
    }
    return hasAny ? total : null
  }

  function isRunning(id: string): boolean {
    return dayState.value.runningTimerIds.includes(id)
  }

  // --- Tick interval for live updates ---
  const tickInterval = setInterval(() => {
    now.value = Date.now()
  }, 200)

  // --- Periodic persistence (every ~10s when timers running) ---
  const persistInterval = setInterval(() => {
    if (dayState.value.runningTimerIds.length > 0) {
      flush()
      persistDayState()
    }
  }, 10000)

  // --- Midnight rollover ---
  const midnightInterval = setInterval(() => {
    const today = todayKey()
    if (isToday.value && currentDateKey.value !== today) {
      // Date has changed while we were viewing "today"
      // Flush time up to midnight on the old day
      const state = dayState.value
      if (state.lastStateChangeAt !== null && state.runningTimerIds.length > 0) {
        const oldDate = currentDateKey.value
        const parts = oldDate.split('-').map(Number)
        const midnight = new Date(parts[0]!, parts[1]! - 1, parts[2]! + 1).getTime()
        const elapsed = midnight - state.lastStateChangeAt
        if (elapsed > 0) {
          const share = elapsed / state.runningTimerIds.length
          for (const id of state.runningTimerIds) {
            if (!state.timers[id]) state.timers[id] = { accumulatedMs: 0 }
            state.timers[id].accumulatedMs += share
          }
        }
        state.runningTimerIds = []
        state.lastStateChangeAt = null
        saveDayState(oldDate, state)
      }
      // Navigate to the new today
      currentDateKey.value = today
      saveMeta({ lastOpenDate: today })
    }
  }, 1000)

  // Save meta on init
  saveMeta({ lastOpenDate: todayKey() })

  onUnmounted(() => {
    clearInterval(tickInterval)
    clearInterval(persistInterval)
    clearInterval(midnightInterval)
  })

  return {
    currentDateKey,
    isToday,
    displayDate,
    goToPrevDay,
    goToNextDay,
    goToToday,
    tree,
    addRoot,
    addChild,
    addSibling,
    renameTask,
    deleteTask,
    setTimeLimit,
    dayState,
    switchTimer,
    stopTimer,
    shareTimer,
    stopAll,
    setAccumulatedMs,
    getDisplayMs,
    getSubtreeMs,
    getSubtreeLimitMs,
    getTotalDayMs,
    getTotalDayLimitMs,
    isRunning,
    now,
  }
}
