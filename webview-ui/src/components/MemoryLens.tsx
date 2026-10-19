import { HeapRibbon } from './HeapRibbon';
import { Notice, Section } from './ui';
import type { HeapObject, MemorySnapshot, ScopeVariable } from '../types';

function describe(variable: ScopeVariable, heap: Record<string, HeapObject>): string {
  if (variable.type === 'reference') {
    const referred = heap[String(variable.value)];
    if (referred?.type === 'array' && referred.elements) {
      const preview = referred.elements.slice(0, 8).map(String).join(', ');
      const more = referred.elements.length > 8 ? ', …' : '';
      return `@ → [ ${preview}${more} ]`;
    }
    if (referred?.fields) {
      return `@ → { ${Object.keys(referred.fields).join(', ')} }`;
    }
    return String(variable.value);
  }
  if (typeof variable.value === 'object' && variable.value !== null) {
    return JSON.stringify(variable.value);
  }
  return String(variable.value);
}

function ScopeTable({
  scope,
  heap,
}: {
  scope: Record<string, ScopeVariable>;
  heap: Record<string, HeapObject>;
}) {
  const entries = Object.entries(scope);
  if (entries.length === 0) {
    return <p className="text-[11px] text-muted">(no locals in this frame)</p>;
  }
  return (
    <table className="w-full border-collapse font-mono text-[11px]">
      <tbody>
        {entries.map(([name, variable]) => (
          <tr key={name} className="border-b border-border/40 last:border-b-0">
            <td className="py-0.5 pr-2 align-top whitespace-nowrap text-accent">
              {variable.isChanged && <span aria-hidden className="diff-add" />}
              {name}
            </td>
            <td className="py-0.5 pr-2 align-top text-muted">{variable.rawType}</td>
            <td className="py-0.5 align-top break-all">{describe(variable, heap)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Compound objects that are not plain arrays: dicts, sets, node structs. */
function HeapObjects({ heap }: { heap: Record<string, HeapObject> }) {
  const objects = Object.values(heap).filter((object) => object.type !== 'array');
  if (objects.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {objects.map((object) => (
        <div key={object.id} className="rounded border border-border bg-raised px-2 py-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <span className="lane-label">{object.type.replace('custom_', '')}</span>
            <span className="chip">{object.id}</span>
          </div>
          <table className="w-full border-collapse font-mono text-[11px]">
            <tbody>
              {Object.entries(object.fields ?? {}).map(([key, value]) => (
                <tr key={key}>
                  <td className="py-0.5 pr-2 align-top text-accent">{key}</td>
                  <td className="py-0.5 align-top break-all">
                    {typeof value === 'string' && value.startsWith('@heap:') ? `→ ${value}` : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function MemoryLens({ snapshot }: { snapshot: MemorySnapshot }) {
  const frames = snapshot.callStack ?? [];
  const heap = snapshot.heap ?? {};
  const heapIsEmpty = Object.keys(heap).length === 0;

  return (
    <div className="flex flex-col">
      <Section title="call stack & scope" count={frames.length}>
        <div className="flex flex-col gap-2">
          {frames.map((frame, depth) => (
            <div key={frame.frameId} style={{ paddingLeft: depth * 8 }}>
              <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-accent">{frame.functionName}</span>
                <span className="text-muted">() · line {frame.line}</span>
                <span className="chip text-muted">depth {depth}</span>
              </div>
              <ScopeTable scope={frame.scope ?? {}} heap={heap} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="heap memory" count={Object.keys(heap).length}>
        <HeapRibbon heap={heap} />
        <HeapObjects heap={heap} />
        {heapIsEmpty && (
          <p className="text-[11px] text-muted">
            No heap objects yet. Compound values appear here when they are allocated.
          </p>
        )}
      </Section>

      {snapshot.line > 0 && (
        <Notice tone="info">
          Every value above is what the engine reported for tick {snapshot.tick}. The panel does no
          inference of its own.
        </Notice>
      )}
    </div>
  );
}
