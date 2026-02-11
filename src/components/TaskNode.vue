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

// Rolled-up limit (leaf: own limit, parent: sum of descendant limits)
const subtreeLimitMs = computed(() => tracker.getSubtreeLimitMs(props.node))

// Time limit highlights (works for both leaves and parents with rolled-up limits)
const limitRatio = computed(() => {
  if (subtreeLimitMs.value === null || subtreeLimitMs.value <= 0) return null
  return displayMs.value / subtreeLimitMs.value
})
const limitClass = computed(() => {
  if (limitRatio.value === null) return ''
  if (limitRatio.value >= 1) return running.value ? 'limit-exceeded-running' : 'limit-exceeded'
  if (limitRatio.value >= 0.8) return running.value ? 'limit-approaching-running' : 'limit-approaching'
  return ''
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

// Auto-focus for new (unnamed) nodes
function onNameMounted(el: HTMLInputElement) {
  if (!props.node.name) {
    el.focus()
  }
}
</script>

<template>
  <div class="task-node" :class="limitClass">
    <div class="node-row" :style="{ paddingLeft: depth * 20 + 'px' }">
      <!-- Expand indicator for parents -->
      <span v-if="!isLeaf" class="parent-indicator">&#9660;</span>
      <span v-else class="leaf-indicator">&#8226;</span>

      <!-- Name -->
      <input
        v-if="editingName || !node.name"
        :ref="(el) => { if (el) onNameMounted(el as HTMLInputElement) }"
        v-model="nameInput"
        class="name-input"
        placeholder="Task name..."
        @blur="commitName"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
        @keydown.escape="editingName = false"
        @vue:mounted="() => { nameInput = node.name }"
      />
      <span v-else class="name-label" @click="startEditName">{{ node.name }}</span>

      <!-- Time display -->
      <span v-if="!editingTime" class="time-display" :class="{ clickable: isLeaf && !running && tracker.isToday.value }" @click="startEditTime">
        {{ displayTime }}
      </span>
      <input
        v-else
        v-model="timeInput"
        class="time-input"
        @blur="commitTime"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
        @keydown.escape="editingTime = false"
        @vue:mounted="($event: any) => $event.el.focus()"
      />

      <!-- Time limit (editable on leaves, rolled-up display on parents) -->
      <template v-if="isLeaf">
        <span
          v-if="!editingLimit"
          class="limit-display"
          :class="{ 'has-limit': node.timeLimitMs !== null }"
          @click="startEditLimit"
          :title="node.timeLimitMs !== null ? 'Limit: ' + formatMs(node.timeLimitMs) : 'Set limit'"
        >
          {{ node.timeLimitMs !== null ? '/' + formatMs(node.timeLimitMs) : '&#9201;' }}
        </span>
        <input
          v-else
          v-model="limitInput"
          class="time-input limit-input"
          placeholder="HH:MM:SS or empty"
          @blur="commitLimit"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @keydown.escape="editingLimit = false"
          @vue:mounted="($event: any) => $event.el.focus()"
        />
      </template>
      <span
        v-else-if="subtreeLimitMs !== null"
        class="limit-display has-limit"
        :title="'Subtree limit: ' + formatMs(subtreeLimitMs)"
      >
        /{{ formatMs(subtreeLimitMs) }}
      </span>

      <!-- Timer buttons (only today, only leaves) -->
      <template v-if="isLeaf && tracker.isToday.value">
        <button v-if="!running" class="btn btn-start" @click="tracker.switchTimer(node.id)" title="Switch to this timer">&#9654;</button>
        <button v-if="running" class="btn btn-stop" @click="tracker.stopTimer(node.id)" title="Stop">&#9632;</button>
        <button v-if="!running" class="btn btn-share" @click="tracker.shareTimer(node.id)" title="Share time with running timers">&#43;</button>
      </template>

      <!-- Structure buttons -->
      <button class="btn btn-small" @click="tracker.addChild(node.id)" title="Add child">&#8627;</button>
      <button class="btn btn-small" @click="tracker.addSibling(node.id)" title="Add sibling">&#8615;</button>
      <button class="btn btn-small btn-delete" @click="tracker.deleteTask(node.id)" title="Delete">&times;</button>
    </div>

    <!-- Recursive children -->
    <TaskNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
    />
  </div>
</template>

<style scoped>
.task-node {
  /* base styling for limit highlights */
}
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  min-height: 32px;
  border-radius: 3px;
}
.node-row:hover {
  background: #f5f5f5;
}
.parent-indicator,
.leaf-indicator {
  width: 14px;
  text-align: center;
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
}
.name-label {
  cursor: pointer;
  flex: 1;
  min-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-input {
  flex: 1;
  min-width: 60px;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 2px 4px;
  font: inherit;
}
.time-display {
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  min-width: 70px;
  text-align: right;
  color: #555;
}
.time-display.clickable {
  cursor: pointer;
  text-decoration: underline dotted;
}
.time-input {
  width: 80px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  padding: 2px 4px;
  text-align: right;
}
.limit-input {
  width: 100px;
}
.limit-display {
  font-size: 12px;
  color: #999;
  cursor: pointer;
  min-width: 24px;
  text-align: center;
}
.limit-display.has-limit {
  color: #777;
  font-family: 'Courier New', Courier, monospace;
}
.btn {
  border: none;
  border-radius: 3px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  background: #eee;
  flex-shrink: 0;
}
.btn:hover {
  background: #ddd;
}
.btn-start {
  color: #2a7d2a;
}
.btn-stop {
  color: #c0392b;
}
.btn-share {
  color: #4a90d9;
}
.btn-small {
  font-size: 16px;
  padding: 0 4px;
  background: none;
  color: #999;
}
.btn-small:hover {
  color: #333;
}
.btn-delete:hover {
  color: #c0392b;
}

/* Time limit highlights */
.limit-approaching > .node-row {
  background: #fff8e1;
}
.limit-exceeded > .node-row {
  background: #ffebee;
}
.limit-approaching-running > .node-row {
  animation: pulse-warning 1.5s ease-in-out infinite;
}
.limit-exceeded-running > .node-row {
  animation: pulse-danger 1s ease-in-out infinite;
}

@keyframes pulse-warning {
  0%, 100% { background: #fff8e1; }
  50% { background: #fff3c4; }
}
@keyframes pulse-danger {
  0%, 100% { background: #ffebee; }
  50% { background: #ffcdd2; }
}
</style>
