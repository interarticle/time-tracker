<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { TimeTrackerKey, PlanningKey, BUFFER_NAME } from '@/types'
import type { CommittedNode, TaskNode } from '@/types'
import { formatMsHM } from '@/utils/format'

const tracker = inject(TimeTrackerKey)!
const planning = inject(PlanningKey)!

const expanded = ref(true)

const COLORS = [
  '#4a90d9', '#e67e22', '#27ae60', '#9b59b6',
  '#e74c3c', '#1abc9c', '#f39c12', '#2980b9',
  '#8e44ad', '#16a085',
]

interface CategoryEntry {
  key: string
  displayName: string
  committedMs: number
  usedMs: number
  limitMs: number | null
  color: string
}

const categories = computed((): CategoryEntry[] => {
  const committedRoots = planning.committedTree.value.roots
  const plannedRoots = tracker.tree.value.roots

  // Build maps keyed by lowercase name
  const committedMap = new Map<string, CommittedNode>()
  for (const r of committedRoots) {
    committedMap.set(r.name.toLowerCase(), r)
  }
  const plannedMap = new Map<string, TaskNode>()
  for (const r of plannedRoots) {
    plannedMap.set(r.name.toLowerCase(), r)
  }

  // Collect all unique keys
  const allKeys = new Set([...committedMap.keys(), ...plannedMap.keys()])

  const entries: CategoryEntry[] = []
  let colorIdx = 0

  for (const key of allKeys) {
    if (!key) continue // skip unnamed
    const committedRoot = committedMap.get(key)
    const plannedRoot = plannedMap.get(key)

    const committedMs = committedRoot ? planning.getCommittedSubtreeMs(committedRoot) : 0
    const plannedUsedMs = plannedRoot ? tracker.getSubtreeMs(plannedRoot) : 0
    const usedMs = committedMs + plannedUsedMs

    let limitMs: number | null
    if (plannedRoot) {
      const planLimit = tracker.getSubtreeLimitMs(plannedRoot)
      if (planLimit !== null || committedMs > 0) {
        limitMs = committedMs + (planLimit ?? 0)
      } else {
        limitMs = null
      }
    } else {
      // committed-only category
      limitMs = committedMs
    }

    const displayName = committedRoot?.name || plannedRoot?.name || key
    entries.push({
      key,
      displayName,
      committedMs,
      usedMs,
      limitMs,
      color: COLORS[colorIdx % COLORS.length]!,
    })
    colorIdx++
  }

  // Merge the permanent buffer item into its category
  const bufferKey = BUFFER_NAME.toLowerCase()
  const bufMs = planning.bufferAccumulatedMs.value
  const bufLim = planning.bufferLimitMs.value
  if (bufMs > 0 || bufLim !== undefined) {
    const existingIdx = entries.findIndex((e) => e.key === bufferKey)
    if (existingIdx >= 0) {
      const e = entries[existingIdx]!
      e.usedMs += bufMs
      if (bufLim !== undefined) {
        e.limitMs = (e.limitMs ?? 0) + bufLim
      }
    } else {
      entries.push({
        key: bufferKey,
        displayName: BUFFER_NAME,
        committedMs: 0,
        usedMs: bufMs,
        limitMs: bufLim ?? null,
        color: COLORS[colorIdx % COLORS.length]!,
      })
      colorIdx++
    }
  }

  // Sort: matched first, then committed-only, then planned-only; alpha within groups
  entries.sort((a, b) => {
    const aHasBoth = committedMap.has(a.key) && plannedMap.has(a.key) ? 0 : committedMap.has(a.key) ? 1 : 2
    const bHasBoth = committedMap.has(b.key) && plannedMap.has(b.key) ? 0 : committedMap.has(b.key) ? 1 : 2
    if (aHasBoth !== bHasBoth) return aHasBoth - bHasBoth
    return a.displayName.localeCompare(b.displayName)
  })

  return entries
})

const totalUsedMs = computed(() => categories.value.reduce((s, c) => s + c.usedMs, 0))
const totalLimitMs = computed(() =>
  categories.value.reduce((s, c) => s + (c.limitMs ?? c.usedMs), 0),
)

function usedPct(c: CategoryEntry): number {
  if (totalUsedMs.value <= 0) return 0
  return (c.usedMs / totalUsedMs.value) * 100
}
function plannedPct(c: CategoryEntry): number {
  if (totalLimitMs.value <= 0) return 0
  return ((c.limitMs ?? c.usedMs) / totalLimitMs.value) * 100
}
function arrowColor(c: CategoryEntry): string {
  if (c.limitMs === null) return '#888'
  return c.usedMs > c.limitMs ? '#c62828' : '#2e7d32'
}
</script>

<template>
  <div v-if="categories.length > 0" class="category-breakdown">
    <div class="breakdown-header" @click="expanded = !expanded">
      <span class="toggle-icon">{{ expanded ? '▾' : '▸' }}</span>
      <span class="breakdown-title">BY CATEGORY</span>
    </div>

    <div v-if="expanded" class="breakdown-body">
      <!-- Used bar -->
      <div class="bar-row" title="Actual time used — each segment's width shows that category's share of total used time">
        <div
          v-for="c in categories"
          :key="c.key + '-used'"
          class="bar-seg"
          :style="{ width: usedPct(c) + '%', background: c.color }"
          :title="c.displayName + ': ' + formatMsHM(c.usedMs) + ' used (' + Math.round(usedPct(c)) + '% of day)'"
        ></div>
      </div>

      <!-- Planned bar -->
      <div class="bar-row planned-bar" title="Planned/limit time — each segment's width shows that category's share of total planned time">
        <div
          v-for="c in categories"
          :key="c.key + '-plan'"
          class="bar-seg planned-seg"
          :style="{ width: plannedPct(c) + '%', background: c.color }"
          :title="c.displayName + ': ' + (c.limitMs !== null ? formatMsHM(c.limitMs) + ' planned (' + Math.round(plannedPct(c)) + '% of day)' : 'no limit')"
        ></div>
      </div>

      <!-- Detail rows -->
      <div class="detail-rows">
        <div v-for="c in categories" :key="c.key" class="detail-row">
          <span class="cat-swatch" :style="{ background: c.color }"></span>
          <span class="cat-name">{{ c.displayName }}</span>
          <span
            class="cat-used"
            :style="{ color: c.limitMs !== null && c.usedMs > c.limitMs ? '#c62828' : '#555' }"
          >{{ formatMsHM(c.usedMs) }}</span>
          <span
            class="cat-pct-arrow"
            :style="{ color: arrowColor(c) }"
          >{{ Math.round(usedPct(c)) }}%&nbsp;←&nbsp;{{ Math.round(plannedPct(c)) }}%</span>
          <span v-if="c.limitMs !== null" class="cat-limit">/ {{ formatMsHM(c.limitMs) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-breakdown {
  margin-top: 12px;
  border-top: 1px solid #e8e8e8;
  padding-top: 8px;
}
.breakdown-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 8px;
}
.toggle-icon {
  font-size: 12px;
  color: #888;
  width: 12px;
}
.breakdown-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #888;
  text-transform: uppercase;
}

.breakdown-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Bar rows */
.bar-row {
  display: flex;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: #f0f0f0;
  gap: 1px;
}
.planned-bar {
  height: 8px;
  opacity: 0.6;
}
.bar-seg {
  flex-shrink: 0;
  min-width: 1px;
  transition: width 0.3s;
}
.planned-seg {
  opacity: 0.7;
}

/* Detail rows */
.detail-rows {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #444;
  padding: 2px 0;
}
.cat-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.cat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-used {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: #555;
  flex-shrink: 0;
}
.cat-pct-arrow {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  flex-shrink: 0;
}
.cat-limit {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}
</style>
