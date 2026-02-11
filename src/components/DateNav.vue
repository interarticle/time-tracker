<script setup lang="ts">
import { inject } from 'vue'
import { TimeTrackerKey } from '@/types'

const tracker = inject(TimeTrackerKey)!
</script>

<template>
  <nav class="date-nav">
    <button class="nav-btn" @click="tracker.goToPrevDay()" title="Previous day">&larr;</button>
    <span class="date-display">{{ tracker.displayDate.value }}</span>
    <button class="nav-btn" @click="tracker.goToNextDay()" title="Next day">&rarr;</button>
    <button
      v-if="!tracker.isToday.value"
      class="today-btn"
      @click="tracker.goToToday()"
    >
      Today
    </button>
  </nav>
</template>

<style scoped>
.date-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.date-display {
  font-weight: 600;
  min-width: 180px;
  text-align: center;
}
.nav-btn {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 16px;
}
.nav-btn:hover {
  background: #eee;
}
.today-btn {
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 14px;
}
.today-btn:hover {
  background: #357abd;
}
</style>
