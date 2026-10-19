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
    <div className="flex flex-col gap-3 p-3 text-[#f1f5f9] select-none">
      {/* TOP COMMAND & TELEMETRY RIBBON */}
      <section className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#00f2fe]">Time-Travel Engine</span>
          <span className="text-[#2a364f]">/</span>
          <span className="text-xs font-semibold text-[#f1f5f9]">ODET Heap Tracing &amp; Diff Profiler</span>
          <span className="font-mono text-[10px] text-[#94a3b8] bg-[#0d131e] px-1.5 py-0.5 rounded border border-[#2a364f]">
            {state.fileName || 'active-trace.ts'}
          </span>
        </div>

        {/* Stepper Controls */}
        <div className="flex items-center gap-1.5 bg-[#0d131e] p-1 rounded-lg border border-[#2a364f]">
          <button
            type="button"
            onClick={first}
            disabled={state.tick === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161c27] text-xs text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
          >
            <span>⏮ First</span>
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={state.tick === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161c27] text-xs text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
          >
            <span>◀ Back</span>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-1 px-3 py-0.5 rounded bg-[#00f2fe] text-[#080e19] font-bold text-xs hover:bg-[#6ff6ff]"
          >
            <span>{state.playing ? '⏸ Pause' : '▶ Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={state.tick >= total - 1}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161c27] text-xs text-[#00f2fe] disabled:opacity-30"
          >
            <span>Next ▶</span>
          </button>
          <button
            type="button"
            onClick={last}
            disabled={state.tick >= total - 1}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161c27] text-xs text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
          >
            <span>Tail ⏭</span>
          </button>
          <div className="h-4 w-px bg-[#2a364f] mx-1" />
          <button
            type="button"
            onClick={() => setPinnedTick(pinnedTick === state.tick ? null : state.tick)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              pinnedTick === state.tick
                ? 'bg-[#8b5cf6] text-[#080e19] font-semibold'
                : 'bg-[#8b5cf6]/20 text-[#8b5cf6] hover:bg-[#8b5cf6]/30'
            }`}
          >
            <span>📌</span>
            <span>{pinnedTick === state.tick ? `Pinned T${currentTickNum}` : `Pin Tick ${currentTickNum}`}</span>
          </button>
        </div>
      </section>

      {/* METRIC OVERVIEW CARDS (4 Stitch Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Execution Horizon */}
        <div className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[#94a3b8]">
            <span>Total Execution Horizon</span>
            <span className="text-[#00f2fe]">⏱</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#f1f5f9]">{totalSteps}</span>
            <span className="text-xs font-mono text-[#00f2fe]">Tick #{currentTickNum} ({horizonPercent}%)</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#0d131e] overflow-hidden">
            <div className="h-full bg-[#00f2fe] transition-all" style={{ width: `${horizonPercent}%` }} />
          </div>
        </div>

        {/* Card 2: Peak Heap Memory */}
        <div className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[#94a3b8]">
            <span>Peak Heap Memory</span>
            <span className="text-[#10b981]">🧠</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#10b981]">{peakKb} KB</span>
            <span className="text-[10px] font-mono text-[#94a3b8]">{deltaText}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#0d131e] overflow-hidden">
            <div className="h-full bg-[#10b981] w-[65%]" />
          </div>
        </div>

        {/* Card 3: Heap Node Registry */}
        <div className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[#94a3b8]">
            <span>Heap Node Registry</span>
            <span className="text-[#8b5cf6]">📦</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#8b5cf6]">{totalAllocated}</span>
            <span className="text-[10px] font-mono text-[#94a3b8]">active on heap</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#0d131e] overflow-hidden flex gap-0.5">
            <div className="h-full bg-[#8b5cf6] flex-1" />
            <div className="h-full bg-[#00f2fe] flex-1" />
            <div className="h-full bg-[#2a364f] flex-1" />
          </div>
        </div>

        {/* Card 4: Pointer Mutability Writes */}
        <div className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[#94a3b8]">
            <span>Pointer Mutability Writes</span>
            <span className="text-[#f59e0b]">⚡</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#f59e0b]">{mutationCount}</span>
            <span className="text-[10px] font-mono text-[#94a3b8]">mutations</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#0d131e] overflow-hidden">
            <div className="h-full bg-[#f59e0b]" style={{ width: `${Math.min(100, mutationCount * 25)}%` }} />
          </div>
        </div>
      </section>

      {/* 3-TRACK INTERACTIVE FLAMECHART & MULTI-TRACK SCRUBBER */}
      <section className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-[#242a36] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[#00f2fe]">🔥</span>
            <h3 className="text-xs font-semibold text-[#f1f5f9] uppercase tracking-wide">
              Interactive Execution Flamechart &amp; Scrubber
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#94a3b8]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-[#00f2fe]" /> Track 1: Call Stack
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Track 2: Memory Events
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-[#8b5cf6]" /> Track 3: Mutation Intensity
            </span>
          </div>
        </div>

        {/* Active Instruction Ribbon */}
        <div className="rounded-lg bg-[#0d131e] px-3 py-1.5 text-xs font-mono border border-[#242a36] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#1a2234] px-1.5 py-0.5 text-[#00f2fe] font-bold">
              TICK {currentTickNum}
            </span>
            <span className="text-[#94a3b8]">{state.fileName}:line {currSnapshot.line} →</span>
            <span className="text-[#f1f5f9] font-semibold">{currSnapshot.codeSnippet}</span>
          </div>
          <span className="text-[#10b981] text-[11px]">{deltaText}</span>
        </div>

        {/* Multi-Track Canvas */}
        <div className="relative w-full rounded-lg bg-[#080e19] border border-[#242a36] p-3 flex flex-col gap-3 overflow-hidden">
          {/* Playhead Scrubber Line */}
          <div
            style={{ left: `${horizonPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-[#00f2fe] z-20 pointer-events-none transition-all shadow-[0_0_8px_#00f2fe]"
          >
            <div className="absolute -top-1 -left-3 px-1.5 py-0.5 rounded-full bg-[#00f2fe] text-[#080e19] font-mono text-[9px] font-bold">
              T{currentTickNum}
            </div>
          </div>

          {/* Track 1: Call Stack Flamechart */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[#94a3b8]">
              <span>Track 1: Call Stack Flame Graph (Depth across ticks)</span>
              <span>Frames: {currSnapshot.callStack.map((f) => f.functionName).join(' > ')}</span>
            </div>
            <div className="h-10 w-full bg-[#161c27]/40 rounded flex items-end gap-0.5 p-1 relative overflow-hidden">
              {timelineTrack.map((p, idx) => {
                const heightPercent = Math.min(100, Math.max(20, p.callDepth * 28));
                return (
                  <div
                    key={idx}
                    onClick={() => goto(idx)}
                    style={{ height: `${heightPercent}%` }}
                    className={`flex-1 rounded-sm cursor-pointer transition-all hover:bg-[#00f2fe] ${
                      idx === state.tick ? 'bg-[#00f2fe]' : 'bg-[#1a2234]'
                    }`}
                    title={`Tick ${p.tick}: Depth ${p.callDepth}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Track 2: Memory Events (Allocations & Deallocations) */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[#94a3b8]">
              <span>Track 2: Memory Events (Allocations &amp; Heap Delta)</span>
              <span>Heap Objects: {totalAllocated}</span>
            </div>
            <div className="h-6 w-full bg-[#161c27]/30 rounded flex items-center relative px-2">
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
                    <span className="h-2.5 w-2.5 rounded-full bg-[#10b981] block shadow-[0_0_6px_#10b981] group-hover:scale-150 transition-transform" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track 3: Variable Mutation Intensity Sparkline */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-[#94a3b8]">
              <span>Track 3: Variable Mutation &amp; Pointer Write Sparkline</span>
              <span>Mutations this tick: {mutationCount}</span>
            </div>
            <div className="h-9 w-full bg-[#161c27]/30 rounded relative flex items-end">
              <svg className="w-full h-8" preserveAspectRatio="none" viewBox="0 0 100 24">
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {sparklineData && (
                  <path d={sparklineData} fill="url(#sparkGrad)" stroke="#00f2fe" strokeWidth="1.2" />
                )}
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* SIDE-BY-SIDE MEMORY HEAP DIFF */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left Box: Snapshot at Tick N-1 */}
        <div className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[#242a36]">
            <div className="flex items-center gap-1.5 font-bold text-xs text-[#94a3b8]">
              <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
              <span>Snapshot at Tick {state.tick > 0 ? state.tick : 1}</span>
            </div>
            <span className="font-mono text-[10px] text-[#94a3b8] uppercase">PREVIOUS STATE</span>
          </div>

          {prevSnapshot ? (
            <div className="flex flex-col gap-2 text-xs font-mono">
              {/* Stack variables */}
              <div className="rounded bg-[#0d131e] p-2 border border-[#242a36]">
                <div className="text-[10px] text-[#94a3b8] uppercase font-bold mb-1">Scope Variables</div>
                {Object.entries(prevSnapshot.callStack[prevSnapshot.callStack.length - 1]?.scope || {}).map(
                  ([k, v]) => (
                    <div key={k} className="flex justify-between text-[#94a3b8]">
                      <span>{k}:</span>
                      <span className="text-[#f1f5f9]">{String(v.value)}</span>
                    </div>
                  )
                )}
              </div>

              {/* Heap Objects */}
              <div className="rounded bg-[#0d131e] p-2 border border-[#242a36]">
                <div className="text-[10px] text-[#94a3b8] uppercase font-bold mb-1">Heap Objects</div>
                {Object.entries(prevSnapshot.heap).map(([id, obj]) => (
                  <div key={id} className="text-[#94a3b8] mb-1">
                    <span className="text-[#8b5cf6] font-bold">{id}</span>: {obj.type === 'array' ? `[${obj.elements?.join(', ')}]` : JSON.stringify(obj.fields)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-[#94a3b8]">Initial tick — no previous snapshot.</div>
          )}
        </div>

        {/* Right Box: Snapshot at Tick N (Current Mutated State) */}
        <div className="rounded-xl border border-[#00f2fe]/40 bg-[#161c27] p-3 shadow-md flex flex-col gap-2">
          <div className="flex items-center justify-between pb-1 border-b border-[#242a36]">
            <div className="flex items-center gap-1.5 font-bold text-xs text-[#00f2fe]">
              <span className="h-2 w-2 rounded-full bg-[#00f2fe] shadow-[0_0_6px_#00f2fe]" />
              <span>Snapshot at Tick {currentTickNum}</span>
            </div>
            <span className="font-mono text-[10px] text-[#00f2fe] uppercase">MUTATED CURRENT</span>
          </div>

          <div className="flex flex-col gap-2 text-xs font-mono">
            {/* Scope Variables */}
            <div className="rounded bg-[#0d131e] p-2 border border-[#242a36]">
              <div className="text-[10px] text-[#00f2fe] uppercase font-bold mb-1">Scope Variables (Diff)</div>
              {Object.entries(currSnapshot.callStack[currSnapshot.callStack.length - 1]?.scope || {}).map(
                ([k, v]) => (
                  <div
                    key={k}
                    className={`flex justify-between p-0.5 rounded ${
                      v.isChanged ? 'bg-[#10b981]/15 text-[#10b981] font-bold' : 'text-[#f1f5f9]'
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
            <div className="rounded bg-[#0d131e] p-2 border border-[#242a36]">
              <div className="text-[10px] text-[#8b5cf6] uppercase font-bold mb-1">Heap Objects (Diff)</div>
              {Object.entries(currSnapshot.heap).map(([id, obj]) => {
                const isMutated = currSnapshot.memoryDiff?.changedHeapObjects.includes(id);
                return (
                  <div
                    key={id}
                    className={`p-1 rounded mb-1 ${
                      isMutated ? 'bg-[#8b5cf6]/20 border border-[#8b5cf6]/40' : 'text-[#94a3b8]'
                    }`}
                  >
                    <span className="text-[#8b5cf6] font-bold">{id}</span>:{' '}
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
