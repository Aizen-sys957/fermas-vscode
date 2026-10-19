import { useStore } from '../state/store';
import { Chip, Notice, Section } from './ui';
import type { ConcurrencyState, MemorySnapshot } from '../types';

const MICRO_COLOR = 'var(--vscode-charts-blue, #38bdf8)';
const MACRO_COLOR = 'var(--vscode-charts-yellow, #fbbf24)';
const PENDING_COLOR = 'var(--vscode-charts-red, #fb7185)';

function Lane({
  title,
  items,
  color,
  emptyHint,
  defaultOpen = true,
}: {
  title: string;
  items: string[];
  color: string;
  emptyHint: string;
  defaultOpen?: boolean;
}) {
  return (
    <Section title={title} count={items.length} defaultOpen={defaultOpen}>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((item, index) => (
            <Chip key={`${index}-${item}`} color={color} title={item}>
              {item}
            </Chip>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Lane 1: the active call stack / executor. */
function ExecutorLane() {
  const { snapshot } = useStore();
  const frames = snapshot?.callStack ?? [];
  return (
    <Section title="call stack" count={frames.length}>
      {frames.length === 0 ? (
        <p className="text-[11px] text-muted">Call stack is empty.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {frames.map((frame) => (
            <div
              key={frame.frameId}
              className="rounded border border-border bg-raised px-2 py-1 font-mono text-[11px]"
            >
              <span className="text-accent">{frame.functionName}</span>
              <span className="text-muted">() · line {frame.line}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function lanesOf(concurrency: ConcurrencyState | undefined) {
  return {
    microtasks: concurrency?.microtasks ?? [],
    macrotasks: concurrency?.macrotasks ?? [],
    pendingTasks: concurrency?.pendingTasks ?? [],
  };
}

export function ConcurrencyLens({ snapshot }: { snapshot: MemorySnapshot }) {
  const { microtasks, macrotasks, pendingTasks } = lanesOf(snapshot.concurrency);

  return (
    <div className="flex flex-col">
      <ExecutorLane />

      <Lane
        title="microtask queue"
        items={microtasks}
        color={MICRO_COLOR}
        emptyHint="Empty. Drained completely before any macrotask runs."
      />
      <Lane
        title="macrotask / timer queue"
        items={macrotasks}
        color={MACRO_COLOR}
        emptyHint="Empty. Timers run only after the microtask queue is empty."
      />
      {pendingTasks.length > 0 && (
        <Lane
          title="unpolled / lazy futures"
          items={pendingTasks}
          color={PENDING_COLOR}
          emptyHint="Nothing awaiting a poll."
        />
      )}

      {microtasks.length === 0 && macrotasks.length === 0 && pendingTasks.length === 0 && (
        <Notice tone="info">
          No async primitives detected at this tick. Queues fill up once a promise, timer, task or
          future is created.
        </Notice>
      )}
    </div>
  );
}
