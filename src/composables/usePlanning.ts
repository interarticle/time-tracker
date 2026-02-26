import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { CommittedNode, CommittedTreeData, Planning, TimeTracker } from '@/types'
import {
  loadPlanningSettings,
  savePlanningSettings,
  loadPlanningDay,
  savePlanningDay,
} from '@/utils/storage'

let idCounter = Date.now() + 1_000_000
function newId(): string {
  return 'c' + (idCounter++).toString(36)
}

function findNode(roots: CommittedNode[], id: string): CommittedNode | null {
  for (const node of roots) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

function findParent(
  roots: CommittedNode[],
  id: string,
): { parent: CommittedNode | null; index: number } {
  for (const node of roots) {
    const idx = node.children.findIndex((c) => c.id === id)
    if (idx !== -1) return { parent: node, index: idx }
    const found = findParent(node.children, id)
    if (found.parent !== null) return found
  }
  return { parent: null, index: -1 }
}

export function usePlanning(currentDateKey: Ref<string>, tracker: TimeTracker): Planning {
  // --- Settings (global, persists across days) ---
  const settings = loadPlanningSettings()
  const planningEnabled = ref(settings.enabled)
  const dailyLimitMs = ref(settings.dailyLimitMs)

  function persistSettings() {
    savePlanningSettings({ enabled: planningEnabled.value, dailyLimitMs: dailyLimitMs.value })
  }

  function setPlanningLimit(ms: number) {
    dailyLimitMs.value = ms
    planningEnabled.value = true
    persistSettings()
  }

  function disablePlanning() {
    planningEnabled.value = false
    persistSettings()
  }

  // --- Per-day data ---
  const dayData = loadPlanningDay(currentDateKey.value)
  const committedTree = ref<CommittedTreeData>({ roots: dayData.roots })
  const startOfDayMinutes = ref<number | null>(dayData.startOfDayMinutes)
  const bufferLimitMs = ref<number | undefined>(dayData.bufferLimitMs)

  function persistDay() {
    savePlanningDay(currentDateKey.value, {
      startOfDayMinutes: startOfDayMinutes.value,
      roots: committedTree.value.roots,
      bufferLimitMs: bufferLimitMs.value,
    })
  }

  watch(currentDateKey, (newKey) => {
    const d = loadPlanningDay(newKey)
    committedTree.value = { roots: d.roots }
    startOfDayMinutes.value = d.startOfDayMinutes
    bufferLimitMs.value = d.bufferLimitMs
  })

  function setBufferLimit(ms: number | undefined) {
    bufferLimitMs.value = ms
    persistDay()
  }

  function setStartOfDay(minutes: number | null) {
    startOfDayMinutes.value = minutes
    persistDay()
  }

  // --- Committed tree CRUD ---
  const committedFocusNodeId = ref<string | null>(null)

  function addCommittedRoot() {
    committedTree.value.roots.push({ id: newId(), name: '', children: [], durationMs: null })
    persistDay()
  }

  function addCommittedChild(parentId: string) {
    const parent = findNode(committedTree.value.roots, parentId)
    if (!parent) return
    parent.children.push({ id: newId(), name: '', children: [], durationMs: null })
    persistDay()
  }

  function addCommittedSibling(nodeId: string) {
    const { parent, index } = findParent(committedTree.value.roots, nodeId)
    if (parent) {
      parent.children.splice(index + 1, 0, {
        id: newId(),
        name: '',
        children: [],
        durationMs: null,
      })
    } else {
      const rootIdx = committedTree.value.roots.findIndex((r) => r.id === nodeId)
      if (rootIdx !== -1) {
        committedTree.value.roots.splice(rootIdx + 1, 0, {
          id: newId(),
          name: '',
          children: [],
          durationMs: null,
        })
      }
    }
    persistDay()
  }

  function renameCommitted(nodeId: string, name: string) {
    const node = findNode(committedTree.value.roots, nodeId)
    if (node) {
      node.name = name
      persistDay()
    }
  }

  function deleteCommitted(nodeId: string) {
    const { parent, index } = findParent(committedTree.value.roots, nodeId)
    if (parent) {
      parent.children.splice(index, 1)
    } else {
      const rootIdx = committedTree.value.roots.findIndex((r) => r.id === nodeId)
      if (rootIdx !== -1) committedTree.value.roots.splice(rootIdx, 1)
    }
    persistDay()
  }

  function setCommittedDuration(nodeId: string, ms: number | null) {
    const node = findNode(committedTree.value.roots, nodeId)
    if (node) {
      node.durationMs = ms
      persistDay()
    }
  }

  // --- Indent / Dedent ---
  type FlatEntry = { node: CommittedNode; depth: number }

  function getFlatList(): FlatEntry[] {
    const result: FlatEntry[] = []
    function walk(nodes: CommittedNode[], depth: number) {
      for (const node of nodes) {
        result.push({ node, depth })
        walk(node.children, depth + 1)
      }
    }
    walk(committedTree.value.roots, 0)
    return result
  }

  function getNodePath(nodeId: string): CommittedNode[] | null {
    function find(
      nodes: CommittedNode[],
      id: string,
      path: CommittedNode[],
    ): CommittedNode[] | null {
      for (const node of nodes) {
        const next = [...path, node]
        if (node.id === id) return next
        const found = find(node.children, id, next)
        if (found) return found
      }
      return null
    }
    return find(committedTree.value.roots, nodeId, [])
  }

  function detachNode(nodeId: string): CommittedNode | null {
    const { parent, index } = findParent(committedTree.value.roots, nodeId)
    if (parent) return parent.children.splice(index, 1)[0] ?? null
    const rootIdx = committedTree.value.roots.findIndex((r) => r.id === nodeId)
    if (rootIdx !== -1) return committedTree.value.roots.splice(rootIdx, 1)[0] ?? null
    return null
  }

  function indentCommitted(nodeId: string): string | null {
    const flat = getFlatList()
    const idx = flat.findIndex((e) => e.node.id === nodeId)
    if (idx <= 0) return 'No item above — cannot indent'
    const { depth: currentDepth } = flat[idx]!
    const { node: aboveNode, depth: aboveDepth } = flat[idx - 1]!

    if (aboveDepth > currentDepth) {
      const path = getNodePath(aboveNode.id)
      if (!path || path.length <= currentDepth) return 'Cannot indent'
      const targetParent = path[currentDepth]!
      const removed = detachNode(nodeId)
      if (!removed) return 'Cannot indent'
      targetParent.children.push(removed)
      persistDay()
      committedFocusNodeId.value = nodeId
      return null
    } else if (aboveDepth === currentDepth) {
      const removed = detachNode(nodeId)
      if (!removed) return 'Cannot indent'
      aboveNode.children.push(removed)
      persistDay()
      committedFocusNodeId.value = nodeId
      return null
    } else {
      return 'Cannot indent: the item above is at a higher level'
    }
  }

  function dedentCommitted(nodeId: string): string | null {
    const flat = getFlatList()
    const entry = flat.find((e) => e.node.id === nodeId)
    if (!entry || entry.depth === 0) return 'Already at top level — cannot dedent'
    const { parent: currentParent, index: idxInParent } = findParent(
      committedTree.value.roots,
      nodeId,
    )
    if (!currentParent) return 'Already at top level — cannot dedent'
    const { parent: grandParent, index: parentIdx } = findParent(
      committedTree.value.roots,
      currentParent.id,
    )
    const removed = currentParent.children.splice(idxInParent, 1)[0]!
    if (grandParent) {
      grandParent.children.splice(parentIdx + 1, 0, removed)
    } else {
      const rootIdx = committedTree.value.roots.findIndex((r) => r.id === currentParent.id)
      committedTree.value.roots.splice(rootIdx + 1, 0, removed)
    }
    persistDay()
    committedFocusNodeId.value = nodeId
    return null
  }

  // --- Computeds ---
  function getCommittedSubtreeMs(node: CommittedNode): number {
    if (node.children.length === 0) return node.durationMs ?? 0
    return node.children.reduce((sum, child) => sum + getCommittedSubtreeMs(child), 0)
  }

  const committedTotalMs = computed(() =>
    committedTree.value.roots.reduce((sum, root) => sum + getCommittedSubtreeMs(root), 0),
  )

  const timeAvailableMs = computed(() => Math.max(0, dailyLimitMs.value - committedTotalMs.value))

  const endOfDayMinutes = computed(() => {
    if (startOfDayMinutes.value === null) return null
    return startOfDayMinutes.value + timeAvailableMs.value / 60000
  })

  // --- Lunch / Buffer computed ---
  function dateKeyOf(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const bufferAccumulatedMs = computed(() => {
    const start = startOfDayMinutes.value
    if (start === null) return 0
    const limitMs = tracker.getTotalDayLimitMs()
    if (!limitMs || limitMs <= 0) return 0

    const startMs = start * 60000           // ms from midnight
    const effectiveEndMs = startMs + limitMs // ms from midnight
    const nowMs = tracker.now.value
    const nowDateKey = dateKeyOf(nowMs)
    const otherPlannedMs = tracker.getTotalDayMs()

    if (currentDateKey.value > nowDateKey) return 0   // future day

    if (currentDateKey.value < nowDateKey) {           // past day
      return effectiveEndMs - startMs - otherPlannedMs
    }

    // Today: live
    const nowDate = new Date(nowMs)
    const nowFromMidnight =
      (nowDate.getHours() * 60 + nowDate.getMinutes()) * 60000 +
      nowDate.getSeconds() * 1000

    if (nowFromMidnight <= startMs) return 0
    if (nowFromMidnight >= effectiveEndMs) return effectiveEndMs - startMs - otherPlannedMs
    return nowFromMidnight - startMs - otherPlannedMs
  })

  const bufferIsLive = computed(() => {
    const start = startOfDayMinutes.value
    if (start === null) return false
    const limitMs = tracker.getTotalDayLimitMs()
    if (!limitMs || limitMs <= 0) return false
    if (dateKeyOf(tracker.now.value) !== currentDateKey.value) return false

    const nowDate = new Date(tracker.now.value)
    const nowFromMidnight =
      (nowDate.getHours() * 60 + nowDate.getMinutes()) * 60000 +
      nowDate.getSeconds() * 1000
    const startMs = start * 60000
    const effectiveEndMs = startMs + limitMs
    return nowFromMidnight > startMs && nowFromMidnight < effectiveEndMs
  })

  return {
    planningEnabled,
    dailyLimitMs,
    setPlanningLimit,
    disablePlanning,
    committedTree,
    startOfDayMinutes,
    setStartOfDay,
    addCommittedRoot,
    addCommittedChild,
    addCommittedSibling,
    renameCommitted,
    deleteCommitted,
    setCommittedDuration,
    committedFocusNodeId,
    indentCommitted,
    dedentCommitted,
    committedTotalMs,
    timeAvailableMs,
    endOfDayMinutes,
    getCommittedSubtreeMs,
    bufferLimitMs,
    setBufferLimit,
    bufferAccumulatedMs,
    bufferIsLive,
  }
}
