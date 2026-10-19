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
    <header className="shrink-0 border-b border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#252526)] text-[var(--vscode-foreground,#cccccc)] select-none">
      {/* Top Telemetry & Global Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--vscode-panel-border,#333333)]/40 bg-[var(--vscode-sideBarSectionHeader-background,#1e1e1e)]/70 text-[11px]">
        {/* Brand & Engine Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-[var(--vscode-foreground,#ffffff)]">
            <svg viewBox="0 0 100 100" className="h-4 w-4 text-[var(--vscode-focusBorder,#007acc)]" fill="currentColor">
              <path d="M 78.07 10.00 L 78.07 21.47 L 77.30 23.15 L 75.93 24.99 L 73.94 26.52 L 72.26 27.28 L 21.93 45.64 L 21.78 36.31 L 22.39 33.56 L 23.61 31.41 L 25.45 29.58 L 27.90 28.20 L 77.92 10.15 Z" />
              <path d="M 59.41 37.53 L 61.55 37.53 L 76.85 41.20 L 77.00 43.96 L 76.54 45.64 L 75.93 46.56 L 73.63 48.39 L 42.89 58.49 L 23.15 49.62 L 59.25 37.69 Z" />
              <path d="M 21.93 51.30 L 38.60 62.01 L 39.37 62.62 L 40.29 64.15 L 40.29 75.93 L 39.06 78.37 L 38.30 79.14 L 21.93 90.00 L 21.93 51.45 Z" />
            </svg>
            <span className="font-semibold text-xs tracking-wide">Fermas</span>
            <span className="font-mono text-[9px] font-normal text-[var(--vscode-descriptionForeground,#8c8c8c)]">v2.4</span>
          </div>

          <span className="hidden md:inline text-[var(--vscode-panel-border,#333333)]">|</span>

          <div className="hidden sm:flex items-center gap-1.5 rounded bg-[var(--vscode-input-background,#1e1e1e)] px-2 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] border border-[var(--vscode-panel-border,#333333)]/50">
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            <span>Ready</span>
          </div>

          <div className="flex items-center gap-1 rounded bg-[var(--vscode-input-background,#1e1e1e)] px-2 py-0.5 font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] border border-[var(--vscode-panel-border,#333333)]/50">
            <span>Mem:</span>
            <span className="text-[var(--vscode-foreground,#cccccc)] font-medium">{memoryKb} KB</span>
          </div>

          <LangBadge language={state.language} />
        </div>

        {/* File & Controls */}
        <div className="flex items-center gap-2">
          <span className="max-w-[180px] truncate rounded bg-[var(--vscode-input-background,#1e1e1e)] px-2 py-0.5 font-mono text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)] border border-[var(--vscode-panel-border,#333333)]/50">
            {state.fileName || 'no file active'}
          </span>

          <button
            type="button"
            onClick={() => toggleLiveSync()}
            title={state.liveSync ? 'Real-time live code sync is active' : 'Live code sync is paused'}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border ${
              state.liveSync
                ? 'bg-[#34d399]/10 text-[#34d399] border-[#34d399]/30'
                : 'bg-[var(--vscode-input-background,#1e1e1e)] text-[var(--vscode-descriptionForeground,#8c8c8c)] border-[var(--vscode-panel-border,#333333)]/50 hover:text-[var(--vscode-foreground,#cccccc)]'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${state.liveSync ? 'bg-[#34d399]' : 'bg-[var(--vscode-descriptionForeground,#8c8c8c)]'}`} />
            <span>Sync: {state.liveSync ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={retrace}
            title="Re-run trace on the active editor file"
            className="flex items-center gap-1 rounded border border-[var(--vscode-panel-border,#333333)]/60 bg-[var(--vscode-button-secondaryBackground,#3a3d41)] px-2 py-0.5 text-[10px] text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] transition-colors"
          >
            <span>⟳</span>
            <span>Retrace</span>
          </button>

          <button
            type="button"
            onClick={openPanel}
            title="Open visualizer beside code in full tab"
            className="rounded border border-[var(--vscode-panel-border,#333333)]/60 bg-[var(--vscode-button-secondaryBackground,#3a3d41)] px-2 py-0.5 text-[11px] text-[var(--vscode-button-secondaryForeground,#ffffff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] transition-colors"
          >
            ⤢
          </button>
        </div>
      </div>

      {/* Main Views Navigation Ribbon (Clean VS Code Tabs) */}
      <nav className="flex items-center gap-1 overflow-x-auto px-2 pt-1 bg-[var(--vscode-sideBar-background,#252526)]">
        {navItems.map((item) => {
          const isActive = currentView === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => setViewMode(item.mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-all shrink-0 border-b-2 ${
                isActive
                  ? 'border-[var(--vscode-focusBorder,#007acc)] text-[var(--vscode-foreground,#ffffff)] font-semibold bg-[var(--vscode-editor-background,#1e1e1e)]/60 rounded-t'
                  : 'border-transparent text-[var(--vscode-descriptionForeground,#8c8c8c)] hover:text-[var(--vscode-foreground,#cccccc)] hover:bg-[var(--vscode-list-hoverBackground,#2a2d2e)]/50 rounded-t'
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

