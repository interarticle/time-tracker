<script setup lang="ts">
import { inject, computed } from 'vue'
import { TimeTrackerKey } from '@/types'
import type { TaskNode as TaskNodeData } from '@/types'
import TaskNode from './TaskNode.vue'
import { parseTags, parsePriority } from '@/utils/tags'

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
