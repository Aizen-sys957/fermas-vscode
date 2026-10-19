/**
 * The single seam between the panel UI and the extension host.
 *
 * Snapshot/curriculum shapes come straight from the frozen engine contract at
 * ../../src/engine/types.ts (owned jointly with the backend). Do not redefine
 * them here — re-export only, so a change there is a compile error here.
 */
import type {
  CallFrame,
  ConcurrencyState,
  CurriculumModule,
  HeapObject,
  InferredPointer,
  MemorySnapshot,
  QuizQuestion,
  ScopeVariable,
  SupportedLanguage,
} from '../../src/engine/types';

export type {
  CallFrame,
  ConcurrencyState,
  CurriculumModule,
  HeapObject,
  InferredPointer,
  MemorySnapshot,
  QuizQuestion,
  ScopeVariable,
  SupportedLanguage,
};

/** Two lenses over one snapshot stream. */
export type Lens = 'concurrency' | 'memory';

/** Which source of code the panel is visualising. */
export type ViewMode = 'editor' | 'lessons';

export type PlaybackRate = 0.25 | 0.5 | 1 | 2 | 4;

// ---------------------------------------------------------------------------
// Host -> webview
// ---------------------------------------------------------------------------

export type HostMessage =
  | {
      type: 'SET_TRACE';
      snapshots: MemorySnapshot[];
      language: SupportedLanguage;
      currentTick?: number;
      fileName?: string;
      activeModule?: CurriculumModule;
      error?: string;
    }
  | { type: 'GOTO_TICK'; tick: number }
  | { type: 'SET_CURRICULUM'; modules: CurriculumModule[] }
  | { type: 'OPEN_CURRICULUM'; modules: CurriculumModule[] }
  | { type: 'SET_ERROR'; message: string };

// ---------------------------------------------------------------------------
// Webview -> host
// ---------------------------------------------------------------------------

export type WebviewMessage =
  | { type: 'STEP_CHANGED'; tick: number }
  | { type: 'REQUEST_RETRACE' }
  | { type: 'REQUEST_CURRICULUM' }
  | { type: 'LOAD_MODULE'; id: string }
  | { type: 'OPEN_PANEL' }
  | { type: 'REVEAL_LINE'; line: number };

/** Persisted across panel hides via vscode.setState(). */
export interface PersistedState {
  viewMode: ViewMode;
  lens: Lens;
  tick: number;
}
