<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { TimeTrackerKey, PlanningKey, BUFFER_NAME } from '@/types'
import { formatMs, parseTimeInput } from '@/utils/format'
import PieChart from './PieChart.vue'

const tracker = inject(TimeTrackerKey)!
const planning = inject(PlanningKey)!

const bufferMs = computed(() => planning.bufferAccumulatedMs.value)

const displayTime = computed(() => {
  const ms = bufferMs.value
  if (ms < 0) return '−' + formatMs(-ms)
  return formatMs(ms)
})

const limitRatio = computed(() => {
  const lim = planning.bufferLimitMs.value
  if (!lim) return null
  return bufferMs.value / lim
})

// Limit editing
const editingLimit = ref(false)
const limitInput = ref('')

function startEditLimit() {
  editingLimit.value = true
  limitInput.value = planning.bufferLimitMs.value !== undefined
    ? formatMs(planning.bufferLimitMs.value)
    : ''
}
function commitLimit() {
  if (limitInput.value.trim() === '') {
    planning.setBufferLimit(undefined)
  } else {
    const ms = parseTimeInput(limitInput.value)
    if (ms !== null) planning.setBufferLimit(ms)
  }
  editingLimit.value = false
}

// Whether any other timer is running (affects live-counting visual weight)
const otherRunning = computed(() => tracker.dayState.value.runningTimerIds.length > 0)
</script>

<template>
  <div
    class="task-row buffer-row"
    :class="{
      'is-live': planning.bufferIsLive.value,
      'other-running': planning.bufferIsLive.value && otherRunning,
    }"
  >
    <!-- Left: name (no indent, fixed) -->
    <span class="row-left">
      <span class="node-icon" aria-hidden="true">&#x2022;</span>
      <span class="name-text">{{ BUFFER_NAME }}</span>
    </span>

    <!-- Right: time + limit + spacers to align with TaskNode depth-0 rows -->
    <span class="row-right">
      <span class="time-cell">
        <span class="time-text" :class="{ negative: bufferMs < 0 }">{{ displayTime }}</span>
      </span>
      <span class="limit-cell">
        <input
          v-if="editingLimit"
          v-model="limitInput"
          class="cell-input"
          placeholder="H:MM:SS"
          @blur="commitLimit"
          @keydown.enter.prevent="commitLimit"
          @keydown.escape="editingLimit = false"
          @vue:mounted="($event: any) => $event.el.focus()"
        />
        <template v-else>
          <PieChart v-if="limitRatio !== null" :ratio="limitRatio" />
          <span
            v-if="planning.bufferLimitMs.value !== undefined"
            class="limit-text"
            @click="startEditLimit"
          >/{{ formatMs(planning.bufferLimitMs.value) }}</span>
          <span v-else class="limit-set" @click="startEditLimit"></span>
        </template>
      </span>
      <!-- Spacers to match depth-0 TaskNode layout (reverse-indent + timer-btns + struct-btns) -->
      <span class="spacer"></span>
    </span>
  </div>
</template>

<style scoped>
.task-row {
  display: flex;
  align-items: center;
  min-height: 30px;
  padding: 1px 0;
  border-radius: 4px;
  transition: background-color 0.15s;
}
.task-row:hover { background-color: #f0f0f0; }
.task-row.is-live { background-color: #e8f5e9; }
.task-row.is-live:hover { background-color: #c8e6c9; }
/* Dimmed when live but another timer is stealing the foreground */
.task-row.other-running { opacity: 0.7; }

.row-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  line-height: 30px;
}
.node-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 11px;
  color: #aaa;
  user-select: none;
}
.name-text {
  color: #bbb;
  font-style: italic;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.time-cell {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
}
.time-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  color: #444;
}
.time-text.negative { color: #c62828; }

.limit-cell {
  width: 92px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-left: 2px;
}
.limit-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  color: #888;
  cursor: pointer;
}
.limit-set {
  display: inline-block;
  cursor: pointer;
  user-select: none;
  opacity: 0;
  transition: opacity 0.12s;
}
.task-row:hover .limit-set { opacity: 0.4; }
.limit-set::before { content: '\23F1'; font-size: 12px; }

.cell-input {
  width: 100%;
  box-sizing: border-box;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  padding: 1px 4px;
  text-align: right;
  outline: none;
}

/* Matches: reverse-indent(80) + timer-btns(46) + struct-btns(68) = 194px at depth 0 */
.spacer {
  width: 194px;
  flex-shrink: 0;
}
</style>
