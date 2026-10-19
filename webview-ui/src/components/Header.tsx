import { useStore } from '../state/store';
import { LangBadge } from './ui';
import type { ViewMode } from '../types';

export function Header() {
  const { state, setViewMode, retrace, openPanel, toggleLiveSync } = useStore();
  const currentView = state.viewMode === 'editor' ? 'visualizer' : state.viewMode === 'lessons' ? 'algo-hub' : state.viewMode;

  const peakBytes = state.snapshots[state.tick]?.memoryDiff?.peakHeapBytes ?? 512;
  const memoryKb = Math.max(64, Math.round(peakBytes / 1024));

  const navItems: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'visualizer', label: 'Dynamic Visualizer', icon: '⚡' },
    { mode: 'recursion-tree', label: 'Recursion & Call Tree', icon: '🌳' },
    { mode: 'timeline-memory', label: 'Timeline & Memory Diff', icon: '⏱' },
    { mode: 'algo-hub', label: 'Algorithm Hub & GitHub', icon: '📚' },
  ];

  return (
    <header className="shrink-0 border-b border-[#2a364f] bg-[#0d131e] text-[#f1f5f9] select-none">
      {/* Top Telemetry & Global Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[#1a2234] bg-[#080e19]/90 text-[11px]">
        {/* Brand & Engine Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-[#00f2fe]">
            <span className="flex h-2 w-2 rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]" />
            <span>Fermas</span>
            <span className="font-mono text-[10px] font-normal text-[#94a3b8]">v2.4</span>
          </div>

          <span className="hidden md:inline text-[#2a364f]">|</span>

          <div className="hidden sm:flex items-center gap-1.5 rounded bg-[#161c27] px-2 py-0.5 text-[10px] text-[#10b981]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
            <span>Engine: Ready</span>
          </div>

          <div className="flex items-center gap-1 rounded bg-[#161c27] px-2 py-0.5 font-mono text-[10px] text-[#94a3b8]">
            <span>Mem:</span>
            <span className="text-[#00f2fe] font-medium">{memoryKb} KB</span>
          </div>

          <LangBadge language={state.language} />
        </div>

        {/* File & Controls */}
        <div className="flex items-center gap-2">
          <span className="max-w-[180px] truncate rounded bg-[#1a2234] px-2 py-0.5 font-mono text-[10px] text-[#94a3b8]">
            {state.fileName || 'no file active'}
          </span>

          <button
            type="button"
            onClick={() => toggleLiveSync()}
            title={state.liveSync ? 'Real-time live code sync is active' : 'Live code sync is paused'}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              state.liveSync
                ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 hover:bg-[#10b981]/25'
                : 'bg-[#161c27] text-[#94a3b8] border border-[#2a364f] hover:text-[#f1f5f9]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${state.liveSync ? 'bg-[#10b981] animate-ping' : 'bg-[#94a3b8]'}`} />
            <span>Live Sync: {state.liveSync ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={retrace}
            title="Re-run trace on the active editor file"
            className="flex items-center gap-1 rounded border border-[#2a364f] bg-[#161c27] px-2 py-0.5 text-[10px] text-[#94a3b8] hover:bg-[#1a2234] hover:text-[#f1f5f9] transition-colors"
          >
            <span>⟳</span>
            <span>Retrace</span>
          </button>

          <button
            type="button"
            onClick={openPanel}
            title="Open visualizer beside code in full tab"
            className="rounded border border-[#2a364f] bg-[#161c27] px-2 py-0.5 text-[11px] text-[#94a3b8] hover:bg-[#1a2234] hover:text-[#f1f5f9] transition-colors"
          >
            ⤢
          </button>
        </div>
      </div>

      {/* Main Views Navigation Ribbon (4 Stitch Tabs) */}
      <nav className="flex items-center gap-1 overflow-x-auto px-2 py-1 bg-[#131924]">
        {navItems.map((item) => {
          const isActive = currentView === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => setViewMode(item.mode)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-[#1a2234] text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_12px_rgba(0,242,254,0.15)]'
                  : 'text-[#94a3b8] hover:bg-[#161c27] hover:text-[#f1f5f9]'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

