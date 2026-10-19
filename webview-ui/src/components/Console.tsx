import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';

/** Standard output. Always the same component, whichever lens is active. */
export function Console() {
  const { snapshot } = useStore();
  const stdout = snapshot?.stdout ?? [];
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [stdout.length]);

  if (stdout.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-bg">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="lane-label">stdout</span>
        <span className="chip">{stdout.length}</span>
      </div>
      <div
        role="log"
        aria-live="polite"
        className="fermas-scroll max-h-32 px-2 pb-1.5 font-mono text-[11px] leading-relaxed text-ok"
      >
        {stdout.map((line, index) => (
          // eslint-disable-next-line react/no-array-index-key -- stdout is append-only
          <div key={`${index}-${line}`}>{line}</div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
