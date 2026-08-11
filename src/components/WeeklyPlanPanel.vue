<script setup lang="ts">
import { inject, ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { TimeTrackerKey } from '@/types'
import { useWeeklyPlan } from '@/composables/useWeeklyPlan'
import { formatMsHM } from '@/utils/format'

const props = defineProps<{
  /** The centred content column the panel docks to the right of. */
  anchorEl?: HTMLElement | null
}>()

const tracker = inject(TimeTrackerKey)!
const plan = useWeeklyPlan(tracker)

// --- Geometry -------------------------------------------------------------
// The panel is position:fixed so it can never widen the document (no new
// horizontal scrollbar), but its `left` tracks the right edge of the centred
// column, so it reads as attached to it. When the remaining space is too
// narrow the panel is simply clipped by the viewport edge; hovering (or
// pinning) slides it left until it fits, overlapping the column if it must.
const PANEL_W = 340
const GAP = 12
const ANCHOR_W = 30 // sliver kept on screen when there is no room at all

const anchorRight = ref(0)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const hovered = ref(false)
const pinned = ref(false)

function measure() {
  viewportWidth.value = window.innerWidth
  const el = props.anchorEl
  anchorRight.value = el ? el.getBoundingClientRect().right : viewportWidth.value
}

const restingLeft = computed(() =>
  Math.min(anchorRight.value + GAP, viewportWidth.value - ANCHOR_W),
)
// Flush to the right viewport edge when opened. Leaving a gap here would create a
// strip that the resting panel covers but the open panel does not, so hovering it
// would open the panel out from under the cursor and oscillate.
const openLeft = computed(() => Math.max(0, viewportWidth.value - PANEL_W))
const isOpen = computed(() => hovered.value || pinned.value)
const left = computed(() =>
  isOpen.value ? Math.min(restingLeft.value, openLeft.value) : restingLeft.value,
)
/** True when the panel does not fit in the space beside the column. */
const isCramped = computed(() => restingLeft.value + PANEL_W > viewportWidth.value)

// Animate only the open/close slide — never the continuous reflow of a resize or
// scroll, where a transition just makes the panel lag behind the column.
const animate = ref(false)
let animTimer: number | undefined
watch(isOpen, () => {
  animate.value = true
  clearTimeout(animTimer)
  animTimer = window.setTimeout(() => { animate.value = false }, 260)
})

const panelStyle = computed(() => ({
  left: `${left.value}px`,
  width: `${PANEL_W}px`,
  transition: animate.value ? 'left 0.22s ease' : 'none',
}))

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    if (props.anchorEl) observer.observe(props.anchorEl)
    observer.observe(document.documentElement)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure)
  observer?.disconnect()
  clearTimeout(animTimer)
})

// --- Editing --------------------------------------------------------------
const editing = ref(false)
const draft = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)

function startEdit() {
  draft.value = plan.markdown.value
  editing.value = true
  pinned.value = true
  nextTick(() => textareaEl.value?.focus())
}
function commitEdit() {
  plan.setMarkdown(draft.value)
  editing.value = false
}
function cancelEdit() {
  editing.value = false
}

const PLACEHOLDER = `# Project name #tag

What this week is about.

- a bullet
- another`
</script>

<template>
  <aside
    class="wp-panel"
    :class="{ 'is-open': isOpen, 'is-cramped': isCramped, 'is-editing': editing }"
    :style="panelStyle"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Spine: always visible, even when the panel is clipped off-screen -->
    <div class="wp-spine" @click="pinned = !pinned" :title="pinned ? 'Unpin panel' : 'Pin panel open'">
      <span class="wp-spine-label">WEEK</span>
    </div>

    <div class="wp-inner">
      <header class="wp-header">
        <span class="wp-title">Weekly plan</span>
        <span class="wp-week">{{ plan.weekLabel.value }}</span>
        <span class="wp-actions">
          <button
            class="wp-btn"
            :class="{ 'is-active': pinned }"
            @click="pinned = !pinned"
            :title="pinned ? 'Unpin' : 'Pin open'"
          >&#x1F4CC;</button>
          <button v-if="!editing" class="wp-btn" @click="startEdit" title="Edit">&#x270E;</button>
        </span>
      </header>

      <!-- Empty state: just one button, nothing else -->
      <div v-if="plan.isEmpty.value && !editing" class="wp-empty">
        <button class="wp-add-btn" @click="startEdit">+ Weekly plan</button>
      </div>

      <!-- Editor -->
      <div v-else-if="editing" class="wp-editor">
        <textarea
          ref="textareaEl"
          v-model="draft"
          class="wp-textarea"
          :placeholder="PLACEHOLDER"
          spellcheck="false"
          @keydown.escape.prevent="cancelEdit"
        ></textarea>
        <div class="wp-editor-actions">
          <span class="wp-hint">H1 = project · first #tag links to tasks</span>
          <button class="wp-btn-text" @click="cancelEdit">Cancel</button>
          <button class="wp-btn-primary" @click="commitEdit">Save</button>
        </div>
      </div>

      <!-- Rendered plan -->
      <div v-else class="wp-body">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="plan.parsed.value.preambleHtml" class="wp-md wp-preamble" v-html="plan.parsed.value.preambleHtml"></div>

        <section
          v-for="(section, i) in plan.parsed.value.sections"
          :key="i"
          class="wp-section"
        >
          <div class="wp-section-head">
            <span class="wp-project">{{ section.title || '(untitled)' }}</span>
            <span v-for="tag in section.tags" :key="tag" class="wp-tag">#{{ tag }}</span>
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="section.contentHtml" class="wp-md" v-html="section.contentHtml"></div>

          <!-- Tallies for the week, from tasks carrying the section's tag -->
          <div v-if="plan.tallies.value[i]" class="wp-tally">
            <span class="wp-tally-main">
              {{ formatMsHM(plan.tallies.value[i]!.trackedMs) }}
              <span class="wp-tally-sep">/</span>
              <span class="wp-tally-limit">{{
                plan.tallies.value[i]!.limitMs !== null ? formatMsHM(plan.tallies.value[i]!.limitMs!) : '—'
              }}</span>
            </span>
            <span
              v-if="plan.tallies.value[i]!.pctOfLimit !== null"
              class="wp-tally-pct"
              :style="{ color: plan.tallies.value[i]!.pctOfLimit! > 100 ? '#c62828' : '#2e7d32' }"
            >{{ Math.round(plan.tallies.value[i]!.pctOfLimit!) }}% used</span>
            <span v-if="plan.tallies.value[i]!.pctOfWeek !== null" class="wp-tally-week">
              {{ Math.round(plan.tallies.value[i]!.pctOfWeek!) }}% of week
            </span>
          </div>
          <div v-else class="wp-tally wp-tally-untagged">no #tag — not tracked</div>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.wp-panel {
  position: fixed;
  top: 12px;
  bottom: 12px;
  display: flex;
  z-index: 40;
  /* `left` transition is bound inline so it applies only to open/close, not resize. */
}

/* Spine handle — the bit that stays reachable when the panel is clipped */
.wp-spine {
  flex-shrink: 0;
  width: 22px;
  background: #f0f0f0;
  border: 1px solid #e0e0e0;
  border-right: none;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: background-color 0.15s;
}
.wp-spine:hover { background: #e4e4e4; }
.wp-spine-label {
  writing-mode: vertical-rl;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #999;
}
.wp-panel.is-open .wp-spine-label { color: #4a90d9; }

.wp-inner {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 0 6px 6px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.wp-panel.is-open .wp-inner {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.13);
}

/* Header */
.wp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.wp-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #888;
}
.wp-week {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  color: #aaa;
}
.wp-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}
.wp-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 3px 4px;
  border-radius: 3px;
  opacity: 0.5;
}
.wp-btn:hover { background: rgba(0, 0, 0, 0.07); opacity: 1; }
.wp-btn.is-active { opacity: 1; }

/* Empty state */
.wp-empty {
  padding: 14px 10px;
}
.wp-add-btn {
  width: 100%;
  background: none;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 7px 10px;
  cursor: pointer;
  color: #888;
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}
.wp-add-btn:hover { border-color: #999; color: #444; }

/* Editor */
.wp-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px;
  gap: 6px;
}
.wp-textarea {
  flex: 1;
  min-height: 200px;
  resize: none;
  border: 1px solid #d5d5d5;
  border-radius: 4px;
  padding: 7px 8px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
}
.wp-textarea:focus { border-color: #4a90d9; }
.wp-editor-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.wp-hint {
  flex: 1;
  font-size: 10px;
  color: #aaa;
}
.wp-btn-text {
  background: none;
  border: none;
  cursor: pointer;
  color: #888;
  font-size: 12px;
  padding: 4px 6px;
}
.wp-btn-text:hover { color: #444; }
.wp-btn-primary {
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.wp-btn-primary:hover { background: #3a7bc0; }

/* Rendered body */
.wp-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 14px;
}
.wp-section + .wp-section {
  margin-top: 12px;
  border-top: 1px solid #f0f0f0;
  padding-top: 10px;
}
.wp-section-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 3px;
}
.wp-project {
  font-size: 13px;
  font-weight: 650;
  color: #222;
}
.wp-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 8px;
  background-color: #e3edf7;
  color: #3a6ea5;
  white-space: nowrap;
}

/* Tallies */
.wp-tally {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 5px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
}
.wp-tally-main { font-weight: 600; color: #333; }
.wp-tally-sep { color: #ccc; margin: 0 1px; }
.wp-tally-limit { color: #999; font-weight: 500; }
.wp-tally-pct { font-weight: 600; }
.wp-tally-week { color: #aaa; }
.wp-tally-untagged {
  font-family: inherit;
  font-size: 10px;
  color: #c8c8c8;
  font-style: italic;
}

/* Markdown content */
.wp-md {
  font-size: 12px;
  line-height: 1.55;
  color: #444;
  overflow-wrap: break-word;
}
.wp-md :deep(p) { margin: 3px 0; }
.wp-md :deep(ul),
.wp-md :deep(ol) { margin: 3px 0; padding-left: 18px; }
.wp-md :deep(li) { margin: 1px 0; }
.wp-md :deep(h2) { font-size: 12px; font-weight: 700; margin: 7px 0 2px; color: #333; }
.wp-md :deep(h3),
.wp-md :deep(h4) { font-size: 11px; font-weight: 700; margin: 6px 0 2px; color: #555; }
.wp-md :deep(code) {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  background: #f4f4f4;
  padding: 1px 3px;
  border-radius: 3px;
}
.wp-md :deep(pre) {
  background: #f6f6f6;
  padding: 6px 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 4px 0;
}
.wp-md :deep(pre code) { background: none; padding: 0; }
.wp-md :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid #e0e0e0;
  color: #777;
}
.wp-md :deep(a) { color: #3a6ea5; }
.wp-md :deep(table) { border-collapse: collapse; font-size: 11px; }
.wp-md :deep(th),
.wp-md :deep(td) { border: 1px solid #e5e5e5; padding: 2px 5px; }
.wp-md :deep(img) { max-width: 100%; }
.wp-md :deep(hr) { border: none; border-top: 1px solid #eee; margin: 6px 0; }

/* On very narrow screens the panel is more overlay than sidebar */
@media (max-width: 600px) {
  .wp-panel { top: 6px; bottom: 6px; }
}
</style>
