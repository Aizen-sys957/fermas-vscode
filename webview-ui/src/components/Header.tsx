import { useStore } from '../state/store';
import { cn, LangBadge, Segmented } from './ui';
import type { Lens, ViewMode } from '../types';

export function Header() {
  const { state, setLens, setViewMode, retrace, openPanel } = useStore();

  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span aria-hidden className="text-accent">
          ⚡
        </span>
        <span className="text-[13px] font-bold tracking-tight">Fermas</span>
        <LangBadge language={state.language} />
        <span className="flex-1" />
        <button
          type="button"
          onClick={retrace}
          title="Re-run the trace on the active editor file"
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-raised hover:text-fg"
        >
          ⟳ Retrace
        </button>
        <button
          type="button"
          onClick={openPanel}
          title="Open the visualizer in a full editor tab"
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-raised hover:text-fg"
        >
          ⤢
        </button>
      </div>

      <div className="truncate px-2 pb-1 font-mono text-[10px] text-muted">
        {state.fileName || 'no file'}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
        <Segmented<Lens>
          label="Lens"
          value={state.lens}
          onChange={setLens}
          options={[
            { value: 'concurrency', label: 'Concurrency' },
            { value: 'memory', label: 'Memory' },
          ]}
        />
        <Segmented<ViewMode>
          label="Source"
          value={state.viewMode}
          onChange={setViewMode}
          options={[
            { value: 'editor', label: 'Code' },
            { value: 'lessons', label: 'Lessons' },
          ]}
        />
        {state.source === 'fixture' && (
          <span className={cn('chip', 'text-warn')} title="Rendering a bundled reference trace, not live code">
            fixture
          </span>
        )}
      </div>
    </header>
  );
}
