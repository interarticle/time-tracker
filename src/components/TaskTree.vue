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
      <TaskNode
        v-for="root in tracker.tree.value.roots"
        :key="root.id"
        :node="root"
        :depth="0"
      />
      <button class="add-root-btn" @click="tracker.addRoot()">+ Add Task</button>
    </template>
  </div>
</template>

<style scoped>
.task-tree {
  padding: 8px 0;
}
.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #888;
}
.add-root-btn {
  margin-top: 8px;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  color: #666;
  font-size: 14px;
}
.add-root-btn:hover {
  border-color: #999;
  color: #333;
}
</style>
