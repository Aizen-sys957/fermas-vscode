import { useStore } from '../state/store';

export function DynamicVisualizerView() {
  const {
    state,
    snapshot,
    total,
    goto,
    step,
    first,
    last,
    togglePlay,
    setRate,
    jumpToAnomaly,
    revealLine,
    loadModule,
    setSelectedHeapNodeId,
  } = useStore();

  const rates = [0.25, 0.5, 1, 2, 4] as const;

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--vscode-descriptionForeground,#8c8c8c)]">
        <span className="text-3xl mb-2">⚡</span>
        <h3 className="text-[14px] font-semibold text-[var(--vscode-foreground,#ffffff)]">No Active Simulation</h3>
        <p className="text-[12px] max-w-sm mt-1 mb-4">
          Open a TypeScript, JavaScript, Python, or Rust file in the editor, or choose a preset below.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={() => loadModule('two-sum')}
            className="rounded bg-[#1a2234] border border-[#00f2fe]/40 px-3 py-1.5 text-xs text-[#00f2fe] hover:bg-[#242a36]"
          >
            Load Two Sum (Two Pointers)
          </button>
          <button
            type="button"
            onClick={() => loadModule('merge-sort')}
            className="rounded bg-[#1a2234] border border-[#8b5cf6]/40 px-3 py-1.5 text-xs text-[#8b5cf6] hover:bg-[#242a36]"
          >
            Load Merge Sort (Recursion)
          </button>
        </div>
      </div>
    );
  }

  const heap = snapshot.heap ?? {};
  const arrays = Object.values(heap).filter((h) => h.type === 'array');
  const customNodes = Object.values(heap).filter((h) => h.type === 'custom_node' || (h.fields && ('val' in h.fields || 'next' in h.fields || 'left' in h.fields)));
  const diagnostics = snapshot.diagnostics ?? [];
  const percent = total > 0 ? Math.round(((state.tick + 1) / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--vscode-foreground,#cccccc)] select-none">
      {/* VCR TRANSPORT CONTROLLER DECK */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#252526)] p-3">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--vscode-panel-border,#333333)]/40">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">Preset:</span>
            <select
              aria-label="Preset Algorithm"
              className="rounded bg-[var(--vscode-input-background,#1e1e1e)] border border-[var(--vscode-input-border,#3c3c3c)] px-2 py-0.5 text-xs text-[var(--vscode-foreground,#cccccc)] outline-none cursor-pointer focus:border-[var(--vscode-focusBorder,#007acc)]"
              onChange={(e) => {
                if (e.target.value) loadModule(e.target.value);
              }}
              value={state.activeModule?.id || ''}
            >
              <option value="">(Active Editor File)</option>
              <option value="two-sum">Two Sum (Two Pointers)</option>
              <option value="merge-sort">Merge Sort (Call Tree)</option>
              <option value="binary-search-tree">Binary Search Tree</option>
              <option value="n-queens">N-Queens Backtracking</option>
              <option value="microtask-queue">Event Loop & Promises</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Selector */}
            <div className="flex items-center gap-1 rounded bg-[var(--vscode-input-background,#1e1e1e)] px-2 py-0.5 text-[11px] border border-[var(--vscode-panel-border,#333333)]/50">
              <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">Speed:</span>
              <button
                type="button"
                onClick={() => setRate(rates[(rates.indexOf(state.rate) + 1) % rates.length]!)}
                className="font-mono text-[var(--vscode-textLink-foreground,#3794ff)] font-medium hover:underline"
              >
                {state.rate}x
              </button>
            </div>

            {/* Jump to Anomaly Button */}
            <button
              type="button"
              onClick={jumpToAnomaly}
              title="Jump forward to next detected anomaly or warning"
              className="flex items-center gap-1 rounded bg-[#cca700]/10 border border-[#cca700]/30 px-2 py-0.5 text-[11px] text-[#cca700] hover:bg-[#cca700]/20 transition-colors"
            >
              <span>⚠</span>
              <span>Next Anomaly</span>
            </button>
          </div>
        </div>

        {/* Transport Buttons & Scrub Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
          {/* Stepper Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={first}
              disabled={state.tick === 0}
              title="First Step [Home]"
              className="h-7 w-7 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)]/50 flex items-center justify-center text-xs text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30 disabled:pointer-events-none"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={state.tick === 0}
              title="Step Back [Shift+F10]"
              className="flex items-center gap-1 h-7 px-2 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)]/50 text-xs text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>◀</span>
              <span className="hidden md:inline font-mono text-[9px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">⇧F10</span>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title="Play / Pause [Space]"
              className="flex items-center gap-1.5 h-7 px-3 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium text-xs hover:bg-[var(--vscode-button-hoverBackground,#1177bb)] transition-colors"
            >
              <span>{state.playing ? '⏸' : '▶'}</span>
              <span>{state.playing ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={state.tick >= total - 1}
              title="Step Next [F10]"
              className="flex items-center gap-1 h-7 px-2 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)]/50 text-xs text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>▶</span>
              <span className="hidden md:inline font-mono text-[9px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">F10</span>
            </button>
            <button
              type="button"
              onClick={last}
              disabled={state.tick >= total - 1}
              title="Jump to End [End]"
              className="h-7 w-7 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)]/50 flex items-center justify-center text-xs text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30 disabled:pointer-events-none"
            >
              ⏭
            </button>
          </div>

          {/* Interactive Slider & Info */}
          <div className="flex-1 w-full flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[var(--vscode-foreground,#ffffff)]">TICK #{state.tick + 1}</span>
                <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">/ {total}</span>
                <span className="font-sans truncate ml-1 text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                  L{snapshot.line}: {snapshot.codeSnippet || snapshot.explanation}
                </span>
              </div>
              <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)] font-medium">{percent}%</span>
            </div>

            <input
              type="range"
              aria-label="Execution Scrubber"
              min={0}
              max={Math.max(0, total - 1)}
              value={state.tick}
              onChange={(e) => goto(Number(e.target.value))}
              className="h-1.5 w-full appearance-none rounded-full bg-[var(--vscode-input-background,#1e1e1e)] accent-[var(--vscode-focusBorder,#007acc)] cursor-pointer"
            />
          </div>
        </div>

        {/* Step Explanation Banner */}
        <div className="mt-2.5 rounded bg-[var(--vscode-input-background,#1e1e1e)] px-3 py-1.5 text-xs text-[var(--vscode-foreground,#cccccc)] border border-[var(--vscode-panel-border,#333333)]/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[var(--vscode-textLink-foreground,#3794ff)]">ℹ</span>
            <span>{snapshot.explanation}</span>
          </div>
          <button
            type="button"
            onClick={() => revealLine(snapshot.line)}
            className="font-mono text-[10px] text-[var(--vscode-textLink-foreground,#3794ff)] hover:underline shrink-0"
          >
            Line {snapshot.line} ↗
          </button>
        </div>
      </section>

      {/* SMART DEBUGGER DIAGNOSTICS ALERT (If any detected) */}
      {diagnostics.length > 0 && (
        <section className="rounded-lg border border-[#f14c4c]/40 bg-[#f14c4c]/10 p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#f14c4c] font-semibold text-xs">
              <span className="text-sm">⚠</span>
              <span>Execution Diagnostics ({diagnostics.length} alert{diagnostics.length > 1 ? 's' : ''})</span>
            </div>
            <span className="font-mono text-[10px] text-[#f14c4c] bg-[var(--vscode-editor-background,#1e1e1e)] px-2 py-0.5 rounded border border-[#f14c4c]/30">
              Tick #{state.tick + 1}
            </span>
          </div>
          {diagnostics.map((diag, idx) => (
            <div key={idx} className="rounded bg-[var(--vscode-editor-background,#1e1e1e)]/90 p-2 text-xs flex flex-col gap-1 border border-[#f14c4c]/20">
              <div className="flex items-center justify-between font-medium text-[var(--vscode-foreground,#ffffff)]">
                <span>{diag.title}</span>
                {diag.line && <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">line {diag.line}</span>}
              </div>
              <p className="text-[#f14c4c] text-[11px] leading-snug">{diag.message}</p>
              {diag.suggestedFix && (
                <div className="text-[11px] text-[#89d185] bg-[#89d185]/10 px-2 py-1 rounded mt-0.5">
                  <span className="font-semibold">💡 Suggestion: </span>
                  {diag.suggestedFix}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* SECTION 1: MEMORY & ARRAYS */}
      {arrays.length > 0 && (
        <article className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#252526)] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs">📊</span>
              <h3 className="text-xs font-semibold text-[var(--vscode-foreground,#cccccc)] uppercase tracking-wide">
                Memory &amp; Arrays
              </h3>
            </div>
            <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">Addr: 0x7ffee490</span>
          </div>

          {arrays.map((arr) => {
            const elements = arr.elements ?? [];
            const pointers = arr.inferredPointers ?? [];
            return (
              <div key={arr.id} className="rounded bg-[var(--vscode-input-background,#1e1e1e)] p-3 border border-[var(--vscode-panel-border,#333333)]/50 overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                    {arr.name ? <strong className="text-[var(--vscode-foreground,#ffffff)]">{arr.name} </strong> : null}
                    ({arr.id}) (len: {elements.length})
                  </span>
                  <div className="flex gap-2">
                    {pointers.map((p) => (
                      <span
                        key={p.variableName}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
                        style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}40` }}
                      >
                        {p.label ?? `${p.variableName} = ${p.index}`}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Array Cells */}
                <div className="flex items-end gap-1.5 py-3">
                  {elements.map((val, idx) => {
                    const pointing = pointers.filter((p) => p.index === idx);
                    const isTarget = pointing.length > 0;
                    const renderedVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1 min-w-[36px]">
                        {/* Pointer Flags */}
                        <div className="h-5 flex items-center justify-center">
                          {pointing.map((p) => (
                            <span
                              key={p.variableName}
                              className="text-[10px] font-mono font-bold"
                              style={{ color: p.color }}
                              title={`${p.variableName} = ${p.index}`}
                            >
                              ▼
                            </span>
                          ))}
                        </div>

                        {/* Cell Box */}
                        <div
                          className={`h-9 min-w-9 px-2 rounded flex items-center justify-center font-mono text-xs font-semibold border transition-all ${
                            isTarget
                              ? 'bg-[var(--vscode-list-activeSelectionBackground,#094771)]/30 border-[var(--vscode-focusBorder,#007acc)] text-[var(--vscode-foreground,#ffffff)]'
                              : 'bg-[var(--vscode-sideBar-background,#252526)] border-[var(--vscode-panel-border,#3c3c3c)] text-[var(--vscode-foreground,#cccccc)]'
                          }`}
                        >
                          {renderedVal}
                        </div>

                        {/* Index */}
                        <span className="font-mono text-[9px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">[{idx}]</span>
                      </div>
                    );
                  })}
                </div>

                {/* Step Equation Banner */}
                {snapshot.evaluatedExpression && (
                  <div className="mt-2 pt-2 border-t border-[var(--vscode-panel-border,#333333)]/40 flex items-center gap-2 text-xs font-mono">
                    <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">Step Equation:</span>
                    <span className="rounded bg-[var(--vscode-sideBar-background,#252526)] px-2 py-0.5 text-[var(--vscode-foreground,#ffffff)] border border-[var(--vscode-panel-border,#333333)]/40">
                      {snapshot.evaluatedExpression.expression}
                    </span>
                    <span className={snapshot.evaluatedExpression.isSatisfied ? 'text-[#89d185]' : 'text-[#cca700]'}>
                      → {snapshot.evaluatedExpression.result}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </article>
      )}

      {/* SECTION 2: CONNECTED POINTER GRAPHS (Trees & Linked Lists) */}
      <article className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#252526)] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs">🌳</span>
            <h3 className="text-xs font-semibold text-[var(--vscode-foreground,#cccccc)] uppercase tracking-wide">
              Connected Pointer Graph (Heap Objects &amp; Nodes)
            </h3>
          </div>
          <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">{customNodes.length} Heap Nodes</span>
        </div>

        {customNodes.length === 0 ? (
          <div className="rounded bg-[var(--vscode-input-background,#1e1e1e)] p-3 text-center text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)] border border-[var(--vscode-panel-border,#333333)]/40">
            No linked nodes on heap yet. Allocate objects like <code className="text-[var(--vscode-foreground,#ffffff)]">new ListNode(5)</code> or{' '}
            <code className="text-[var(--vscode-foreground,#ffffff)]">{`{ val: 10, next: null }`}</code> to visualize directed pointer graphs.
          </div>
        ) : (
          <div className="rounded bg-[var(--vscode-input-background,#1e1e1e)] p-3 border border-[var(--vscode-panel-border,#333333)]/50 flex flex-col gap-3">
            {/* SVG Visualizer Canvas */}
            <div className="relative w-full min-h-[160px] rounded bg-[var(--vscode-editor-background,#1e1e1e)] border border-[var(--vscode-panel-border,#333333)]/40 p-3 flex flex-wrap items-center justify-around gap-4">
              {customNodes.map((node) => {
                const fields = node.fields || {};
                const val = fields.val ?? fields.value ?? fields.data ?? '?';
                const nextRef = fields.next;
                const leftRef = fields.left;
                const rightRef = fields.right;

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedHeapNodeId(node.id)}
                    className="flex flex-col items-center gap-1 cursor-pointer group"
                  >
                    {/* Node Circle */}
                    <div className="relative h-11 w-11 rounded-full bg-[var(--vscode-sideBar-background,#252526)] border-2 border-[var(--vscode-focusBorder,#007acc)]/70 text-[var(--vscode-foreground,#ffffff)] font-mono text-xs font-semibold flex flex-col items-center justify-center group-hover:border-[var(--vscode-focusBorder,#007acc)] transition-all">
                      <span>{String(val)}</span>
                      <span className="text-[8px] text-[var(--vscode-descriptionForeground,#8c8c8c)] -mt-0.5">{node.id.replace('@heap:', '#')}</span>
                    </div>

                    {/* Pointer Connections description */}
                    <div className="flex flex-col items-center text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                      {nextRef && nextRef !== 'null' && (
                        <span className="text-[#38bdf8]">next → {String(nextRef).replace('@heap:', '#')}</span>
                      )}
                      {leftRef && leftRef !== 'null' && (
                        <span className="text-[#34d399]">L → {String(leftRef).replace('@heap:', '#')}</span>
                      )}
                      {rightRef && rightRef !== 'null' && (
                        <span className="text-[#fbbf24]">R → {String(rightRef).replace('@heap:', '#')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Field inspector table for selected or all nodes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {customNodes.map((node) => (
                <div key={node.id} className="rounded bg-[var(--vscode-sideBar-background,#252526)] p-2 text-xs border border-[var(--vscode-panel-border,#333333)]/50">
                  <div className="flex justify-between items-center mb-1 text-[11px] font-mono">
                    <span className="text-[var(--vscode-foreground,#ffffff)] font-semibold">{node.id}</span>
                    <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">{node.type}</span>
                  </div>
                  <div className="space-y-0.5 font-mono text-[10px]">
                    {Object.entries(node.fields || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                        <span>{k}:</span>
                        <span className="text-[var(--vscode-foreground,#cccccc)] font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* SECTION 3: CALL STACK & LEXICAL SCOPES */}
      <article className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#252526)] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs">🥞</span>
            <h3 className="text-xs font-semibold text-[var(--vscode-foreground,#cccccc)] uppercase tracking-wide">
              Call Stack &amp; Lexical Scope Inspector
            </h3>
          </div>
          <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            {snapshot.callStack.length} Active Frame{snapshot.callStack.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {snapshot.callStack.map((frame, depth) => (
            <div
              key={frame.frameId}
              className={`rounded border p-2.5 transition-all ${
                depth === snapshot.callStack.length - 1
                  ? 'bg-[var(--vscode-editorWidget-background,#2d2d2d)] border-[var(--vscode-focusBorder,#007acc)]/60'
                  : 'bg-[var(--vscode-input-background,#1e1e1e)] border-[var(--vscode-panel-border,#333333)]/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--vscode-foreground,#ffffff)] font-medium">{frame.functionName}()</span>
                  <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)] text-[10px]">line {frame.line}</span>
                </div>
                <span className="text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] bg-[var(--vscode-sideBar-background,#252526)] px-1.5 py-0.5 rounded border border-[var(--vscode-panel-border,#333333)]/40">
                  depth {depth}
                </span>
              </div>

              {/* Variables Table */}
              {Object.keys(frame.scope).length === 0 ? (
                <div className="text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)] italic py-1">No local bindings in frame yet</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-xs">
                  {Object.entries(frame.scope).map(([name, v]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-2 py-1 border border-[var(--vscode-panel-border,#333333)]/40"
                    >
                      <span className="text-[var(--vscode-symbolIcon-variableForeground,#9cdcfe)] truncate">
                        {v.isChanged && <span className="text-[#89d185] font-bold mr-1">+</span>}
                        {name}
                      </span>
                      <span className="text-[var(--vscode-foreground,#cccccc)] font-medium truncate ml-2">
                        {typeof v.value === 'object' && v.value !== null ? JSON.stringify(v.value) : String(v.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
