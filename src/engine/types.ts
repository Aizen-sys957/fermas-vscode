export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'rust';

export interface ScopeVariable {
  name: string;
  type: 'primitive' | 'reference';
  value: any;
  rawType: string;
  isChanged?: boolean;
}

export interface CallFrame {
  frameId: string;
  functionName: string;
  line: number;
  scope: Record<string, ScopeVariable>;
}

export interface InferredPointer {
  variableName: string;
  index: number;
  color: string;
  label?: string;
}

export interface HeapObject {
  id: string; // e.g. "@heap:1"
  name?: string; // e.g. "nums", "arr", "root"
  type: 'array' | 'object' | 'set' | 'map' | 'custom_node';
  elements?: any[]; // for arrays
  fields?: Record<string, any>; // for objects/nodes
  inferredPointers?: InferredPointer[];
  activeIndices?: { index: number; type: 'read' | 'write' | 'compare' }[];
}

export interface ConcurrencyState {
  microtasks: string[];
  macrotasks: string[];
  pendingTasks: string[];
  activeExecutionState?: string;
}

export interface MemorySnapshot {
  tick: number;
  totalTicks: number;
  line: number;
  column?: number;
  codeSnippet: string;
  event: 'step' | 'call' | 'return' | 'loop' | 'async_tick' | 'init';
  explanation: string;
  
  // Call stack and scopes
  callStack: CallFrame[];

  // Heap storage (all compound objects by address)
  heap: Record<string, HeapObject>;

  // Concurrency and Event Loop (if applicable)
  concurrency?: ConcurrencyState;

  // Program output so far
  stdout: string[];

  // Highlighted line inlay text
  inlayHint?: string;

  // Active comparison or expression evaluation (e.g. "nums[left] + nums[right] = 0")
  evaluatedExpression?: {
    expression: string;
    result: string;
    isSatisfied?: boolean;
  };

  // Dynamic Call Tree Topology (for Recursion Tree & Call Graph)
  callTree?: CallTreeNode[];
  activeCallTreeId?: string;

  // Memory Diff vs previous tick
  memoryDiff?: MemoryDiff;

  // Real-time Debugging & Execution Diagnostics
  diagnostics?: DebuggerDiagnostic[];

  // Timeline & Scrubber telemetry
  timelineTrack?: TimelinePoint[];
}

export interface CallTreeNode {
  id: string; // e.g. "call_1"
  parentId?: string;
  functionName: string;
  args: Record<string, any>;
  returnValue?: any;
  startTick: number;
  endTick?: number;
  depth: number;
  status: 'active' | 'resolved' | 'pruned' | 'exception';
  children: string[]; // child IDs
}

export interface MemoryDiff {
  previousTick: number;
  changedVariables: string[];
  changedHeapObjects: string[];
  heapDeltaBytes: number;
  peakHeapBytes: number;
  totalAllocatedObjects: number;
  freedObjects: number;
  mutationsCount: number;
}

export interface DebuggerDiagnostic {
  type: 'info' | 'warning' | 'error' | 'anomaly';
  title: string;
  message: string;
  line?: number;
  suggestedFix?: string;
}

export interface TimelinePoint {
  tick: number;
  callDepth: number;
  allocations: { id: string; label: string; isDealloc?: boolean }[];
  mutationCount: number;
  activeLine: number;
  isBreakpoint?: boolean;
  hasAnomaly?: boolean;
}

export interface TraceResult {
  language: SupportedLanguage;
  code: string;
  snapshots: MemorySnapshot[];
  error?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface CurriculumModule {
  id: string;
  title: string;
  category: string;
  language: SupportedLanguage;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'EASY' | 'MEDIUM' | 'HARD';
  description: string;
  code: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  ticks?: number;
  entry?: string;
  quiz?: QuizQuestion;
  tags?: string[];
  author?: string;
}

export interface CurriculumRepoManifest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  repository?: string;
  modules: Array<{
    id: string;
    title: string;
    category?: string;
    language?: SupportedLanguage;
    difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | 'EASY' | 'MEDIUM' | 'HARD';
    description?: string;
    timeComplexity?: string;
    spaceComplexity?: string;
    ticks?: number;
    tags?: string[];
    entry?: string;
    code?: string;
    quiz?: QuizQuestion;
    author?: string;
  }>;
}

export interface ImportedCurriculumSource {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  manifestPath: string;
  description?: string;
  author?: string;
  modules: CurriculumModule[];
  importedAt: string;
}

