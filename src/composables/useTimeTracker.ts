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
      clearNotificationState(nodeId)
    }
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
    clearNotificationState(id)
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

  // --- Picture-in-Picture ---
  let pipWin: Window | null = null

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
      #pip-stop { background: #c62828; color: #fff; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 12px; font-weight: 500; width: 100%; flex-shrink: 0; }
      #pip-stop:hover { background: #b71c1c; }
      @keyframes pw { 0%,100% { background:#fff8e1; } 50% { background:#ffe082; } }
      @keyframes pd { 0%,100% { background:#ffebee; } 50% { background:#ef9a9a; } }
    `
    doc.head.appendChild(style)
    const tasks = doc.createElement('div')
    tasks.id = 'pip-tasks'
    const stopBtn = doc.createElement('button')
    stopBtn.id = 'pip-stop'
    stopBtn.textContent = 'Stop All'
    stopBtn.addEventListener('click', () => { stopAll(); window.focus() })
    doc.body.appendChild(tasks)
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
  }

  async function openPip(): Promise<void> {
    if (!('documentPictureInPicture' in window)) return
    if (pipWin && !pipWin.closed) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipWin = await (window as any).documentPictureInPicture.requestWindow({ width: 300, height: 180, disallowReturnToOpener: true })
      buildPipContent(pipWin!)
      updatePipContent()
      pipWin!.addEventListener('pagehide', () => { pipWin = null })
    } catch {
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
    getDisplayMs,
    getSubtreeMs,
    getSubtreeLimitMs,
    getTotalDayMs,
    getTotalDayLimitMs,
    isRunning,
    now,
    sendTestNotification,
    openPip,
  }
}
