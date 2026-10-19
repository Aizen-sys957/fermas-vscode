import { useStore } from '../state/store';
import { Chip } from './ui';
import type { MemorySnapshot } from '../types';

const EVENT_LABEL: Record<MemorySnapshot['event'], string> = {
  init: 'init',
  step: 'step',
  call: 'call',
  return: 'return',
  loop: 'loop',
  async_tick: 'event loop',
};

export function StepBanner() {
  const { snapshot } = useStore();
  if (!snapshot) return null;

  return (
    <div className="shrink-0 border-b border-border bg-surface px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="chip">L{snapshot.line}</span>
        <span className="chip text-muted">{EVENT_LABEL[snapshot.event]}</span>
        <span className="flex-1" />
        {snapshot.inlayHint && <Chip color="var(--color-accent)">{snapshot.inlayHint}</Chip>}
      </div>

      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-snug text-fg">
        {snapshot.codeSnippet}
      </pre>

      {snapshot.evaluatedExpression && (
        <div className="mt-1 rounded border border-accent/30 bg-accent/10 px-2 py-1">
          <div className="font-mono text-[11px] text-fg">
            {snapshot.evaluatedExpression.expression}
          </div>
          <div
            className={
              snapshot.evaluatedExpression.isSatisfied
                ? 'text-[11px] text-ok'
                : 'text-[11px] text-warn'
            }
          >
            <span aria-hidden>{snapshot.evaluatedExpression.isSatisfied ? '✓ ' : '✗ '}</span>
            {snapshot.evaluatedExpression.result}
          </div>
        </div>
      )}
    </div>
  );
}
