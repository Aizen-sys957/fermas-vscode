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
  category: 'Algorithms & DSA' | 'Concurrency & Runtimes' | 'Memory & Pointers';
  language: SupportedLanguage;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  code: string;
  quiz?: QuizQuestion;
  tags: string[];
}
