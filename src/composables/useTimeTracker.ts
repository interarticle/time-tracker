import { ref, computed, watch, onUnmounted } from 'vue'
import type { TaskNode, TaskTreeData, DayTimerState, TimeTracker } from '@/types'
import { todayKey, addDays, formatDateDisplay, formatMs } from '@/utils/format'
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

  // --- Task tree (per-day) ---
  const tree = ref<TaskTreeData>(loadTree(currentDateKey.value))

  function persistTree() {
    saveTree(currentDateKey.value, tree.value)
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
      if (existingTimer && (existingTimer.accumulatedMs > 0 || (existingTimer.nightAccumulatedMs ?? 0) > 0)) {
        dayState.value.timers[childNode.id] = {
          accumulatedMs: existingTimer.accumulatedMs,
          ...(existingTimer.nightAccumulatedMs ? { nightAccumulatedMs: existingTimer.nightAccumulatedMs } : {}),
        }
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
      clearNotificationState(nodeId)
    }
  }

  // --- Focus request (set after indent/dedent so the node re-enters edit mode) ---
  const focusNodeId = ref<string | null>(null)

  // --- Indent / Dedent helpers ---
  type FlatEntry = { node: TaskNode; depth: number }

  function getFlatList(): FlatEntry[] {
    const result: FlatEntry[] = []
    function walk(nodes: TaskNode[], depth: number) {
      for (const node of nodes) {
        result.push({ node, depth })
        walk(node.children, depth + 1)
      }
    }
    walk(tree.value.roots, 0)
    return result
  }

  /** Returns the ancestor path [root, …, node] for the given id, or null. */
  function getNodePath(nodeId: string): TaskNode[] | null {
    function find(nodes: TaskNode[], id: string, path: TaskNode[]): TaskNode[] | null {
      for (const node of nodes) {
        const next = [...path, node]
        if (node.id === id) return next
        const found = find(node.children, id, next)
        if (found) return found
      }
      return null
    }
    return find(tree.value.roots, nodeId, [])
  }

  /** Remove the node from wherever it lives and return it. */
  function detachNode(nodeId: string): TaskNode | null {
    const { parent, index } = findParent(tree.value.roots, nodeId)
    if (parent) return parent.children.splice(index, 1)[0] ?? null
    const rootIdx = tree.value.roots.findIndex((r) => r.id === nodeId)
    if (rootIdx !== -1) return tree.value.roots.splice(rootIdx, 1)[0] ?? null
    return null
  }

  function indentTask(nodeId: string): string | null {
    const flat = getFlatList()
    const idx = flat.findIndex((e) => e.node.id === nodeId)
    if (idx <= 0) return 'No item above — cannot indent'
    const { depth: currentDepth } = flat[idx]!
    const { node: aboveNode, depth: aboveDepth } = flat[idx - 1]!

    if (aboveDepth > currentDepth) {
      // Case 1: item above is deeper — slot current one level deeper into that hierarchy
      const path = getNodePath(aboveNode.id)
      if (!path || path.length <= currentDepth) return 'Cannot indent'
      const targetParent = path[currentDepth]!
      const removed = detachNode(nodeId)
      if (!removed) return 'Cannot indent'
      targetParent.children.push(removed)
      persistTree()
      focusNodeId.value = nodeId
      return null
    } else if (aboveDepth === currentDepth) {
      // Case 2: same level — only if above has no accumulated time and no limit
      if (getSubtreeMs(aboveNode) > 0) return 'Cannot indent: the item above has accumulated time'
      if (getSubtreeLimitMs(aboveNode) !== null) return 'Cannot indent: the item above has a time limit set'
      const removed = detachNode(nodeId)
      if (!removed) return 'Cannot indent'
      aboveNode.children.push(removed)
      persistTree()
      focusNodeId.value = nodeId
      return null
    } else {
      return 'Cannot indent: the item above is at a higher level'
    }
  }

  function dedentTask(nodeId: string): string | null {
    const flat = getFlatList()
    const entry = flat.find((e) => e.node.id === nodeId)
    if (!entry || entry.depth === 0) return 'Already at top level — cannot dedent'
    const { parent: currentParent, index: idxInParent } = findParent(tree.value.roots, nodeId)
    if (!currentParent) return 'Already at top level — cannot dedent'
    const { parent: grandParent, index: parentIdx } = findParent(tree.value.roots, currentParent.id)
    const removed = currentParent.children.splice(idxInParent, 1)[0]!
    if (grandParent) {
      grandParent.children.splice(parentIdx + 1, 0, removed)
    } else {
      const rootIdx = tree.value.roots.findIndex((r) => r.id === currentParent.id)
      tree.value.roots.splice(rootIdx + 1, 0, removed)
    }
    persistTree()
    focusNodeId.value = nodeId
    return null
  }

  // --- Day timer state ---
  const dayState = ref<DayTimerState>(loadDayState(currentDateKey.value))

  function persistDayState() {
    saveDayState(currentDateKey.value, dayState.value)
  }

  // Reload tree and day state when date changes
  watch(currentDateKey, (newKey) => {
    tree.value = loadTree(newKey)
    dayState.value = loadDayState(newKey)
  })

  // --- EOD / night mode ---
  const eodTimestamp = ref<number | null>(null)

  function setEodTimestamp(ms: number | null) {
    eodTimestamp.value = ms
  }

  const isAfterEod = computed(() => {
    const eod = eodTimestamp.value
    if (eod === null) return false
    return now.value >= eod
  })

  const hasAnyNightTime = computed(() =>
    Object.values(dayState.value.timers).some((t) => (t.nightAccumulatedMs ?? 0) > 0),
  )

  // --- Flush pattern ---
  function flush() {
    const state = dayState.value
    if (state.lastStateChangeAt === null || state.runningTimerIds.length === 0) return

    const nowMs = Date.now()
    const elapsed = nowMs - state.lastStateChangeAt
    const share = elapsed / state.runningTimerIds.length

    const eod = eodTimestamp.value
    const isNight = eod !== null && state.lastStateChangeAt >= eod

    for (const id of state.runningTimerIds) {
      if (!state.timers[id]) state.timers[id] = { accumulatedMs: 0 }
      if (isNight) {
        state.timers[id].nightAccumulatedMs = (state.timers[id].nightAccumulatedMs ?? 0) + share
      } else {
        state.timers[id].accumulatedMs += share
      }
    }
    state.lastStateChangeAt = nowMs
  }

  function stopAllAtEod(eodMs: number) {
    const state = dayState.value
    if (state.runningTimerIds.length === 0) return
    const nowMs = Date.now()
    const numRunning = state.runningTimerIds.length
    const lastChange = state.lastStateChangeAt ?? nowMs

    const dayMs = Math.max(0, Math.min(eodMs, nowMs) - lastChange)
    const dayShare = dayMs / numRunning
    const nightMs = Math.max(0, nowMs - Math.max(eodMs, lastChange))
    const nightShare = nightMs / numRunning

    for (const id of state.runningTimerIds) {
      if (!state.timers[id]) state.timers[id] = { accumulatedMs: 0 }
      state.timers[id].accumulatedMs += dayShare
      if (nightShare > 0) {
        state.timers[id].nightAccumulatedMs = (state.timers[id].nightAccumulatedMs ?? 0) + nightShare
      }
    }
    state.runningTimerIds = []
    state.lastStateChangeAt = null
    persistDayState()
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
    const timer = dayState.value.timers[id]
    timer.accumulatedMs = ms
    persistDayState()
    clearNotificationState(id)
  }

  function setNightAccumulatedMs(id: string, ms: number) {
    if (!dayState.value.timers[id]) {
      dayState.value.timers[id] = { accumulatedMs: 0 }
    }
    dayState.value.timers[id].nightAccumulatedMs = ms
    persistDayState()
  }

  function setCompleted(nodeId: string, completed: boolean) {
    const node = findNode(tree.value.roots, nodeId)
    if (!node || !isLeaf(node)) return
    if (completed && isRunning(nodeId)) {
      stopTimer(nodeId)
    }
    node.completed = completed
    persistTree()
  }

  // --- Display helpers ---
  const now = ref(Date.now())

  // Total time (day + night + running), used for display
  function getDisplayMs(id: string): number {
    const timer = dayState.value.timers[id]
    const base = timer ? (timer.accumulatedMs + (timer.nightAccumulatedMs ?? 0)) : 0
    if (
      dayState.value.runningTimerIds.includes(id) &&
      dayState.value.lastStateChangeAt !== null
    ) {
      const elapsed = now.value - dayState.value.lastStateChangeAt
      return base + elapsed / dayState.value.runningTimerIds.length
    }
    return base
  }

  // Day-only time (for buffer calculation)
  function getDayDisplayMs(id: string): number {
    const timer = dayState.value.timers[id]
    if (!timer) return 0
    const base = timer.accumulatedMs
    const eod = eodTimestamp.value
    const isNight = eod !== null && dayState.value.lastStateChangeAt !== null && dayState.value.lastStateChangeAt >= eod
    if (
      !isNight &&
      dayState.value.runningTimerIds.includes(id) &&
      dayState.value.lastStateChangeAt !== null
    ) {
      const elapsed = now.value - dayState.value.lastStateChangeAt
      return base + elapsed / dayState.value.runningTimerIds.length
    }
    return base
  }

  // Night-only time
  function getNightDisplayMs(id: string): number {
    const timer = dayState.value.timers[id]
    if (!timer) return 0
    const base = timer.nightAccumulatedMs ?? 0
    const eod = eodTimestamp.value
    const isNight = eod !== null && dayState.value.lastStateChangeAt !== null && dayState.value.lastStateChangeAt >= eod
    if (
      isNight &&
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

  function getDaySubtreeMs(node: TaskNode): number {
    if (isLeaf(node)) return getDayDisplayMs(node.id)
    return node.children.reduce((sum, child) => sum + getDaySubtreeMs(child), 0)
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

  // Day-only total — used for buffer calculation
  function getTotalDayMs(): number {
    return tree.value.roots.reduce((sum, root) => sum + getDaySubtreeMs(root), 0)
  }

  // Full total (day + night) — used for rollup display
  function getTotalAllMs(): number {
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

  // --- Notifications ---
  // Per-leaf tracking: has warning/exceeded notification been shown this session?
  const notified = ref<Record<string, { warning: boolean; exceeded: boolean }>>({})

  // Reset notification state on date change
  watch(currentDateKey, () => {
    notified.value = {}
  })

  function isInWarningZone(ms: number, limitMs: number): boolean {
    return ms / limitMs >= 0.8 && (limitMs - ms) <= 10 * 60 * 1000
  }

  function isSecureOrigin(): boolean {
    return location.protocol === 'https:'
  }

  function notify(title: string, body: string): void {
    if (isSecureOrigin() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body })
    } else {
      alert(`${title}\n${body}`)
    }
  }

  function checkNotifications() {
    if (!isToday.value) return
    for (const id of dayState.value.runningTimerIds) {
      const node = findNode(tree.value.roots, id)
      if (!node || !isLeaf(node) || node.timeLimitMs === null || node.timeLimitMs <= 0) continue

      const ms = getDisplayMs(id)
      const limit = node.timeLimitMs
      if (!notified.value[id]) notified.value[id] = { warning: false, exceeded: false }
      const state = notified.value[id]

      if (ms >= limit && !state.exceeded) {
        state.exceeded = true
        notify(`\u26A0\uFE0F ${node.name} — time limit exceeded!`, `${formatMs(ms)} / ${formatMs(limit)}`)
      } else if (isInWarningZone(ms, limit) && !state.warning) {
        state.warning = true
        notify(`\u23F0 ${node.name} — approaching limit`, `${formatMs(ms)} / ${formatMs(limit)}`)
      }
    }
  }

  /** Clear stale notification flags when limit or time is edited */
  function clearNotificationState(id: string) {
    const state = notified.value[id]
    if (!state) return
    const node = findNode(tree.value.roots, id)
    if (!node || node.timeLimitMs === null || node.timeLimitMs <= 0) {
      state.warning = false
      state.exceeded = false
      return
    }
    const ms = getDisplayMs(id)
    const limit = node.timeLimitMs
    if (ms < limit) state.exceeded = false
    if (!isInWarningZone(ms, limit)) state.warning = false
  }

  async function sendTestNotification(): Promise<void> {
    if (isSecureOrigin() && typeof Notification !== 'undefined') {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') return
      }
      new Notification('\u2705 Time Tracker — notifications working!', {
        body: 'You will be notified when timers approach or exceed their limits.',
      })
    } else {
      alert('\u2705 Time Tracker — notifications working!\nYou will be alerted when timers approach or exceed their limits.')
    }
  }

  // --- Tick interval for live updates ---
  const tickInterval = setInterval(() => {
    now.value = Date.now()
    checkNotifications()
    updatePipContent()
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
          const eod = eodTimestamp.value
          const isNight = eod !== null && state.lastStateChangeAt >= eod
          for (const id of state.runningTimerIds) {
            if (!state.timers[id]) state.timers[id] = { accumulatedMs: 0 }
            if (isNight) {
              state.timers[id].nightAccumulatedMs = (state.timers[id].nightAccumulatedMs ?? 0) + share
            } else {
              state.timers[id].accumulatedMs += share
            }
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

  // --- Picture-in-Picture ---
  let pipWin: Window | null = null

  // Use the canonical 'leave' event to detect PiP window close
  if ('documentPictureInPicture' in window) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).documentPictureInPicture.addEventListener('leave', () => {
      pipWin = null
    })
  }

  function pieSvgHtml(ratio: number, size = 14): string {
    const r = size / 2 - 1, cx = size / 2, cy = size / 2
    function arcPath(frac: number): string {
      const a = frac * 2 * Math.PI
      const x = (cx + r * Math.sin(a)).toFixed(3)
      const y = (cy - r * Math.cos(a)).toFixed(3)
      return `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${frac > 0.5 ? 1 : 0},1 ${x},${y}Z`
    }
    const main = Math.min(ratio, 1), over = ratio - 1
    let inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ddd"/>`
    if (main >= 1) inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#4a90d9"/>`
    else if (main > 0) inner += `<path d="${arcPath(main)}" fill="#4a90d9"/>`
    if (over >= 1) inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e53935"/>`
    else if (over > 0) inner += `<path d="${arcPath(over)}" fill="#e53935"/>`
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">${inner}</svg>`
  }

  function buildPipContent(win: Window) {
    const doc = win.document
    const style = doc.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #222; padding: 10px; font-size: 13px; height: 100vh; display: flex; flex-direction: column; gap: 8px; }
      #pip-tasks { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
      .pip-task { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 5px; background: #f5f5f5; }
      .pip-task.is-warning { background: #fff8e1; animation: pw 1.5s ease-in-out infinite; }
      .pip-task.is-exceeded { background: #ffebee; animation: pd 1s ease-in-out infinite; }
      .pip-name { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pip-time { font-family: monospace; font-size: 13px; color: #333; flex-shrink: 0; }
      .pip-pie { flex-shrink: 0; display: flex; align-items: center; }
      .pip-limit { font-family: monospace; font-size: 12px; color: #999; flex-shrink: 0; }
      #pip-eod { font-size: 11px; text-align: center; padding: 2px 0; flex-shrink: 0; min-height: 14px; }
      #pip-stop { background: #c62828; color: #fff; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 12px; font-weight: 500; width: 100%; flex-shrink: 0; }
      #pip-stop:hover { background: #b71c1c; }
      @keyframes pw { 0%,100% { background:#fff8e1; } 50% { background:#ffe082; } }
      @keyframes pd { 0%,100% { background:#ffebee; } 50% { background:#ef9a9a; } }
    `
    doc.head.appendChild(style)
    const tasks = doc.createElement('div')
    tasks.id = 'pip-tasks'
    const eodEl = doc.createElement('div')
    eodEl.id = 'pip-eod'
    const stopBtn = doc.createElement('button')
    stopBtn.id = 'pip-stop'
    stopBtn.textContent = 'Stop All'
    stopBtn.addEventListener('click', () => { stopAll(); window.focus() })
    doc.body.appendChild(tasks)
    doc.body.appendChild(eodEl)
    doc.body.appendChild(stopBtn)
  }

  function updatePipContent() {
    if (!pipWin || pipWin.closed) return
    const doc = pipWin.document
    const tasksEl = doc.getElementById('pip-tasks')
    if (!tasksEl) return

    const ids = dayState.value.runningTimerIds
    const activeSet = new Set(ids)

    // Remove rows for timers no longer running
    tasksEl.querySelectorAll<HTMLElement>('[data-id]').forEach(el => {
      if (!activeSet.has(el.dataset.id!)) el.remove()
    })

    for (const id of ids) {
      const node = findNode(tree.value.roots, id)
      if (!node) continue
      const ms = getDisplayMs(id)
      const limit = node.timeLimitMs

      let cls = 'pip-task'
      if (limit !== null && limit > 0) {
        if (ms >= limit) cls += ' is-exceeded'
        else if (isInWarningZone(ms, limit)) cls += ' is-warning'
      }

      let row = tasksEl.querySelector<HTMLElement>(`[data-id="${id}"]`)
      if (!row) {
        row = doc.createElement('div')
        row.dataset.id = id
        const nameEl = doc.createElement('span'); nameEl.className = 'pip-name'
        const timeEl = doc.createElement('span'); timeEl.className = 'pip-time'
        const pieEl = doc.createElement('span'); pieEl.className = 'pip-pie'
        const limitEl = doc.createElement('span'); limitEl.className = 'pip-limit'
        row.appendChild(nameEl); row.appendChild(timeEl); row.appendChild(pieEl); row.appendChild(limitEl)
        tasksEl.appendChild(row)
      }

      row.className = cls;
      (row.querySelector('.pip-name') as HTMLElement).textContent = node.name;
      (row.querySelector('.pip-time') as HTMLElement).textContent = formatMs(ms);
      (row.querySelector('.pip-pie') as HTMLElement).innerHTML = limit !== null && limit > 0 ? pieSvgHtml(ms / limit) : '';
      (row.querySelector('.pip-limit') as HTMLElement).textContent = limit !== null ? '/' + formatMs(limit) : ''
    }

    const eodEl = doc.getElementById('pip-eod')
    if (eodEl) {
      const eod = eodTimestamp.value
      if (eod !== null) {
        const remaining = eod - now.value
        if (remaining > 0 && remaining <= 3600000) {
          const mins = Math.floor(remaining / 60000)
          const secs = Math.floor((remaining % 60000) / 1000)
          eodEl.textContent = `⚠ EOD in ${mins}:${String(secs).padStart(2, '0')}`
          eodEl.style.color = remaining < 600000 ? '#c62828' : '#e67e22'
          eodEl.style.fontWeight = '600'
        } else if (remaining <= 0) {
          eodEl.textContent = '🌙 Night mode'
          eodEl.style.color = '#1565c0'
          eodEl.style.fontWeight = '600'
        } else {
          eodEl.textContent = ''
        }
      } else {
        eodEl.textContent = ''
      }
    }
  }

  async function openPip(forceReopen = false): Promise<void> {
    if (!('documentPictureInPicture' in window)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dPiP = (window as any).documentPictureInPicture
    // If a PiP window already exists and we're not forcing a reopen, just update its content
    if (dPiP.window && !forceReopen) {
      pipWin = dPiP.window
      updatePipContent()
      return
    }
    // Force-reopen: close existing first, then open fresh
    if (dPiP.window) {
      try { (dPiP.window as Window).close() } catch {}
    }
    pipWin = null
    try {
      pipWin = await dPiP.requestWindow({ width: 300, height: 180 })
      buildPipContent(pipWin!)
      updatePipContent()
    } catch (e) {
      console.error('[pip] requestWindow failed:', e)
      pipWin = null
    }
  }

  function closePip(): void {
    if (pipWin && !pipWin.closed) pipWin.close()
    pipWin = null
  }

  watch(() => dayState.value.runningTimerIds.length, (len) => {
    if (len === 0) closePip()
  })

  onUnmounted(() => {
    clearInterval(tickInterval)
    clearInterval(persistInterval)
    clearInterval(midnightInterval)
    closePip()
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
    setNightAccumulatedMs,
    setCompleted,
    getDisplayMs,
    getDayDisplayMs,
    getNightDisplayMs,
    getSubtreeMs,
    getSubtreeLimitMs,
    getTotalDayMs,
    getTotalAllMs,
    getTotalDayLimitMs,
    isRunning,
    now,
    setEodTimestamp,
    stopAllAtEod,
    isAfterEod,
    hasAnyNightTime,
    sendTestNotification,
    openPip,
    focusNodeId,
    indentTask,
    dedentTask,
  }
}
