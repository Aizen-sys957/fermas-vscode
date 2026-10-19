/**
 * The single seam between the panel UI and the extension host.
 *
 * Snapshot/curriculum shapes come straight from the frozen engine contract at
 * ../../src/engine/types.ts (owned jointly with the backend). Do not redefine
 * them here — re-export only, so a change there is a compile error here.
 */
import type {
  CallFrame,
  CallTreeNode,
  ConcurrencyState,
  CurriculumModule,
  CurriculumRepoManifest,
  DebuggerDiagnostic,
  HeapObject,
  ImportedCurriculumSource,
  InferredPointer,
  MemoryDiff,
  MemorySnapshot,
  QuizQuestion,
  ScopeVariable,
  SupportedLanguage,
  TimelinePoint,
} from '../../src/engine/types';

export type {
  CallFrame,
  CallTreeNode,
  ConcurrencyState,
  CurriculumModule,
  CurriculumRepoManifest,
  DebuggerDiagnostic,
  HeapObject,
  ImportedCurriculumSource,
  InferredPointer,
  MemoryDiff,
  MemorySnapshot,
  QuizQuestion,
  ScopeVariable,
  SupportedLanguage,
  TimelinePoint,
};

/** Two lenses over one snapshot stream. */
export type Lens = 'concurrency' | 'memory';

/** Which view the panel is rendering (aligned with the 4 Stitch screens). */
export type ViewMode =
  | 'visualizer'      // Slide 1: Fermas Dynamic Visualizer Workspace
  | 'recursion-tree'  // Slide 2: Recursion Tree & Dynamic Call Graph
  | 'timeline-memory' // Slide 3: Timeline Scrubber & Memory Heap Diff
  | 'algo-hub'        // Slide 4: Algorithm Hub & GitHub Importer
  | 'editor'          // Backwards compat alias for 'visualizer'
  | 'lessons';        // Backwards compat alias for 'algo-hub'

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
  | {
      type: 'SET_CURRICULUM';
      modules: CurriculumModule[];
      sources?: ImportedCurriculumSource[];
      activeSourceId?: string;
    }
  | {
      type: 'OPEN_CURRICULUM';
      modules: CurriculumModule[];
      sources?: ImportedCurriculumSource[];
      activeSourceId?: string;
    }
  | { type: 'SET_LIVE_SYNC'; enabled: boolean }
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
  | { type: 'REVEAL_LINE'; line: number }
  | { type: 'IMPORT_GITHUB'; repoUrl: string; branch?: string; path?: string }
  | { type: 'IMPORT_GIT_REPO'; repoUrl: string; branch?: string; path?: string }
  | { type: 'SELECT_CURRICULUM_SOURCE'; sourceId: string }
  | { type: 'DELETE_CURRICULUM_SOURCE'; sourceId: string }
  | { type: 'REFRESH_CURRICULUM' }
  | { type: 'EXPORT_TEMPLATE' }
  | { type: 'TOGGLE_LIVE_SYNC'; enabled: boolean };

/** Persisted across panel hides via vscode.setState(). */
export interface PersistedState {
  viewMode: ViewMode;
  lens: Lens;
  tick: number;
  liveSync?: boolean;
}

