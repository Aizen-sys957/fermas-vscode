import { cn } from './ui';
import type { HeapObject } from '../types';

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') return Array.isArray(value) ? '[…]' : '{…}';
  return String(value);
}

function ArrayTrack({ object }: { object: HeapObject }) {
  const elements = object.elements ?? [];
  const pointers = object.inferredPointers ?? [];
  const activeIndices = new Set((object.activeIndices ?? []).map((entry) => entry.index));

  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="lane-label">array</span>
        <span className="chip">{object.id}</span>
        <span className="chip text-muted">{elements.length}</span>
      </div>

      <div className="array-track">
        {elements.map((value, index) => {
          const here = pointers.filter((pointer) => pointer.index === index);
          return (
            <div className="array-cell" key={index}>
              {here.length > 0 && (
                <div className="pointer-flag">
                  {here.map((pointer) => (
                    <span
                      key={pointer.variableName}
                      className="pointer-pill"
                      style={{ background: pointer.color }}
                    >
                      {pointer.label ?? `${pointer.variableName} = ${pointer.index}`}
                    </span>
                  ))}
                  <span className="pointer-arrow" style={{ color: here[0]!.color }} />
                </div>
              )}
              <div className={cn('array-cell-box', activeIndices.has(index) && 'is-active')}>
                {formatValue(value)}
              </div>
              <div className="array-index">[{index}]</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Any 1D array or list on the heap renders here, with inferred pointer badges. */
export function HeapRibbon({ heap }: { heap: Record<string, HeapObject> }) {
  const arrays = Object.values(heap).filter(
    (object) => object.type === 'array' && Array.isArray(object.elements),
  );
  if (arrays.length === 0) return null;

  return (
    <div className="array-ribbon">
      {arrays.map((object) => (
        <ArrayTrack key={object.id} object={object} />
      ))}
    </div>
  );
}
