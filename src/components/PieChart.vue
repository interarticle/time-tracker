<script setup lang="ts">
const props = defineProps<{ ratio: number }>()

function arc(frac: number): string {
  const a = frac * 2 * Math.PI
  const x = (8 + 7 * Math.sin(a)).toFixed(3)
  const y = (8 - 7 * Math.cos(a)).toFixed(3)
  return `M8,8 L8,1 A7,7 0 ${frac > 0.5 ? 1 : 0},1 ${x},${y}Z`
}
</script>

<template>
  <svg width="16" height="16" viewBox="0 0 16 16" style="flex-shrink:0;display:block">
    <!-- Track -->
    <circle cx="8" cy="8" r="7" fill="#e8e8e8"/>
    <!-- Fill up to 100% -->
    <circle v-if="ratio >= 1" cx="8" cy="8" r="7" fill="#4a90d9"/>
    <path v-else-if="ratio > 0" :d="arc(ratio)" fill="#4a90d9"/>
    <!-- Overflow in red -->
    <circle v-if="ratio >= 2" cx="8" cy="8" r="7" fill="#e53935"/>
    <path v-else-if="ratio > 1" :d="arc(ratio - 1)" fill="#e53935"/>
  </svg>
</template>
