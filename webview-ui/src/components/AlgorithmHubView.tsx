import { useState, useMemo } from 'react';
import { useStore } from '../state/store';

interface AlgorithmEntry {
  id: string;
  title: string;
  category: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  description: string;
  timeComplexity: string;
  spaceComplexity: string;
  languages: ('TS' | 'PY' | 'RS' | 'JS')[];
  ticks: number;
  code: string;
}

const BUILTIN_ALGORITHMS: AlgorithmEntry[] = [
  {
    id: 'two-sum',
    title: 'Two Sum (Two Pointers)',
    category: 'Two Pointers',
    difficulty: 'EASY',
    description: 'Find indices that sum to target using bidirectional pointers narrowing from edges with instant collision detection.',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    languages: ['TS', 'PY', 'RS'],
    ticks: 14,
    code: `export function twoSum(nums: number[], target: number): number[] {
  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    const currentSum = nums[left] + nums[right];
    if (currentSum === target) {
      return [left, right];
    } else if (currentSum < target) {
      left++;
    } else {
      right--;
    }
  }
  return [-1, -1];
}

const dataset = [2, 7, 11, 15, 13, 20, 24, 36];
twoSum(dataset, 39);`,
  },
  {
    id: 'merge-sort',
    title: 'Merge Sort (Divide & Conquer)',
    category: 'Sorting & Partitioning',
    difficulty: 'MEDIUM',
    description: 'Recursively split arrays into halves and merge sorted subarrays to demonstrate call tree expansion and stack unwinding.',
    timeComplexity: 'O(n log n)',
    spaceComplexity: 'O(n)',
    languages: ['TS', 'PY'],
    ticks: 48,
    code: `export function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(left: number[], right: number[]): number[] {
  const result: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] < right[j]) {
      result.push(left[i++]);
    } else {
      result.push(right[j++]);
    }
  }
  return result.concat(left.slice(i)).concat(right.slice(j));
}

mergeSort([38, 27, 43, 3, 9, 82, 10]);`,
  },
  {
    id: 'binary-search-tree',
    title: 'Binary Search Tree Insertion & Search',
    category: 'Trees & Graphs',
    difficulty: 'MEDIUM',
    description: 'Construct binary search tree heap nodes with directed left and right pointers and trace logarithmic key lookup.',
    timeComplexity: 'O(log n)',
    spaceComplexity: 'O(n)',
    languages: ['TS', 'PY'],
    ticks: 28,
    code: `class TreeNode {
  val: number;
  left: any = null;
  right: any = null;
  constructor(val: number) {
    this.val = val;
  }
}

function insertBST(root: any, val: number): any {
  if (!root) return new TreeNode(val);
  if (val < root.val) {
    root.left = insertBST(root.left, val);
  } else {
    root.right = insertBST(root.right, val);
  }
  return root;
}

let root = new TreeNode(5);
insertBST(root, 3);
insertBST(root, 8);
insertBST(root, 1);
insertBST(root, 4);`,
  },
  {
    id: 'reverse-linked-list',
    title: 'Reverse Linked List (In-Place Pointers)',
    category: 'Trees & Graphs',
    difficulty: 'EASY',
    description: 'Reverse singly linked list by dynamically redirecting curr.next pointers in-place with null termination check.',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    languages: ['TS', 'PY', 'RS'],
    ticks: 22,
    code: `class ListNode {
  val: number;
  next: any = null;
  constructor(val: number) {
    this.val = val;
  }
}

function reverseList(head: any): any {
  let prev = null;
  let curr = head;
  while (curr != null) {
    let nextTemp = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nextTemp;
  }
  return prev;
}

let head = new ListNode(1);
head.next = new ListNode(2);
head.next.next = new ListNode(3);
reverseList(head);`,
  },
  {
    id: 'n-queens',
    title: 'N-Queens Backtracking & Pruning',
    category: 'Dynamic Programming',
    difficulty: 'HARD',
    description: 'Place N non-attacking queens on chessboard with dynamic constraint validation and recursive state backtracking.',
    timeComplexity: 'O(N!)',
    spaceComplexity: 'O(N)',
    languages: ['TS', 'PY'],
    ticks: 85,
    code: `function solveNQueens(n: number): number {
  let count = 0;
  const cols = new Set<number>();
  const diag1 = new Set<number>();
  const diag2 = new Set<number>();

  function backtrack(row: number) {
    if (row === n) {
      count++;
      return;
    }
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag1.has(row - col) || diag2.has(row + col)) continue;
      cols.add(col);
      diag1.add(row - col);
      diag2.add(row + col);
      backtrack(row + 1);
      cols.delete(col);
      diag1.delete(row - col);
      diag2.delete(row + col);
    }
  }

  backtrack(0);
  return count;
}

solveNQueens(4);`,
  },
  {
    id: 'microtask-queue',
    title: 'Microtask vs Macrotask Event Loop',
    category: 'Concurrency & Event Loop',
    difficulty: 'MEDIUM',
    description: 'Visualizes strict microtask draining before macrotask timer execution in JavaScript runtime event loop.',
    timeComplexity: 'O(1)',
    spaceComplexity: 'O(1)',
    languages: ['TS', 'JS'],
    ticks: 18,
    code: `console.log("1: Synchronous Script Start");

setTimeout(() => {
  console.log("4: Macrotask Timer Callback");
}, 0);

queueMicrotask(() => {
  console.log("3: Microtask Reaction 1");
});

console.log("2: Synchronous Script End");`,
  },
];

const CATEGORIES = [
  'All',
  'Two Pointers',
  'Trees & Graphs',
  'Dynamic Programming',
  'Sorting & Partitioning',
  'Concurrency & Event Loop',
  'Rust Borrow Check',
];

export function AlgorithmHubView() {
  const { loadModule, importGitHub, state } = useStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [repoUrl, setRepoUrl] = useState('github.com/torvalds/algo-bench/src/two-pointer');
  const [branch, setBranch] = useState('main');
  const [filePath, setFilePath] = useState('solution.ts');
  const [isImporting, setIsImporting] = useState(false);

  const filteredAlgorithms = useMemo(() => {
    return BUILTIN_ALGORITHMS.filter((algo) => {
      const matchesCategory = selectedCategory === 'All' || algo.category === selectedCategory;
      const matchesSearch =
        search.trim() === '' ||
        algo.title.toLowerCase().includes(search.toLowerCase()) ||
        algo.description.toLowerCase().includes(search.toLowerCase()) ||
        algo.category.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  const handleImportGitHub = async () => {
    if (!repoUrl) return;
    setIsImporting(true);
    try {
      importGitHub(repoUrl, branch, filePath);
    } finally {
      setTimeout(() => setIsImporting(false), 800);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--vscode-foreground,#cccccc)] select-none">
      {/* TOP HEADER & SEARCH RIBBON */}
      <section className="rounded-lg border border-[var(--vscode-panel-border,#333333)] bg-[var(--vscode-sideBar-background,#181818)] p-3 shadow-sm flex flex-col gap-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--vscode-textLink-foreground,#3794ff)]">
              <span>Curriculum &amp; Remote Ingestion</span>
              <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)]">•</span>
              <span className="font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">AST Instrumenter v2.4</span>
            </div>
            <h2 className="text-base font-bold text-[var(--vscode-foreground,#ffffff)] tracking-tight">
              Fermas Algorithm Curriculum &amp; Dynamic Code Sandbox
            </h2>
          </div>

          {/* Quick Search */}
          <div className="relative w-full lg:w-80">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by algorithm, data structure, or tag..."
              className="w-full rounded bg-[var(--vscode-input-background,#1e1e1e)] border border-[var(--vscode-input-border,#3c3c3c)] pl-8 pr-12 py-1.5 text-xs text-[var(--vscode-input-foreground,#cccccc)] placeholder:text-[var(--vscode-input-placeholderForeground,#8c8c8c)] outline-none focus:border-[var(--vscode-focusBorder,#007fd4)] transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)]">🔍</span>
            <span className="absolute right-2 top-1.5 font-mono text-[9px] bg-[var(--vscode-badge-background,#4d4d4d)] text-[var(--vscode-badge-foreground,#ffffff)] px-1.5 py-0.5 rounded border border-[var(--vscode-panel-border,#333333)]">
              ⌘K
            </span>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {CATEGORIES.map((cat) => {
            const count =
              cat === 'All'
                ? BUILTIN_ALGORITHMS.length
                : BUILTIN_ALGORITHMS.filter((a) => a.category === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium'
                    : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-secondaryHoverBackground,#45494e)] hover:text-[var(--vscode-foreground,#ffffff)]'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-[var(--vscode-button-hoverBackground,#1177bb)]' : 'bg-[var(--vscode-editor-background,#1e1e1e)]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* REMOTE GITHUB INGESTION ACTION BAR */}
        <div className="rounded bg-[var(--vscode-editor-background,#1e1e1e)] p-2.5 border border-[var(--vscode-panel-border,#333333)] flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[var(--vscode-textLink-foreground,#3794ff)] text-lg">⚡</span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[var(--vscode-foreground,#ffffff)]">Remote Trace Importer</span>
              <span className="text-[10px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">Transpile &amp; inject live bytecode instrumenter hooks</span>
            </div>
          </div>

          <div className="flex-1 flex flex-wrap lg:flex-nowrap items-center gap-2">
            {/* Repo Input */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-2 top-2 text-[11px] text-[var(--vscode-descriptionForeground,#8c8c8c)]">📂</span>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="github.com/owner/repo/path"
                className="w-full rounded bg-[var(--vscode-input-background,#1e1e1e)] border border-[var(--vscode-input-border,#3c3c3c)] pl-6 pr-2 py-1 text-xs font-mono text-[var(--vscode-input-foreground,#cccccc)] placeholder:text-[var(--vscode-input-placeholderForeground,#8c8c8c)] outline-none focus:border-[var(--vscode-focusBorder,#007fd4)]"
              />
            </div>

            {/* Branch Selector */}
            <select
              aria-label="GitHub Branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="rounded bg-[var(--vscode-dropdown-background,#252526)] border border-[var(--vscode-dropdown-border,#3c3c3c)] px-2 py-1 text-xs font-mono text-[var(--vscode-dropdown-foreground,#cccccc)] outline-none cursor-pointer focus:border-[var(--vscode-focusBorder,#007fd4)]"
            >
              <option value="main">main</option>
              <option value="master">master</option>
              <option value="dev">dev</option>
            </select>

            {/* File Path */}
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="solution.ts"
              className="w-24 rounded bg-[var(--vscode-input-background,#1e1e1e)] border border-[var(--vscode-input-border,#3c3c3c)] px-2 py-1 text-xs font-mono text-[var(--vscode-input-foreground,#cccccc)] outline-none focus:border-[var(--vscode-focusBorder,#007fd4)]"
            />

            {/* Import Button */}
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImportGitHub}
              className="flex items-center justify-center gap-1.5 px-3 py-1 rounded bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)] font-medium text-xs hover:bg-[var(--vscode-button-hoverBackground,#1177bb)] transition-colors disabled:opacity-50 shrink-0"
            >
              <span>{isImporting ? '⏳' : '⚡'}</span>
              <span>{isImporting ? 'Ingesting...' : 'Import & Instrument AST'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ALGORITHM CARDS GRID */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--vscode-foreground,#ffffff)]">
            Preset Algorithm Index ({filteredAlgorithms.length} Available)
          </span>
          <span className="text-[var(--vscode-descriptionForeground,#8c8c8c)] font-mono text-[10px]">READY-TO-TRACE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAlgorithms.map((algo) => {
            const isActive = state.activeModule?.id === algo.id;
            return (
              <div
                key={algo.id}
                className={`rounded-lg border p-3.5 flex flex-col justify-between transition-colors shadow-sm group ${
                  isActive
                    ? 'bg-[var(--vscode-sideBar-background,#181818)] border-[var(--vscode-focusBorder,#007fd4)] ring-1 ring-[var(--vscode-focusBorder,#007fd4)]'
                    : 'bg-[var(--vscode-sideBar-background,#181818)] border-[var(--vscode-panel-border,#333333)] hover:border-[var(--vscode-focusBorder,#007fd4)]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-[var(--vscode-textLink-foreground,#3794ff)] uppercase font-semibold">
                      {algo.category}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded ${
                        algo.difficulty === 'EASY'
                          ? 'bg-[#34d399]/15 text-[#34d399]'
                          : algo.difficulty === 'MEDIUM'
                          ? 'bg-[#fbbf24]/15 text-[#fbbf24]'
                          : 'bg-[#f87171]/15 text-[#f87171]'
                      }`}
                    >
                      {algo.difficulty}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-[var(--vscode-foreground,#ffffff)] mb-1 group-hover:text-[var(--vscode-textLink-foreground,#3794ff)] transition-colors">
                    {algo.title}
                  </h3>

                  <p className="text-xs text-[var(--vscode-descriptionForeground,#8c8c8c)] leading-snug line-clamp-2 mb-3">
                    {algo.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--vscode-panel-border,#333333)] flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--vscode-descriptionForeground,#8c8c8c)]">
                    <span>⏱ {algo.timeComplexity}</span>
                    <span>🧠 {algo.spaceComplexity}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1">
                      {algo.languages.map((l) => (
                        <span
                          key={l}
                          className="font-mono text-[9px] px-1 py-0.5 rounded bg-[var(--vscode-editor-background,#1e1e1e)] text-[var(--vscode-descriptionForeground,#8c8c8c)] border border-[var(--vscode-panel-border,#333333)]"
                        >
                          {l}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => loadModule(algo.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)] hover:bg-[var(--vscode-button-background,#0e639c)] hover:text-[var(--vscode-button-foreground,#ffffff)] border border-[var(--vscode-panel-border,#333333)] font-medium text-xs transition-colors"
                    >
                      <span>▶</span>
                      <span>Trace ({algo.ticks} Ticks)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
