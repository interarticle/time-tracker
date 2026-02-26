<script setup lang="ts">
import { inject, computed } from 'vue'
import { TimeTrackerKey, PlanningKey } from '@/types'
import type { CommittedNode, TaskNode as TaskNodeData } from '@/types'
import TaskNode from './TaskNode.vue'
import { formatMsHM, formatMinutes } from '@/utils/format'

const props = defineProps<{ mode?: 'planned' | 'committed' }>()

const tracker = inject(TimeTrackerKey)!
const planning = inject(PlanningKey, null)

const isCommitted = computed(() => props.mode === 'committed')

const roots = computed(() =>
  isCommitted.value
    ? (planning?.committedTree.value.roots ?? [])
    : tracker.tree.value.roots,
)

// Planned section header — shown when mode=planned and planning is enabled
const showPlanningHeader = computed(
  () => !isCommitted.value && planning?.planningEnabled.value,
)
const availableMs = computed(() => planning?.timeAvailableMs.value ?? 0)
const limitsMs = computed(() => tracker.getTotalDayLimitMs() ?? 0)
const remainingMs = computed(() => availableMs.value - limitsMs.value)
const remainingColor = computed(() =>
  remainingMs.value > 0 ? '#2e7d32' : remainingMs.value < 0 ? '#c62828' : '#888',
)
function formatRemaining(ms: number): string {
  const sign = ms > 0 ? '+' : ms < 0 ? '−' : ''
  return sign + formatMsHM(Math.abs(ms))
}

// Effective end of day: start + (committed + planned limits) / 60000
// Differs from planning.endOfDayMinutes when planned limits exceed available time
const effectiveEndMinutes = computed(() => {
  const start = planning?.startOfDayMinutes.value
  if (start === null || start === undefined) return null
  const committedMs = planning?.committedTotalMs.value ?? 0
  const plannedLimitsMs = tracker.getTotalDayLimitMs() ?? 0
  return Math.round(start + (committedMs + plannedLimitsMs) / 60000)
})
</script>

<template>
  <div class="task-tree">
    <!-- Planned section header (planned mode + planning enabled) -->
    <div v-if="showPlanningHeader" class="planning-header">
      <span class="ph-item">
        <span class="ph-label">Available:</span>
        <span class="ph-value">{{ formatMsHM(availableMs) }}</span>
      </span>
      <span class="ph-sep">│</span>
      <span class="ph-item">
        <span class="ph-label">Limits:</span>
        <span class="ph-value">{{ formatMsHM(limitsMs) }}</span>
      </span>
      <span class="ph-sep">│</span>
      <span class="ph-item">
        <span class="ph-label">Remaining:</span>
        <span class="ph-value" :style="{ color: remainingColor }">{{ formatRemaining(remainingMs) }}</span>
      </span>
      <template v-if="effectiveEndMinutes !== null">
        <span class="ph-sep">│</span>
        <span class="ph-item">
          <span class="ph-label">Eff. end:</span>
          <span class="ph-value" :style="{ color: remainingMs < 0 ? '#c62828' : '#333' }">{{ formatMinutes(effectiveEndMinutes) }}</span>
        </span>
      </template>
    </div>

    <div v-if="roots.length === 0" class="empty-state">
      <p>{{ isCommitted ? 'No committed items yet.' : 'No tasks yet.' }}</p>
      <button v-if="!isCommitted" class="add-root-btn" @click="tracker.addRoot()">+ Add Task</button>
    </div>
    <template v-else>
      <ul class="task-list">
        <TaskNode
          v-for="root in (roots as (TaskNodeData | CommittedNode)[])"
          :key="root.id"
          :node="root"
          :depth="0"
          :mode="props.mode"
        />
      </ul>
      <button v-if="!isCommitted" class="add-root-btn" @click="tracker.addRoot()">+ Add Task</button>
    </template>
  </div>
</template>

<style scoped>
.task-tree {
  padding: 4px 0;
}
.task-list {
  margin: 0;
  padding: 0;
}
.empty-state {
  text-align: center;
  padding: 48px 0;
  color: #999;
}
.empty-state p {
  margin: 0 0 12px;
}
.add-root-btn {
  margin-top: 8px;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 5px 16px;
  cursor: pointer;
  color: #888;
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}
.add-root-btn:hover {
  border-color: #999;
  color: #444;
}

/* Planning header */
.planning-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 4px 7px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 4px;
  font-size: 12px;
  color: #555;
  flex-wrap: wrap;
}
.ph-item {
  display: flex;
  gap: 4px;
  align-items: center;
}
.ph-label {
  color: #999;
}
.ph-value {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-weight: 600;
}
.ph-sep {
  color: #ddd;
}
</style>
