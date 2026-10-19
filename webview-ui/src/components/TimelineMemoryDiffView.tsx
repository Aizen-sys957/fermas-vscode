import { useState, useMemo } from 'react';
import { useStore } from '../state/store';
import type { TimelinePoint } from '../types';

export function TimelineMemoryDiffView() {
  const {
    state,
    snapshot,
    total,
    goto,
    step,
    first,
    last,
    togglePlay,
  } = useStore();

  const [pinnedTick, setPinnedTick] = useState<number | null>(null);

  const prevSnapshot = state.tick > 0 ? state.snapshots[state.tick - 1] : undefined;
  const currSnapshot = snapshot;

  const timelineTrack: TimelinePoint[] = useMemo(() => {
    if (state.snapshots.length === 0) return [];
    if (currSnapshot?.timelineTrack && currSnapshot.timelineTrack.length === state.snapshots.length) {
      return currSnapshot.timelineTrack;
    }
    return state.snapshots.map((s, idx) => ({
      tick: idx + 1,
      callDepth: s.callStack.length,
      allocations: (s.memoryDiff?.changedHeapObjects || []).map((id) => ({ id, label: id })),
      mutationCount: s.memoryDiff?.mutationsCount || 0,
      activeLine: s.line,
      isBreakpoint: s.event === 'loop' || s.event === 'call',
      hasAnomaly: (s.diagnostics || []).some((d) => d.type === 'error' || d.type === 'warning'),
    }));
  }, [state.snapshots, currSnapshot]);

  if (!currSnapshot) {
    return (
      <div className="p-8 text-center text-[#94a3b8]">
        <p>No active trace. Start stepping to inspect timeline and memory diffs.</p>
      </div>
    );
  }

  // Metric computations
  const totalSteps = total;
  const currentTickNum = state.tick + 1;
  const horizonPercent = totalSteps > 0 ? ((currentTickNum / totalSteps) * 100).toFixed(1) : '0';
  const peakBytes = currSnapshot.memoryDiff?.peakHeapBytes ?? 512 * 1024;
  const peakKb = Math.max(64, Math.round(peakBytes / 1024));
  const deltaBytes = currSnapshot.memoryDiff?.heapDeltaBytes ?? 0;
  const deltaText = deltaBytes >= 0 ? `+${deltaBytes} B this tick` : `${deltaBytes} B this tick`;
  const totalAllocated = currSnapshot.memoryDiff?.totalAllocatedObjects ?? Object.keys(currSnapshot.heap).length;
  const mutationCount = currSnapshot.memoryDiff?.mutationsCount ?? 0;

  // Sparkline path generator
  const sparklineData = useMemo(() => {
    if (timelineTrack.length === 0) return '';
    const maxMut = Math.max(1, ...timelineTrack.map((p) => p.mutationCount));
    const width = 100;
    const height = 24;

    const points = timelineTrack.map((p, idx) => {
      const x = (idx / Math.max(1, timelineTrack.length - 1)) * width;
      const y = height - (p.mutationCount / maxMut) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
  }, [timelineTrack]);

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--vscode-foreground,#cccccc)] select-none">
      {/* TOP COMMAND & TELEMETRY RIBBON */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--vscode-textLink-foreground,#3794ff)]" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--vscode-foreground,#cccccc)]">Time-Travel Engine</span>
          <span className="text-[var(--vscode-panel-border,#333333)]">/</span>
          <span className="text-xs font-semibold text-[var(--vscode-foreground,#ffffff)]">Heap Tracing &amp; Diff Profiler</span>
          <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] bg-[var(--vscode-editor-background,#1e1e1e)] px-1.5 py-0.5 rounded border border-[var(--vscode-panel-border,#333333)]">
            {state.fileName || 'active-trace.ts'}
          </span>
        </div>

        {/* Stepper Controls */}
        <div className="flex items-center gap-1.5 bg-[var(--vscode-editor-background,#1e1e1e)] p-1 rounded-lg border border-[var(--vscode-panel-border,#333333)]">
          <button
            type="button"
            onClick={first}
            disabled={state.tick === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-xs text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
          >
            <span>⏮ First</span>
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={state.tick === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-xs text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
          >
            <span>◀ Back</span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1 px-3 py-0.5 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium text-xs hover:bg-[var(--vscode-button-hoverBackground,#1177bb)]"
          >
            <span>{state.playing ? '⏸ Pause' : '▶ Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={state.tick >= total - 1}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-xs text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
          >
            <span>Next ▶</span>
          </button>
          <button
            type="button"
            onClick={last}
            disabled={state.tick >= total - 1}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-xs text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
          >
            <span>Tail ⏭</span>
          </button>
          <div className="h-4 w-px bg-[var(--vscode-panel-border,#333333)] mx-1" />
          <button
            type="button"
            onClick={() => setPinnedTick(pinnedTick === state.tick ? null : state.tick)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              pinnedTick === state.tick
                ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium'
                : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)]'
            }`}
          >
            <span>📌</span>
            <span>{pinnedTick === state.tick ? `Pinned T${currentTickNum}` : `Pin Tick ${currentTickNum}`}</span>
          </button>
        </div>
      </section>

      {/* METRIC OVERVIEW CARDS (4 Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Execution Horizon */}
        <div className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            <span>Total Execution Horizon</span>
            <span className="text-[#38bdf8]">⏱</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[var(--vscode-foreground,#ffffff)]">{totalSteps}</span>
            <span className="text-xs font-mono text-[var(--vscode-textLink-foreground,#3794ff)]">Tick #{currentTickNum} ({horizonPercent}%)</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--vscode-editor-background,#1e1e1e)] overflow-hidden">
            <div className="h-full bg-[var(--vscode-focusBorder,#007fd4)] transition-all" style={{ width: `${horizonPercent}%` }} />
          </div>
        </div>

        {/* Card 2: Peak Heap Memory */}
        <div className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            <span>Peak Heap Memory</span>
            <span className="text-[#34d399]">🧠</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#34d399]">{peakKb} KB</span>
            <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">{deltaText}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--vscode-editor-background,#1e1e1e)] overflow-hidden">
            <div className="h-full bg-[#34d399] w-[65%]" />
          </div>
        </div>

        {/* Card 3: Heap Node Registry */}
        <div className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            <span>Heap Node Registry</span>
            <span className="text-[#a78bfa]">📦</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#a78bfa]">{totalAllocated}</span>
            <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">active on heap</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--vscode-editor-background,#1e1e1e)] overflow-hidden flex gap-0.5">
            <div className="h-full bg-[#a78bfa] flex-1" />
            <div className="h-full bg-[var(--vscode-focusBorder,#007fd4)] flex-1" />
            <div className="h-full bg-[var(--vscode-panel-border,#333333)] flex-1" />
          </div>
        </div>

        {/* Card 4: Pointer Mutability Writes */}
        <div className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            <span>Pointer Mutability Writes</span>
            <span className="text-[#fbbf24]">⚡</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#fbbf24]">{mutationCount}</span>
            <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">mutations</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--vscode-editor-background,#1e1e1e)] overflow-hidden">
            <div className="h-full bg-[#fbbf24]" style={{ width: `${Math.min(100, mutationCount * 25)}%` }} />
          </div>
        </div>
      </section>

      {/* 3-TRACK INTERACTIVE FLAMECHART & MULTI-TRACK SCRUBBER */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-[var(--vscode-panel-border,#333333)] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[var(--vscode-textLink-foreground,#3794ff)]">🔥</span>
            <h3 className="text-xs font-semibold text-[var(--vscode-foreground,#ffffff)] uppercase tracking-wide">
              Interactive Execution Flamechart &amp; Scrubber
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-[var(--vscode-focusBorder,#007fd4)]" /> Track 1: Call Stack
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#34d399]" /> Track 2: Memory Events
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-[#a78bfa]" /> Track 3: Mutation Intensity
            </span>
          </div>
        </div>

        {/* Active Instruction Ribbon */}
        <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-3 py-1.5 text-xs font-mono border border-[var(--vscode-panel-border,#333333)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--vscode-badge-background,#4d4d4d)] px-1.5 py-0.5 text-[var(--vscode-badge-foreground,#ffffff)] font-semibold text-[11px]">
              TICK {currentTickNum}
            </span>
            <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">{state.fileName}:line {currSnapshot.line} →</span>
            <span className="text-[var(--vscode-foreground,#ffffff)] font-medium">{currSnapshot.codeSnippet}</span>
          </div>
          <span className="text-[#34d399] text-[11px]">{deltaText}</span>
        </div>

        {/* Multi-Track Canvas */}
        <div className="relative w-full rounded bg-[var(--vscode-editor-background,#1e1e1e)] border border-[var(--vscode-panel-border,#333333)] p-3 flex flex-col gap-3 overflow-hidden">
          {/* Playhead Scrubber Line */}
          <div
            style={{ left: `${horizonPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-[var(--vscode-focusBorder,#007fd4)] z-20 pointer-events-none transition-all"
          >
            <div className="absolute -top-1 -left-3 px-1.5 py-0.5 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-mono text-[9px] font-semibold">
              T{currentTickNum}
            </div>
          </div>

          {/* Track 1: Call Stack Flamechart */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
              <span>Track 1: Call Stack Flame Graph (Depth across ticks)</span>
              <span>Frames: {currSnapshot.callStack.map((f) => f.functionName).join(' > ')}</span>
            </div>
            <div className="h-10 w-full bg-[var(--vscode-sideBar-background,#181818)] rounded flex items-end gap-0.5 p-1 relative overflow-hidden border border-[var(--vscode-panel-border,#333333)]">
              {timelineTrack.map((p, idx) => {
                const heightPercent = Math.min(100, Math.max(20, p.callDepth * 28));
                return (
                  <div
                    key={idx}
                    onClick={() => goto(idx)}
                    style={{ height: `${heightPercent}%` }}
                    className={`flex-1 rounded-sm cursor-pointer transition-all hover:bg-[var(--vscode-focusBorder,#007fd4)] ${
                      idx === state.tick ? 'bg-[var(--vscode-focusBorder,#007fd4)]' : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)]'
                    }`}
                    title={`Tick ${p.tick}: Depth ${p.callDepth}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Track 2: Memory Events (Allocations & Deallocations) */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
              <span>Track 2: Memory Events (Allocations &amp; Heap Delta)</span>
              <span>Heap Objects: {totalAllocated}</span>
            </div>
            <div className="h-6 w-full bg-[var(--vscode-sideBar-background,#181818)] rounded flex items-center relative px-2 border border-[var(--vscode-panel-border,#333333)]">
              {timelineTrack.map((p, idx) => {
                if (p.allocations.length === 0) return null;
                const leftPos = (idx / Math.max(1, timelineTrack.length - 1)) * 100;
                return (
                  <div
                    key={idx}
                    onClick={() => goto(idx)}
                    style={{ left: `${leftPos}%` }}
                    className="absolute -translate-x-1/2 cursor-pointer group"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-[#34d399] block group-hover:scale-125 transition-transform" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track 3: Variable Mutation Intensity Sparkline */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
              <span>Track 3: Variable Mutation &amp; Pointer Write Sparkline</span>
              <span>Mutations this tick: {mutationCount}</span>
            </div>
            <div className="h-9 w-full bg-[var(--vscode-sideBar-background,#181818)] rounded relative flex items-end border border-[var(--vscode-panel-border,#333333)]">
              <svg className="w-full h-8" preserveAspectRatio="none" viewBox="0 0 100 24">
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--vscode-focusBorder,#007fd4)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--vscode-focusBorder,#007fd4)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {sparklineData && (
                  <path d={sparklineData} fill="url(#sparkGrad)" stroke="var(--vscode-focusBorder,#007fd4)" strokeWidth="1.2" />
                )}
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* SIDE-BY-SIDE MEMORY HEAP DIFF */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left Box: Snapshot at Tick N-1 */}
        <div className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--vscode-panel-border,#333333)]">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)]">
              <span className="h-2 w-2 rounded-full bg-[var(--vscode-descriptionForeground,#8c8c8c)]" />
              <span>Snapshot at Tick {state.tick > 0 ? state.tick : 1}</span>
            </div>
            <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] uppercase">PREVIOUS STATE</span>
          </div>

          {prevSnapshot ? (
            <div className="flex flex-col gap-2 text-xs font-mono">
              {/* Stack variables */}
              <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-2 border border-[var(--vscode-panel-border,#333333)]">
                <div className="text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] uppercase font-semibold mb-1">Scope Variables</div>
                {Object.entries(prevSnapshot.callStack[prevSnapshot.callStack.length - 1]?.scope || {}).map(
                  ([k, v]) => (
                    <div key={k} className="flex justify-between text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                      <span>{k}:</span>
                      <span className="text-[var(--vscode-foreground,#ffffff)]">{String(v.value)}</span>
                    </div>
                  )
                )}
              </div>

              {/* Heap Objects */}
              <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-2 border border-[var(--vscode-panel-border,#333333)]">
                <div className="text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] uppercase font-semibold mb-1">Heap Objects</div>
                {Object.entries(prevSnapshot.heap).map(([id, obj]) => (
                  <div key={id} className="text-[var(--vscode-descriptionForeground,#8c8c8c)] mb-1">
                    <span className="text-[#a78bfa] font-medium">{id}</span>: {obj.type === 'array' ? `[${obj.elements?.join(', ')}]` : JSON.stringify(obj.fields)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)]">Initial tick — no previous snapshot.</div>
          )}
        </div>

        {/* Right Box: Snapshot at Tick N (Current Mutated State) */}
        <div className="rounded-lg border border-[var(--vscode-focusBorder,#007fd4)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--vscode-panel-border,#333333)]">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--vscode-textLink-foreground,#3794ff)]">
              <span className="h-2 w-2 rounded-full bg-[var(--vscode-textLink-foreground,#3794ff)]" />
              <span>Snapshot at Tick {currentTickNum}</span>
            </div>
            <span className="font-mono text-[10px] text-[var(--vscode-textLink-foreground,#3794ff)] uppercase">MUTATED CURRENT</span>
          </div>

          <div className="flex flex-col gap-2 text-xs font-mono">
            {/* Scope Variables */}
            <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-2 border border-[var(--vscode-panel-border,#333333)]">
              <div className="text-[10px] text-[var(--vscode-textLink-foreground,#3794ff)] uppercase font-semibold mb-1">Scope Variables (Diff)</div>
              {Object.entries(currSnapshot.callStack[currSnapshot.callStack.length - 1]?.scope || {}).map(
                ([k, v]) => (
                  <div
                    key={k}
                    className={`flex justify-between p-0.5 rounded ${
                      v.isChanged ? 'bg-[#34d399]/15 text-[#34d399] font-medium' : 'text-[var(--vscode-foreground,#ffffff)]'
                    }`}
                  >
                    <span>
                      {v.isChanged && '+ '}
                      {k}:
                    </span>
                    <span>{String(v.value)}</span>
                  </div>
                )
              )}
            </div>

            {/* Heap Objects */}
            <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-2 border border-[var(--vscode-panel-border,#333333)]">
              <div className="text-[10px] text-[#a78bfa] uppercase font-semibold mb-1">Heap Objects (Diff)</div>
              {Object.entries(currSnapshot.heap).map(([id, obj]) => {
                const isMutated = currSnapshot.memoryDiff?.changedHeapObjects.includes(id);
                return (
                  <div
                    key={id}
                    className={`p-1 rounded mb-1 ${
                      isMutated ? 'bg-[#a78bfa]/15 border border-[#a78bfa]/30' : 'text-[var(--vscode-descriptionForeground,#8c8c8c)]'
                    }`}
                  >
                    <span className="text-[#a78bfa] font-medium">{id}</span>:{' '}
                    {obj.type === 'array' ? `[${obj.elements?.join(', ')}]` : JSON.stringify(obj.fields)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
