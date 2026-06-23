<script setup lang="ts">
import { inject, computed } from 'vue'
import { TimeTrackerKey } from '@/types'
import type { TaskNode as TaskNodeData } from '@/types'
import TaskNode from './TaskNode.vue'
import { parseTags, parsePriority } from '@/utils/tags'
import { formatMs } from '@/utils/format'

const tracker = inject(TimeTrackerKey)!

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
const rows = computed(() => {
  const sorted = [...leaves.value].sort((a, b) => {
    const pa = a.priority ?? Infinity
    const pb = b.priority ?? Infinity
    return pa !== pb ? pa - pb : a.order - b.order
  })
  // Running cumulative sum of the (effective) limits down the prioritized order.
  let cum = 0
  return sorted.map((e) => {
    cum += e.node.deprioritized ? 0 : (e.node.timeLimitMs ?? 0)
    return { ...e, cumLimitMs: cum }
  })
})

const totalLimitMs = computed(() =>
  rows.value.length ? rows.value[rows.value.length - 1]!.cumLimitMs : 0,
)
</script>

<template>
  <div class="priority-view">
    <div class="pv-header">
      <span class="pv-title">Priority order</span>
      <span class="pv-total">Σ limits: {{ formatMs(totalLimitMs) }}</span>
    </div>
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
      />
    </ul>
  </div>
</template>

<style scoped>
.priority-view {
  padding: 4px 0;
}
.task-list {
  margin: 0;
  padding: 0;
}
.pv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 4px 7px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 4px;
  font-size: 12px;
  color: #555;
}
.pv-title {
  font-weight: 600;
}
.pv-total {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-weight: 600;
  color: #333;
}
.pv-empty {
  text-align: center;
  padding: 48px 0;
  color: #999;
}
</style>
