<script setup lang="ts">
import { inject } from 'vue'
import { PlanningKey } from '@/types'
import { formatMsHM } from '@/utils/format'
import TaskTree from './TaskTree.vue'

const planning = inject(PlanningKey)!
</script>

<template>
  <div class="committed-section">
    <div class="section-header">
      <span class="section-label">COMMITTED</span>
      <span class="section-total">Total: {{ formatMsHM(planning.committedTotalMs.value) }}</span>
    </div>
    <TaskTree mode="committed" />
    <button class="add-committed-btn" @click="planning.addCommittedRoot()">
      + Add committed item
    </button>
  </div>
</template>

<style scoped>
.committed-section {
  margin-bottom: 4px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafafa;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #888;
  text-transform: uppercase;
}
.section-total {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #555;
}
.add-committed-btn {
  margin-top: 6px;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 4px 14px;
  cursor: pointer;
  color: #888;
  font-size: 12px;
  transition: border-color 0.15s, color 0.15s;
}
.add-committed-btn:hover {
  border-color: #999;
  color: #444;
}
</style>
