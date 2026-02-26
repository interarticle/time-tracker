<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { PlanningKey } from '@/types'
import { formatMsHM, formatMinutes, parseClockHHMM } from '@/utils/format'

const planning = inject(PlanningKey)!

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
    <span class="info-item">
      <span class="info-label">Start:</span>
      <input
        v-if="editingStart"
        v-model="startInput"
        class="start-input"
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
.start-input {
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
