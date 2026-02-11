<script setup lang="ts">
import { provide, computed } from 'vue'
import { TimeTrackerKey } from '@/types'
import { useTimeTracker } from '@/composables/useTimeTracker'
import { formatMs } from '@/utils/format'
import DateNav from '@/components/DateNav.vue'
import TaskTree from '@/components/TaskTree.vue'

const tracker = useTimeTracker()
provide(TimeTrackerKey, tracker)

const totalDayMs = computed(() => tracker.getTotalDayMs())
const totalDayLimitMs = computed(() => tracker.getTotalDayLimitMs())
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
  </div>
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
</style>
