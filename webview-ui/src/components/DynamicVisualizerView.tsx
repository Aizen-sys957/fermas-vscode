import { useState } from 'react';
import { useStore } from '../state/store';
import type { HeapObject, InferredPointer } from '../types';

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

  const [activeTab, setActiveTab] = useState<'memory' | 'concurrency'>('memory');
  const rates = [0.25, 0.5, 1, 2, 4] as const;

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-[#94a3b8]">
        <span className="text-3xl mb-2">⚡</span>
        <h3 className="text-[14px] font-semibold text-[#f1f5f9]">No Active Simulation</h3>
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
    <div className="flex flex-col gap-3 p-3 text-[#f1f5f9] select-none">
      {/* VCR TRANSPORT CONTROLLER DECK */}
      <section className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-lg">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#242a36]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#94a3b8]">Preset:</span>
            <select
              aria-label="Preset Algorithm"
              className="rounded bg-[#0d131e] border border-[#2a364f] px-2 py-0.5 text-xs text-[#00f2fe] font-medium outline-none cursor-pointer"
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
            <div className="flex items-center gap-1 rounded bg-[#0d131e] px-2 py-0.5 text-[11px] border border-[#2a364f]">
              <span className="text-[#94a3b8]">Speed:</span>
              <button
                type="button"
                onClick={() => setRate(rates[(rates.indexOf(state.rate) + 1) % rates.length]!)}
                className="font-mono text-[#00f2fe] font-medium hover:underline"
              >
                {state.rate}x
              </button>
            </div>

            {/* Jump to Anomaly Button */}
            <button
              type="button"
              onClick={jumpToAnomaly}
              title="Jump forward to next detected anomaly or warning"
              className="flex items-center gap-1 rounded bg-[#f43f5e]/15 border border-[#f43f5e]/30 px-2 py-0.5 text-[11px] text-[#f43f5e] hover:bg-[#f43f5e]/25 transition-colors"
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
              className="h-7 w-7 rounded bg-[#1a2234] border border-[#2a364f] flex items-center justify-center text-xs text-[#94a3b8] hover:text-[#00f2fe] hover:border-[#00f2fe] disabled:opacity-30 disabled:pointer-events-none"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={state.tick === 0}
              title="Step Back [Shift+F10]"
              className="flex items-center gap-1 h-7 px-2 rounded bg-[#1a2234] border border-[#2a364f] text-xs text-[#94a3b8] hover:text-[#00f2fe] hover:border-[#00f2fe] disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>◀</span>
              <span className="hidden md:inline font-mono text-[9px] text-[#94a3b8]">⇧F10</span>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title="Play / Pause [Space]"
              className="flex items-center gap-1.5 h-7 px-3 rounded bg-[#00f2fe] text-[#080e19] font-semibold text-xs hover:bg-[#6ff6ff] transition-all shadow-[0_0_12px_rgba(0,242,254,0.3)]"
            >
              <span>{state.playing ? '⏸' : '▶'}</span>
              <span>{state.playing ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={state.tick >= total - 1}
              title="Step Next [F10]"
              className="flex items-center gap-1 h-7 px-2 rounded bg-[#1a2234] border border-[#2a364f] text-xs text-[#00f2fe] hover:border-[#00f2fe] disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>▶</span>
              <span className="hidden md:inline font-mono text-[9px] text-[#00f2fe]">F10</span>
            </button>
            <button
              type="button"
              onClick={last}
              disabled={state.tick >= total - 1}
              title="Jump to End [End]"
              className="h-7 w-7 rounded bg-[#1a2234] border border-[#2a364f] flex items-center justify-center text-xs text-[#94a3b8] hover:text-[#00f2fe] hover:border-[#00f2fe] disabled:opacity-30 disabled:pointer-events-none"
            >
              ⏭
            </button>
          </div>

          {/* Interactive Slider & Info */}
          <div className="flex-1 w-full flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-[#00f2fe] font-bold">TICK #{state.tick + 1}</span>
                <span className="text-[#94a3b8]">/ {total}</span>
                <span className="text-[#f1f5f9] font-sans truncate ml-1 text-[11px]">
                  L{snapshot.line}: {snapshot.codeSnippet || snapshot.explanation}
                </span>
              </div>
              <span className="text-[#00f2fe] font-semibold">{percent}%</span>
            </div>

            <input
              type="range"
              aria-label="Execution Scrubber"
              min={0}
              max={Math.max(0, total - 1)}
              value={state.tick}
              onChange={(e) => goto(Number(e.target.value))}
              className="h-2 w-full appearance-none rounded-full bg-[#0d131e] accent-[#00f2fe] cursor-pointer"
            />
          </div>
        </div>

        {/* Step Explanation Banner */}
        <div className="mt-2.5 rounded-lg bg-[#0d131e] px-3 py-1.5 text-xs text-[#f1f5f9]/90 border border-[#1a2234] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#00f2fe]">ℹ</span>
            <span>{snapshot.explanation}</span>
          </div>
          <button
            type="button"
            onClick={() => revealLine(snapshot.line)}
            className="font-mono text-[10px] text-[#00f2fe] hover:underline shrink-0"
          >
            Line {snapshot.line} ↗
          </button>
        </div>
      </section>

      {/* SMART DEBUGGER DIAGNOSTICS ALERT (If any detected) */}
      {diagnostics.length > 0 && (
        <section className="rounded-xl border border-[#f43f5e]/40 bg-[#f43f5e]/10 p-3 shadow-md flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[#f43f5e] font-semibold text-xs">
              <span className="text-sm">⚠</span>
              <span>Execution Diagnostics ({diagnostics.length} alert{diagnostics.length > 1 ? 's' : ''})</span>
            </div>
            <span className="font-mono text-[10px] text-[#f43f5e] bg-[#080e19] px-2 py-0.5 rounded">
              Tick #{state.tick + 1}
            </span>
          </div>
          {diagnostics.map((diag, idx) => (
            <div key={idx} className="rounded bg-[#080e19]/70 p-2 text-xs flex flex-col gap-1 border border-[#f43f5e]/20">
              <div className="flex items-center justify-between font-medium text-[#f1f5f9]">
                <span>{diag.title}</span>
                {diag.line && <span className="font-mono text-[10px] text-[#94a3b8]">line {diag.line}</span>}
              </div>
              <p className="text-[#f43f5e] text-[11px] leading-snug">{diag.message}</p>
              {diag.suggestedFix && (
                <div className="text-[11px] text-[#10b981] bg-[#10b981]/10 px-2 py-1 rounded mt-0.5">
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
        <article className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-lg flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#00f2fe]">📊</span>
              <h3 className="text-xs font-semibold text-[#f1f5f9] uppercase tracking-wide">
                Memory &amp; Arrays Section
              </h3>
            </div>
            <span className="font-mono text-[10px] text-[#8b5cf6]">Addr: 0x7ffee490</span>
          </div>

          {arrays.map((arr) => {
            const elements = arr.elements ?? [];
            const pointers = arr.inferredPointers ?? [];
            return (
              <div key={arr.id} className="rounded-lg bg-[#0d131e] p-3 border border-[#242a36] overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] text-[#94a3b8]">
                    {arr.name ? <strong className="text-[#00f2fe]">{arr.name} </strong> : null}
                    ({arr.id}) (len: {elements.length})
                  </span>
                  <div className="flex gap-2">
                    {pointers.map((p) => (
                      <span
                        key={p.variableName}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{ background: `${p.color}25`, color: p.color, border: `1px solid ${p.color}50` }}
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
                              className="text-[10px] font-mono font-bold animate-bounce"
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
                              ? 'bg-[#00f2fe]/20 border-[#00f2fe] text-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.4)]'
                              : 'bg-[#1a2234] border-[#2a364f] text-[#f1f5f9]'
                          }`}
                        >
                          {renderedVal}
                        </div>

                        {/* Index */}
                        <span className="font-mono text-[9px] text-[#94a3b8]">[{idx}]</span>
                      </div>
                    );
                  })}
                </div>

                {/* Step Equation Banner */}
                {snapshot.evaluatedExpression && (
                  <div className="mt-2 pt-2 border-t border-[#1a2234] flex items-center gap-2 text-xs font-mono">
                    <span className="text-[#94a3b8]">Step Equation:</span>
                    <span className="rounded bg-[#1a2234] px-2 py-0.5 text-[#00f2fe] font-semibold">
                      {snapshot.evaluatedExpression.expression}
                    </span>
                    <span className={snapshot.evaluatedExpression.isSatisfied ? 'text-[#10b981]' : 'text-[#f59e0b]'}>
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
      <article className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-lg flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#8b5cf6]">🌳</span>
            <h3 className="text-xs font-semibold text-[#f1f5f9] uppercase tracking-wide">
              Connected Pointer Graph (Heap Objects &amp; Nodes)
            </h3>
          </div>
          <span className="font-mono text-[10px] text-[#94a3b8]">{customNodes.length} Heap Nodes</span>
        </div>

        {customNodes.length === 0 ? (
          <div className="rounded-lg bg-[#0d131e] p-4 text-center text-xs text-[#94a3b8] border border-[#242a36]">
            No linked nodes on heap yet. Allocate objects like <code className="text-[#00f2fe]">new ListNode(5)</code> or{' '}
            <code className="text-[#00f2fe]">{`{ val: 10, next: null }`}</code> to visualize directed pointer graphs.
          </div>
        ) : (
          <div className="rounded-lg bg-[#0d131e] p-3 border border-[#242a36] flex flex-col gap-3">
            {/* SVG Visualizer Canvas */}
            <div className="relative w-full min-h-[160px] rounded bg-[#080e19] border border-[#1a2234] p-3 flex flex-wrap items-center justify-around gap-4">
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
                    <div className="relative h-12 w-12 rounded-full bg-[#1a2234] border-2 border-[#8b5cf6] text-[#f1f5f9] font-mono text-sm font-bold flex flex-col items-center justify-center shadow-[0_0_12px_rgba(139,92,246,0.25)] group-hover:scale-105 transition-all">
                      <span>{String(val)}</span>
                      <span className="text-[8px] text-[#94a3b8] -mt-0.5">{node.id.replace('@heap:', '#')}</span>
                    </div>

                    {/* Pointer Connections description */}
                    <div className="flex flex-col items-center text-[10px] font-mono text-[#94a3b8]">
                      {nextRef && nextRef !== 'null' && (
                        <span className="text-[#00f2fe]">next → {String(nextRef).replace('@heap:', '#')}</span>
                      )}
                      {leftRef && leftRef !== 'null' && (
                        <span className="text-[#10b981]">L → {String(leftRef).replace('@heap:', '#')}</span>
                      )}
                      {rightRef && rightRef !== 'null' && (
                        <span className="text-[#f59e0b]">R → {String(rightRef).replace('@heap:', '#')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Field inspector table for selected or all nodes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {customNodes.map((node) => (
                <div key={node.id} className="rounded bg-[#1a2234] p-2 text-xs border border-[#2a364f]">
                  <div className="flex justify-between items-center mb-1 text-[11px] font-mono">
                    <span className="text-[#8b5cf6] font-bold">{node.id}</span>
                    <span className="text-[#94a3b8]">{node.type}</span>
                  </div>
                  <div className="space-y-0.5 font-mono text-[10px]">
                    {Object.entries(node.fields || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[#94a3b8]">
                        <span>{k}:</span>
                        <span className="text-[#f1f5f9] font-medium">{String(v)}</span>
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
      <article className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-lg flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#10b981]">🥞</span>
            <h3 className="text-xs font-semibold text-[#f1f5f9] uppercase tracking-wide">
              Call Stack &amp; Lexical Scope Inspector
            </h3>
          </div>
          <span className="font-mono text-[10px] text-[#10b981]">
            {snapshot.callStack.length} Active Frame{snapshot.callStack.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {snapshot.callStack.map((frame, depth) => (
            <div
              key={frame.frameId}
              className={`rounded-lg border p-2.5 transition-all ${
                depth === snapshot.callStack.length - 1
                  ? 'bg-[#1a2234] border-[#00f2fe]/40 shadow-sm'
                  : 'bg-[#0d131e] border-[#242a36]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#00f2fe] font-bold">{frame.functionName}()</span>
                  <span className="text-[#94a3b8] text-[10px]">line {frame.line}</span>
                </div>
                <span className="text-[10px] text-[#94a3b8] bg-[#080e19] px-1.5 py-0.5 rounded">
                  depth {depth}
                </span>
              </div>

              {/* Variables Table */}
              {Object.keys(frame.scope).length === 0 ? (
                <div className="text-[11px] text-[#94a3b8] italic py-1">No local bindings in frame yet</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-xs">
                  {Object.entries(frame.scope).map(([name, v]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded bg-[#080e19]/60 px-2 py-1 border border-[#2a364f]/40"
                    >
                      <span className="text-[#00f2fe] truncate">
                        {v.isChanged && <span className="text-[#10b981] font-bold mr-1">+</span>}
                        {name}
                      </span>
                      <span className="text-[#f1f5f9] font-medium truncate ml-2">
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
