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
  } = useStore();

  const [selectedCallNodeId, setSelectedCallNodeId] = useState<string | null>(null);
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
    <div className="flex flex-col gap-3 p-3 text-[var(--vscode-foreground,#cccccc)] select-none">
      {/* TOP TELEMETRY RIBBON */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-2.5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-2.5 py-1 text-xs border border-[var(--vscode-panel-border,#333333)]">
            <span className="text-[#38bdf8]">🌳</span>
            <span className="font-semibold text-[var(--vscode-foreground,#ffffff)]">{currentFrame?.functionName || 'main'}()</span>
            <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">›</span>
            <span className="text-[var(--vscode-textLink-foreground,#3794ff)] font-mono">
              Depth: {currentFrame ? snapshot.callStack.length - 1 : 0}{' '}
              <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">(Max: {maxDepth})</span>
            </span>
          </div>

          <div className="flex items-center gap-1 rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-2 py-1 text-xs font-mono border border-[var(--vscode-panel-border,#333333)]">
            <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)] uppercase text-[10px]">Invocations:</span>
            <span className="text-[#34d399] font-medium">{callTree.length} nodes</span>
          </div>
        </div>

        {/* Canvas Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* Zoom Buttons */}
          <div className="flex items-center rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-0.5 border border-[var(--vscode-panel-border,#333333)]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="h-6 w-6 rounded flex items-center justify-center text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#ffffff)] hover:bg-[var(--vscode-toolbar-hoverBackground,#2a2d2e)]"
            >
              -
            </button>
            <span className="px-2 font-mono text-[11px] text-[var(--vscode-foreground,#cccccc)]">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(180, z + 15))}
              className="h-6 w-6 rounded flex items-center justify-center text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#ffffff)] hover:bg-[var(--vscode-toolbar-hoverBackground,#2a2d2e)]"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="px-2 h-6 text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#ffffff)] hover:bg-[var(--vscode-toolbar-hoverBackground,#2a2d2e)] rounded"
            >
              Center
            </button>
          </div>

          {/* Layout Toggle */}
          <div className="flex items-center rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-0.5 border border-[var(--vscode-panel-border,#333333)] text-xs">
            <button
              type="button"
              onClick={() => setLayoutMode('tree')}
              className={`px-2 py-0.5 rounded transition-colors ${
                layoutMode === 'tree'
                  ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium'
                  : 'text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#ffffff)]'
              }`}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('force')}
              className={`px-2 py-0.5 rounded transition-colors ${
                layoutMode === 'force'
                  ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium'
                  : 'text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#ffffff)]'
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
                ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] border-[var(--vscode-focusBorder,#007fd4)]'
                : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] border-[var(--vscode-panel-border,#333333)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)]'
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
                ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] border-[var(--vscode-focusBorder,#007fd4)]'
                : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] border-[var(--vscode-panel-border,#333333)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)]'
            }`}
          >
            Memo Cache
          </button>
        </div>
      </section>

      {/* STEPPER BAR */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-2 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={first}
              disabled={state.tick === 0}
              className="h-6 w-6 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)] text-[10px] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={state.tick === 0}
              className="h-6 px-2 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)] text-[10px] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="h-6 px-3 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium text-xs hover:bg-[var(--vscode-button-hoverBackground,#1177bb)]"
            >
              {state.playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={state.tick >= total - 1}
              className="h-6 px-2 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)] text-[10px] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={last}
              disabled={state.tick >= total - 1}
              className="h-6 w-6 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] border border-[var(--vscode-panel-border,#333333)] text-[10px] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] disabled:opacity-30"
            >
              ⏭
            </button>
          </div>

          <span className="font-mono text-xs text-[var(--vscode-foreground,#cccccc)]">
            Step <span className="font-semibold text-[var(--vscode-textLink-foreground,#3794ff)]">{state.tick + 1}</span>{' '}
            <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">/ {total}</span>
          </span>
        </div>

        {/* Active Line Chip */}
        <div
          onClick={() => revealLine(snapshot.line)}
          className="flex items-center gap-2 rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-2.5 py-1 text-xs border border-[var(--vscode-panel-border,#333333)] cursor-pointer hover:border-[var(--vscode-focusBorder,#007fd4)] transition-colors"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--vscode-textLink-foreground,#3794ff)]" />
          <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)] text-[11px]">Active Line:</span>
          <code className="font-mono text-[var(--vscode-textLink-foreground,#3794ff)] truncate max-w-xs">{snapshot.codeSnippet || 'return;'}</code>
          <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">:{snapshot.line}</span>
        </div>
      </section>

      {/* 2D CALL TREE TOPOLOGY CANVAS */}
      <section className="relative w-full h-[540px] rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-editor-background,#1e1e1e)] overflow-hidden shadow-sm flex flex-col">
        {/* Canvas Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--vscode-sideBar-background,#181818)] border-b border-[var(--vscode-panel-border,#333333)] z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground,#8c8c8c)]">Dynamic Call Tree</span>
            <div className="flex items-center gap-2.5 text-[10px]">
              <span className="inline-flex items-center gap-1 text-[#34d399]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> Resolved
              </span>
              <span className="inline-flex items-center gap-1 text-[var(--vscode-textLink-foreground,#3794ff)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--vscode-textLink-foreground,#3794ff)]" /> Active
              </span>
              <span className="inline-flex items-center gap-1 text-[#fbbf24]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" /> Pruned
              </span>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">Pan/Scroll enabled</span>
        </div>

        {/* Interactive SVG Canvas */}
        <div className="relative flex-1 overflow-auto p-4 cursor-grab active:cursor-grabbing">
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', minWidth: '900px', minHeight: '480px' }}
            className="relative"
          >
            {/* SVG Connecting Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: '900px', minHeight: '480px' }}>
              {treeLayout.map(({ node, x, y, parentX, parentY }) => {
                if (parentX === undefined || parentY === undefined) return null;
                const cY = (parentY + y) / 2;
                const isActiveEdge = node.id === activeCallId;
                return (
                  <path
                    key={`edge-${node.id}`}
                    d={`M ${parentX} ${parentY + 20} C ${parentX} ${cY}, ${x} ${cY}, ${x} ${y - 20}`}
                    fill="none"
                    stroke={isActiveEdge ? 'var(--vscode-focusBorder,#007fd4)' : 'var(--vscode-panel-border,#333333)'}
                    strokeWidth={isActiveEdge ? 2 : 1}
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
                  className={`absolute w-36 rounded-md p-2 text-center transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-[var(--vscode-list-activeSelectionBackground,#094771)] border-[var(--vscode-focusBorder,#007fd4)] text-[var(--vscode-foreground,#ffffff)] ring-1 ring-[var(--vscode-focusBorder,#007fd4)]'
                      : isSelected
                      ? 'bg-[var(--vscode-editorWidget-background,#252526)] border-[var(--vscode-focusBorder,#007fd4)] text-[var(--vscode-foreground,#ffffff)]'
                      : isResolved
                      ? 'bg-[var(--vscode-sideBar-background,#181818)] border-[var(--vscode-panel-border,#333333)] text-[var(--vscode-foreground,#cccccc)] hover:border-[var(--vscode-focusBorder,#007fd4)]'
                      : 'bg-[var(--vscode-sideBar-background,#181818)] border-[var(--vscode-panel-border,#333333)] text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:border-[var(--vscode-focusBorder,#007fd4)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)] mb-0.5">
                    <span>d:{node.depth}</span>
                    <span className={isResolved ? 'text-[#34d399]' : isActive ? 'text-[var(--vscode-textLink-foreground,#3794ff)]' : 'text-[#fbbf24]'}>
                      {isResolved ? '✓' : isActive ? '▶' : '⟲'}
                    </span>
                  </div>

                  <div className="font-mono text-xs font-semibold truncate">{node.functionName}()</div>

                  {/* Arguments preview */}
                  <div className="font-mono text-[9px] text-[var(--vscode-descriptionForeground,#8c8c8c)] truncate mt-0.5">
                    {Object.values(node.args).map((val) =>
                      typeof val === 'object' ? JSON.stringify(val) : String(val)
                    ).join(', ')}
                  </div>

                  {/* Return value chip if resolved */}
                  {node.returnValue !== undefined && (
                    <div className="mt-1 rounded bg-[var(--vscode-editor-background,#1e1e1e)] px-1 py-0.5 font-mono text-[9px] text-[#34d399] truncate border border-[var(--vscode-panel-border,#333333)]">
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
          <div className="p-2.5 bg-[var(--vscode-sideBar-background,#181818)] border-t border-[var(--vscode-panel-border,#333333)] flex flex-wrap items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold text-[var(--vscode-textLink-foreground,#3794ff)]">{selectedNode.functionName}()</span>
              <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                Arguments: <code className="font-mono text-[var(--vscode-foreground,#ffffff)]">{JSON.stringify(selectedNode.args)}</code>
              </span>
              {selectedNode.returnValue !== undefined && (
                <span className="text-[#34d399]">
                  Return: <code className="font-mono">{JSON.stringify(selectedNode.returnValue)}</code>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => goto(selectedNode.startTick - 1)}
              className="text-[11px] text-[var(--vscode-textLink-foreground,#3794ff)] hover:underline"
            >
              Jump to Tick #{selectedNode.startTick} ↗
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
