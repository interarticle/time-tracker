<script setup lang="ts">
import { provide, computed, ref, watch, onMounted } from 'vue'
import { TimeTrackerKey, PlanningKey } from '@/types'
import { useTimeTracker } from '@/composables/useTimeTracker'
import { usePlanning } from '@/composables/usePlanning'
import { formatMs, parseHoursMinutes, formatForEdit } from '@/utils/format'
import DateNav from '@/components/DateNav.vue'
import TaskTree from '@/components/TaskTree.vue'
import CommittedSection from '@/components/CommittedSection.vue'
import PlanningInfoBar from '@/components/PlanningInfoBar.vue'
import CategoryBreakdown from '@/components/CategoryBreakdown.vue'
import CopyOverlay from '@/components/CopyOverlay.vue'
import WeeklyPlanPanel from '@/components/WeeklyPlanPanel.vue'

const tracker = useTimeTracker()
const planning = usePlanning(tracker.currentDateKey, tracker)
const buildInfo = `${__COMMIT__} · built on ${__BUILD_TIME__}`
provide(TimeTrackerKey, tracker)
provide(PlanningKey, planning)

// Header rollup (uses full total including night time)
const totalDayMs = computed(() => {
  if (planning.planningEnabled.value) {
    return tracker.getTotalAllMs() + planning.committedTotalMs.value
  }
  return tracker.getTotalAllMs()
})

// Returns true only if running timers were started before EOD (day timers, not night)
function hasDayTimersRunning(eodMs: number): boolean {
  const state = tracker.dayState.value
  if (state.runningTimerIds.length === 0) return false
  const lastChange = state.lastStateChangeAt
  return lastChange !== null && lastChange < eodMs
}

// Sync EOD timestamp to tracker + handle EOD regression
watch(
  () => planning.absoluteEffectiveEndMs.value,
  (eodMs) => {
    tracker.setEodTimestamp(eodMs ?? null)
    if (eodMs !== null && eodMs < Date.now() && hasDayTimersRunning(eodMs)) {
      tracker.stopAllAtEod(eodMs)
      alert('End of day moved to the past — timers stopped.')
    }
  },
  { immediate: true },
)

// Live EOD crossing detection (ticks every 200ms via tracker.now)
watch(
  () => tracker.now.value,
  (nowMs) => {
    const eodMs = planning.absoluteEffectiveEndMs.value
    if (eodMs === null) return
    if (nowMs >= eodMs && hasDayTimersRunning(eodMs)) {
      tracker.stopAllAtEod(eodMs)
      alert('End of day reached — timers stopped.')
    }
  },
)

// Sync overcommit to PiP
watch(
  () => planning.planningEnabled.value ? planning.overcommitMs.value : 0,
  (ms) => tracker.setOvercommitForPip(ms),
  { immediate: true },
)

// Retroactive stop on page load
onMounted(() => {
  const eodMs = planning.absoluteEffectiveEndMs.value
  if (eodMs !== null && Date.now() > eodMs && hasDayTimersRunning(eodMs)) {
    tracker.stopAllAtEod(eodMs)
    alert('Timers were running past end of day — they have been stopped retroactively.')
  }
})
const totalDayLimitMs = computed(() => {
  if (planning.planningEnabled.value) {
    const trackerLimit = tracker.getTotalDayLimitMs()
    const committedTotal = planning.committedTotalMs.value
    if (trackerLimit !== null || committedTotal > 0) {
      return (trackerLimit ?? 0) + committedTotal
    }
    return null
  }
  return tracker.getTotalDayLimitMs()
})

// --- Copy overlay ---
const showCopyOverlay = ref(false)

// --- Help dialog ---
const showHelpDialog = ref(false)

// --- Data dialog ---
const showDataDialog = ref(false)
const importText = ref('')
const importError = ref('')

function openDataDialog() {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (key.startsWith('tt:')) {
      try { data[key] = JSON.parse(localStorage.getItem(key)!) }
      catch { data[key] = localStorage.getItem(key) }
    }
  }
  importText.value = JSON.stringify(data, null, 2)
  importError.value = ''
  showDataDialog.value = true
}

function copyToClipboard() {
  navigator.clipboard.writeText(importText.value)
}

function importData() {
  importError.value = ''
  try {
    const data = JSON.parse(importText.value)
    if (typeof data !== 'object' || data === null) throw new Error('Expected a JSON object')
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('tt:')) throw new Error(`Unexpected key: ${key}`)
      localStorage.setItem(key, JSON.stringify(value))
    }
    window.location.reload()
  } catch (e) {
    importError.value = e instanceof Error ? e.message : 'Invalid JSON'
  }
}

// --- Priority view toggle (not persisted) ---
const priorityView = ref(false)

// Anchor element the weekly-plan panel docks against (the centred column)
const appEl = ref<HTMLElement | null>(null)

// --- Planning dialog ---
const showPlanningDialog = ref(false)
const planningLimitInput = ref('')

function openPlanningDialog() {
  planningLimitInput.value = formatForEdit(planning.dailyLimitMs.value, 'hm')
  showPlanningDialog.value = true
}

function savePlanningLimit() {
  const ms = parseHoursMinutes(planningLimitInput.value)
  if (ms !== null && ms > 0) {
    planning.setDailyLimit(ms)
    planning.setPlanningEnabled(true)
  }
  showPlanningDialog.value = false
}

function disablePlanningAndClose() {
  planning.setPlanningEnabled(false)
  showPlanningDialog.value = false
}
</script>

<template>
  <div ref="appEl" class="app">
    <header class="header">
      <h1>Time Tracker</h1>
      <DateNav />
      <div class="day-total">
        <span class="total-time">{{ formatMs(totalDayMs) }}</span>
        <span v-if="totalDayLimitMs !== null" class="total-limit">/{{ formatMs(totalDayLimitMs) }}</span>
      </div>
      <div class="header-actions">
        <button
          class="icon-btn sigma-btn"
          :class="{ 'sigma-active': planning.planningEnabled.value }"
          @click="openPlanningDialog"
        >Σ</button>
        <button
          class="icon-btn sigma-btn"
          :class="{ 'sigma-active': priorityView }"
          @click="priorityView = !priorityView"
          title="Priority view"
        >P&#x2193;</button>
        <button class="icon-btn" @click="showCopyOverlay = true" title="Copy as Markdown">&#x1F4CB;</button>
        <button class="icon-btn" @click="showHelpDialog = true" title="Help">?</button>
        <button class="icon-btn" @click="openDataDialog" title="Import / Export">&#x1F4BE;</button>
        <button class="icon-btn" @click="tracker.sendTestNotification()" title="Test notifications">&#x1F514;</button>
        <button
          v-if="tracker.isToday.value && tracker.dayState.value.runningTimerIds.length > 0"
          class="icon-btn"
          @click="tracker.openPip(true)"
          title="Open Picture-in-Picture"
        >PiP</button>
        <button
          v-if="tracker.isToday.value && tracker.dayState.value.runningTimerIds.length > 0"
          class="stop-all-btn"
          @click="tracker.stopAll()"
        >
          Stop All
        </button>
      </div>
    </header>
    <main>
      <template v-if="planning.planningEnabled.value">
        <CommittedSection />
        <PlanningInfoBar />
        <TaskTree mode="planned" :priority="priorityView" />
        <CategoryBreakdown />
      </template>
      <template v-else>
        <TaskTree :priority="priorityView" />
      </template>
    </main>
    <footer class="build-info">{{ buildInfo }}</footer>
  </div>

  <!-- Weekly plan: docked to the right of the centred column -->
  <WeeklyPlanPanel :anchor-el="appEl" />

  <!-- Planning dialog -->
  <Teleport to="body">
    <div v-if="showPlanningDialog" class="overlay" @click.self="showPlanningDialog = false">
      <div class="dialog planning-dialog">
        <div class="dialog-header">
          <span class="dialog-title">Planning Mode</span>
          <button class="dialog-close" @click="showPlanningDialog = false">&#x00D7;</button>
        </div>
        <div class="planning-form">
          <label class="planning-label">
            Next daily limit:
            <input
              v-model="planningLimitInput"
              class="planning-input"
              placeholder="H:MM"
              @keydown.enter="savePlanningLimit"
              @vue:mounted="($event: any) => { $event.el.focus(); $event.el.select() }"
            />
          </label>
          <span class="planning-hint">hours:minutes (e.g. 8:00)</span>
        </div>
        <div class="dialog-actions">
          <button
            v-if="planning.planningEnabled.value"
            class="btn-disable-planning"
            @click="disablePlanningAndClose"
          >Disable planning</button>
          <div style="flex:1"></div>
          <button class="btn-save-planning" @click="savePlanningLimit">Save</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Help dialog -->
  <Teleport to="body">
    <div v-if="showHelpDialog" class="overlay" @click.self="showHelpDialog = false">
      <div class="dialog help-dialog">
        <div class="dialog-header">
          <span class="dialog-title">How Time Tracker works</span>
          <button class="dialog-close" @click="showHelpDialog = false">&#x00D7;</button>
        </div>
        <div class="help-body">

          <section>
            <h3>Task tree</h3>
            <p>Tasks are organised as a tree. Rows marked <kbd>●</kbd> are <strong>leaves</strong> — only leaves can run timers. Rows marked <kbd>▾</kbd> are <strong>parents</strong> and show rolled-up totals from all their descendants.</p>
          </section>

          <section>
            <h3>Rollups</h3>
            <p>A parent's time column shows the <strong>sum of all leaf times</strong> in its subtree. A parent's limit column shows the <strong>sum of all leaf limits</strong> in its subtree (only leaves that have a limit are counted). Root-level rows also show two percentages: <em>time %</em> (share of total day time) and <em>limit %</em> (share of total day limits).</p>
          </section>

          <section>
            <h3>Adding a subtask to a leaf</h3>
            <p>When you press <kbd>↳</kbd> on a leaf that already has accumulated time, that leaf becomes a parent and its accumulated time is <strong>automatically transferred to the new first child</strong>. Any running timer is stopped first. Subsequent children added to the same parent start at zero.</p>
            <p><strong>Warning:</strong> if you later delete that first child, its transferred time is permanently lost — it is not returned to the parent.</p>
          </section>

          <section>
            <h3>Timer buttons</h3>
            <table class="help-table">
              <tr><td><kbd>▶</kbd></td><td><strong>Switch</strong> — stop all running timers and start this one exclusively.</td></tr>
              <tr><td><kbd>■</kbd></td><td><strong>Stop</strong> — stop this timer.</td></tr>
              <tr><td><kbd>+</kbd></td><td><strong>Share</strong> — start this timer alongside any currently running timers. Elapsed time is divided equally among all running timers on every tick.</td></tr>
            </table>
          </section>

          <section>
            <h3>Shared / parallel timers</h3>
            <p>When multiple timers run simultaneously (via Share), each tick's elapsed time is split equally among all running timers. For example, two timers running for 10 minutes each record 5 minutes apiece. This models time spent across parallel activities.</p>
          </section>

          <section>
            <h3>Structure buttons</h3>
            <table class="help-table">
              <tr><td><kbd>↳</kbd></td><td><strong>Add child</strong> — nest a new task under this one.</td></tr>
              <tr><td><kbd>↓</kbd></td><td><strong>Add sibling</strong> — add a new task at the same level, below this one.</td></tr>
              <tr><td><kbd>×</kbd></td><td><strong>Delete</strong> — remove this task and all its children. Timer data for deleted tasks is also removed from the day state.</td></tr>
            </table>
            <p>Structure buttons appear on hover.</p>
          </section>

          <section>
            <h3>Time limits &amp; warnings</h3>
            <p>Click the limit column on any leaf to set a limit (<code>H:MM:SS</code> format, leave blank to clear). A row pulses <span class="swatch warn">yellow</span> when <strong>≥ 80 % used and ≤ 10 minutes remaining</strong>. It pulses <span class="swatch danger">red</span> when the limit is exceeded.</p>
          </section>

          <section>
            <h3>Editing time</h3>
            <p>Click the time column on a <strong>stopped</strong> leaf to edit its accumulated time directly. This works on both today and past dates.</p>
          </section>

          <section>
            <h3>Date navigation</h3>
            <p>Use <kbd>←</kbd> <kbd>→</kbd> to browse days. Each day has its own independent task tree and timer data — changing today's tree does not affect yesterday's. You can edit past-day times but cannot start timers on past dates.</p>
          </section>

          <section>
            <h3>Picture-in-Picture</h3>
            <p>When you switch to another browser tab with timers running, a floating PiP window appears showing all active counters, their limits, and a Stop All button. It closes automatically when you return to this tab or all timers stop.</p>
          </section>

          <section>
            <h3>Planning mode</h3>
            <p>Click <kbd>Σ</kbd> in the header to enable planning mode. Set a daily limit (total work hours). The <strong>Committed</strong> section holds fixed-duration obligations (meetings, etc.). The <strong>info bar</strong> shows start time, available time, and projected end. The <strong>By Category</strong> breakdown merges committed and planned items by root name.</p>
          </section>

          <section>
            <h3>Import / Export</h3>
            <p>The <kbd>💾</kbd> button exports all data as a single JSON object keyed by localStorage key (<code>tt:tree:YYYY-MM-DD</code>, <code>tt:day:YYYY-MM-DD</code>, <code>tt:meta</code>, <code>tt:planning</code>, <code>tt:plan:YYYY-MM-DD</code>). Paste edited JSON back and click <em>Import &amp; reload</em> to restore. Useful for backups or moving data between browsers.</p>
          </section>

        </div>
      </div>
    </div>
  </Teleport>

  <!-- Copy overlay -->
  <CopyOverlay v-if="showCopyOverlay" @close="showCopyOverlay = false" />

  <!-- Data dialog -->
  <Teleport to="body">
    <div v-if="showDataDialog" class="overlay" @click.self="showDataDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <span class="dialog-title">Import / Export</span>
          <button class="dialog-close" @click="showDataDialog = false">&#x00D7;</button>
        </div>
        <p class="dialog-hint">All <code>tt:</code> localStorage keys as JSON. Edit and click Import to restore.</p>
        <textarea v-model="importText" class="data-textarea" spellcheck="false"></textarea>
        <p v-if="importError" class="import-error">{{ importError }}</p>
        <div class="dialog-actions">
          <button class="btn-copy" @click="copyToClipboard">Copy to clipboard</button>
          <button class="btn-import" @click="importData">Import &amp; reload</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  font-size: 14px;
  color: #222;
  background: #fafafa;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app {
  max-width: 860px;
  margin: 0 auto;
  padding: 12px 16px;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 10px;
  margin-bottom: 6px;
}
.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
}
.day-total {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  gap: 1px;
}
.total-time {
  color: #333;
}
.total-limit {
  color: #999;
}
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.icon-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s;
}
.icon-btn:hover {
  background: #f0f0f0;
}
.sigma-btn {
  font-weight: 600;
  color: #555;
}
.sigma-active {
  background: #e8f0fe;
  border-color: #4a90d9;
  color: #1a56a0;
}
.stop-all-btn {
  background: #c62828;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.15s;
}
.stop-all-btn:hover {
  background: #b71c1c;
}
.build-info {
  margin-top: 24px;
  text-align: center;
  font-size: 11px;
  color: #bbb;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
}

/* Dialog */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  padding: 20px;
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dialog-title {
  font-size: 15px;
  font-weight: 600;
}
.dialog-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #888;
  line-height: 1;
  padding: 0 4px;
}
.dialog-close:hover { color: #222; }
.dialog-hint {
  margin: 0;
  font-size: 12px;
  color: #888;
}
.dialog-hint code {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
}
.data-textarea {
  width: 100%;
  height: 320px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  resize: vertical;
  outline: none;
}
.data-textarea:focus { border-color: #4a90d9; }
.import-error {
  margin: 0;
  font-size: 12px;
  color: #c62828;
}
.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}
.btn-copy, .btn-import {
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.15s;
}
.btn-copy {
  background: #f0f0f0;
  color: #333;
}
.btn-copy:hover { background: #e0e0e0; }
.btn-import {
  background: #1565c0;
  color: #fff;
}
.btn-import:hover { background: #0d47a1; }

/* Planning dialog */
.planning-dialog {
  width: 360px;
}
.planning-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.planning-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333;
}
.planning-input {
  width: 90px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
}
.planning-input:focus { border-color: #4a90d9; }
.planning-hint {
  font-size: 11px;
  color: #aaa;
}
.btn-save-planning {
  background: #1565c0;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.15s;
}
.btn-save-planning:hover { background: #0d47a1; }
.btn-disable-planning {
  background: none;
  border: none;
  color: #c62828;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}
.btn-disable-planning:hover { color: #b71c1c; }

/* Help dialog */
.help-dialog {
  width: 620px;
  max-height: calc(100vh - 64px);
}
.help-body {
  overflow-y: auto;
  max-height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}
.help-body section { display: flex; flex-direction: column; gap: 6px; }
.help-body h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #eee;
  padding-bottom: 4px;
}
.help-body p { margin: 0; font-size: 13px; color: #444; line-height: 1.55; }
.help-body kbd {
  display: inline-block;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0 5px;
  font-family: inherit;
  font-size: 12px;
  color: #333;
}
.help-body code {
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.help-table {
  border-collapse: collapse;
  font-size: 13px;
  color: #444;
}
.help-table td { padding: 3px 8px 3px 0; vertical-align: top; }
.help-table td:first-child { white-space: nowrap; }
.swatch {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
.swatch.warn { background: #fff8e1; border: 1px solid #ffe082; }
.swatch.danger { background: #ffebee; border: 1px solid #ef9a9a; }
</style>
