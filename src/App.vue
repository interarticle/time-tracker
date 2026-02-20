<script setup lang="ts">
import { provide, computed, ref } from 'vue'
import { TimeTrackerKey } from '@/types'
import { useTimeTracker } from '@/composables/useTimeTracker'
import { formatMs } from '@/utils/format'
import DateNav from '@/components/DateNav.vue'
import TaskTree from '@/components/TaskTree.vue'

const tracker = useTimeTracker()
const buildInfo = `${__COMMIT__} · built on ${__BUILD_TIME__}`
provide(TimeTrackerKey, tracker)

const totalDayMs = computed(() => tracker.getTotalDayMs())
const totalDayLimitMs = computed(() => tracker.getTotalDayLimitMs())

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
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>Time Tracker</h1>
      <DateNav />
      <div class="day-total">
        <span class="total-time">{{ formatMs(totalDayMs) }}</span>
        <span v-if="totalDayLimitMs !== null" class="total-limit">/{{ formatMs(totalDayLimitMs) }}</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" @click="openDataDialog" title="Import / Export">&#x1F4BE;</button>
        <button class="icon-btn" @click="tracker.sendTestNotification()" title="Test notifications">&#x1F514;</button>
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
      <TaskTree />
    </main>
    <footer class="build-info">{{ buildInfo }}</footer>
  </div>

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
</style>
