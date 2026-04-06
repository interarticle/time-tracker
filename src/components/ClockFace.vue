<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ ms: number; size?: number }>(), { size: 16 })

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const r = computed(() => props.size / 2 - 1)

// Tick marks at 12, 3, 6, 9
const ticks = computed(() => {
  const tickLen = props.size * 0.18
  return [0, 1, 2, 3].map(i => {
    const angle = i * Math.PI / 2
    return {
      x1: cx.value + r.value * Math.sin(angle),
      y1: cy.value - r.value * Math.cos(angle),
      x2: cx.value + (r.value - tickLen) * Math.sin(angle),
      y2: cy.value - (r.value - tickLen) * Math.cos(angle),
    }
  })
})

// Hand angles from duration
const totalMinutes = computed(() => Math.abs(props.ms) / 60000)
const minuteAngle = computed(() => (totalMinutes.value % 60) / 60 * 360)
const hourAngle = computed(() => (totalMinutes.value / 60 % 12) / 12 * 360)

// Hand endpoints
const minuteHand = computed(() => {
  const len = r.value * 0.72
  const a = minuteAngle.value * Math.PI / 180
  return { x: cx.value + len * Math.sin(a), y: cy.value - len * Math.cos(a) }
})
const hourHand = computed(() => {
  const len = r.value * 0.48
  const a = hourAngle.value * Math.PI / 180
  return { x: cx.value + len * Math.sin(a), y: cy.value - len * Math.cos(a) }
})

const handStroke = computed(() => props.size > 20 ? 1.5 : 1)
const hourStroke = computed(() => props.size > 20 ? 2.5 : 1.5)
const tickStroke = computed(() => props.size > 20 ? 1 : 0.75)
const dotR = computed(() => props.size > 20 ? 2 : 1)
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" style="flex-shrink:0;display:block">
    <!-- Face -->
    <circle :cx="cx" :cy="cy" :r="r" fill="#f0f0f0" stroke="#ccc" :stroke-width="tickStroke" />
    <!-- Tick marks -->
    <line
      v-for="(t, i) in ticks" :key="i"
      :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2"
      stroke="#999" :stroke-width="tickStroke" stroke-linecap="round"
    />
    <!-- Hour hand -->
    <line :x1="cx" :y1="cy" :x2="hourHand.x" :y2="hourHand.y"
      stroke="#333" :stroke-width="hourStroke" stroke-linecap="round" />
    <!-- Minute hand -->
    <line :x1="cx" :y1="cy" :x2="minuteHand.x" :y2="minuteHand.y"
      stroke="#333" :stroke-width="handStroke" stroke-linecap="round" />
    <!-- Center dot -->
    <circle :cx="cx" :cy="cy" :r="dotR" fill="#333" />
  </svg>
</template>
