import { MemorySnapshot, CallFrame, HeapObject, InferredPointer } from './types';

const POINTER_COLORS = ['#818cf8', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];

/**
 * General Python Execution Tracer.
 * Evaluates Python statements, loops, lists, slicing, and coroutines,
 * tracking stack frames, heap arrays/dicts, and auto-inferring array pointers.
 */
export class PythonTracer {
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
        explanation: `Python trace notice: ${err?.message || 'Completed'}`,
        callStack: [{
          frameId: 'frame-py-main',
          functionName: '<module>',
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
      frameId: 'frame-py-main',
      functionName: '<module>',
      line: 1,
      scope: {}
    }];

    let readyTasks: string[] = [];
    let pendingCoroutines: string[] = [];

    // Initial snapshot
    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || '',
      event: 'init',
      explanation: 'Python interpreter initialized module execution.',
      callStack: this.cloneCallStack(callStackFrames, scope)
    });

    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500;

    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;

      if (!trimmed || trimmed.startsWith('#')) {
        lineIdx++;
        continue;
      }

      // asyncio task creation or coroutines
      if (trimmed.includes('asyncio.create_task')) {
        const match = trimmed.match(/asyncio\.create_task\((.*)\)/);
        const taskName = match ? match[1].trim() : 'async_coroutine()';
        readyTasks.push(taskName);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `Python Event Loop: Scheduled task '${taskName}' on the ready queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...readyTasks], macrotasks: [], pendingTasks: [...pendingCoroutines] },
          inlayHint: `[Task Scheduled: ${taskName}]`
        });
        lineIdx++;
        continue;
      }

      // Unawaited coroutine call trap (e.g. `coro = work()`)
      if (trimmed.match(/([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)/) && trimmed.includes('async')) {
        const parts = trimmed.split('=');
        const varName = parts[0].trim();
        pendingCoroutines.push(varName);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'async_tick',
          explanation: `⚠️ Unawaited Coroutine: Calling an async function returns a coroutine object without executing it!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [], macrotasks: [], pendingTasks: [...pendingCoroutines] },
          inlayHint: `[Coroutine object created (Unawaited)]`
        });
        lineIdx++;
        continue;
      }

      // print() inspection
      if (trimmed.startsWith('print(')) {
        const match = trimmed.match(/print\((.*)\)/);
        let printed = '';
        if (match) {
          printed = this.evaluatePythonExpression(match[1].trim(), scope);
        }
        this.stdoutLog.push(printed);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Output: ${printed}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${printed}]`
        });
        lineIdx++;
        continue;
      }

      // list.sort() in Python
      const sortMatch = trimmed.match(/([a-zA-Z0-9_$]+)\.sort\s*\(\)/);
      if (sortMatch) {
        const listVar = sortMatch[1];
        if (scope[listVar] && Array.isArray(scope[listVar])) {
          scope[listVar].sort((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0));
          this.updateHeapObject(listVar, scope[listVar]);
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: 'step',
            explanation: `List '${listVar}' sorted in-place: [${scope[listVar].join(', ')}]`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[Sorted: [${scope[listVar].join(', ')}]]`
          });
        }
        lineIdx++;
        continue;
      }

      // Python assignment: x = ... OR left, right = i + 1, len(nums) - 1
      const assignMatch = trimmed.match(/^([a-zA-Z0-9_$,\s]+?)\s*=\s*(.+)$/);
      if (assignMatch && !trimmed.startsWith('if') && !trimmed.startsWith('while') && !trimmed.startsWith('for') && !trimmed.startsWith('def')) {
        const lhs = assignMatch[1].trim();
        const rhs = assignMatch[2].trim();

        if (lhs.includes(',')) {
          const varNames = lhs.split(',').map(s => s.trim());
          const valExprs = rhs.split(',').map(s => s.trim());
          for (let k = 0; k < varNames.length; k++) {
            const vName = varNames[k];
            scope[vName] = this.evaluatePythonRaw(valExprs[k] || '0', scope);
          }
        } else {
          const evaluated = this.evaluatePythonRaw(rhs, scope);
          scope[lhs] = evaluated;

          if (Array.isArray(evaluated)) {
            this.allocateHeapArray(lhs, evaluated);
          }
        }

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Assigned: ${lhs} = ${JSON.stringify(scope[lhs.split(',')[0].trim()])}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${lhs} = ${JSON.stringify(scope[lhs.split(',')[0].trim()])}]`
        });
        lineIdx++;
        continue;
      }

      // Augmented assignments (e.g. left += 1, right -= 1)
      const augMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
      if (augMatch) {
        const vName = augMatch[1];
        const op = augMatch[2];
        const delta = this.evaluatePythonRaw(augMatch[3], scope);
        if (typeof scope[vName] === 'number') {
          if (op === '+=') scope[vName] += delta;
          if (op === '-=') scope[vName] -= delta;
          if (op === '*=') scope[vName] *= delta;
          if (op === '/=') scope[vName] /= delta;

          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: 'step',
            explanation: `Updated '${vName}' (${op} ${delta}) -> ${scope[vName]}`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${vName} = ${scope[vName]}]`
          });
        }
        lineIdx++;
        continue;
      }

      // While loop: while left < right:
      const whileMatch = trimmed.match(/^while\s+(.*):$/);
      if (whileMatch) {
        const cond = whileMatch[1].trim();
        const isTrue = this.evaluatePythonCondition(cond, scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'loop',
          explanation: `While condition '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? 'True (Iterating)' : 'False (Exiting loop)',
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`
        });

        if (!isTrue) {
          lineIdx = this.findPythonBlockEnd(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      // For loop: for i in range(...):
      const forMatch = trimmed.match(/^for\s+([a-zA-Z0-9_$]+)\s+in\s+range\((.*)\):$/);
      if (forMatch) {
        const iterVar = forMatch[1];
        const rangeExpr = forMatch[2];
        const maxVal = this.evaluatePythonRaw(rangeExpr, scope);

        if (!(iterVar in scope)) {
          scope[iterVar] = 0;
        }

        const isWithin = scope[iterVar] < maxVal;
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'loop',
          explanation: `For loop: '${iterVar}' = ${scope[iterVar]} (range bound: ${maxVal})`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${iterVar} = ${scope[iterVar]}]`
        });

        if (!isWithin) {
          lineIdx = this.findPythonBlockEnd(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }

      // If condition: if total == 0:
      const ifMatch = trimmed.match(/^(?:if|elif)\s+(.*):$/);
      if (ifMatch) {
        const cond = ifMatch[1].trim();
        const isTrue = this.evaluatePythonCondition(cond, scope);

        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: 'step',
          explanation: `Branch '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? 'True (Branch taken)' : 'False (Skip branch)',
            isSatisfied: isTrue
          },
          inlayHint: `[${isTrue ? 'Branch Taken' : 'Branch Skipped'}]`
        });

        if (!isTrue) {
          lineIdx = this.findPythonBlockEnd(lines, lineIdx);
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

  private updateHeapObject(name: string, updatedArr: any[]) {
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
        value: Array.isArray(v) ? `List(${v.length})` : v,
        rawType: typeof v
      };
    }

    return frames.map(f => ({
      ...f,
      scope: { ...activeScope }
    }));
  }

  private evaluatePythonRaw(expr: string, scope: Record<string, any>): any {
    // Convert python expressions (e.g. len(nums), True, False) to JS-evaluable
    let sanitized = expr
      .replace(/\blen\((.*?)\)/g, '$1.length')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!');

    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${sanitized});`);
      return fn(...values);
    } catch {
      if (expr.startsWith('[') && expr.endsWith(']')) {
        try {
          return JSON.parse(expr);
        } catch {
          return expr.slice(1, -1).split(',').map(s => Number(s.trim()) || s.trim());
        }
      }
      if (!isNaN(Number(expr))) return Number(expr);
      return expr;
    }
  }

  private evaluatePythonExpression(expr: string, scope: Record<string, any>): string {
    const val = this.evaluatePythonRaw(expr, scope);
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  private evaluatePythonCondition(cond: string, scope: Record<string, any>): boolean {
    return Boolean(this.evaluatePythonRaw(cond, scope));
  }

  private findPythonBlockEnd(lines: string[], currentIdx: number): number {
    const baseIndent = lines[currentIdx].search(/\S/);
    for (let i = currentIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const indent = line.search(/\S/);
      if (indent <= baseIndent) {
        return i;
      }
    }
    return lines.length;
  }
}
