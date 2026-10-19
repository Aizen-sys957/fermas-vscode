# ⚡ Fermas — Omniscient Code Execution & CS Concept Visualizer
**An Interactive Dual-Mode Visualizer for VS Code (JavaScript/TypeScript, Python, Rust)**

---

## 🌟 What is Fermas?

**Fermas** is a native VS Code extension and interactive learning canvas designed to make counterintuitive Computer Science concepts click through hands-on, step-by-step visual engagement.

Fermas operates as **two versions of the same coin**:
1. **Real-Time Editor Mode**: Automatically inspects *any arbitrary code* typed into the editor in real-time. It renders the active line, call stack, heap objects, and **automatically infers index pointers** (`left`, `right`, `i`, etc.) stationed on array cells—complete with in-editor line decorations and inline inlay hints.
2. **Dynamic Remote Demo Mode**: Connects to an external curriculum server (`http://localhost:3456/api/curriculum`) delivering curated CS puzzles, "Predict-First" intuition checks, and cross-language comparisons without needing an extension update.

---

## 🚀 Key Architectural Features

### 1. General Omniscient Execution Engine (Zero Hardcoded Algorithms)
- **Dynamic Scope & Memory Introspection**: Analyzes *any* general algorithm (e.g. Three-Sum, Two Pointers, Binary Search, Sorting, Recursion).
- **Auto-Inferred Pointer Badges**: If an integer variable in the current frame indexes into an active array on the heap, Fermas automatically attaches a colored pointer badge directly above that array cell. It works whether variables are named `left`, `right`, `i`, `foo`, or `ptr`.
- **Expression Evaluation**: Dynamically evaluates active comparison conditions (e.g., `nums[left] + nums[right] = -1 + 2 = 1 (sum > 0 -> decrement right)`).

### 2. Tri-Lingual Concurrency & Execution Models
Fermas contrasts the mental models of three major languages:
- **JavaScript**: Eager Promises, Call Stack $\to$ Microtasks (strict priority) $\to$ Macrotasks (timers).
- **Python**: Cooperative Coroutine Objects, `asyncio` task ready queue.
- **Rust**: Zero-cost, lazy pull-based Future state machines that execute **zero CPU cycles** until explicitly driven by `.await` or an executor poll.

### 3. Deep In-Editor Native UX
- **CodeLens Triggers**: `[⚡ Run Entire File in Fermas Visualizer]` and `[📚 Browse CS Puzzles]` appear directly above your code.
- **Synchronized Gutter & Line Highlighting**: The active line of code in VS Code lights up in sync with the visualizer timeline.
- **Inline Inlay Hints**: Real-time state hints (`/* [Tick 3: nums[left]=0, nums[right]=2] */`) rendered directly at the end of statements.

### 4. "Predict-First" Pedagogical Checks
- Before stepping past critical decisions, learners can test their hypothesis. Immediate feedback explains the underlying CS principle.

---

## 🛠 Project Structure

```
fermas-vscode\
├── package.json               # VS Code extension manifest
├── tsconfig.json              # TypeScript compilation config
├── esbuild.js                 # Builds the extension host only
├── .vscode\
│   ├── launch.json            # One-click F5 debug launcher
│   └── tasks.json             # Pre-launch compile task
├── src\
│   ├── extension.ts           # Extension entrypoint, commands, status bar
│   ├── engine\                # BACKEND — see docs/FERMAS-CONTRACT.md
│   │   ├── types.ts           # Frozen snapshot & trace contract
│   │   ├── tracer.ts          # Unified engine coordinator
│   │   ├── astInterpreter.ts  # AST step interpreter (JS/TS)
│   │   ├── jsTracer.ts        # JS/TS execution & memory tracer
│   │   ├── pythonTracer.ts    # Python execution tracer
│   │   ├── rustTracer.ts      # Rust execution & future state tracer
│   │   └── curriculumServer.ts# Curriculum sync client & offline fallback
│   └── providers\             # FRONTEND (host side)
│       ├── fermasWebviewProvider.ts    # Panel hosting & message bridge
│       ├── fermasCodeLensProvider.ts   # Inline [⚡ Visualize] CodeLens
│       ├── fermasInlayHintsProvider.ts # In-editor inline state hints
│       └── fermasDecorations.ts        # Active line highlight & gutter markers
├── webview-ui\                # FRONTEND (panel) — React + Vite + Tailwind
│   ├── vite.config.ts         # Builds -> dist/webview.js + dist/style.css
│   ├── src\
│   │   ├── App.tsx            # Panel shell
│   │   ├── state\store.tsx    # Trace state, playback, host sync
│   │   ├── components\        # Header, toolbar, scrubber, lenses, ribbon, quiz
│   │   ├── fixtures\          # Reference traces (work offline, no engine)
│   │   └── styles\index.css   # Tailwind theme mapped to --vscode-* tokens
│   └── package.json
├── docs\
│   └── FERMAS-CONTRACT.md     # Frontend/backend split, protocol, guarantees
├── server\
│   └── demoServer.js          # Standalone HTTP dynamic curriculum server
└── examples\
    ├── three_sum.js           # Three-Sum algorithm with two pointers
    ├── microtasks.js          # JS microtask priority vs setTimeout
    ├── container_water.py     # Python Two-Pointer container problem
    └── lazy_future.rs         # Rust Lazy Future vs Eager execution
```

> The panel and the engine are separate packages on purpose. The panel only
> consumes `MemorySnapshot[]` from `src/engine/types.ts`; it never parses or
> evaluates user code. See [docs/FERMAS-CONTRACT.md](docs/FERMAS-CONTRACT.md).

---

## 🏃 How to Run and Test Fermas

### Step 0: Install dependencies (once)
```bash
npm install                 # extension host + build tooling
npm run install:webview     # panel dependencies (React/Vite/Tailwind)
```

### Step 1: Build
```bash
npm run compile             # extension host (esbuild) + panel (Vite)
```
Or run `npm run watch` and `npm run watch:webview` in two terminals while developing.

### Step 2: Start the Dynamic Curriculum Server (Optional, for Live Sync Demo)
In a terminal, run:
```bash
npm run serve:curriculum
```
This launches the curriculum server on `http://localhost:3456/api/curriculum`.

### Step 3: Launch the Extension in VS Code
1. Open this workspace in VS Code.
2. Press **`F5`** (or go to **Run & Debug** $\to$ **Run Extension (Fermas)**).
3. A new **Extension Development Host** VS Code window will open with Fermas active!
4. Click the **Fermas** icon in the secondary side bar (right edge) — or press
   `Ctrl+Alt+B` to show it. The panel docks beside your code.

### Step 4: Test Interactive Visualizations
1. In the new window, open any file in `examples/`:
   - Open `examples/three_sum.js`
   - Click the **`[⚡ Run Entire File in Fermas Visualizer]`** CodeLens button above line 1 (or run command `Fermas: Visualize Active Code Execution`).
2. Scrub through the timeline with `[◀]` and `[▶]` or the timeline slider.
3. Switch between the **Concurrency** and **Memory** lens in the panel header.
4. Watch the editor gutter highlight the active line and display inline inlay hints.

### Working on the panel without the engine
Open the panel and, from the empty state, load a bundled reference trace
(`js-microtasks`, `js-three-sum`). These render the full UI with no engine and no
network — see [webview-ui/src/fixtures](webview-ui/src/fixtures).

