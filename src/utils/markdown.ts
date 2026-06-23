import type { TaskNode, CommittedNode } from '@/types'
import { BUFFER_NAME } from '@/types'
import { loadTree, loadDayState, loadPlanningDay, loadPlanningSettings } from '@/utils/storage'
import { formatMs, formatMsHM, formatDateDisplay, formatMinutes, addDays } from '@/utils/format'

// ─── Helpers ────────────────────────────────────────────────────

function getLeafMs(node: TaskNode, timers: Record<string, { accumulatedMs: number; nightAccumulatedMs?: number }>): number {
  if (node.children.length > 0) {
    return node.children.reduce((s, c) => s + getLeafMs(c, timers), 0)
  }
  const t = timers[node.id]
  return (t?.accumulatedMs ?? 0) + (t?.nightAccumulatedMs ?? 0)
}

function getDayOnlyLeafMs(node: TaskNode, timers: Record<string, { accumulatedMs: number; nightAccumulatedMs?: number }>): number {
  if (node.children.length > 0) {
    return node.children.reduce((s, c) => s + getDayOnlyLeafMs(c, timers), 0)
  }
  const t = timers[node.id]
  return t?.accumulatedMs ?? 0
}

function getSubtreeLimitMs(node: TaskNode): number | null {
  // Deprioritized leaves contribute a zero limit, matching the live tracker.
  if (node.children.length === 0) return node.deprioritized ? (node.timeLimitMs === null ? null : 0) : node.timeLimitMs
  let total = 0
  let hasAny = false
  for (const c of node.children) {
    const sub = getSubtreeLimitMs(c)
    if (sub !== null) { total += sub; hasAny = true }
  }
  return hasAny ? total : null
}

function getCommittedSubtreeMs(node: CommittedNode): number {
  if (node.children.length === 0) return node.durationMs ?? 0
  return node.children.reduce((s, c) => s + getCommittedSubtreeMs(c), 0)
}

// ─── Single day markdown ────────────────────────────────────────

export function generateDayMarkdown(dateKey: string): string {
  const tree = loadTree(dateKey)
  const dayState = loadDayState(dateKey)
  const planData = loadPlanningDay(dateKey)
  const planSettings = loadPlanningSettings()
  const planningEnabled = planSettings.enabled

  const timers = dayState.timers
  const totalMs = tree.roots.reduce((s, r) => s + getLeafMs(r, timers), 0)

  const lines: string[] = []

  lines.push(`# ${formatDateDisplay(dateKey)}`)
  lines.push('')
  lines.push('> **Field guide** (for agent ingestion):')
  lines.push('> - **Time** = actual tracked time (day + night if applicable)')
  lines.push('> - **Limit** = budgeted time cap for the task')
  lines.push('> - **% of day** = this item\'s share of total tracked time')
  lines.push('> - **Committed** = fixed-duration obligations (meetings, etc.) set during planning')
  lines.push('> - **Planned** = flexible tasks with time limits')
  lines.push('> - **Buffer** = unstructured time (lunch, breaks, context switches)')
  lines.push('')

  // Summary
  const committedTotalMs = planData.roots.reduce((s, r) => s + getCommittedSubtreeMs(r), 0)
  const grandTotal = totalMs + (planningEnabled ? committedTotalMs : 0)

  lines.push('## Summary')
  lines.push(`- **Total tracked:** ${formatMs(grandTotal)}`)
  if (planData.dailyLimitMs !== undefined) {
    lines.push(`- **Daily limit:** ${formatMsHM(planData.dailyLimitMs)}`)
  }
  if (planData.startOfDayMinutes !== null) {
    lines.push(`- **Start of day:** ${formatMinutes(planData.startOfDayMinutes)}`)
  }
  if (planData.startOfDayMinutes !== null && planData.dailyLimitMs !== undefined) {
    const endMin = planData.startOfDayMinutes + planData.dailyLimitMs / 60000
    lines.push(`- **End of day:** ${formatMinutes(endMin)}`)
  }
  lines.push('')

  // Committed section (if planning)
  if (planningEnabled && planData.roots.length > 0) {
    lines.push('## Committed')
    function renderCommitted(nodes: CommittedNode[], indent: number) {
      for (const node of nodes) {
        const prefix = '  '.repeat(indent) + '- '
        const dur = getCommittedSubtreeMs(node)
        const durStr = node.children.length > 0
          ? ` — ${formatMsHM(dur)} (rollup)`
          : node.durationMs !== null ? ` — ${formatMsHM(node.durationMs)}` : ''
        lines.push(`${prefix}**${node.name || '(unnamed)'}**${durStr}`)
        if (node.children.length > 0) {
          renderCommitted(node.children, indent + 1)
        }
      }
    }
    renderCommitted(planData.roots, 0)
    lines.push('')
    lines.push(`**Committed total:** ${formatMsHM(committedTotalMs)}`)
    lines.push('')
  }

  // Planned / tracked tasks
  if (tree.roots.length > 0) {
    lines.push(planningEnabled ? '## Planned Tasks' : '## Tasks')

    function renderTasks(nodes: TaskNode[], indent: number) {
      for (const node of nodes) {
        const prefix = '  '.repeat(indent) + '- '
        const ms = getLeafMs(node, timers)
        const limit = getSubtreeLimitMs(node)
        const completed = node.completed ? ' [DONE]' : ''

        let detail = formatMs(ms)
        // Percentage of day (only at root level or if meaningful)
        if (indent === 0 && grandTotal > 0) {
          detail += ` (${Math.round((ms / grandTotal) * 100)}% of day)`
        }
        if (limit !== null) {
          detail += ` / limit ${formatMs(limit)}`
          if (ms > limit) detail += ' OVER'
        }

        lines.push(`${prefix}**${node.name || '(unnamed)'}**${completed} — ${detail}`)
        if (node.children.length > 0) {
          renderTasks(node.children, indent + 1)
        }
      }
    }
    renderTasks(tree.roots, 0)
    lines.push('')
  }

  // Buffer
  if (planningEnabled) {
    const bufLimitMs = planData.bufferLimitMs
    const dayOnlyTaskMs = tree.roots.reduce((s, r) => s + getDayOnlyLeafMs(r, timers), 0)
    const totalLimitMs = ((() => {
      let sum = 0; let any = false
      for (const r of tree.roots) { const l = getSubtreeLimitMs(r); if (l !== null) { sum += l; any = true } }
      return any ? sum : null
    })() ?? 0) + (bufLimitMs ?? 0)

    if (totalLimitMs > 0 && planData.startOfDayMinutes !== null) {
      const startMs = planData.startOfDayMinutes * 60000
      const effectiveEndMs = startMs + totalLimitMs

      // Match UI logic: before EOD use elapsed time, after EOD use full day budget
      const now = new Date()
      const nowFromMidnight =
        (now.getHours() * 60 + now.getMinutes()) * 60000 +
        now.getSeconds() * 1000
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const isToday = dateKey === todayKey

      let bufferMs: number
      if (isToday && nowFromMidnight < effectiveEndMs) {
        // Before EOD: elapsed time since start minus task time
        const elapsed = Math.max(0, nowFromMidnight - startMs)
        bufferMs = elapsed - dayOnlyTaskMs
      } else {
        // After EOD or past day: full day budget minus task time
        bufferMs = totalLimitMs - dayOnlyTaskMs
      }

      const bufferStr = bufferMs < 0 ? '−' + formatMs(-bufferMs) : formatMs(bufferMs)
      lines.push('## Buffer')
      lines.push(`- **${BUFFER_NAME}:** ${bufferStr}${bufLimitMs !== undefined ? ` / limit ${formatMsHM(bufLimitMs)}` : ''}`)
      lines.push('')
    }
  }

  // Category breakdown
  if (planningEnabled && (tree.roots.length > 0 || planData.roots.length > 0)) {
    const cats = buildCategories(tree.roots, timers, planData.roots, planData.bufferLimitMs, planningEnabled, totalMs, committedTotalMs)
    if (cats.length > 0) {
      lines.push('## Category Breakdown')
      lines.push('| Category | Used | Planned/Limit | % of day |')
      lines.push('|----------|------|---------------|----------|')
      for (const c of cats) {
        const limitStr = c.limitMs !== null ? formatMsHM(c.limitMs) : '—'
        lines.push(`| ${c.name} | ${formatMsHM(c.usedMs)} | ${limitStr} | ${c.pct}% |`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

interface CategorySummary {
  name: string
  usedMs: number
  limitMs: number | null
  pct: number
}

function buildCategories(
  taskRoots: TaskNode[],
  timers: Record<string, { accumulatedMs: number; nightAccumulatedMs?: number }>,
  committedRoots: CommittedNode[],
  bufferLimitMs: number | undefined,
  _planningEnabled: boolean,
  _totalTaskMs: number,
  _committedTotalMs: number,
): CategorySummary[] {
  const grandTotal = _totalTaskMs + _committedTotalMs
  const committedMap = new Map<string, CommittedNode>()
  for (const r of committedRoots) committedMap.set(r.name.toLowerCase(), r)
  const plannedMap = new Map<string, TaskNode>()
  for (const r of taskRoots) plannedMap.set(r.name.toLowerCase(), r)

  const allKeys = new Set([...committedMap.keys(), ...plannedMap.keys()])
  const entries: CategorySummary[] = []

  for (const key of allKeys) {
    if (!key) continue
    const cRoot = committedMap.get(key)
    const pRoot = plannedMap.get(key)
    const cMs = cRoot ? getCommittedSubtreeMs(cRoot) : 0
    const pMs = pRoot ? getLeafMs(pRoot, timers) : 0
    const usedMs = cMs + pMs

    let limitMs: number | null
    if (pRoot) {
      const planLimit = getSubtreeLimitMs(pRoot)
      limitMs = (planLimit !== null || cMs > 0) ? cMs + (planLimit ?? 0) : null
    } else {
      limitMs = cMs
    }

    entries.push({
      name: cRoot?.name || pRoot?.name || key,
      usedMs,
      limitMs,
      pct: grandTotal > 0 ? Math.round((usedMs / grandTotal) * 100) : 0,
    })
  }

  return entries
}

// ─── Week markdown ──────────────────────────────────────────────

function getMonday(dateKey: string): string {
  const parts = dateKey.split('-').map(Number)
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday=1
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekLabel(mondayKey: string): string {
  const fri = addDays(mondayKey, 4)
  return `${formatDateDisplay(mondayKey)} — ${formatDateDisplay(fri)}`
}

export function getWeekOptions(currentDateKey: string, count = 8): { monday: string; label: string }[] {
  const thisMonday = getMonday(currentDateKey)
  const weeks: { monday: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const monday = addDays(thisMonday, -7 * i)
    weeks.push({ monday, label: getWeekLabel(monday) })
  }
  return weeks
}

export function generateWeekMarkdown(mondayKey: string): string {
  const lines: string[] = []
  const fri = addDays(mondayKey, 4)
  lines.push(`# Week of ${formatDateDisplay(mondayKey)} — ${formatDateDisplay(fri)}`)
  lines.push('')
  lines.push('> **Field guide** (for agent ingestion):')
  lines.push('> - **Time** = actual tracked time')
  lines.push('> - **Limit** = budgeted time cap')
  lines.push('> - **% of day** = share of that day\'s total tracked time')
  lines.push('> - Each day below is a self-contained daily report')
  lines.push('> - The weekly summary at the end aggregates time by top-level category')
  lines.push('')

  // Aggregate across the week
  const weekCats = new Map<string, { usedMs: number; limitMs: number }>()
  let weekTotalMs = 0
  const dayKeys: string[] = []

  for (let i = 0; i < 7; i++) {
    const dk = addDays(mondayKey, i)
    dayKeys.push(dk)
  }

  // Generate each day + collect aggregation
  for (const dk of dayKeys) {
    const tree = loadTree(dk)
    const dayState = loadDayState(dk)
    const planData = loadPlanningDay(dk)
    const timers = dayState.timers

    const dayTaskMs = tree.roots.reduce((s, r) => s + getLeafMs(r, timers), 0)
    const committedMs = planData.roots.reduce((s, r) => s + getCommittedSubtreeMs(r), 0)
    const dayTotal = dayTaskMs + committedMs

    if (dayTotal === 0 && tree.roots.length === 0 && planData.roots.length === 0) {
      continue // skip empty days
    }

    weekTotalMs += dayTotal

    // Aggregate by root task name
    for (const r of tree.roots) {
      const key = r.name.toLowerCase() || '(unnamed)'
      const ms = getLeafMs(r, timers)
      const limit = getSubtreeLimitMs(r)
      const prev = weekCats.get(key) ?? { usedMs: 0, limitMs: 0 }
      prev.usedMs += ms
      if (limit !== null) prev.limitMs += limit
      weekCats.set(key, prev)
    }
    for (const r of planData.roots) {
      const key = r.name.toLowerCase() || '(unnamed)'
      const ms = getCommittedSubtreeMs(r)
      const prev = weekCats.get(key) ?? { usedMs: 0, limitMs: 0 }
      prev.usedMs += ms
      prev.limitMs += ms
      weekCats.set(key, prev)
    }

    // Append this day's markdown (as sub-section, demoted headings)
    const dayMd = generateDayMarkdown(dk)
    // Demote headings: # → ##, ## → ###
    const demoted = dayMd.replace(/^(#+)/gm, (m) => m + '#')
    lines.push(demoted)
    lines.push('---')
    lines.push('')
  }

  // Weekly summary
  lines.push('## Weekly Summary')
  lines.push(`- **Total tracked:** ${formatMs(weekTotalMs)}`)
  lines.push('')

  if (weekCats.size > 0) {
    lines.push('### Time by Category (Week Total)')
    lines.push('| Category | Total Used | Total Limit | % of week |')
    lines.push('|----------|-----------|-------------|-----------|')
    const sorted = [...weekCats.entries()].sort((a, b) => b[1].usedMs - a[1].usedMs)
    for (const [name, data] of sorted) {
      const pct = weekTotalMs > 0 ? Math.round((data.usedMs / weekTotalMs) * 100) : 0
      const limitStr = data.limitMs > 0 ? formatMsHM(data.limitMs) : '—'
      lines.push(`| ${name} | ${formatMsHM(data.usedMs)} | ${limitStr} | ${pct}% |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Date range markdown ────────────────────────────────────────

export function generateRangeMarkdown(startKey: string, endKey: string): string {
  const lines: string[] = []
  lines.push(`# ${formatDateDisplay(startKey)} — ${formatDateDisplay(endKey)}`)
  lines.push('')

  const rangeCats = new Map<string, { usedMs: number; limitMs: number }>()
  let rangeTotalMs = 0

  let dk = startKey
  while (dk <= endKey) {
    const tree = loadTree(dk)
    const dayState = loadDayState(dk)
    const planData = loadPlanningDay(dk)
    const timers = dayState.timers

    const dayTaskMs = tree.roots.reduce((s, r) => s + getLeafMs(r, timers), 0)
    const committedMs = planData.roots.reduce((s, r) => s + getCommittedSubtreeMs(r), 0)
    const dayTotal = dayTaskMs + committedMs

    if (dayTotal > 0 || tree.roots.length > 0 || planData.roots.length > 0) {
      rangeTotalMs += dayTotal

      for (const r of tree.roots) {
        const key = r.name.toLowerCase() || '(unnamed)'
        const ms = getLeafMs(r, timers)
        const limit = getSubtreeLimitMs(r)
        const prev = rangeCats.get(key) ?? { usedMs: 0, limitMs: 0 }
        prev.usedMs += ms
        if (limit !== null) prev.limitMs += limit
        rangeCats.set(key, prev)
      }
      for (const r of planData.roots) {
        const key = r.name.toLowerCase() || '(unnamed)'
        const ms = getCommittedSubtreeMs(r)
        const prev = rangeCats.get(key) ?? { usedMs: 0, limitMs: 0 }
        prev.usedMs += ms
        prev.limitMs += ms
        rangeCats.set(key, prev)
      }

      const dayMd = generateDayMarkdown(dk)
      const demoted = dayMd.replace(/^(#+)/gm, (m) => m + '#')
      lines.push(demoted)
      lines.push('---')
      lines.push('')
    }

    dk = addDays(dk, 1)
  }

  lines.push('## Range Summary')
  lines.push(`- **Total tracked:** ${formatMs(rangeTotalMs)}`)
  lines.push('')

  if (rangeCats.size > 0) {
    lines.push('### Time by Category')
    lines.push('| Category | Total Used | Total Limit | % of range |')
    lines.push('|----------|-----------|-------------|------------|')
    const sorted = [...rangeCats.entries()].sort((a, b) => b[1].usedMs - a[1].usedMs)
    for (const [name, data] of sorted) {
      const pct = rangeTotalMs > 0 ? Math.round((data.usedMs / rangeTotalMs) * 100) : 0
      const limitStr = data.limitMs > 0 ? formatMsHM(data.limitMs) : '—'
      lines.push(`| ${name} | ${formatMsHM(data.usedMs)} | ${limitStr} | ${pct}% |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
