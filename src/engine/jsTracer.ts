import { MemorySnapshot, CallFrame, HeapObject, InferredPointer, SupportedLanguage } from './types';

const POINTER_COLORS = ['#818cf8', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];

/**
 * General JavaScript/TypeScript Step-Execution Tracer.
 * Performs dynamic step evaluation on arbitrary JS/TS code,
 * capturing Call Stack, Heap objects, and automatically inferring array index pointers.
 */
export class JsTracer {
  private snapshots: MemorySnapshot[] = [];
  private heapStore: Map<string, HeapObject> = new Map();
  private stdoutLog: string[] = [];
  private heapCounter = 1;

  public trace(code: string, language: SupportedLanguage = 'javascript'): MemorySnapshot[] {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;

    try {
      this.executeAndRecord(code, language);
    } catch (err: any) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split('\n')[0] || '',
        event: 'step',
        explanation: `Execution notice: ${err?.message || 'Completed'}`,
        callStack: [{
          frameId: 'frame-1',
          functionName: 'global',
          line: 1,
          scope: {}
        }],
        inlayHint: `[Error: ${err?.message}]`
      });
    }

    if (this.snapshots.length === 0) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split('\n')[0] || '',
        event: 'init',
        explanation: 'Program initialized.',
        callStack: [{
          frameId: 'frame-1',
          functionName: 'global',
          line: 1,
          scope: {}
        }]
      });
    }

    // Set totalTicks on all snapshots
    const total = this.snapshots.length;
    this.snapshots.forEach((s, idx) => {
      s.tick = idx + 1;
      s.totalTicks = total;
    });

    return this.snapshots;
  }

  private executeAndRecord(code: string, language: SupportedLanguage) {
    const lines = code.split('\n');
    let scope: Record<string, any> = {};
    let callStackFrames: CallFrame[] = [{
      frameId: 'frame-main',
      functionName: 'main',
      line: 1,
      scope: {}
    }];

    let microtasks: string[] = [];
    let macrotasks: string[] = [];

    // Initial Snapshot
    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || '',
      event: 'init',
      explanation: 'Initializing program execution environment.',
      callStack: this.cloneCallStack(callStackFrames, scope),
      concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] }
    });

    // Generalized line-by-line interpreter loop
    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500; // Safeguard against runaway loops

    // Scan for function definitions
    const functions: Record<string, { params: string[]; bodyLines: number[] }> = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const fnMatch = line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2].split(',').map(p => p.trim()).filter(Boolean);
        functions[fnName] = { params, bodyLines: [i + 1] };
      }
    }

    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;

      // Skip empty or comment lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        lineIdx++;
        continue;
      }

      // Check for Promise or setTimeout (Concurrency primitives)
      if (trimmed.includes('setTimeout')) {
        const match = trimmed.match(/setTimeout\s*\(\s*(?:\(\)\s*=>|function\s*\(\)\s*\{)?\s*([^,\n]*)/);
        const taskDesc = match ? match[1].trim() : 'Timer Callback';
        macrotasks.push(taskDesc.replace(/[\(\);\{\}]/g, '').trim() || 'Timer Task');
        
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `Enqueued Macrotask: setTimeout callback placed in Macrotask/Timer Queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
          inlayHint: `[Macrotask Enqueued: ${macrotasks[macrotasks.length - 1]}]`
        });
        lineIdx++;
        continue;
      }

      if (trimmed.includes('Promise.resolve') || trimmed.includes('queueMicrotask')) {
        const match = trimmed.match(/(?:then|queueMicrotask)\s*\(\s*(?:\(\)\s*=>|function\s*\(\)\s*\{)?\s*([^,\n]*)/);
        const microDesc = match ? match[1].trim() : 'Promise Reaction';
        microtasks.push(microDesc.replace(/[\(\);\{\}]/g, '').trim() || 'Microtask');
        
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `Enqueued Microtask: Promise resolution pushes callback directly to high-priority Microtask Queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
          inlayHint: `[Microtask Enqueued (Priority)]`
        });
        lineIdx++;
        continue;
      }

      // console.log inspection
      if (trimmed.startsWith('console.log')) {
        const contentMatch = trimmed.match(/console\.log\((.*)\)/);
        let evaluatedLog = '';
        if (contentMatch) {
          const expr = contentMatch[1].trim();
          evaluatedLog = this.evaluateExpression(expr, scope);
        }
        this.stdoutLog.push(evaluatedLog);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Standard output emitted: ${evaluatedLog}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${evaluatedLog}]`
        });
        lineIdx++;
        continue;
      }

      // Array sorting or in-place modifications (e.g. nums.sort())
      const sortMatch = trimmed.match(/([a-zA-Z0-9_$]+)\.sort\s*\(/);
      if (sortMatch) {
        const arrVar = sortMatch[1];
        if (scope[arrVar] && Array.isArray(scope[arrVar])) {
          scope[arrVar].sort((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
          this.updateHeapObject(arrVar, scope[arrVar]);
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: 'step',
            explanation: `Array '${arrVar}' sorted in ascending order: [${scope[arrVar].join(', ')}]`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[Sorted: [${scope[arrVar].join(', ')}]]`
          });
        }
        lineIdx++;
        continue;
      }

      // Variable declaration or assignment: let/const/var x = ... OR x = ...
      const assignMatch = trimmed.match(/^(?:(?:let|const|var)\s+)?([a-zA-Z0-9_$,\s]+?)\s*=\s*(.+?);?$/);
      if (assignMatch && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('if')) {
        const varPart = assignMatch[1].trim();
        const exprPart = assignMatch[2].trim();

        // Destructuring assignment (e.g. [left, right] = [0, n - 1] or left = ..., right = ...)
        if (varPart.includes(',')) {
          const varNames = varPart.replace(/[\[\]]/g, '').split(',').map(s => s.trim());
          const valMatches = exprPart.replace(/[\[\]]/g, '').split(',').map(s => s.trim());
          for (let k = 0; k < varNames.length; k++) {
            const vName = varNames[k];
            const valExpr = valMatches[k] || '0';
            scope[vName] = this.evaluateRaw(valExpr, scope);
          }
        } else {
          const varName = varPart;
          const evaluatedVal = this.evaluateRaw(exprPart, scope);
          scope[varName] = evaluatedVal;

          // If it's an array, allocate on heap
          if (Array.isArray(evaluatedVal)) {
            this.allocateHeapArray(varName, evaluatedVal);
          }
        }

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Assignment: Updated ${varPart} in current scope frame.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${varPart} = ${JSON.stringify(scope[varPart.split(',')[0].trim()])}]`
        });
        lineIdx++;
        continue;
      }

      // Pointer increments/decrements (e.g. left++; right--; ++i; --j;)
      const incDecMatch = trimmed.match(/^([a-zA-Z0-9_$]+)(\+\+|--);?$/);
      if (incDecMatch) {
        const varName = incDecMatch[1];
        const op = incDecMatch[2];
        if (typeof scope[varName] === 'number') {
          scope[varName] = op === '++' ? scope[varName] + 1 : scope[varName] - 1;
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: 'step',
            explanation: `${op === '++' ? 'Incremented' : 'Decremented'} variable '${varName}' to ${scope[varName]}.`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${varName} -> ${scope[varName]}]`
          });
        }
        lineIdx++;
        continue;
      }

      // While loop header: while (condition)
      const whileMatch = trimmed.match(/^while\s*\((.*)\)\s*\{?$/);
      if (whileMatch) {
        const cond = whileMatch[1].trim();
        const isTrue = this.evaluateCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'loop',
          explanation: `Evaluating while condition '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? 'True (Continue loop)' : 'False (Exit loop)',
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`
        });

        if (!isTrue) {
          // Skip loop block
          lineIdx = this.findMatchingClosingBrace(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      // For loop header
      const forMatch = trimmed.match(/^for\s*\(\s*(?:let|var)?\s*([a-zA-Z0-9_$]+)\s*=\s*([^;]+);\s*([^;]+);\s*([^)]+)\)\s*\{?$/);
      if (forMatch) {
        const iterVar = forMatch[1];
        if (!(iterVar in scope)) {
          scope[iterVar] = this.evaluateRaw(forMatch[2], scope);
        }
        const condExpr = forMatch[3];
        const isCondMet = this.evaluateCondition(condExpr, scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'loop',
          explanation: `For loop iteration '${iterVar}' = ${scope[iterVar]}. Condition '${condExpr}' is ${isCondMet}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${iterVar} = ${scope[iterVar]}]`
        });

        if (!isCondMet) {
          lineIdx = this.findMatchingClosingBrace(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      // If condition: if (condition)
      const ifMatch = trimmed.match(/^if\s*\((.*)\)\s*\{?$/);
      if (ifMatch) {
        const cond = ifMatch[1].trim();
        const isTrue = this.evaluateCondition(cond, scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Branch evaluation '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? 'True (Branch taken)' : 'False (Skip branch)',
            isSatisfied: isTrue
          },
          inlayHint: `[${isTrue ? 'Branch Taken' : 'Branch Skipped'}]`
        });

        if (!isTrue) {
          lineIdx = this.findMatchingClosingBrace(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      // Default line step
      this.recordSnapshot({
        line: currentLineNum,
        codeSnippet: trimmed,
        event: 'step',
        explanation: `Executing: ${trimmed}`,
        callStack: this.cloneCallStack(callStackFrames, scope)
      });

      lineIdx++;
    }

    // Drain Microtasks (Demonstrating event loop priority)
    while (microtasks.length > 0) {
      const task = microtasks.shift()!;
      this.recordSnapshot({
        line: lines.length,
        codeSnippet: `// Microtask Execution: ${task}`,
        event: 'async_tick',
        explanation: `[Event Loop Tick] Microtask Queue draining: Executing callback '${task}'. Microtasks have strict priority!`,
        callStack: this.cloneCallStack(callStackFrames, scope),
        concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
        inlayHint: `[Microtask Executing: ${task}]`
      });
    }

    // Drain Macrotasks
    while (macrotasks.length > 0) {
      const task = macrotasks.shift()!;
      this.recordSnapshot({
        line: lines.length,
        codeSnippet: `// Macrotask Execution: ${task}`,
        event: 'async_tick',
        explanation: `[Event Loop Tick] Microtask queue is empty. Macrotask/Timer Queue executing: '${task}'.`,
        callStack: this.cloneCallStack(callStackFrames, scope),
        concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
        inlayHint: `[Macrotask Executing: ${task}]`
      });
    }
  }

  private recordSnapshot(partial: Partial<MemorySnapshot> & { line: number; codeSnippet: string; event: any; explanation: string; callStack: CallFrame[] }) {
    // Perform dynamic automatic inference of array index pointers
    this.inferArrayPointers(partial.callStack);

    const heapObj: Record<string, HeapObject> = {};
    this.heapStore.forEach((v, k) => {
      heapObj[k] = JSON.parse(JSON.stringify(v));
    });

    const snapshot: MemorySnapshot = {
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
    };

    this.snapshots.push(snapshot);
  }

  /**
   * General-purpose Automatic Pointer Inference:
   * Inspects all variables in the active stack frames. If any variable is an integer
   * and falls within the index bounds [0, array.length - 1] of an array on the heap,
   * it attaches an inferred pointer badge to that array!
   * No hardcoded variable names required.
   */
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

  private updateHeapObject(name: string, updatedArr: any[]) {
    // Find matching array on heap and update elements
    for (const heapObj of this.heapStore.values()) {
      if (heapObj.type === 'array') {
        heapObj.elements = [...updatedArr];
        break;
      }
    }
  }

  private cloneCallStack(frames: CallFrame[], currentScope: Record<string, any>): CallFrame[] {
    const activeScope: Record<string, any> = {};
    for (const [k, v] of Object.entries(currentScope)) {
      activeScope[k] = {
        name: k,
        type: Array.isArray(v) || (typeof v === 'object' && v !== null) ? 'reference' : 'primitive',
        value: Array.isArray(v) ? `Array(${v.length})` : v,
        rawType: typeof v
      };
    }

    return frames.map(f => ({
      ...f,
      scope: { ...activeScope }
    }));
  }

  private evaluateRaw(expr: string, scope: Record<string, any>): any {
    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${expr});`);
      return fn(...values);
    } catch {
      // Fallback evaluation for simple arrays/numbers/strings
      if (expr.startsWith('[') && expr.endsWith(']')) {
        try {
          return JSON.parse(expr);
        } catch {
          return expr.slice(1, -1).split(',').map(s => Number(s.trim()) || s.trim());
        }
      }
      if (!isNaN(Number(expr))) return Number(expr);
      if (expr === 'true') return true;
      if (expr === 'false') return false;
      return expr;
    }
  }

  private evaluateExpression(expr: string, scope: Record<string, any>): string {
    try {
      const val = this.evaluateRaw(expr, scope);
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    } catch {
      return expr;
    }
  }

  private evaluateCondition(cond: string, scope: Record<string, any>): boolean {
    try {
      const res = this.evaluateRaw(cond, scope);
      return Boolean(res);
    } catch {
      return false;
    }
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
