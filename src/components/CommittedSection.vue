<script setup lang="ts">
import { inject, ref, computed, watch, onMounted } from 'vue'
import { PlanningKey, TimeTrackerKey } from '@/types'
import { formatMsHM } from '@/utils/format'
import TaskTree from './TaskTree.vue'

const planning = inject(PlanningKey)!
const tracker = inject(TimeTrackerKey)!

// Tri-state collapse:
//   null  = use derivedDefault (snapshot taken at init / date-switch)
//   true  = hard open
//   false = hard closed
// State is in-memory only — resets to null on refresh or when switching back to today.

const hasPlannedItems = computed(() => tracker.tree.value.roots.length > 0)

// Snapshot: open iff no planned items at the time the null-state was last established.
// We capture it once so that adding/removing tasks while in null-state does NOT
// reactively open or close the drawer.
const derivedDefault = ref(!hasPlannedItems.value)

const collapseState = ref<boolean | null>(null)

const isOpen = computed((): boolean => {
  if (!tracker.isToday.value) return true        // non-today: always open
  if (collapseState.value === null) return derivedDefault.value
  return collapseState.value
})

function toggle() {
  if (!tracker.isToday.value) return            // non-today: not collapsible
  collapseState.value = !isOpen.value
}

// Switching back to today → reset state and re-snapshot the default
watch(tracker.currentDateKey, () => {
  if (tracker.isToday.value) {
    derivedDefault.value = !hasPlannedItems.value
    collapseState.value = null
  }
})

// First timer start while state is still null → auto-collapse
watch(
  () => tracker.dayState.value.runningTimerIds.length,
  (len, prevLen) => {
    if (len > 0 && (prevLen ?? 0) === 0 && collapseState.value === null && tracker.isToday.value) {
      collapseState.value = false
    }
  },
)

// Enable transitions only after first mount to avoid animating the initial render
const ready = ref(false)
onMounted(() => { ready.value = true })
</script>

<template>
  <div class="committed-section">
    <!-- Header — clickable only on today -->
    <div
      class="section-header"
      :class="{ 'is-today': tracker.isToday.value }"
      @click="toggle"
    >
      <span class="toggle-icon">{{ isOpen ? '▾' : '▸' }}</span>
      <span class="section-label">COMMITTED</span>
      <span class="section-total">Total: {{ formatMsHM(planning.committedTotalMs.value) }}</span>
    </div>

    <!-- Drawer: grid-based height animation -->
    <div class="drawer" :class="{ 'drawer--open': isOpen, 'drawer--animated': ready }">
      <div class="drawer-inner">
        <TaskTree mode="committed" />
        <button class="add-committed-btn" @click="planning.addCommittedRoot()">
          + Add committed item
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.committed-section {
  margin-bottom: 4px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafafa;
}

/* Header */
.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0 4px;
  user-select: none;
  border-radius: 4px;
}
.section-header.is-today {
  cursor: pointer;
}
.section-header.is-today:hover {
  color: #333;
}
.toggle-icon {
  font-size: 11px;
  color: #aaa;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #888;
  text-transform: uppercase;
  flex: 1;
}
.section-total {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #555;
}

/* Drawer animation via grid-template-rows trick */
.drawer {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
}
.drawer--animated {
  transition: grid-template-rows 0.2s ease, opacity 0.18s ease;
}
.drawer--open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.drawer-inner {
  overflow: hidden;
  min-height: 0;
}

.add-committed-btn {
  margin-top: 6px;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 4px 14px;
  cursor: pointer;
  color: #888;
  font-size: 12px;
  transition: border-color 0.15s, color 0.15s;
}
.add-committed-btn:hover {
  border-color: #999;
  color: #444;
}
</style>
