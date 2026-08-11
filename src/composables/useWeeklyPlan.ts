import { ref, computed, watch } from 'vue'
import type { TaskNode, TimeTracker, LeafTimerData } from '@/types'
import { getWeekStart, addDays, formatWeekRange } from '@/utils/format'
import { loadWeeklyPlan, saveWeeklyPlan, loadTree, loadDayState } from '@/utils/storage'
import { parseWeeklyPlan } from '@/utils/weeklyPlan'
import { hasTag } from '@/utils/tags'

export interface PlanTally {
  trackedMs: number
  /** Sum of limits for matching tasks, or null when none of them set a limit. */
  limitMs: number | null
  /** trackedMs / limitMs, as a percentage. Null when there is no limit. */
  pctOfLimit: number | null
  /** Share of the week's total tracked time, as a percentage. */
  pctOfWeek: number | null
}

type Timers = Record<string, LeafTimerData>

/** Tracked ms for a subtree, read straight from a persisted timers map. */
function rawSubtreeMs(node: TaskNode, timers: Timers): number {
  if (node.children.length === 0) {
    const t = timers[node.id]
    return (t?.accumulatedMs ?? 0) + (t?.nightAccumulatedMs ?? 0)
  }
  return node.children.reduce((sum, c) => sum + rawSubtreeMs(c, timers), 0)
}

/** Subtree limit, mirroring the tracker: deprioritized leaves count as zero. */
function rawSubtreeLimitMs(node: TaskNode): number | null {
  if (node.children.length === 0) {
    return node.deprioritized ? (node.timeLimitMs === null ? null : 0) : node.timeLimitMs
  }
  let total = 0
  let hasAny = false
  for (const c of node.children) {
    const sub = rawSubtreeLimitMs(c)
    if (sub !== null) {
      total += sub
      hasAny = true
    }
  }
  return hasAny ? total : null
}

export function useWeeklyPlan(tracker: TimeTracker) {
  // The plan is bound to the Sunday-based week containing the viewed date.
  const weekStartKey = computed(() => getWeekStart(tracker.currentDateKey.value))
  const weekLabel = computed(() => formatWeekRange(weekStartKey.value))
  const weekDayKeys = computed(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStartKey.value, i)),
  )

  const markdown = ref('')
  watch(
    weekStartKey,
    (key) => {
      markdown.value = loadWeeklyPlan(key).markdown
    },
    { immediate: true },
  )

  function setMarkdown(md: string) {
    markdown.value = md
    saveWeeklyPlan(weekStartKey.value, { markdown: md })
  }

  const isEmpty = computed(() => markdown.value.trim() === '')
  const parsed = computed(() => parseWeeklyPlan(markdown.value))

  // Bumped when persisted data for days other than the viewed one may have
  // changed, forcing the cross-week tallies to re-read localStorage.
  const reloadKey = ref(0)
  watch(() => tracker.currentDateKey.value, () => { reloadKey.value++ })

  /**
   * Per-day (tree, timers) pairs for the week. The viewed day comes from the
   * live tracker state so tallies tick along with a running timer; the other
   * days are read from storage.
   */
  const weekDays = computed(() => {
    void reloadKey.value
    const viewed = tracker.currentDateKey.value
    return weekDayKeys.value.map((key) => {
      if (key === viewed) {
        return { key, isViewed: true, roots: tracker.tree.value.roots, timers: tracker.dayState.value.timers }
      }
      return { key, isViewed: false, roots: loadTree(key).roots, timers: loadDayState(key).timers }
    })
  })

  /**
   * Sum tracked time and limits for tasks carrying `tag`. A node that carries
   * the tag contributes its entire subtree, and we stop descending into it so
   * nested matches are never counted twice.
   */
  function collect(tag: string): { trackedMs: number; limitMs: number | null } {
    let trackedMs = 0
    let limitMs = 0
    let hasLimit = false

    for (const day of weekDays.value) {
      const walk = (nodes: TaskNode[]) => {
        for (const node of nodes) {
          if (hasTag(node.name, tag)) {
            trackedMs += day.isViewed
              ? tracker.getSubtreeMs(node)
              : rawSubtreeMs(node, day.timers)
            const limit = day.isViewed
              ? tracker.getSubtreeLimitMs(node)
              : rawSubtreeLimitMs(node)
            if (limit !== null) {
              limitMs += limit
              hasLimit = true
            }
            continue
          }
          walk(node.children)
        }
      }
      walk(day.roots)
    }
    return { trackedMs, limitMs: hasLimit ? limitMs : null }
  }

  /** Total tracked time across the whole week — the denominator for shares. */
  const weekTrackedMs = computed(() =>
    weekDays.value.reduce((sum, day) => {
      const perRoot = day.isViewed
        ? day.roots.reduce((s, r) => s + tracker.getSubtreeMs(r), 0)
        : day.roots.reduce((s, r) => s + rawSubtreeMs(r, day.timers), 0)
      return sum + perRoot
    }, 0),
  )

  /** Tally per parsed section, indexed the same as `parsed.value.sections`. */
  const tallies = computed<(PlanTally | null)[]>(() =>
    parsed.value.sections.map((section) => {
      if (!section.tag) return null
      const { trackedMs, limitMs } = collect(section.tag)
      const total = weekTrackedMs.value
      return {
        trackedMs,
        limitMs,
        pctOfLimit: limitMs !== null && limitMs > 0 ? (trackedMs / limitMs) * 100 : null,
        pctOfWeek: total > 0 ? (trackedMs / total) * 100 : null,
      }
    }),
  )

  return {
    weekStartKey,
    weekLabel,
    markdown,
    setMarkdown,
    isEmpty,
    parsed,
    tallies,
    weekTrackedMs,
  }
}
