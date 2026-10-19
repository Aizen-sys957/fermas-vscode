import { useStore } from '../state/store';

export function Scrubber() {
  const { state, total, snapshot, goto } = useStore();

  return (
    <div className="shrink-0 border-b border-border px-2 py-1.5">
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label="Trace position"
          min={0}
          max={Math.max(0, total - 1)}
          value={state.tick}
          disabled={total === 0}
          onChange={(event) => goto(Number(event.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded bg-border accent-[var(--color-accent)]"
        />
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
          Tick {total === 0 ? 0 : state.tick + 1} / {total}
        </span>
      </div>
      {snapshot && (
        <p className="mt-1 text-[11px] leading-snug text-fg/90">{snapshot.explanation}</p>
      )}
    </div>
  );
}
