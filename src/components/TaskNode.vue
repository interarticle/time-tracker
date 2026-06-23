<script setup lang="ts">
import { inject, ref, computed, watch, nextTick } from 'vue'
import { TimeTrackerKey, PlanningKey } from '@/types'
import type { TaskNode, CommittedNode } from '@/types'
import { formatMs, formatCountdown, parseTimeInput, formatForEdit } from '@/utils/format'
import { parseTags, parsePriority, isPriorityTag } from '@/utils/tags'
import ClockFace from './ClockFace.vue'

type AnyNode = TaskNode | CommittedNode

const props = defineProps<{
  node: AnyNode
  depth: number
  mode?: 'planned' | 'committed'
  /** Priority-list rendering: flat (no indent), hierarchical name, priority chip + cumulative limit. */
  priorityRow?: boolean
  /** Ancestor labels joined with " > " (priority view only). */
  pathPrefix?: string
  /** Running cumulative sum of limits down the prioritized order (priority view only). */
  cumLimitMs?: number | null
}>()
const tracker = inject(TimeTrackerKey)!
const planning = inject(PlanningKey, null)

const isCommitted = computed(() => props.mode === 'committed')
const isLeaf = computed(() => props.node.children.length === 0)
const isCompleted = computed(() =>
  !isCommitted.value && isLeaf.value && !!((props.node as TaskNode).completed),
)
const isDeprioritized = computed(() =>
  !isCommitted.value && isLeaf.value && !!((props.node as TaskNode).deprioritized),
)
// A deprioritized leaf can be re-prioritized any time; a normal leaf can only be
// deprioritized when no time has been counted yet.
const canDeprioritize = computed(
  () => !isCommitted.value && isLeaf.value && !isCompleted.value &&
    (isDeprioritized.value || (!running.value && displayMs.value === 0)),
)
const showLimitStrikethrough = computed(() =>
  isDeprioritized.value ||
  (isCompleted.value && timeLimitMs.value !== null && displayMs.value < timeLimitMs.value),
)
function toggleComplete() {
  if (isCommitted.value || !isLeaf.value || isDeprioritized.value) return
  tracker.setCompleted(props.node.id, !isCompleted.value)
}
function toggleDeprioritize() {
  if (!canDeprioritize.value) return
  tracker.setDeprioritized(props.node.id, !isDeprioritized.value)
}

const parsed = computed(() => parseTags(props.node.name))
// Tags shown as chips. On a planned leaf the #p<n> priority tag is rendered as a
// dedicated priority chip instead, so drop it here; elsewhere keep all tags.
const displayTags = computed(() =>
  !isCommitted.value && isLeaf.value
    ? parsed.value.tags.filter((t) => !isPriorityTag(t))
    : parsed.value.tags,
)
// Priority is only meaningful for planned leaves.
const priority = computed(() =>
  !isCommitted.value && isLeaf.value ? parsePriority(props.node.name) : null,
)
// In the priority view every leaf shows a chip (P? when unprioritized); elsewhere
// only prioritized leaves show one.
const priorityChip = computed(() => {
  if (priority.value !== null) return `P${priority.value}`
  return props.priorityRow ? 'P?' : null
})

const running = computed(() => !isCommitted.value && tracker.isRunning(props.node.id))
const isAfterEod = computed(() => tracker.isAfterEod.value)

const displayMs = computed(() => {
  if (isCommitted.value) {
    return planning!.getCommittedSubtreeMs(props.node as CommittedNode)
  }
  return isLeaf.value
    ? tracker.getDisplayMs(props.node.id)
    : tracker.getSubtreeMs(props.node as TaskNode)
})
const displayTime = computed(() => formatMs(displayMs.value))

// Night time (leaves in planned mode only)
const nightMs = computed(() => {
  if (isCommitted.value || !isLeaf.value) return 0
  return tracker.getNightDisplayMs(props.node.id)
})
const hasNight = computed(() => nightMs.value > 0)
const nightTime = computed(() => formatMs(nightMs.value))

// Day portion when night exists
const dayMs = computed(() => {
  if (!hasNight.value || isCommitted.value || !isLeaf.value) return displayMs.value
  return tracker.getDayDisplayMs(props.node.id)
})
const dayTime = computed(() => formatMs(dayMs.value))

// timeLimitMs is only relevant in planned mode
const timeLimitMs = computed(() => {
  if (isCommitted.value) return null
  return (props.node as TaskNode).timeLimitMs
})
const subtreeLimitMs = computed(() => {
  if (isCommitted.value) return null
  return tracker.getSubtreeLimitMs(props.node as TaskNode)
})

const limitRatio = computed(() => {
  if (subtreeLimitMs.value === null || subtreeLimitMs.value <= 0) return null
  return displayMs.value / subtreeLimitMs.value
})

// Percentage of day totals (root nodes only, planned mode only)
const timePct = computed(() => {
  if (isCommitted.value || props.depth !== 0) return null
  const total = tracker.getTotalAllMs()
  if (total <= 0) return null
  return Math.round((displayMs.value / total) * 100)
})
const limitPct = computed(() => {
  if (isCommitted.value || props.depth !== 0) return null
  const totalLimit = tracker.getTotalDayLimitMs()
  if (totalLimit === null || totalLimit <= 0 || subtreeLimitMs.value === null) return null
  return Math.round((subtreeLimitMs.value / totalLimit) * 100)
})

// Countdown: shown only while running with a limit
const showCountdown = computed(() => running.value && isLeaf.value && timeLimitMs.value !== null && timeLimitMs.value > 0)
const countdownMs = computed(() => (timeLimitMs.value ?? 0) - displayMs.value)
const countdownText = computed(() => formatCountdown(countdownMs.value))
const countdownColor = computed(() => countdownMs.value >= 0 ? '#2e7d32' : '#c62828')

const rowClasses = computed(() => {
  if (isCommitted.value) return {}
  const c: Record<string, boolean> = {}
  if (isDeprioritized.value) {
    c['is-deprioritized'] = true
    return c
  }
  if (isCompleted.value) {
    c['is-completed'] = true
    // Overtime items keep their red; warning items lose their yellow
    if (limitRatio.value !== null && limitRatio.value >= 1) {
      c['limit-exceeded'] = true
    }
    return c
  }
  if (running.value) c['is-running'] = true
  if (limitRatio.value !== null) {
    if (limitRatio.value >= 1) {
      c[running.value ? 'limit-exceeded-running' : 'limit-exceeded'] = true
    } else if (
      limitRatio.value >= 0.8 &&
      (subtreeLimitMs.value! - displayMs.value) <= 10 * 60 * 1000
    ) {
      c[running.value ? 'limit-approaching-running' : 'limit-approaching'] = true
    }
  }
  return c
})

// Name editing
const editingName = ref(false)
const nameInput = ref('')
function startEditName() {
  if (!isCommitted.value && running.value) return
  editingName.value = true
  nameInput.value = props.node.name
}
function commitName() {
  if (isCommitted.value) {
    planning!.renameCommitted(props.node.id, nameInput.value)
  } else {
    tracker.renameTask(props.node.id, nameInput.value)
  }
  editingName.value = false
}

// Enter in name field: leaf → focus time/limit field; non-leaf → add sibling
function handleNameEnter() {
  if (!isCommitted.value && running.value) { commitName(); return }
  commitName()
  if (!isLeaf.value) {
    if (isCommitted.value) planning!.addCommittedSibling(props.node.id)
    else tracker.addSibling(props.node.id)
    return
  }
  // Leaf: move focus to the time/limit field
  if (isCommitted.value) {
    editingTime.value = true
    timeInput.value = formatForEdit((props.node as CommittedNode).durationMs, 'hms')
  } else {
    editingLimit.value = true
    limitInput.value = formatForEdit(timeLimitMs.value, 'hms')
  }
}

// Enter in time/limit field: commit + add sibling
function commitTimeAndAddSibling() {
  commitTime()
  if (isCommitted.value) planning!.addCommittedSibling(props.node.id)
  else tracker.addSibling(props.node.id)
}
function commitLimitAndAddSibling() {
  commitLimit()
  tracker.addSibling(props.node.id)
}

// Escape: save name; auto-delete if empty with no data
function handleEscape() {
  commitName()
  // Auto-delete if empty and no data worth preserving
  if (props.node.name) return
  if (isCommitted.value) {
    const hasData = (node: CommittedNode): boolean =>
      node.children.length > 0 || (node.durationMs ?? 0) > 0 ||
      node.children.some(hasData)
    if (!hasData(props.node as CommittedNode)) {
      planning!.deleteCommitted(props.node.id)
    }
  } else {
    const hasTime = tracker.getSubtreeMs(props.node as TaskNode) > 0
    const hasLimit = tracker.getSubtreeLimitMs(props.node as TaskNode) !== null
    const hasChildren = props.node.children.length > 0
    if (!hasTime && !hasLimit && !hasChildren) {
      tracker.deleteTask(props.node.id)
    }
  }
}

// Tab / Shift+Tab: indent or dedent
function handleTabKey(event: KeyboardEvent) {
  if (!isCommitted.value && running.value) return
  if (isCommitted.value) {
    planning!.renameCommitted(props.node.id, nameInput.value)
    const warning = event.shiftKey
      ? planning!.dedentCommitted(props.node.id)
      : planning!.indentCommitted(props.node.id)
    if (warning) alert(warning)
  } else {
    tracker.renameTask(props.node.id, nameInput.value)
    const warning = event.shiftKey
      ? tracker.dedentTask(props.node.id)
      : tracker.indentTask(props.node.id)
    if (warning) alert(warning)
  }
}

// Delete with confirmation if the node has data worth preserving
function handleDelete() {
  if (isCommitted.value) {
    const hasNonZero = (node: CommittedNode): boolean =>
      (node.children.length === 0 ? (node.durationMs ?? 0) > 0 : node.children.some(hasNonZero))
    const node = props.node as CommittedNode
    const hasDuration = hasNonZero(node)
    const hasChildren = node.children.length > 0
    if (hasDuration || hasChildren) {
      const reasons = [hasDuration && 'duration', hasChildren && 'subtasks']
        .filter(Boolean)
        .join(', ')
      if (!confirm(`"${node.name || 'Unnamed'}" has ${reasons}. Delete anyway?`)) return
    }
    planning!.deleteCommitted(props.node.id)
  } else {
    const hasTime = tracker.getSubtreeMs(props.node as TaskNode) > 0
    const hasLimit = tracker.getSubtreeLimitMs(props.node as TaskNode) !== null
    const hasChildren = props.node.children.length > 0
    if (hasTime || hasLimit || hasChildren) {
      const reasons = [
        hasTime && 'accumulated time',
        hasLimit && 'a time limit',
        hasChildren && 'subtasks',
      ]
        .filter(Boolean)
        .join(', ')
      if (!confirm(`"${props.node.name || 'Unnamed'}" has ${reasons}. Delete anyway?`)) return
    }
    tracker.deleteTask(props.node.id)
  }
}

// Re-focus after indent/dedent — planned mode
watch(
  () => tracker.focusNodeId.value,
  (id) => {
    if (isCommitted.value || id !== props.node.id) return
    tracker.focusNodeId.value = null
    nameInput.value = props.node.name
    editingName.value = true
  },
  { immediate: true },
)

// Re-focus after indent/dedent — committed mode
watch(
  () => planning?.committedFocusNodeId.value,
  (id) => {
    if (!isCommitted.value || id !== props.node.id) return
    planning!.committedFocusNodeId.value = null
    nameInput.value = props.node.name
    editingName.value = true
  },
  { immediate: true },
)

// Time editing — 'day' edits accumulatedMs, 'night' edits nightAccumulatedMs
const editingTime = ref(false)
const editingWhich = ref<'day' | 'night'>('day')
const timeInput = ref('')

function startEditTime(which: 'day' | 'night' = 'day') {
  if (!isCommitted.value && (isCompleted.value || isDeprioritized.value)) return
  if (isCommitted.value) {
    if (!isLeaf.value) return
    editingTime.value = true
    editingWhich.value = 'day'
    timeInput.value = formatForEdit((props.node as CommittedNode).durationMs, 'hms')
  } else {
    if (!isLeaf.value || running.value) return
    editingTime.value = true
    editingWhich.value = which
    timeInput.value = formatForEdit(which === 'night' ? nightMs.value : dayMs.value, 'hms')
  }
}

function commitTime() {
  if (timeInput.value.trim() === '' && isCommitted.value) {
    planning!.setCommittedDuration(props.node.id, null)
  } else {
    const ms = parseTimeInput(timeInput.value)
    if (ms !== null) {
      if (isCommitted.value) {
        planning!.setCommittedDuration(props.node.id, ms)
      } else if (editingWhich.value === 'night') {
        tracker.setNightAccumulatedMs(props.node.id, ms)
      } else {
        tracker.setAccumulatedMs(props.node.id, ms)
      }
    }
  }
  editingTime.value = false
}

// Time limit editing (planned mode only)
const editingLimit = ref(false)
const limitInput = ref('')
function startEditLimit() {
  if (isCommitted.value || !isLeaf.value || isCompleted.value || isDeprioritized.value) return
  editingLimit.value = true
  limitInput.value = formatForEdit(timeLimitMs.value, 'hms')
}
function commitLimit() {
  if (isCommitted.value) return
  if (tracker.hasAnyNightTime.value) {
    if (!confirm('Night time has been accumulated. Changing limits after end of day — proceed?')) {
      editingLimit.value = false
      return
    }
  }
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

// Struct button helpers (avoid non-null assertions in template)
function doAddChild() {
  if (isCommitted.value) planning?.addCommittedChild(props.node.id)
  else tracker.addChild(props.node.id)
}
function doAddSibling() {
  if (isCommitted.value) planning?.addCommittedSibling(props.node.id)
  else tracker.addSibling(props.node.id)
}

// Always focus (and select existing text) when the name input is freshly mounted.
let lastNameInputEl: HTMLInputElement | null = null
function onNameMounted(el: HTMLInputElement | null) {
  if (!el) { lastNameInputEl = null; return }
  if (el === lastNameInputEl) return
  lastNameInputEl = el
  nextTick(() => { el.focus(); el.select() })
}
</script>

<template>
  <li>
    <div class="task-row" :class="rowClasses">
      <!-- Left: tree-indented name -->
      <span class="row-left">
        <span v-if="!priorityRow" class="indent" :style="{ width: depth * 20 + 'px' }" aria-hidden="true"></span>
        <span
          v-if="priorityChip"
          :class="['priority-chip', { 'priority-none': priority === null }]"
        >{{ priorityChip }}</span>
        <span class="node-icon" aria-hidden="true">{{ isLeaf ? '\u2022' : '\u25BE' }}</span>
        <input
          v-if="!priorityRow && (editingName || !node.name)"
          :ref="(el) => onNameMounted(el as HTMLInputElement | null)"
          v-model="nameInput"
          class="name-input"
          placeholder="Task name…"
          @blur="commitName"
          @keydown.enter.prevent="handleNameEnter"
          @keydown.escape.prevent="handleEscape"
          @keydown.tab.prevent="handleTabKey($event)"
        />
        <span v-else-if="priorityRow" class="name-text path-name"><span
          v-if="pathPrefix"
          class="path-prefix"
        >{{ pathPrefix }} › </span>{{ parsed.displayName }}<span
          v-for="tag in displayTags"
          :key="tag"
          :class="['tag-chip', { 'tag-timeboxed': tag.toLowerCase() === 'timeboxed' }]"
        >#{{ tag }}</span></span>
        <span v-else class="name-text" @click="startEditName">{{ parsed.displayName }}<span
          v-for="tag in displayTags"
          :key="tag"
          :class="['tag-chip', { 'tag-timeboxed': tag.toLowerCase() === 'timeboxed' }]"
          @click.stop
        >#{{ tag }}</span></span>
      </span>

      <!-- Right: time + limit, then reverse-indent gap, then fixed-width controls -->
      <span class="row-right">
        <span class="time-cell">
          <input
            v-if="editingTime"
            v-model="timeInput"
            class="cell-input"
            @blur="commitTime"
            @keydown.enter.prevent="commitTimeAndAddSibling"
            @keydown.escape="editingTime = false"
            @vue:mounted="($event: any) => $event.el.focus()"
          />
          <span v-else class="time-text">
            <span
              :class="{ editable: isLeaf && (!running || isCommitted) }"
              @click="startEditTime('day')"
            >{{ hasNight ? dayTime : displayTime }}</span>
            <span
              v-if="hasNight"
              class="night-time editable"
              @click.stop="startEditTime('night')"
            >+{{ nightTime }}</span>
          </span>
        </span>
        <!-- Used-time clock face -->
        <ClockFace v-if="!isCommitted && !isDeprioritized && subtreeLimitMs !== null" :ms="displayMs" :size="16" class="clock-used" @click="startEditTime('day')" />
        <span v-if="timePct !== null" class="pct-cell time-pct">{{ timePct }}%</span>
        <!-- Limit cell: planned mode only -->
        <span v-if="!isCommitted" class="limit-cell">
          <template v-if="isLeaf">
            <input
              v-if="editingLimit"
              v-model="limitInput"
              class="cell-input"
              placeholder="H:MM:SS"
              @blur="commitLimit"
              @keydown.enter.prevent="commitLimitAndAddSibling"
              @keydown.escape="editingLimit = false"
              @vue:mounted="($event: any) => $event.el.focus()"
            />
            <template v-else-if="showCountdown">
              <span class="countdown-text" :style="{ color: countdownColor }">{{ countdownText }}</span>
            </template>
            <template v-else>
              <span v-if="timeLimitMs !== null" :class="['limit-text', { 'is-crossed': showLimitStrikethrough }]" @click="startEditLimit">/{{ formatMs(timeLimitMs ?? 0) }}</span>
              <span v-else class="limit-set" @click="startEditLimit"></span>
            </template>
          </template>
          <template v-else-if="subtreeLimitMs !== null">
            <span class="limit-text">/{{ formatMs(subtreeLimitMs) }}</span>
          </template>
        </span>
        <!-- Limit clock face (after limit numbers) -->
        <ClockFace v-if="!isCommitted && !isDeprioritized && subtreeLimitMs !== null" :ms="subtreeLimitMs" :size="16" class="clock-limit" @click="startEditLimit" />
        <!-- Night-time indicator for narrow screens (when no clock faces shown) -->
        <span v-if="hasNight && !isCommitted && subtreeLimitMs === null" class="night-narrow-icon" @click.stop="startEditTime('night')"></span>
        <span v-if="limitPct !== null" class="pct-cell limit-pct">{{ limitPct }}%</span>
        <!-- Reverse indent: shallower = wider gap, deeper = narrower (flush with controls) -->
        <span class="reverse-indent" :style="{ width: Math.max(0, 4 - depth) * 20 + 'px' }"></span>
        <!-- Timer buttons: planned mode only -->
        <span class="timer-btns">
          <template v-if="!isCommitted && isLeaf && tracker.isToday.value && !isCompleted && !isDeprioritized">
            <button v-if="!running" class="btn btn-switch" :class="{ 'btn-night': isAfterEod }" @click="tracker.openPip().then(() => tracker.switchTimer(node.id))" title="Switch"></button>
            <button v-if="running" class="btn btn-stop" @click="tracker.stopTimer(node.id)" title="Stop"></button>
            <button v-if="!running" class="btn btn-share" :class="{ 'btn-night': isAfterEod }" @click="tracker.openPip().then(() => tracker.shareTimer(node.id))" title="Share"></button>
          </template>
        </span>
        <span v-if="!priorityRow" class="struct-btns">
          <button class="btn btn-struct btn-add-child" @click="doAddChild" title="Add child"></button>
          <button class="btn btn-struct btn-add-sibling" @click="doAddSibling" title="Add sibling"></button>
          <button class="btn btn-struct btn-delete" @click="handleDelete" title="Delete"></button>
        </span>
        <!-- Deprioritize toggle: planned leaves only (hidden until hover, like the checkbox) -->
        <span class="deprio-cell">
          <button
            v-if="!isCommitted && isLeaf && canDeprioritize"
            :class="['btn', 'btn-deprio', { 'is-active': isDeprioritized }]"
            @click="toggleDeprioritize"
            :title="isDeprioritized ? 'Re-prioritize' : 'Deprioritize (zero out limit)'"
          ></button>
        </span>
        <!-- Complete toggle: planned leaves only; spacer for others -->
        <span class="complete-cell">
          <button
            v-if="!isCommitted && isLeaf && !isDeprioritized"
            :class="['btn', 'btn-complete', { 'is-checked': isCompleted }]"
            @click="toggleComplete"
            :title="isCompleted ? 'Mark incomplete' : 'Mark complete'"
          ></button>
        </span>
        <!-- Cumulative limit (priority view only): sum of limits down the prioritized order -->
        <span v-if="priorityRow" class="cumsum-cell">{{ cumLimitMs ? formatMs(cumLimitMs) : '—' }}</span>
      </span>
    </div>

    <ul v-if="node.children.length > 0">
      <TaskNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :mode="mode"
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
.is-running .name-text {
  cursor: default;
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
  width: 74px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
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
.clock-used, .clock-limit {
  flex-shrink: 0;
  margin-left: 3px;
}
.countdown-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 600;
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

/* Night mode: blue timer buttons */
.btn-switch.btn-night::before { color: #1565c0; }
.btn-share.btn-night::before  { color: #1a56a0; }

/* Night time display */
.night-time {
  display: block;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 10px;
  color: #1565c0;
  text-align: right;
  line-height: 1.2;
}
.night-time.editable {
  cursor: pointer;
  text-decoration: underline dotted #7baad4;
}

.btn-struct { color: #aaa; }
.btn-add-child::before   { content: '\21B3'; font-size: 14px; }
.btn-add-sibling::before { content: '\2193'; font-size: 14px; }
.btn-delete::before      { content: '\00D7'; font-size: 16px; }
.btn-struct:hover { color: #555; }
.btn-delete:hover { color: #c62828 !important; }

/* Priority chip (before the leaf name) */
.priority-chip {
  flex-shrink: 0;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  margin-right: 5px;
  border-radius: 8px;
  background-color: #e3edf7;
  color: #2f6db3;
  line-height: 16px;
}
.priority-chip.priority-none {
  background-color: #f0f0f0;
  color: #aaa;
}

/* Hierarchical path label (priority view) */
.path-name { color: #333; }
.path-prefix { color: #aaa; }

/* Deprioritize toggle button (hover-revealed, like the checkbox) */
.deprio-cell {
  width: 23px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.btn-deprio {
  opacity: 0;
  transition: opacity 0.12s;
  width: 20px;
  height: 20px;
}
.task-row:hover .btn-deprio { opacity: 0.45; }
.btn-deprio.is-active { opacity: 1 !important; }
.btn-deprio::before { content: '\2298'; font-size: 14px; color: #aaa; }
.btn-deprio.is-active::before { color: #c0392b; }

/* Cumulative limit cell (priority view) */
.cumsum-cell {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
  padding-left: 8px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #777;
}

/* Deprioritized state: dimmed, limit struck through, controls hidden */
.task-row.is-deprioritized { opacity: 0.55; }
.task-row.is-deprioritized .name-text { color: #999; }

/* Completed state */
.task-row.is-completed { opacity: 0.7; }
.task-row.is-completed.limit-exceeded { opacity: 1; }
.task-row.is-completed .name-text { text-decoration: line-through; }
.limit-text.is-crossed { text-decoration: line-through; }

/* Complete toggle button */
.complete-cell {
  width: 23px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.btn-complete {
  opacity: 0;
  transition: opacity 0.12s;
  width: 20px;
  height: 20px;
}
.task-row:hover .btn-complete { opacity: 0.45; }
.btn-complete.is-checked { opacity: 1 !important; }
.btn-complete::before { content: '\2610'; font-size: 14px; color: #aaa; }
.btn-complete.is-checked::before { content: '\2611'; color: #4caf50; }

/* ---- Night narrow-screen icon ---- */
.night-narrow-icon {
  display: none;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1565c0;
  font-size: 12px;
}
.night-narrow-icon::before { content: '\1F319'; }

/* ---- Narrow / mobile layout ---- */
@media (max-width: 600px) {
  .time-cell,
  .limit-cell,
  .pct-cell,
  .reverse-indent {
    display: none;
  }
  .time-cell:has(.cell-input),
  .limit-cell:has(.cell-input) {
    display: block;
  }
  .clock-used,
  .clock-limit {
    cursor: pointer;
  }
  .night-narrow-icon {
    display: inline-flex;
  }
}

/* ---- Tag chips ---- */
.tag-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  margin-left: 4px;
  border-radius: 8px;
  background-color: #e3edf7;
  color: #3a6ea5;
  vertical-align: middle;
  line-height: 16px;
  cursor: default;
  white-space: nowrap;
}
.tag-timeboxed {
  background-color: #fce4ec;
  color: #c62828;
}
</style>
