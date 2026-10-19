import { useStore } from '../state/store';
import { cn } from './ui';
import type { PlaybackRate } from '../types';

const RATES: PlaybackRate[] = [0.25, 0.5, 1, 2, 4];

function TransportButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded border border-border text-[11px]',
        disabled ? 'cursor-default text-muted opacity-40' : 'text-fg hover:bg-raised',
      )}
    >
      {glyph}
    </button>
  );
}

export function Toolbar() {
  const { state, total, first, last, step, togglePlay, setRate } = useStore();
  const disabled = total === 0;
  const atStart = disabled || state.tick === 0;
  const atEnd = disabled || state.tick >= total - 1;

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
      <TransportButton label="First tick" glyph="⏮" onClick={first} disabled={disabled || atStart} />
      <TransportButton label="Step back" glyph="◀" onClick={() => step(-1)} disabled={atStart} />
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        aria-label={state.playing ? 'Pause' : 'Play'}
        title={state.playing ? 'Pause' : 'Play'}
        className={cn(
          'flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-semibold',
          disabled
            ? 'cursor-default border-border text-muted opacity-40'
            : 'border-accent bg-accent text-black hover:opacity-90',
        )}
      >
        {state.playing ? '⏸' : '▶'}
        <span>{state.playing ? 'Pause' : 'Play'}</span>
      </button>
      <TransportButton label="Step forward" glyph="▶" onClick={() => step(1)} disabled={atEnd} />
      <TransportButton label="Last tick" glyph="⏭" onClick={last} disabled={disabled || atEnd} />

      <span className="flex-1" />

      <button
        type="button"
        onClick={() => setRate(RATES[(RATES.indexOf(state.rate) + 1) % RATES.length]!)}
        title="Playback speed"
        className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted hover:bg-raised hover:text-fg"
      >
        {state.rate}x
      </button>
    </div>
  );
}
