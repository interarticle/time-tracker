<script setup lang="ts">
import { inject } from 'vue'
import { TimeTrackerKey } from '@/types'
import TaskNode from './TaskNode.vue'

const tracker = inject(TimeTrackerKey)!
</script>

<template>
  <div class="task-tree">
    <div v-if="tracker.tree.value.roots.length === 0" class="empty-state">
      <p>No tasks yet.</p>
      <button class="add-root-btn" @click="tracker.addRoot()">+ Add Task</button>
    </div>
    <template v-else>
      <ul class="task-list">
        <TaskNode
          v-for="root in tracker.tree.value.roots"
          :key="root.id"
          :node="root"
          :depth="0"
        />
      </ul>
      <button class="add-root-btn" @click="tracker.addRoot()">+ Add Task</button>
    </template>
  </div>
</template>

<style scoped>
.task-tree {
  padding: 4px 0;
}
.task-list {
  margin: 0;
  padding: 0;
}
.empty-state {
  text-align: center;
  padding: 48px 0;
  color: #999;
}
.empty-state p {
  margin: 0 0 12px;
}
.add-root-btn {
  margin-top: 8px;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 5px 16px;
  cursor: pointer;
  color: #888;
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}
.add-root-btn:hover {
  border-color: #999;
  color: #444;
}
</style>
