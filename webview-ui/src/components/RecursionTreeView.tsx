import { useState, useMemo } from 'react';
import { useStore } from '../state/store';
import type { CallTreeNode } from '../types';

export function RecursionTreeView() {
  const {
    state,
    snapshot,
    total,
    goto,
    step,
    first,
    last,
    togglePlay,
    revealLine,
    selectedCallNodeId,
    setSelectedCallNodeId,
  } = useStore();

  const [zoom, setZoom] = useState(100);
  const [layoutMode, setLayoutMode] = useState<'tree' | 'force'>('tree');
  const [activePathOnly, setActivePathOnly] = useState(false);
  const [showMemoCache, setShowMemoCache] = useState(false);

  const callTree = snapshot?.callTree ?? [];
  const activeCallId = snapshot?.activeCallTreeId;

  // Compute maximum depth
  const maxDepth = useMemo(() => {
    return callTree.reduce((max, node) => Math.max(max, node.depth), 0);
  }, [callTree]);

  const currentFrame = snapshot?.callStack[snapshot.callStack.length - 1];

  // Build tree hierarchy for rendering
  const treeLayout = useMemo(() => {
    if (callTree.length === 0) return [];

    // Filter nodes if activePathOnly is selected
    const nodesToRender = activePathOnly
      ? callTree.filter((n) => n.status === 'active' || n.id === activeCallId)
      : callTree;

    // Group by depth
    const depthGroups: Record<number, CallTreeNode[]> = {};
    nodesToRender.forEach((node) => {
      const d = node.depth;
      if (!depthGroups[d]) depthGroups[d] = [];
      depthGroups[d].push(node);
    });

    const calculated: {
      node: CallTreeNode;
      x: number;
      y: number;
      parentX?: number;
      parentY?: number;
    }[] = [];

    const nodeCoords = new Map<string, { x: number; y: number }>();

    Object.entries(depthGroups).forEach(([depthStr, nodes]) => {
      const depth = Number(depthStr);
      const totalInDepth = nodes.length;
      const widthPerNode = Math.max(160, 800 / (totalInDepth + 1));

      nodes.forEach((node, idx) => {
        const x = (idx + 1) * widthPerNode;
        const y = depth * 110 + 60;
        nodeCoords.set(node.id, { x, y });

        let parentCoord;
        if (node.parentId && nodeCoords.has(node.parentId)) {
          parentCoord = nodeCoords.get(node.parentId);
        }

        calculated.push({
          node,
          x,
          y,
          parentX: parentCoord?.x,
          parentY: parentCoord?.y,
        });
      });
    });

    return calculated;
  }, [callTree, activePathOnly, activeCallId]);

  if (!snapshot) {
    return (
      <div className="p-8 text-center text-[#94a3b8]">
        <p>No active trace. Start stepping to visualize the dynamic call tree.</p>
      </div>
    );
  }

  const selectedNode = callTree.find((n) => n.id === selectedCallNodeId) || callTree.find((n) => n.id === activeCallId);

  return (
    <div className="flex flex-col gap-3 p-3 text-[#f1f5f9] select-none">
      {/* TOP TELEMETRY RIBBON */}
      <section className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded bg-[#1a2234] px-2.5 py-1 text-xs border border-[#2a364f]">
            <span className="text-[#00f2fe]">🌳</span>
            <span className="font-semibold text-[#f1f5f9]">{currentFrame?.functionName || 'main'}()</span>
            <span className="text-[#94a3b8]">›</span>
            <span className="text-[#00f2fe] font-mono">
              Depth: {currentFrame ? snapshot.callStack.length - 1 : 0}{' '}
              <span className="text-[#94a3b8]">(Max: {maxDepth})</span>
            </span>
          </div>

          <div className="flex items-center gap-1 rounded bg-[#0d131e] px-2 py-1 text-xs font-mono border border-[#2a364f]">
            <span className="text-[#94a3b8] uppercase text-[10px]">Invocations:</span>
            <span className="text-[#10b981] font-bold">{callTree.length} nodes</span>
          </div>
        </div>

        {/* Canvas Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* Zoom Buttons */}
          <div className="flex items-center rounded bg-[#0d131e] p-0.5 border border-[#2a364f]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="h-6 w-6 rounded flex items-center justify-center text-xs text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1a2234]"
            >
              -
            </button>
            <span className="px-2 font-mono text-[11px] text-[#00f2fe]">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(180, z + 15))}
              className="h-6 w-6 rounded flex items-center justify-center text-xs text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1a2234]"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="px-2 h-6 text-[10px] text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1a2234] rounded"
            >
              Center
            </button>
          </div>

          {/* Layout Toggle */}
          <div className="flex items-center rounded bg-[#0d131e] p-0.5 border border-[#2a364f] text-xs">
            <button
              type="button"
              onClick={() => setLayoutMode('tree')}
              className={`px-2 py-0.5 rounded ${
                layoutMode === 'tree' ? 'bg-[#1a2234] text-[#00f2fe] font-medium' : 'text-[#94a3b8]'
              }`}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('force')}
              className={`px-2 py-0.5 rounded ${
                layoutMode === 'force' ? 'bg-[#1a2234] text-[#00f2fe] font-medium' : 'text-[#94a3b8]'
              }`}
            >
              Force
            </button>
          </div>

          {/* Active Path Only */}
          <button
            type="button"
            onClick={() => setActivePathOnly(!activePathOnly)}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${
              activePathOnly
                ? 'bg-[#00f2fe]/15 text-[#00f2fe] border-[#00f2fe]/40'
                : 'bg-[#1a2234] text-[#94a3b8] border-[#2a364f]'
            }`}
          >
            Active Path Only
          </button>

          {/* Memo Toggle */}
          <button
            type="button"
            onClick={() => setShowMemoCache(!showMemoCache)}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${
              showMemoCache
                ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border-[#8b5cf6]/40'
                : 'bg-[#1a2234] text-[#94a3b8] border-[#2a364f]'
            }`}
          >
            Memo Cache
          </button>
        </div>
      </section>

      {/* STEPPER BAR */}
      <section className="rounded-xl border border-[#2a364f] bg-[#0d131e] p-2.5 shadow-inner flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={first}
              disabled={state.tick === 0}
              className="h-6 w-6 rounded bg-[#161c27] border border-[#2a364f] text-[10px] text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={state.tick === 0}
              className="h-6 px-2 rounded bg-[#161c27] border border-[#2a364f] text-[10px] text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="h-6 px-3 rounded bg-[#00f2fe] text-[#080e19] font-bold text-xs hover:bg-[#6ff6ff]"
            >
              {state.playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={state.tick >= total - 1}
              className="h-6 px-2 rounded bg-[#161c27] border border-[#2a364f] text-[10px] text-[#00f2fe] disabled:opacity-30"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={last}
              disabled={state.tick >= total - 1}
              className="h-6 w-6 rounded bg-[#161c27] border border-[#2a364f] text-[10px] text-[#94a3b8] hover:text-[#00f2fe] disabled:opacity-30"
            >
              ⏭
            </button>
          </div>

          <span className="font-mono text-xs text-[#00f2fe]">
            Step {state.tick + 1} <span className="text-[#94a3b8]">/ {total}</span>
          </span>
        </div>

        {/* Active Line Chip */}
        <div
          onClick={() => revealLine(snapshot.line)}
          className="flex items-center gap-2 rounded bg-[#161c27] px-2.5 py-1 text-xs border border-[#2a364f] cursor-pointer hover:border-[#00f2fe]"
        >
          <span className="h-2 w-2 rounded-full bg-[#00f2fe] animate-pulse" />
          <span className="text-[#94a3b8] text-[11px]">Active Line:</span>
          <code className="font-mono text-[#00f2fe] truncate max-w-xs">{snapshot.codeSnippet || 'return;'}</code>
          <span className="font-mono text-[10px] text-[#94a3b8]">:{snapshot.line}</span>
        </div>
      </section>

      {/* 2D CALL TREE TOPOLOGY CANVAS */}
      <section className="relative w-full h-[540px] rounded-xl border border-[#2a364f] bg-[#080e19] overflow-hidden shadow-2xl flex flex-col">
        {/* Canvas Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#161c27]/80 backdrop-blur-md border-b border-[#242a36] z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]">Dynamic Call Tree</span>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1 text-[#10b981]">
                <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Resolved
              </span>
              <span className="inline-flex items-center gap-1 text-[#00f2fe]">
                <span className="h-2 w-2 rounded-full bg-[#00f2fe] animate-pulse" /> Active
              </span>
              <span className="inline-flex items-center gap-1 text-[#f59e0b]">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Pruned
              </span>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[#94a3b8]">Pan/Scroll enabled</span>
        </div>

        {/* Interactive SVG Canvas */}
        <div className="relative flex-1 overflow-auto p-4 cursor-grab active:cursor-grabbing">
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', minWidth: '900px', minHeight: '480px' }}
            className="relative"
          >
            {/* SVG Connecting Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: '900px', minHeight: '480px' }}>
              <defs>
                <linearGradient id="treeEdgeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.7" />
                  <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.4" />
                </linearGradient>
              </defs>
              {treeLayout.map(({ node, x, y, parentX, parentY }) => {
                if (parentX === undefined || parentY === undefined) return null;
                const cY = (parentY + y) / 2;
                return (
                  <path
                    key={`edge-${node.id}`}
                    d={`M ${parentX} ${parentY + 20} C ${parentX} ${cY}, ${x} ${cY}, ${x} ${y - 20}`}
                    fill="none"
                    stroke={node.id === activeCallId ? '#00f2fe' : '#2a364f'}
                    strokeWidth={node.id === activeCallId ? 2.5 : 1.5}
                    strokeDasharray={node.status === 'active' ? '4 2' : undefined}
                  />
                );
              })}
            </svg>

            {/* Tree Nodes */}
            {treeLayout.map(({ node, x, y }) => {
              const isActive = node.id === activeCallId;
              const isSelected = node.id === selectedCallNodeId;
              const isResolved = node.status === 'resolved';

              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedCallNodeId(node.id);
                    if (node.startTick) goto(node.startTick - 1);
                  }}
                  style={{ left: `${x - 70}px`, top: `${y - 22}px` }}
                  className={`absolute w-36 rounded-lg p-2 text-center transition-all cursor-pointer shadow-lg border ${
                    isActive
                      ? 'bg-[#1a2234] border-[#00f2fe] text-[#00f2fe] ring-2 ring-[#00f2fe]/30 scale-105'
                      : isSelected
                      ? 'bg-[#242a36] border-[#8b5cf6] text-[#f1f5f9]'
                      : isResolved
                      ? 'bg-[#161c27] border-[#10b981]/40 text-[#f1f5f9]'
                      : 'bg-[#161c27] border-[#2a364f] text-[#94a3b8]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono text-[#94a3b8] mb-0.5">
                    <span>d:{node.depth}</span>
                    <span className={isResolved ? 'text-[#10b981]' : isActive ? 'text-[#00f2fe]' : 'text-[#f59e0b]'}>
                      {isResolved ? '✓' : isActive ? '▶' : '⟲'}
                    </span>
                  </div>

                  <div className="font-mono text-xs font-bold truncate">{node.functionName}()</div>

                  {/* Arguments preview */}
                  <div className="font-mono text-[9px] text-[#94a3b8] truncate mt-0.5">
                    {Object.values(node.args).map((val) =>
                      typeof val === 'object' ? JSON.stringify(val) : String(val)
                    ).join(', ')}
                  </div>

                  {/* Return value chip if resolved */}
                  {node.returnValue !== undefined && (
                    <div className="mt-1 rounded bg-[#080e19] px-1 py-0.5 font-mono text-[9px] text-[#10b981] truncate">
                      → {typeof node.returnValue === 'object' ? JSON.stringify(node.returnValue) : String(node.returnValue)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Node Details Bar */}
        {selectedNode && (
          <div className="p-2.5 bg-[#161c27] border-t border-[#242a36] flex flex-wrap items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-[#00f2fe]">{selectedNode.functionName}()</span>
              <span className="text-[#94a3b8]">
                Arguments: <code className="font-mono text-[#f1f5f9]">{JSON.stringify(selectedNode.args)}</code>
              </span>
              {selectedNode.returnValue !== undefined && (
                <span className="text-[#10b981]">
                  Return: <code className="font-mono">{JSON.stringify(selectedNode.returnValue)}</code>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => goto(selectedNode.startTick - 1)}
              className="text-[11px] text-[#00f2fe] hover:underline"
            >
              Jump to Tick #{selectedNode.startTick} ↗
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
