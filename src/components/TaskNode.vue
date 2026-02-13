<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { TimeTrackerKey } from '@/types'
import type { TaskNode } from '@/types'
import { formatMs, parseTimeInput } from '@/utils/format'

const props = defineProps<{ node: TaskNode; depth: number }>()
const tracker = inject(TimeTrackerKey)!

const isLeaf = computed(() => props.node.children.length === 0)
const running = computed(() => tracker.isRunning(props.node.id))
const displayMs = computed(() =>
  isLeaf.value ? tracker.getDisplayMs(props.node.id) : tracker.getSubtreeMs(props.node),
)
const displayTime = computed(() => formatMs(displayMs.value))
const subtreeLimitMs = computed(() => tracker.getSubtreeLimitMs(props.node))

const limitRatio = computed(() => {
  if (subtreeLimitMs.value === null || subtreeLimitMs.value <= 0) return null
  return displayMs.value / subtreeLimitMs.value
})

// Percentage of day totals (root nodes only)
const timePct = computed(() => {
  if (props.depth !== 0) return null
  const total = tracker.getTotalDayMs()
  if (total <= 0) return null
  return Math.round((displayMs.value / total) * 100)
})
const limitPct = computed(() => {
  if (props.depth !== 0) return null
  const totalLimit = tracker.getTotalDayLimitMs()
  if (totalLimit === null || totalLimit <= 0 || subtreeLimitMs.value === null) return null
  return Math.round((subtreeLimitMs.value / totalLimit) * 100)
})

const rowClasses = computed(() => {
  const c: Record<string, boolean> = {}
  if (running.value) c['is-running'] = true
  if (limitRatio.value !== null) {
    if (limitRatio.value >= 1) {
      c[running.value ? 'limit-exceeded-running' : 'limit-exceeded'] = true
    } else if (limitRatio.value >= 0.8 && (subtreeLimitMs.value! - displayMs.value) <= 10 * 60 * 1000) {
      c[running.value ? 'limit-approaching-running' : 'limit-approaching'] = true
    }
  }
  return c
})

// Name editing
const editingName = ref(false)
const nameInput = ref('')
function startEditName() {
  editingName.value = true
  nameInput.value = props.node.name
}
function commitName() {
  tracker.renameTask(props.node.id, nameInput.value)
  editingName.value = false
}

// Time editing (only for stopped leaves)
const editingTime = ref(false)
const timeInput = ref('')
function startEditTime() {
  if (!isLeaf.value || running.value || !tracker.isToday.value) return
  editingTime.value = true
  timeInput.value = displayTime.value
}
function commitTime() {
  const ms = parseTimeInput(timeInput.value)
  if (ms !== null) {
    tracker.setAccumulatedMs(props.node.id, ms)
  }
  editingTime.value = false
}

// Time limit editing
const editingLimit = ref(false)
const limitInput = ref('')
function startEditLimit() {
  if (!isLeaf.value) return
  editingLimit.value = true
  limitInput.value = props.node.timeLimitMs !== null ? formatMs(props.node.timeLimitMs) : ''
}
function commitLimit() {
  if (limitInput.value.trim() === '') {
    tracker.setTimeLimit(props.node.id, null)
  } else {
    const ms = parseTimeInput(limitInput.value)
    if (ms !== null) {
      tracker.setTimeLimit(props.node.id, ms)
    }
  }
  editingLimit.value = false
}

function onNameMounted(el: HTMLInputElement) {
  if (!props.node.name) el.focus()
}
</script>

<template>
  <li>
    <div class="task-row" :class="rowClasses">
      <!-- Left: tree-indented name -->
      <span class="row-left">
        <span class="indent" :style="{ width: depth * 20 + 'px' }" aria-hidden="true"></span>
        <span class="node-icon" aria-hidden="true">{{ isLeaf ? '\u2022' : '\u25BE' }}</span>
        <input
          v-if="editingName || !node.name"
          :ref="(el) => { if (el) onNameMounted(el as HTMLInputElement) }"
          v-model="nameInput"
          class="name-input"
          placeholder="Task name…"
          @blur="commitName"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @keydown.escape="editingName = false"
          @vue:mounted="() => { nameInput = node.name }"
        />
        <span v-else class="name-text" @click="startEditName">{{ node.name }}</span>
      </span>

      <!-- Right: time + limit, then reverse-indent gap, then fixed-width controls -->
      <span class="row-right">
        <span class="time-cell">
          <input
            v-if="editingTime"
            v-model="timeInput"
            class="cell-input"
            @blur="commitTime"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @keydown.escape="editingTime = false"
            @vue:mounted="($event: any) => $event.el.focus()"
          />
          <span
            v-else
            class="time-text"
            :class="{ editable: isLeaf && !running && tracker.isToday.value }"
            @click="startEditTime"
          >{{ displayTime }}</span>
        </span>
        <span v-if="timePct !== null" class="pct-cell time-pct">{{ timePct }}%</span>
        <span class="limit-cell">
          <template v-if="isLeaf">
            <input
              v-if="editingLimit"
              v-model="limitInput"
              class="cell-input"
              placeholder="H:MM:SS"
              @blur="commitLimit"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
              @keydown.escape="editingLimit = false"
              @vue:mounted="($event: any) => $event.el.focus()"
            />
            <span v-else-if="node.timeLimitMs !== null" class="limit-text" @click="startEditLimit">/{{ formatMs(node.timeLimitMs) }}</span>
            <span v-else class="limit-set" @click="startEditLimit"></span>
          </template>
          <span v-else-if="subtreeLimitMs !== null" class="limit-text">/{{ formatMs(subtreeLimitMs) }}</span>
        </span>
        <span v-if="limitPct !== null" class="pct-cell limit-pct">{{ limitPct }}%</span>
        <!-- Reverse indent: shallower = wider gap, deeper = narrower (flush with controls) -->
        <span class="reverse-indent" :style="{ width: Math.max(0, 4 - depth) * 20 + 'px' }"></span>
        <!-- Fixed-width button areas so controls never shift -->
        <span class="timer-btns">
          <template v-if="isLeaf && tracker.isToday.value">
            <button v-if="!running" class="btn btn-switch" @click="tracker.switchTimer(node.id)" title="Switch"></button>
            <button v-if="running" class="btn btn-stop" @click="tracker.stopTimer(node.id)" title="Stop"></button>
            <button v-if="!running" class="btn btn-share" @click="tracker.shareTimer(node.id)" title="Share"></button>
          </template>
        </span>
        <span class="struct-btns">
          <button class="btn btn-struct btn-add-child" @click="tracker.addChild(node.id)" title="Add child"></button>
          <button class="btn btn-struct btn-add-sibling" @click="tracker.addSibling(node.id)" title="Add sibling"></button>
          <button class="btn btn-struct btn-delete" @click="tracker.deleteTask(node.id)" title="Delete"></button>
        </span>
      </span>
    </div>

    <ul v-if="node.children.length > 0">
      <TaskNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>

<style scoped>
li { list-style: none; }
ul { margin: 0; padding: 0; }

/* ---- Row ---- */
.task-row {
  display: flex;
  align-items: center;
  min-height: 30px;
  padding: 1px 0;
  border-radius: 4px;
  transition: background-color 0.15s;
}
.task-row:hover { background-color: #f0f0f0; }

/* Running = green (no flash) */
.task-row.is-running { background-color: #e8f5e9; }
.task-row.is-running:hover { background-color: #c8e6c9; }

/* Limit highlights override green */
.task-row.limit-approaching { background-color: #fff8e1; }
.task-row.limit-exceeded { background-color: #ffebee; }
.task-row.limit-approaching-running { animation: pulse-warn 1.5s ease-in-out infinite; }
.task-row.limit-exceeded-running { animation: pulse-danger 1s ease-in-out infinite; }

@keyframes pulse-warn {
  0%, 100% { background-color: #fff8e1; }
  50% { background-color: #ffe082; }
}
@keyframes pulse-danger {
  0%, 100% { background-color: #ffebee; }
  50% { background-color: #ef9a9a; }
}

/* ---- Left: name area ---- */
.row-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  line-height: 30px;
}
.indent { flex-shrink: 0; }
.node-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 11px;
  color: #aaa;
  user-select: none;
}
.name-text {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name-input {
  flex: 1;
  min-width: 60px;
  border: 1px solid #bbb;
  border-radius: 3px;
  padding: 2px 6px;
  font: inherit;
  outline: none;
}
.name-input:focus { border-color: #4a90d9; }

/* ---- Right: times → gap → controls ---- */
.row-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.reverse-indent { flex-shrink: 0; }

/* ---- Time / Limit cells ---- */
.time-cell {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
}
.limit-cell {
  width: 76px;
  flex-shrink: 0;
  text-align: right;
  margin-left: 2px;
}
.time-text, .limit-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  color: #444;
}
.time-text.editable {
  cursor: pointer;
  text-decoration: underline dotted #aaa;
}
.limit-text {
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

/* ---- Percentage cells (root only) ---- */
.pct-cell {
  width: 36px;
  flex-shrink: 0;
  text-align: right;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
}
.time-pct { color: #666; }
.limit-pct { color: #aaa; }

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

/* ---- Fixed-width button containers (no shift) ---- */
.timer-btns {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  gap: 1px;
  justify-content: center;
  user-select: none;
}
.struct-btns {
  width: 68px;
  flex-shrink: 0;
  display: flex;
  gap: 1px;
  justify-content: flex-end;
  user-select: none;
  opacity: 0;
  transition: opacity 0.12s;
}
.task-row:hover .struct-btns { opacity: 1; }

/* ---- Buttons (empty text, icons via ::before) ---- */
.btn {
  border: none;
  background: none;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.1s;
}
.btn:hover { background-color: rgba(0, 0, 0, 0.08); }

.btn-switch::before { content: '\25B6'; color: #2e7d32; font-size: 10px; }
.btn-stop::before   { content: '\25A0'; color: #c62828; font-size: 12px; }
.btn-share::before  { content: '+'; color: #1565c0; font-size: 15px; font-weight: 700; }

.btn-struct { color: #aaa; }
.btn-add-child::before   { content: '\21B3'; font-size: 14px; }
.btn-add-sibling::before { content: '\2193'; font-size: 14px; }
.btn-delete::before      { content: '\00D7'; font-size: 16px; }
.btn-struct:hover { color: #555; }
.btn-delete:hover { color: #c62828 !important; }
</style>
