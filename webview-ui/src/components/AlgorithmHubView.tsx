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
    <div className="flex flex-col gap-3 p-3 text-[#f1f5f9] select-none">
      {/* TOP HEADER & SEARCH RIBBON */}
      <section className="rounded-xl border border-[#2a364f] bg-[#161c27] p-3 shadow-md flex flex-col gap-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#00f2fe]">
              <span>Curriculum &amp; Remote Ingestion</span>
              <span className="text-[#94a3b8]">•</span>
              <span className="font-mono text-[#94a3b8]">AST Instrumenter v2.4</span>
            </div>
            <h2 className="text-base font-bold text-[#f1f5f9] tracking-tight">
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
              className="w-full rounded-lg bg-[#0d131e] border border-[#2a364f] pl-8 pr-12 py-1.5 text-xs text-[#f1f5f9] placeholder:text-[#94a3b8] outline-none focus:border-[#00f2fe] transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-xs text-[#94a3b8]">🔍</span>
            <span className="absolute right-2 top-1.5 font-mono text-[9px] bg-[#1a2234] text-[#94a3b8] px-1.5 py-0.5 rounded border border-[#2a364f]">
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
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-[#00f2fe] text-[#080e19] font-bold shadow-[0_0_8px_rgba(0,242,254,0.3)]'
                    : 'bg-[#1a2234] text-[#94a3b8] hover:bg-[#242a36] hover:text-[#f1f5f9]'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-[#080e19]/20' : 'bg-[#0d131e]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* REMOTE GITHUB INGESTION ACTION BAR */}
        <div className="rounded-lg bg-[#0d131e] p-2.5 border border-[#242a36] flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="text-[#00f2fe] text-lg">⚡</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#f1f5f9]">Remote Trace Importer</span>
              <span className="text-[10px] text-[#94a3b8]">Transpile &amp; inject live bytecode instrumenter hooks</span>
            </div>
          </div>

          <div className="flex-1 flex flex-wrap lg:flex-nowrap items-center gap-2">
            {/* Repo Input */}
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-2 top-2 text-[11px] text-[#94a3b8]">📂</span>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="github.com/owner/repo/path"
                className="w-full rounded bg-[#161c27] border border-[#2a364f] pl-6 pr-2 py-1 text-xs font-mono text-[#00f2fe] placeholder:text-[#94a3b8] outline-none"
              />
            </div>

            {/* Branch Selector */}
            <select
              aria-label="GitHub Branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="rounded bg-[#161c27] border border-[#2a364f] px-2 py-1 text-xs font-mono text-[#f1f5f9] outline-none cursor-pointer"
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
              className="w-24 rounded bg-[#161c27] border border-[#2a364f] px-2 py-1 text-xs font-mono text-[#f1f5f9] outline-none"
            />

            {/* Import Button */}
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImportGitHub}
              className="flex items-center justify-center gap-1.5 px-3 py-1 rounded bg-[#00f2fe] text-[#080e19] font-bold text-xs hover:bg-[#6ff6ff] transition-all disabled:opacity-50 shrink-0"
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
          <span className="font-semibold text-[#f1f5f9]">
            Preset Algorithm Index ({filteredAlgorithms.length} Available)
          </span>
          <span className="text-[#94a3b8] font-mono text-[10px]">READY-TO-TRACE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAlgorithms.map((algo) => {
            const isActive = state.activeModule?.id === algo.id;
            return (
              <div
                key={algo.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all shadow-md group ${
                  isActive
                    ? 'bg-[#1a2234] border-[#00f2fe] shadow-[0_0_12px_rgba(0,242,254,0.15)]'
                    : 'bg-[#161c27] border-[#2a364f] hover:border-[#00f2fe]/50 hover:bg-[#1a2234]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] text-[#00f2fe] uppercase font-bold">
                      {algo.category}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        algo.difficulty === 'EASY'
                          ? 'bg-[#10b981]/15 text-[#10b981]'
                          : algo.difficulty === 'MEDIUM'
                          ? 'bg-[#fbbf24]/15 text-[#fbbf24]'
                          : 'bg-[#f43f5e]/15 text-[#f43f5e]'
                      }`}
                    >
                      {algo.difficulty}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#f1f5f9] mb-1 group-hover:text-[#00f2fe] transition-colors">
                    {algo.title}
                  </h3>

                  <p className="text-xs text-[#94a3b8] leading-snug line-clamp-2 mb-3">
                    {algo.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#242a36] flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
                    <span>⏱ {algo.timeComplexity}</span>
                    <span>🧠 {algo.spaceComplexity}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1">
                      {algo.languages.map((l) => (
                        <span
                          key={l}
                          className="font-mono text-[9px] px-1 py-0.5 rounded bg-[#0d131e] text-[#94a3b8] border border-[#2a364f]"
                        >
                          {l}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => loadModule(algo.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/30 font-bold text-xs hover:bg-[#00f2fe] hover:text-[#080e19] transition-all"
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
