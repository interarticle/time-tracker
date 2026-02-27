<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { PlanningKey } from '@/types'
import { formatMsHM, formatMinutes, parseClockHHMM, parseHoursMinutes } from '@/utils/format'

const planning = inject(PlanningKey)!

// EOD countdown — shown when within 1 hour of EOD
const eodCountdown = computed(() => {
  const ms = planning.timeToEodMs.value
  if (ms === null || ms <= 0 || ms > 3600000) return null
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

// --- Daily limit ---
const editingLimit = ref(false)
const limitInput = ref('')

const limitDisplay = computed(() =>
  planning.dailyLimitMs.value !== undefined
    ? formatMsHM(planning.dailyLimitMs.value)
    : '--:--',
)

function startEditLimit() {
  editingLimit.value = true
  const ms = planning.dailyLimitMs.value
  if (ms !== undefined) {
    const totalMinutes = Math.floor(ms / 60000)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    limitInput.value = `${h}:${String(m).padStart(2, '0')}`
  } else {
    limitInput.value = ''
  }
}

function commitLimit() {
  if (limitInput.value.trim() === '') {
    planning.setDailyLimit(undefined)
  } else {
    const ms = parseHoursMinutes(limitInput.value)
    if (ms !== null && ms > 0) planning.setDailyLimit(ms)
  }
  editingLimit.value = false
}

// --- Start of day ---
const editingStart = ref(false)
const startInput = ref('')

const startDisplay = computed(() =>
  planning.startOfDayMinutes.value !== null
    ? formatMinutes(planning.startOfDayMinutes.value)
    : '--:--',
)

const endDisplay = computed(() =>
  planning.endOfDayMinutes.value !== null
    ? formatMinutes(planning.endOfDayMinutes.value)
    : '--:--',
)

function startEditStart() {
  editingStart.value = true
  startInput.value =
    planning.startOfDayMinutes.value !== null
      ? formatMinutes(planning.startOfDayMinutes.value)
      : ''
}

function commitStart() {
  if (startInput.value.trim() === '') {
    planning.setStartOfDay(null)
  } else {
    const mins = parseClockHHMM(startInput.value)
    if (mins !== null) planning.setStartOfDay(mins)
  }
  editingStart.value = false
}
</script>

<template>
  <div class="planning-info-bar">
    <!-- Daily limit -->
    <span class="info-item">
      <span class="info-label">Limit:</span>
      <input
        v-if="editingLimit"
        v-model="limitInput"
        class="info-input"
        placeholder="H:MM"
        @blur="commitLimit"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
        @keydown.escape="editingLimit = false"
        @vue:mounted="($event: any) => $event.el.focus()"
      />
      <span v-else class="info-value editable" @click="startEditLimit">{{ limitDisplay }}</span>
    </span>
    <span class="info-sep">│</span>
    <!-- Start of day -->
    <span class="info-item">
      <span class="info-label">Start:</span>
      <input
        v-if="editingStart"
        v-model="startInput"
        class="info-input"
        placeholder="HH:MM"
        @blur="commitStart"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
        @keydown.escape="editingStart = false"
        @vue:mounted="($event: any) => $event.el.focus()"
      />
      <span v-else class="info-value editable" @click="startEditStart">{{ startDisplay }}</span>
    </span>
    <span class="info-sep">│</span>
    <span class="info-item">
      <span class="info-label">Available:</span>
      <span class="info-value">{{ formatMsHM(planning.timeAvailableMs.value) }}</span>
    </span>
    <span class="info-sep">│</span>
    <span class="info-item">
      <span class="info-label">End of day:</span>
      <span class="info-value">{{ endDisplay }}</span>
    </span>
    <template v-if="eodCountdown !== null">
      <span class="info-sep">│</span>
      <span class="info-item eod-warn">
        <span class="eod-warn-text">⚠ EOD in {{ eodCountdown }}</span>
      </span>
    </template>
  </div>
</template>

<style scoped>
.planning-info-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 4px;
  font-size: 12px;
  color: #555;
  flex-wrap: wrap;
}
.info-item {
  display: flex;
  align-items: center;
  gap: 5px;
}
.info-label {
  color: #999;
}
.info-value {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-weight: 600;
  color: #333;
}
.info-value.editable {
  cursor: pointer;
  text-decoration: underline dotted #aaa;
}
.info-sep {
  color: #ddd;
}
.eod-warn-text {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-weight: 600;
  color: #e67e22;
  animation: eod-pulse 1s ease-in-out infinite;
}
@keyframes eod-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.info-input {
  width: 60px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  padding: 1px 4px;
  outline: none;
}
</style>
