# Plan: Merge useTimeTracker + usePlanning with node abstraction layer

**Status: PENDING — not yet implemented**

## Context

We want to add timer tracking and editable actual time to committed items. The current architecture has two separate composables (`useTimeTracker` at ~906 lines, `usePlanning` at ~417 lines) with a one-way dependency. The timer system only knows about the task tree — it can't look up committed nodes by ID.

Merging the composables is step 1. Step 2 is introducing a thin abstraction layer so that generic logic (timers, accumulation, display, limits) works identically for both node types.

## Key insight: `dayState.timers` is already tree-agnostic

`dayState.timers` is a flat `Record<string, { accumulatedMs, nightAccumulatedMs? }>` keyed by node ID. It doesn't know which tree an ID belongs to. Committed IDs (prefixed `c`) would work identically — `switchTimer('c1abc')` would just work. The gaps are:

1. Committed nodes can't start timers yet (no UI wiring)
2. Read-back functions like `getSubtreeMs` hardcode walking `TaskNode[]`
3. Display code (`checkNotifications`, PiP) does `findNode(tree.value.roots, id)` — task tree only

## Node abstraction

```
                    TaskNode              CommittedNode
limit/budget:       timeLimitMs           durationMs
actual tracked:     dayState.timers[id]   dayState.timers[id] (new)
children:           children              children
leaf check:         children.length === 0 children.length === 0
completion:         completed             completed (new)
```

Introduce a resolver:

```ts
interface TimerNodeInfo {
  name: string
  limitMs: number | null       // timeLimitMs or durationMs
  isLeaf: boolean
  isCommitted: boolean
}

function resolveTimerNode(id: string): TimerNodeInfo | null
```

## What already works for any ID (zero changes)

- `switchTimer(id)`, `stopTimer(id)`, `shareTimer(id)` — just manipulate `runningTimerIds`
- `getDisplayMs(id)`, `getDayDisplayMs(id)` — just read `dayState.timers[id]`
- `isRunning(id)` — just checks `runningTimerIds.includes(id)`
- Timer flush — operates on IDs only

## What needs `resolveTimerNode` (read paths)

| Call site | Currently reads | Resolver provides |
|-----------|----------------|-------------------|
| `checkNotifications()` (line ~553) | `findNode` + `node.timeLimitMs` | `info.limitMs` |
| `clearNotificationState()` (line ~575) | `findNode` + `node.timeLimitMs` | `info.limitMs` |
| `updatePipContent()` (line ~742) | `findNode` + `node.name`, `node.timeLimitMs` | `info.name`, `info.limitMs` |

## What needs abstraction (write paths)

- `setAccumulatedMs(id, ms)` — writes `dayState.timers[id]` (fine), but calls `clearNotificationState(id)` which does `findNode` on task tree only. Needs resolver.
- `deleteCommitted(nodeId)` — currently does NOT clean up running timers. Must mirror `deleteTask`'s timer cleanup (flush, remove from `runningTimerIds`).
- `addCommittedChild(parentId)` — if committed leaf has running timer, must transfer timer data to new child (mirror `addChild`'s transfer logic).
- `setCompleted(nodeId, completed)` — currently task-only. Must resolve which tree owns the node, mutate it, persist the correct store.

## What becomes generic (subtree functions)

Currently hardcoded to `TaskNode`:
- `getSubtreeMs(node)` / `getDaySubtreeMs(node)` — make generic over `{ id, children }[]`, read `dayState.timers[id]` at leaves
- `getSubtreeLimitMs(node)` — make generic using resolver's `limitMs`
- Delete `getCommittedSubtreeMs` (reads `durationMs`). Replace with generic `getSubtreeMs` for actual time. Add `getSubtreePlannedMs` for planned duration rollup (committed-specific, used by `committedTotalMs`).

## What stays type-specific

- Task tree CRUD (`addRoot`, `renameTask`, etc.) — only called from task UI
- Committed tree CRUD (`addCommittedRoot`, etc.) — only called from committed UI

## Implementation steps

### 1. Merge composable code

**File: `src/composables/useTimeTracker.ts`**

- Move all `usePlanning.ts` code into `useTimeTracker()` body
- Remove `tracker: TimeTracker` parameter — replace `tracker.foo` with direct calls
- Name collisions: make `findNode`/`findParent` generic over `{ id: string; children: T[] }`, keep planning's `newId` as `newCommittedId` (preserves `c` prefix)
- Move App.vue bridge watchers (EOD sync, EOD crossing, overcommit->PiP) into the composable
- Add `resolveTimerNode(id)` — checks task tree first, then committed tree
- Update the 6 call sites listed above

### 2. Merge type interfaces

**File: `src/types.ts`**

- Add `TimerNodeInfo` interface
- Add `completed?: boolean` to `CommittedNode`
- Merge `Planning` interface fields into `TimeTracker`
- Keep `PlanningKey` as injection key alias for zero component changes

### 3. Update App.vue

- Remove `usePlanning` import and call
- Remove bridge watchers (now internal)
- Provide merged object under both `TimeTrackerKey` and `PlanningKey`

### 4. Delete `src/composables/usePlanning.ts`

### 5. Lint and build

`npm run lint` then `npm run build`

## File change summary

| File | Change |
|------|--------|
| `src/composables/useTimeTracker.ts` | Absorb usePlanning, add resolver, generic subtree fns, internalize watchers |
| `src/composables/usePlanning.ts` | Delete |
| `src/types.ts` | Add `TimerNodeInfo`, `completed` on `CommittedNode`, merge interfaces |
| `src/App.vue` | Remove usePlanning, remove bridge watchers, provide under both keys |

## What stays unchanged

- All 8 component files (provide under both keys = zero inject changes)
- `src/utils/storage.ts`, `format.ts`, `markdown.ts`
- All component templates and styles

## Verification

1. `npm run lint` — clean
2. `npm run build` — clean
3. Manual: planning toggle, committed CRUD, task CRUD, timers, PiP, buffer, overcommit, date nav, notifications, night mode
