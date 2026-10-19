import { MemorySnapshot, CallFrame, HeapObject, InferredPointer } from './types';

const POINTER_COLORS = ['#818cf8', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];

/**
 * General Rust Execution Tracer.
 * Evaluates Rust bindings, vectors, index pointers, and async futures.
 * Demonstrates Rust's lazy pull-based future execution model.
 */
export class RustTracer {
  private snapshots: MemorySnapshot[] = [];
  private heapStore: Map<string, HeapObject> = new Map();
  private stdoutLog: string[] = [];
  private heapCounter = 1;

  public trace(code: string): MemorySnapshot[] {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;

    try {
      this.executeAndRecord(code);
    } catch (err: any) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split('\n')[0] || '',
        event: 'step',
        explanation: `Rust trace notice: ${err?.message || 'Completed'}`,
        callStack: [{
          frameId: 'frame-rust-main',
          functionName: 'main',
          line: 1,
          scope: {}
        }]
      });
    }

    const total = this.snapshots.length;
    this.snapshots.forEach((s, idx) => {
      s.tick = idx + 1;
      s.totalTicks = total;
    });

    return this.snapshots;
  }

  private executeAndRecord(code: string) {
    const lines = code.split('\n');
    let scope: Record<string, any> = {};
    let callStackFrames: CallFrame[] = [{
      frameId: 'frame-rust-main',
      functionName: 'main',
      line: 1,
      scope: {}
    }];

    let unpolledFutures: string[] = [];
    let polledTasks: string[] = [];

    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || '',
      event: 'init',
      explanation: 'Rust runtime initialized: main thread allocation.',
      callStack: this.cloneCallStack(callStackFrames, scope)
    });

    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500;

    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        lineIdx++;
        continue;
      }

      // Rust lazy future: let fut = do_work(); (without .await)
      if (trimmed.match(/let\s+([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*\([^)]*\);?$/) && !trimmed.includes('.await') && (trimmed.includes('async') || trimmed.includes('fut') || trimmed.includes('work'))) {
        const parts = trimmed.split('=');
        const varName = parts[0].replace('let', '').trim();
        unpolledFutures.push(varName);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `⚠️ Rust Lazy Future: '${varName}' instantiated. Rust futures are pull-based: ZERO CPU cycles execute until actively polled or .awaited!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [], macrotasks: [], pendingTasks: [...unpolledFutures] },
          inlayHint: `[Future: Lazy / Unpolled]`
        });
        lineIdx++;
        continue;
      }

      // Rust .await call
      if (trimmed.includes('.await')) {
        const match = trimmed.match(/([a-zA-Z0-9_$]+)\.await/);
        const futName = match ? match[1] : 'future';
        unpolledFutures = unpolledFutures.filter(f => f !== futName);
        polledTasks.push(futName);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `Executor Polling: .await called on '${futName}'. Executor drives poll(cx) and executes state machine until Ready!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...polledTasks], macrotasks: [], pendingTasks: [...unpolledFutures] },
          inlayHint: `[Executor: Polled & Ready]`
        });
        lineIdx++;
        continue;
      }

      // println! in Rust
      if (trimmed.startsWith('println!(')) {
        const match = trimmed.match(/println!\((.*)\);?$/);
        let printed = '';
        if (match) {
          const raw = match[1];
          printed = raw.replace(/"/g, '').replace(/\{\}/g, '').trim();
        }
        this.stdoutLog.push(printed);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Rust stdout: ${printed}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${printed}]`
        });
        lineIdx++;
        continue;
      }

      // Vector declaration: let mut nums = vec![-4, -1, 0, 1, 2];
      const vecMatch = trimmed.match(/let\s+(?:mut\s+)?([a-zA-Z0-9_$]+)\s*=\s*vec!\[(.*)\];?$/);
      if (vecMatch) {
        const varName = vecMatch[1];
        const elements = vecMatch[2].split(',').map(s => Number(s.trim()) || s.trim());
        scope[varName] = elements;
        this.allocateHeapArray(varName, elements);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Allocated heap Vector 'Vec<i32>' for '${varName}': [${elements.join(', ')}]`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[Vec<i32>: [${elements.join(', ')}]]`
        });
        lineIdx++;
        continue;
      }

      // Variable binding: let (mut left, mut right) = (0, nums.len() - 1); OR let mut x = 5;
      const letTupleMatch = trimmed.match(/let\s*\((?:mut\s+)?([a-zA-Z0-9_$]+),\s*(?:mut\s+)?([a-zA-Z0-9_$]+)\)\s*=\s*\((.*),\s*(.*)\);?$/);
      if (letTupleMatch) {
        const v1 = letTupleMatch[1].trim();
        const v2 = letTupleMatch[2].trim();
        scope[v1] = this.evaluateRustRaw(letTupleMatch[3], scope);
        scope[v2] = this.evaluateRustRaw(letTupleMatch[4], scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Bound tuple variables: ${v1} = ${scope[v1]}, ${v2} = ${scope[v2]}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${v1}=${scope[v1]}, ${v2}=${scope[v2]}]`
        });
        lineIdx++;
        continue;
      }

      const letSimpleMatch = trimmed.match(/let\s+(?:mut\s+)?([a-zA-Z0-9_$]+)(?:\s*:\s*[a-zA-Z0-9_<>\s]+)?\s*=\s*(.+);?$/);
      if (letSimpleMatch) {
        const varName = letSimpleMatch[1];
        const val = this.evaluateRustRaw(letSimpleMatch[2], scope);
        scope[varName] = val;

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Bound variable '${varName}' = ${JSON.stringify(val)}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${varName} = ${JSON.stringify(val)}]`
        });
        lineIdx++;
        continue;
      }

      // In-place pointer increments/decrements (left += 1, right -= 1)
      const mutOpMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\s*(\+=|-=)\s*(.+);?$/);
      if (mutOpMatch) {
        const vName = mutOpMatch[1];
        const op = mutOpMatch[2];
        const delta = this.evaluateRustRaw(mutOpMatch[3], scope);
        if (typeof scope[vName] === 'number') {
          if (op === '+=') scope[vName] += delta;
          if (op === '-=') scope[vName] -= delta;

          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: 'step',
            explanation: `Mutated variable '${vName}' (${op} ${delta}) -> ${scope[vName]}`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${vName} = ${scope[vName]}]`
          });
        }
        lineIdx++;
        continue;
      }

      // While loop: while left < right {
      const whileMatch = trimmed.match(/^while\s+(.*)\s*\{?$/);
      if (whileMatch) {
        const cond = whileMatch[1].replace('{', '').trim();
        const isTrue = this.evaluateRustCondition(cond, scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'loop',
          explanation: `Evaluating while condition '${cond}': ${isTrue}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? 'True (Iterate)' : 'False (Exit)',
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`
        });

        if (!isTrue) {
          lineIdx = this.findMatchingClosingBrace(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      this.recordSnapshot({
        line: currentLineNum,
        codeSnippet: trimmed,
        event: 'step',
        explanation: `Executing: ${trimmed}`,
        callStack: this.cloneCallStack(callStackFrames, scope)
      });
      lineIdx++;
    }
  }

  private recordSnapshot(partial: Partial<MemorySnapshot> & { line: number; codeSnippet: string; event: any; explanation: string; callStack: CallFrame[] }) {
    this.inferArrayPointers(partial.callStack);

    const heapObj: Record<string, HeapObject> = {};
    this.heapStore.forEach((v, k) => {
      heapObj[k] = JSON.parse(JSON.stringify(v));
    });

    this.snapshots.push({
      tick: this.snapshots.length + 1,
      totalTicks: 0,
      line: partial.line,
      codeSnippet: partial.codeSnippet,
      event: partial.event,
      explanation: partial.explanation,
      callStack: partial.callStack,
      heap: heapObj,
      concurrency: partial.concurrency || { microtasks: [], macrotasks: [], pendingTasks: [] },
      stdout: partial.stdout ? [...partial.stdout] : [...this.stdoutLog],
      inlayHint: partial.inlayHint,
      evaluatedExpression: partial.evaluatedExpression
    });
  }

  private inferArrayPointers(callStack: CallFrame[]) {
    const activeFrame = callStack[callStack.length - 1];
    if (!activeFrame) return;

    let colorIdx = 0;
    this.heapStore.forEach((heapObj) => {
      if (heapObj.type === 'array' && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const pointers: InferredPointer[] = [];

        for (const [varName, scopeVar] of Object.entries(activeFrame.scope)) {
          if (typeof scopeVar.value === 'number' && Number.isInteger(scopeVar.value)) {
            const idx = scopeVar.value;
            if (idx >= 0 && idx < arrLen) {
              pointers.push({
                variableName: varName,
                index: idx,
                color: POINTER_COLORS[colorIdx % POINTER_COLORS.length],
                label: `${varName} = ${idx}`
              });
              colorIdx++;
            }
          }
        }
        heapObj.inferredPointers = pointers;
      }
    });
  }

  private allocateHeapArray(name: string, arr: any[]) {
    const heapId = `@heap:${this.heapCounter++}`;
    this.heapStore.set(heapId, {
      id: heapId,
      type: 'array',
      elements: [...arr],
      inferredPointers: []
    });
  }

  private cloneCallStack(frames: CallFrame[], currentScope: Record<string, any>): CallFrame[] {
    const activeScope: Record<string, any> = {};
    for (const [k, v] of Object.entries(currentScope)) {
      activeScope[k] = {
        name: k,
        type: Array.isArray(v) ? 'reference' : 'primitive',
        value: Array.isArray(v) ? `Vec<i32>(${v.length})` : v,
        rawType: typeof v
      };
    }

    return frames.map(f => ({
      ...f,
      scope: { ...activeScope }
    }));
  }

  private evaluateRustRaw(expr: string, scope: Record<string, any>): any {
    let sanitized = expr
      .replace(/\.len\(\)/g, '.length')
      .replace(/&mut\s+/g, '')
      .replace(/&/g, '');

    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${sanitized});`);
      return fn(...values);
    } catch {
      if (!isNaN(Number(expr))) return Number(expr);
      return expr;
    }
  }

  private evaluateRustCondition(cond: string, scope: Record<string, any>): boolean {
    return Boolean(this.evaluateRustRaw(cond, scope));
  }

  private findMatchingClosingBrace(lines: string[], startIdx: number): number {
    let braceCount = 0;
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].includes('{')) braceCount++;
      if (lines[i].includes('}')) {
        braceCount--;
        if (braceCount <= 0) return i + 1;
      }
    }
    return lines.length;
  }
}
