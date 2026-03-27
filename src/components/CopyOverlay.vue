<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { TimeTrackerKey } from '@/types'
import { generateDayMarkdown, generateWeekMarkdown, generateRangeMarkdown, getWeekOptions } from '@/utils/markdown'

const tracker = inject(TimeTrackerKey)!

const emit = defineEmits<{ close: [] }>()

type Mode = 'day' | 'week' | 'range'
const mode = ref<Mode>('day')

// Week selection
const weekOptions = computed(() => getWeekOptions(tracker.currentDateKey.value, 12))
const selectedWeek = ref(weekOptions.value[0]?.monday ?? '')

// Range selection
const rangeStart = ref(tracker.currentDateKey.value)
const rangeEnd = ref(tracker.currentDateKey.value)

// Copied feedback
const copied = ref(false)

const markdown = computed(() => {
  if (mode.value === 'day') {
    return generateDayMarkdown(tracker.currentDateKey.value)
  } else if (mode.value === 'week') {
    return generateWeekMarkdown(selectedWeek.value)
  } else {
    const start = rangeStart.value <= rangeEnd.value ? rangeStart.value : rangeEnd.value
    const end = rangeStart.value <= rangeEnd.value ? rangeEnd.value : rangeStart.value
    return generateRangeMarkdown(start, end)
  }
})

watch(mode, () => { copied.value = false })
watch(selectedWeek, () => { copied.value = false })
watch(rangeStart, () => { copied.value = false })
watch(rangeEnd, () => { copied.value = false })

async function copyToClipboard() {
  await navigator.clipboard.writeText(markdown.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <div class="dialog copy-dialog">
        <div class="dialog-header">
          <span class="dialog-title">Copy as Markdown</span>
          <button class="dialog-close" @click="emit('close')">&#x00D7;</button>
        </div>

        <!-- Mode tabs -->
        <div class="mode-tabs">
          <button
            :class="['tab', { active: mode === 'day' }]"
            @click="mode = 'day'"
          >Day</button>
          <button
            :class="['tab', { active: mode === 'week' }]"
            @click="mode = 'week'"
          >Week</button>
          <button
            :class="['tab', { active: mode === 'range' }]"
            @click="mode = 'range'"
          >Date Range</button>
        </div>

        <!-- Week selector -->
        <div v-if="mode === 'week'" class="selector-row">
          <select v-model="selectedWeek" class="week-select">
            <option v-for="w in weekOptions" :key="w.monday" :value="w.monday">
              {{ w.label }}
            </option>
          </select>
        </div>

        <!-- Range selector -->
        <div v-if="mode === 'range'" class="selector-row range-row">
          <label class="range-label">
            From
            <input type="date" v-model="rangeStart" class="date-input" />
          </label>
          <label class="range-label">
            To
            <input type="date" v-model="rangeEnd" class="date-input" />
          </label>
        </div>

        <!-- Preview -->
        <textarea
          :value="markdown"
          readonly
          class="md-textarea"
          spellcheck="false"
        ></textarea>

        <!-- Actions -->
        <div class="dialog-actions">
          <button class="btn-copy" :class="{ 'btn-copied': copied }" @click="copyToClipboard">
            {{ copied ? 'Copied!' : 'Copy to clipboard' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
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
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.copy-dialog {
  width: 640px;
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

.mode-tabs {
  display: flex;
  gap: 0;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
}
.tab {
  flex: 1;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  background: #fafafa;
  border: none;
  border-right: 1px solid #ddd;
  cursor: pointer;
  color: #555;
  transition: background 0.15s, color 0.15s;
}
.tab:last-child { border-right: none; }
.tab:hover { background: #f0f0f0; }
.tab.active {
  background: #e8f0fe;
  color: #1a56a0;
  font-weight: 600;
}

.selector-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.week-select {
  flex: 1;
  padding: 5px 8px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 4px;
  outline: none;
  background: #fff;
}
.week-select:focus { border-color: #4a90d9; }

.range-row {
  display: flex;
  gap: 12px;
}
.range-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #555;
}
.date-input {
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 4px;
  outline: none;
}
.date-input:focus { border-color: #4a90d9; }

.md-textarea {
  width: 100%;
  height: 360px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  resize: vertical;
  outline: none;
  background: #fafafa;
  color: #333;
}
.md-textarea:focus { border-color: #4a90d9; }

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-copy {
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  background: #1565c0;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-copy:hover { background: #0d47a1; }
.btn-copied {
  background: #2e7d32;
}
.btn-copied:hover { background: #1b5e20; }
</style>
