<script setup lang="ts">
import { inject, computed } from 'vue'
import { TimeTrackerKey, PlanningKey } from '@/types'
import type { TaskNode as TaskNodeData } from '@/types'
import TaskNode from './TaskNode.vue'
import { parseTags, parsePriority } from '@/utils/tags'

const tracker = inject(TimeTrackerKey)!
const planning = inject(PlanningKey, null)

interface LeafEntry {
  node: TaskNodeData
  pathPrefix: string
  priority: number | null
  order: number
}

// Flatten the planned tree to its leaves, in regular (pre-order) display order,
// recording the ancestor path label and any #p<n> priority for each leaf.
const leaves = computed<LeafEntry[]>(() => {
  const out: LeafEntry[] = []
  let order = 0
  const walk = (nodes: TaskNodeData[], ancestors: string[]) => {
    for (const node of nodes) {
      if (node.children.length === 0) {
        out.push({
          node,
          pathPrefix: ancestors.join(' › '),
          priority: parsePriority(node.name),
          order: order++,
        })
      } else {
        walk(node.children, [...ancestors, parseTags(node.name).displayName || 'Untitled'])
      }
    }
  }
  walk(tracker.tree.value.roots, [])
  return out
})

// Sort by priority (0 highest; unprioritized sinks to the bottom), breaking ties
// by the original display order.
const sorted = computed(() =>
  [...leaves.value].sort((a, b) => {
    const pa = a.priority ?? Infinity
    const pb = b.priority ?? Infinity
    return pa !== pb ? pa - pb : a.order - b.order
  }),
)

// When overcommit is active and positive, visually trim limits in reverse priority
// order (bottom up) — only for leaves that are neither completed nor deprioritized.
// This is display-only; the stored limits and all totals are unchanged.
//
// We can only reclaim a task's *unused* budget (limit − already-consumed), so the
// trimmed limit never drops below the time already spent. A task that has hit or
// passed its limit offers nothing, so the trim flows past it to the next eligible
// task up the list. If the overcommit exceeds all reclaimable budget, it runs out.
const trimmedLimits = computed(() => {
  const map: Record<string, number> = {}
  let remaining =
    planning?.planningEnabled.value ? Math.max(0, planning.overcommitMs.value) : 0
  if (remaining <= 0) return map
  const list = sorted.value
  for (let i = list.length - 1; i >= 0 && remaining > 0; i--) {
    const n = list[i]!.node
    if (n.completed || n.deprioritized) continue
    const limit = n.timeLimitMs ?? 0
    if (limit <= 0) continue
    const consumed = tracker.getDisplayMs(n.id)
    const slack = limit - consumed
    if (slack <= 0) continue // fully used — nothing left to reclaim
    const cut = Math.min(remaining, slack)
    map[n.id] = limit - cut // floored at `consumed`, so never negative
    remaining -= cut
  }
  return map
})

const rows = computed(() => {
  // Running cumulative sum of the (effective) limits down the prioritized order.
  let cum = 0
  const trims = trimmedLimits.value
  return sorted.value.map((e) => {
    cum += e.node.deprioritized ? 0 : (e.node.timeLimitMs ?? 0)
    return {
      ...e,
      cumLimitMs: cum,
      trimmedLimitMs: e.node.id in trims ? trims[e.node.id]! : null,
    }
  })
})
</script>

<template>
  <div v-if="rows.length === 0" class="pv-empty">No leaf tasks yet.</div>
  <ul v-else class="task-list">
    <TaskNode
      v-for="row in rows"
      :key="row.node.id"
      :node="row.node"
      :depth="0"
      mode="planned"
      :priority-row="true"
      :path-prefix="row.pathPrefix"
      :cum-limit-ms="row.cumLimitMs"
      :trimmed-limit-ms="row.trimmedLimitMs"
    />
  </ul>
</template>

<style scoped>
.task-list {
  margin: 0;
  padding: 0;
}
.pv-empty {
  text-align: center;
  padding: 48px 0;
  color: #999;
}
</style>
