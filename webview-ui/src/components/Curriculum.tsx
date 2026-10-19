import { useStore } from '../state/store';
import { LangBadge } from './ui';

export function Curriculum() {
  const { state, loadModule, requestCurriculum } = useStore();
  const modules = state.modules;

  return (
    <div className="flex flex-col gap-2 p-2">
      <div>
        <h2 className="text-[13px] font-semibold">Lessons</h2>
        <p className="text-[11px] leading-snug text-muted">
          Opening a lesson loads its code into the editor and traces it with the same engine used
          for your own files.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="rounded border border-border bg-raised px-2 py-3 text-center">
          <p className="mb-2 text-[11px] text-muted">No lessons loaded.</p>
          <button
            type="button"
            onClick={requestCurriculum}
            className="rounded border border-accent px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
          >
            Sync curriculum
          </button>
        </div>
      ) : (
        modules.map((module) => (
          <article
            key={module.id}
            className="rounded border border-border bg-surface p-2 hover:border-accent"
          >
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <LangBadge language={module.language} />
              <span className="chip text-muted">{module.category}</span>
              <span className="flex-1" />
              <span className="chip text-warn">{module.difficulty}</span>
            </div>
            <h3 className="mb-0.5 text-[12px] font-semibold leading-snug">{module.title}</h3>
            <p className="mb-1.5 text-[11px] leading-snug text-muted">{module.description}</p>
            <div className="flex flex-wrap items-center gap-1">
              {(module.tags ?? []).slice(0, 3).map((tag) => (
                <span key={tag} className="font-mono text-[10px] text-muted">
                  #{tag}
                </span>
              ))}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => loadModule(module.id)}
                className="rounded border border-accent bg-accent px-2 py-0.5 text-[11px] font-semibold text-black hover:opacity-90"
              >
                Open
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
