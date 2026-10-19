# Fermas — Frontend / Backend Split & Interface Contract

Two people, one repo: `E:\fermas-vscode\fermas-vscode`.
This document is the frozen seam between us. Anything below the line is a promise; change it together or not at all.

---

## 1. Ownership map

| Path | Owner | Rule |
| :--- | :--- | :--- |
| `src/engine/**` | **Backend** | Frontend never imports a tracer directly. |
| `src/engine/types.ts` | **FROZEN — both** | The contract. Adding an optional field is a frontend+backend change. |
| `src/providers/fermasWebviewProvider.ts` | **Frontend** (it is the bridge + HTML host) | Backend adds no message types here without telling frontend. |
| `src/providers/fermasCodeLensProvider.ts` | **Frontend** | Pure UI affordance. |
| `src/providers/fermasInlayHintsProvider.ts` | **Frontend** | Pure UI affordance. |
| `src/providers/fermasDecorations.ts` | **Frontend** | Pure UI affordance. |
| `src/webview/**` | **Frontend** | Backend does not touch. |
| `src/extension.ts` | **Frontend** | Wiring, commands, registration. |
| `package.json` `contributes` | **Frontend** | Views, commands, menus, configuration. |
| `server/**` | **Backend** | Curriculum server. |
| `examples/**` | **Shared** | Sample programs both sides test against. |
| `esbuild.js` | **Shared** | Both entry points. Announce changes. |

**The one rule that prevents 90% of merge pain:** the frontend only ever consumes `MemorySnapshot[]` and `CurriculumModule[]`. It never reads source text, never regexes code, never evaluates anything. If the UI needs a fact, the backend puts it in the snapshot.

---

## 2. What the frontend consumes

Exactly two types, both already in `src/engine/types.ts`. No additions required for v1.

```ts
MemorySnapshot[]   // the whole trace, one entry per tick
CurriculumModule[] // the lesson list
```

Fields the UI actually reads (everything else is ignored, but safe to keep sending):

| Field | Used by |
| :--- | :--- |
| `tick`, `totalTicks`, `line` | Scrubber, "Tick N of M", editor sync |
| `codeSnippet` | Active-line banner |
| `explanation` | Active-step banner, inlay tooltip |
| `event` | Icon/colour of the current step |
| `callStack[].functionName`, `.line`, `.scope` | Call Stack & Scope panel |
| `scope[].name / .rawType / .value / .type` | Variable table |
| `heap[id].type / .elements / .fields` | Array ribbon, object cards |
| `heap[id].inferredPointers[]` | Pointer badges above array cells |
| `heap[id].activeIndices[]` | Cell highlight on read/write |
| `concurrency.microtasks / .macrotasks / .pendingTasks` | Event-loop swimlanes |
| `stdout[]` | Console |
| `inlayHint` | In-editor hint + panel chip |
| `evaluatedExpression` | Expression card |
| `CurriculumModule.quiz` | Predict-First card |

---

## 3. Message protocol (current, as implemented)

Host → webview:

| Message | Payload | Purpose |
| :--- | :--- | :--- |
| `SET_TRACE` | `{ snapshots, language, currentTick, activeModule? }` | New trace loaded |
| `GOTO_TICK` | `{ tick }` | Host commands the panel to a tick |
| `SET_CURRICULUM` / `OPEN_CURRICULUM` | `{ modules }` | Lesson list |

Webview → host:

| Message | Payload | Purpose |
| :--- | :--- | :--- |
| `STEP_CHANGED` | `{ tick }` | User scrubbed/stepped → host syncs the editor |
| `REQUEST_RETRACE` | `{}` | Re-run the active editor file |
| `REQUEST_CURRICULUM` | `{}` | Fetch lessons |
| `LOAD_MODULE` | `{ id }` | Open a lesson |

Frontend will add (backend: no action needed, these are UI-only):
`OPEN_PANEL`, `SET_VIEW` (`concurrency` | `memory`), `REVEAL_LINE`, `SUBMIT_ANSWER`.

---

## 4. Guarantees the backend must uphold

The UI is written against these. Breaking one is a visible bug in the panel.

1. **`tick` is `1..totalTicks`, contiguous and non-decreasing.** The scrubber's max is `snapshots.length - 1`.
2. **`line` is 1-based and points into the currently open document.** Stale traces against a different file must be re-run, not rendered.
3. **`stdout` is cumulative** (tick N ⊇ tick N-1) and never shrinks.
4. **Heap ids are stable across ticks.** If an object keeps identity, its `@heap:N` must not change between ticks, or nodes teleport in the graph view.
5. **`callStack` is ordered outermost → innermost**; index 0 is the entry frame. Each frame gets its **own** `scope` — do not copy one scope into all frames.
6. **`totalTicks` is identical on every snapshot** in a given trace.
7. **A trace always has ≥ 1 snapshot**, even for empty or error programs.
8. Every field is JSON-serialisable. No `undefined` in arrays; no circular references.

---

## 5. Backend bug list (priority order)

Verified by reading `src/engine/**`. These are the things standing between the current engine and a demo that survives contact with an audience.

### P0 — every demo currently shows wrong results

| # | Bug | Evidence | Required fix |
| :--- | :--- | :--- | :--- |
| B1 | **Loops never loop.** Bodies execute at most once; `for` increment is parsed and unused. | The only `lineIdx =` assignments are the initial `0` and the two block-skip jumps. No back-jump to a loop header exists. | Jump back to the loop header after the body; apply the increment expression. |
| B2 | **Both branches of every `if`/`else` execute.** | Skip logic handles `if (false)` only. When true, the body runs, then `} else {` becomes a default step into the else body. | Track block structure; make branches mutually exclusive. |
| B3 | **No call stack, no recursion.** `functions` map is written and never read; `callStackFrames` is never pushed/popped; `cloneCallStack` gives every frame the same scope. | `jsTracer.ts:68`, `:94-103`, `:472` | Real frame push/pop on call and return, with per-frame scope. |

**Acceptance tests (all three must pass):**
- `examples/microtasks.js` → stdout order is `1. Synchronous Start`, `1. Synchronous End`, `2. Microtask #1 (Promise)`, `3. Microtask #2 (Chained Promise)`, `4. Macrotask (setTimeout 0ms)`.
- `examples/three_sum.js` → `left` strictly advances, `right` strictly retreats, and **exactly one** branch action per loop iteration.
- Any recursive function → call stack depth visibly grows and shrinks.

### P1 — wrong visuals

| # | Bug | Evidence | Required fix |
| :--- | :--- | :--- | :--- |
| B4 | **Heap objects are not linked to variables.** `allocateHeapArray(name, ...)` ignores `name`; `updateHeapObject(name, ...)` mutates the *first* array found; freed objects are never removed. | `jsTracer.ts:441`, `:451` | Key the heap by variable identity; drop objects no longer reachable. |
| B5 | **Pointer badges over-fire.** Any integer in `[0, len)` becomes a badge, so `target = 0` and `sum` show as pointers. | `jsTracer.ts:422-435` | Badge only when the variable was actually used as an index at this tick; populate `activeIndices`. |
| B6 | **TypeScript annotations are untracked.** `let x: number = 5` matches nothing and degrades to "Executing: …". | `jsTracer.ts:197` | Strip annotations before matching, or route TS through a real parser. |

### P2 — correctness and robustness

| # | Bug | Evidence | Required fix |
| :--- | :--- | :--- | :--- |
| B7 | **User code runs in the extension host.** Expressions are evaluated with `new Function`, so `process`, `require` etc. are reachable. | `jsTracer.ts:482` | `node:vm` with a scrubbed context, or don't evaluate at all. |
| B8 | **Python/Rust eval silently prints raw source.** `str(x)` and `a if c else b` throw, are caught, and the expression text is pushed to stdout. | `pythonTracer.ts:408-433`, `:134`/`:144` | Support the constructs the curriculum uses, or fail loudly. |
| B9 | **Trace payload is sent whole.** `SET_TRACE` posts every snapshot with a deep-cloned heap. | `fermasWebviewProvider.ts:104` | Backend: cap heap depth/size. Frontend will move to a leaner payload. |

### P3 — housekeeping (either of us)

- `activationEvents: ["onStartupFinished"]` → use `onView:fermas.visualizerView`.
- CSP allows `'unsafe-inline'` for `script-src` → nonce.
- `dist/` and `fermas-0.1.0.vsix` are committed; add to `.gitignore`.
- `node_modules` is missing → `npm install` before `npm run compile`.
- README references stale `c:\fermas\` paths.

---

## 6. Frontend deliverables

**Done when:**
1. Fermas appears as a **secondary sidebar on the right**, beside the code, and can also be opened as a wide editor-tab panel.
2. The panel renders Concurrency lens and Memory lens from the same snapshot stream.
3. Stepping in the panel highlights the matching editor line; moving the caret updates the tick.
4. The UI runs end-to-end against **fixture JSON**, with no engine and no network present.
5. Renders correctly in dark, light and high-contrast themes; changed values are readable without colour.
6. A 500-tick trace stays interactive while scrubbing.

**Frontend will not:** generate traces, parse user code, evaluate expressions, or ship correctness logic that should live in the snapshot.

---

## 7. Working without the backend (unblocks both of us)

`src/webview/fixtures/*.json` holds `{"language": "...", "snapshots": MemorySnapshot[]}` files. The panel loads them when `?fixture=name` is present, or when the host sends a `SET_TRACE` with `fixtureMode: true`.

Planned fixtures: `js-microtasks.json`, `js-three-sum.json`, `py-water.json`, `rust-lazy-future.json`.

These are the reference traces the backend must reproduce. If the backend can't produce them, tell frontend — the fixtures are the spec.

---

## 8. Interface freeze

`src/engine/types.ts` is frozen for v1. If a new field is needed:

1. Make it **optional**.
2. Say what populates it and when.
3. Add it to the "what the frontend consumes" table above.

Anything else is a v2 conversation.
