import { useStore } from '../state/store';
import { FIXTURE_NAMES } from '../fixtures';

export function EmptyState() {
  const { loadFixture, setViewMode } = useStore();

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span aria-hidden className="text-2xl">
        ⚡
      </span>
      <div>
        <h2 className="mb-1 text-[13px] font-semibold">Nothing to visualise yet</h2>
        <p className="text-[11px] leading-snug text-muted">
          Open a <span className="font-mono">.js</span>, <span className="font-mono">.ts</span>,{' '}
          <span className="font-mono">.py</span> or <span className="font-mono">.rs</span> file, then
          run <span className="font-mono">Fermas: Visualize Active Code Execution</span>, or press
          Retrace.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setViewMode('lessons')}
        className="rounded border border-accent bg-accent px-3 py-1 text-[12px] font-semibold text-black hover:opacity-90"
      >
        📚 Browse lessons
      </button>

      <div className="w-full border-t border-border pt-3">
        <div className="lane-label mb-1.5">Reference traces</div>
        <div className="flex flex-col gap-1">
          {FIXTURE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => loadFixture(name)}
              className="rounded border border-border bg-raised px-2 py-1 text-left font-mono text-[11px] hover:border-accent"
            >
              {name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted">
          Bundled traces for developing the panel without the engine. The backend must be able to
          produce these exact shapes.
        </p>
      </div>
    </div>
  );
}
