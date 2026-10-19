import * as ts from 'typescript';
import {
  CallFrame,
  CallTreeNode,
  DebuggerDiagnostic,
  HeapObject,
  InferredPointer,
  MemoryDiff,
  MemorySnapshot,
  SupportedLanguage,
  TimelinePoint,
} from './types';

const POINTER_COLORS = ['#00f2fe', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#6366f1', '#38bdf8', '#fbbf24'];
const BLOCKED_GLOBALS = new Set([
  'process', 'require', 'global', 'globalThis', 'window', 'document',
  'eval', 'Function', 'module', 'exports', 'importScripts', 'child_process', 'fs'
]);

export interface InterpreterFrame {
  frameId: string;
  functionName: string;
  line: number;
  rawScope: Record<string, any>;
  parentFrame?: InterpreterFrame;
}

interface AsyncTask {
  id: string;
  type: 'microtask' | 'macrotask';
  label: string;
  line: number;
  codeSnippet: string;
  callbackNode?: ts.Node;
  chained?: AsyncTask[];
}

export class AstInterpreter {
  private snapshots: MemorySnapshot[] = [];
  private heapStore = new Map<string, HeapObject>();
  private rawObjectToHeapId = new Map<any, string>();
  private stdoutLog: string[] = [];
  private heapCounter = 1;
  private callStack: InterpreterFrame[] = [];
  private userFunctions = new Map<string, ts.FunctionDeclaration>();
  private userClasses = new Map<string, ts.ClassDeclaration>();
  private microtasks: string[] = [];
  private macrotasks: string[] = [];
  private microtaskQueue: AsyncTask[] = [];
  private macrotaskQueue: AsyncTask[] = [];
  private activeIndicesMap = new Map<string, { index: number; type: 'read' | 'write' | 'compare' }[]>();
  private unpolledFutures: string[] = [];
  private arrayIndexAccessMap = new Map<string, Set<string>>(); // arrayVarName -> Set of indexVarNames
  private stepCount = 0;
  private readonly MAX_STEPS = 900;
  private sourceFile!: ts.SourceFile;
  private originalLines: string[] = [];

  // Enhanced features
  private callTreeNodes: CallTreeNode[] = [];
  private callTreeCounter = 1;
  private activeCallTreeId?: string;
  private loopCounters = new Map<number, number>();
  private activeDiagnostics: DebuggerDiagnostic[] = [];

  public trace(code: string, language: SupportedLanguage): MemorySnapshot[] {
    this.snapshots = [];
    this.heapStore.clear();
    this.rawObjectToHeapId.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;
    this.callStack = [];
    this.userFunctions.clear();
    this.userClasses.clear();
    this.microtasks = [];
    this.macrotasks = [];
    this.microtaskQueue = [];
    this.macrotaskQueue = [];
    this.activeIndicesMap.clear();
    this.unpolledFutures = [];
    this.arrayIndexAccessMap.clear();
    this.stepCount = 0;
    const normalizedCode = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.originalLines = normalizedCode.split('\n');
    this.callTreeNodes = [];
    this.callTreeCounter = 1;
    this.loopCounters.clear();
    this.activeDiagnostics = [];

    // 1. Language Preprocessing:
    let processedCode = normalizedCode;
    if (language === 'typescript') {
      processedCode = ts.transpileModule(normalizedCode, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: false }
      }).outputText;
    } else if (language === 'python') {
      processedCode = this.pythonToJs(normalizedCode);
    } else if (language === 'rust') {
      processedCode = this.rustToJs(normalizedCode);
    }


    // 2. Parse into TypeScript AST
    this.sourceFile = ts.createSourceFile('code.ts', processedCode, ts.ScriptTarget.ES2022, true);

    // 3. Pre-scan AST for indexing expressions and function/class declarations
    this.scanIndexAccesses(this.sourceFile);
    this.scanDeclarations(this.sourceFile);

    // 4. Initialize global call frame & root call tree node
    const globalFrame: InterpreterFrame = {
      frameId: 'frame-main',
      functionName: 'main',
      line: 1,
      rawScope: {}
    };
    this.callStack.push(globalFrame);

    const rootCallNode: CallTreeNode = {
      id: 'call_root',
      functionName: 'main',
      args: {},
      depth: 0,
      startTick: 1,
      status: 'active',
      children: []
    };
    this.callTreeNodes.push(rootCallNode);
    this.activeCallTreeId = rootCallNode.id;

    // Initial snapshot
    this.recordSnapshot(1, this.originalLines[0] || '', 'init', 'Initializing runtime execution environment & memory layout.', globalFrame);

    // 5. Execute top-level statements
    try {
      for (const statement of this.sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) continue;
        if (this.stepCount >= this.MAX_STEPS) break;
        const signal = this.executeStatement(statement, globalFrame);
        if (signal === 'return') break;
      }
    } catch (err: any) {
      this.activeDiagnostics.push({
        type: 'error',
        title: 'Runtime Evaluation Error',
        message: err?.message || String(err),
        line: 1,
        suggestedFix: 'Review syntax and runtime operations for unhandled expressions.'
      });
      this.recordSnapshot(1, '', 'step', `Runtime error: ${err?.message || err}`, globalFrame);
    }

    // 6. Drain Event Loop queues
    this.drainEventLoop(globalFrame);

    // Finalize root call tree node
    rootCallNode.status = 'resolved';
    rootCallNode.endTick = this.snapshots.length;

    // 7. Finalize totalTicks and timelineTrack
    const total = this.snapshots.length;
    const timeline: TimelinePoint[] = this.snapshots.map((s, idx) => ({
      tick: idx + 1,
      callDepth: s.callStack.length,
      allocations: (s.memoryDiff?.changedHeapObjects || []).map(id => ({ id, label: id })),
      mutationCount: s.memoryDiff?.mutationsCount || 0,
      activeLine: s.line,
      isBreakpoint: s.event === 'loop' || s.event === 'call',
      hasAnomaly: (s.diagnostics || []).some(d => d.type === 'error' || d.type === 'warning')
    }));

    this.snapshots.forEach((s, idx) => {
      s.tick = idx + 1;
      s.totalTicks = total;
      s.timelineTrack = timeline;
    });

    return this.snapshots;
  }

  // --- Statement Execution ---

  private executeStatement(node: ts.Statement, frame: InterpreterFrame): 'none' | 'break' | 'continue' | 'return' {
    if (this.stepCount++ >= this.MAX_STEPS) return 'none';
    const line = this.getLineNumber(node);
    const lineText = this.getLineText(line);

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const varName = decl.name.getText(this.sourceFile);
        let val: any = undefined;
        if (decl.initializer) {
          val = this.evalExpression(decl.initializer, frame);
        }
        frame.rawScope[varName] = val;

        if (Array.isArray(val)) {
          this.allocateHeapArray(varName, val);
        } else if (val && typeof val === 'object' && !this.rawObjectToHeapId.has(val)) {
          this.allocateHeapObject(val);
        }

        const formatted = this.formatVal(val);
        this.recordSnapshot(
          line,
          lineText,
          'step',
          `Declared variable '${varName}' initialized to ${formatted}`,
          frame,
          `[${varName} = ${formatted}]`
        );
      }
      return 'none';
    }

    if (ts.isExpressionStatement(node)) {
      const expr = node.expression;

      // Check for array sort: nums.sort()
      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'sort') {
        const arrVar = expr.expression.expression.getText(this.sourceFile);
        const arr = this.lookupVariable(arrVar, frame);
        if (Array.isArray(arr)) {
          arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          this.updateHeapArray(arrVar, arr);
          this.recordSnapshot(line, lineText, 'step', `Sorted array '${arrVar}' in-place: [${arr.join(', ')}]`, frame, `[Sorted]`);
          return 'none';
        }
      }

      // Check for setTimeout
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'setTimeout') {
        const cbArg = expr.arguments[0];
        const delayArg = expr.arguments[1] ? expr.arguments[1].getText(this.sourceFile) : '0';
        const desc = this.summarizeCallback(cbArg);
        const label = `setTimeout → ${desc} ${delayArg}ms`.trim();
        const cbLine = this.findCallbackLine(cbArg, line);
        const task: AsyncTask = {
          id: `macro-${this.macrotaskQueue.length + 1}`,
          type: 'macrotask',
          label,
          line: cbLine,
          codeSnippet: this.getLineText(cbLine),
          callbackNode: cbArg
        };
        this.macrotaskQueue.push(task);
        this.recordSnapshot(
          line,
          lineText,
          'async_tick',
          'setTimeout(..., 0) is enqueued as a MACROTASK. A 0ms delay does not mean "now" — it cannot run while the call stack is busy.',
          frame,
          '[Macrotask enqueued]'
        );
        return 'none';
      }

      // Check for Promise chain: Promise.resolve().then(...)
      if (ts.isCallExpression(expr)) {
        const chain = this.extractPromiseChain(expr);
        if (chain) {
          this.evalExpression(chain.root, frame);
          if (chain.thenArgs.length > 0) {
            const cb0 = chain.thenArgs[0];
            const label0 = `then → ${this.summarizeCallback(cb0)}`;
            const cbLine0 = this.findCallbackLine(cb0, line);
            const chainedList: AsyncTask[] = [];
            for (let i = 1; i < chain.thenArgs.length; i++) {
              const cbi = chain.thenArgs[i];
              const labeli = `then → ${this.summarizeCallback(cbi)}`;
              const cbLinei = this.findCallbackLine(cbi, line);
              chainedList.push({
                id: `micro-${i + 1}`,
                type: 'microtask',
                label: labeli,
                line: cbLinei,
                codeSnippet: this.getLineText(cbLinei),
                callbackNode: cbi,
                chained: []
              });
            }
            const task0: AsyncTask = {
              id: 'micro-1',
              type: 'microtask',
              label: label0,
              line: cbLine0,
              codeSnippet: this.getLineText(cbLine0),
              callbackNode: cb0,
              chained: chainedList
            };
            this.microtaskQueue.push(task0);
            this.recordSnapshot(
              line,
              lineText,
              'async_tick',
              'The promise is already fulfilled, so its .then callback is queued as a MICROTASK immediately. Only Microtask #1 is queued here — #2 registers when #1 returns.',
              frame,
              '[Microtask enqueued — high priority]'
            );
            return 'none';
          }
        }
      }

      // Check for queueMicrotask(...)
      if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'queueMicrotask') {
        const cbArg = expr.arguments[0];
        const desc = this.summarizeCallback(cbArg);
        const label = `queueMicrotask → ${desc}`;
        const cbLine = this.findCallbackLine(cbArg, line);
        const task: AsyncTask = {
          id: `micro-${this.microtaskQueue.length + 1}`,
          type: 'microtask',
          label,
          line: cbLine,
          codeSnippet: this.getLineText(cbLine),
          callbackNode: cbArg
        };
        this.microtaskQueue.push(task);
        this.recordSnapshot(line, lineText, 'async_tick', 'queueMicrotask() enqueued a high-priority microtask callback.', frame, '[Microtask enqueued]');
        return 'none';
      }

      const prevOutLen = this.stdoutLog.length;
      this.evalExpression(expr, frame);

      if (this.stdoutLog.length > prevOutLen) {
        const latestLog = this.stdoutLog[this.stdoutLog.length - 1];
        this.recordSnapshot(line, lineText, 'step', `Standard output emitted: ${latestLog}`, frame, `[stdout: ${latestLog}]`);
      } else {
        this.recordSnapshot(line, lineText, 'step', `Executed: ${lineText.trim()}`, frame);
      }
      return 'none';
    }

    if (ts.isIfStatement(node)) {
      const condVal = this.evalExpression(node.expression, frame);
      const condStr = node.expression.getText(this.sourceFile);
      const isTrue = Boolean(condVal);

      // Check for possible comparison expression
      const evaluatedEq = this.tryBuildComparisonExpression(node.expression, frame, isTrue);

      this.recordSnapshot(
        line,
        lineText,
        'step',
        `Branch condition '${condStr}' evaluated to ${isTrue ? 'TRUE' : 'FALSE'}. ${isTrue ? 'Entering then-branch.' : 'Skipping then-branch.'}`,
        frame,
        `[${isTrue ? 'Branch Taken' : 'Branch Skipped'}]`,
        evaluatedEq || {
          expression: condStr,
          result: isTrue ? 'TRUE (Taking branch)' : 'FALSE (Skipping branch)',
          isSatisfied: isTrue
        }
      );

      if (isTrue) {
        return this.executeStatement(node.thenStatement, frame);
      } else if (node.elseStatement) {
        return this.executeStatement(node.elseStatement, frame);
      }
      return 'none';
    }

    if (ts.isWhileStatement(node)) {
      let iter = 0;
      while (this.stepCount < this.MAX_STEPS) {
        iter++;
        this.loopCounters.set(line, (this.loopCounters.get(line) || 0) + 1);
        const loopCount = this.loopCounters.get(line)!;

        if (loopCount > 60) {
          this.activeDiagnostics.push({
            type: 'warning',
            title: 'Potential Infinite Loop Detected',
            message: `While loop at line ${line} has executed ${loopCount} iterations without terminating. Check pointer advancement.`,
            line,
            suggestedFix: 'Verify loop invariants and that pointers (e.g. left++, right--) are advancing properly.'
          });
        }

        const condVal = this.evalExpression(node.expression, frame);
        const condStr = node.expression.getText(this.sourceFile);
        const isTrue = Boolean(condVal);

        const evaluatedEq = this.tryBuildComparisonExpression(node.expression, frame, isTrue);

        this.recordSnapshot(
          line,
          lineText,
          'loop',
          `While condition '${condStr}': evaluated to ${isTrue ? 'TRUE' : 'FALSE'}. Iteration ${iter}.`,
          frame,
          `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`,
          evaluatedEq || {
            expression: condStr,
            result: isTrue ? `TRUE (Iteration ${iter})` : 'FALSE (Loop finished)',
            isSatisfied: isTrue
          }
        );

        if (!isTrue) break;

        const signal = this.executeStatement(node.statement, frame);
        if (signal === 'break') break;
        if (signal === 'return') return 'return';
      }
      return 'none';
    }

    if (ts.isForStatement(node)) {
      if (node.initializer) {
        if (ts.isVariableDeclarationList(node.initializer)) {
          for (const decl of node.initializer.declarations) {
            const vName = decl.name.getText(this.sourceFile);
            const vVal = decl.initializer ? this.evalExpression(decl.initializer, frame) : 0;
            frame.rawScope[vName] = vVal;
          }
        } else {
          this.evalExpression(node.initializer, frame);
        }
      }

      let iter = 0;
      while (this.stepCount < this.MAX_STEPS) {
        iter++;
        let isTrue = true;
        let condStr = 'true';
        if (node.condition) {
          condStr = node.condition.getText(this.sourceFile);
          isTrue = Boolean(this.evalExpression(node.condition, frame));
        }

        this.recordSnapshot(
          line,
          lineText,
          'loop',
          `For loop condition '${condStr}': evaluated to ${isTrue ? 'TRUE' : 'FALSE'}. Iteration ${iter}.`,
          frame,
          `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`
        );

        if (!isTrue) break;

        const signal = this.executeStatement(node.statement, frame);
        if (signal === 'break') break;
        if (signal === 'return') return 'return';

        if (node.incrementor) {
          this.evalExpression(node.incrementor, frame);
        }
      }
      return 'none';
    }

    if (ts.isBlock(node)) {
      for (const stmt of node.statements) {
        const signal = this.executeStatement(stmt, frame);
        if (signal !== 'none') return signal;
      }
      return 'none';
    }

    if (ts.isReturnStatement(node)) {
      let retVal: any = undefined;
      if (node.expression) {
        retVal = this.evalExpression(node.expression, frame);
      }
      (frame as any).returnValue = retVal;
      this.recordSnapshot(
        line,
        lineText,
        'return',
        `Return statement evaluated: returning ${this.formatVal(retVal)} to caller.`,
        frame,
        `[Return: ${this.formatVal(retVal)}]`
      );
      return 'return';
    }

    if (node.kind === ts.SyntaxKind.BreakStatement) {
      return 'break';
    }

    if (node.kind === ts.SyntaxKind.ContinueStatement) {
      return 'continue';
    }

    return 'none';
  }

  // --- Secure AST Expression Evaluator ---

  private evalExpression(expr: ts.Expression, frame: InterpreterFrame): any {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (expr.kind === ts.SyntaxKind.NullKeyword) return null;

    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      if (BLOCKED_GLOBALS.has(name)) return undefined;
      return this.lookupVariable(name, frame);
    }

    if (ts.isPrefixUnaryExpression(expr)) {
      const operand = expr.operand;
      const opKind = expr.operator;
      if (opKind === ts.SyntaxKind.ExclamationToken) {
        return !this.evalExpression(operand, frame);
      }
      if (opKind === ts.SyntaxKind.MinusToken) {
        return -this.evalExpression(operand, frame);
      }
      if (opKind === ts.SyntaxKind.PlusPlusToken && ts.isIdentifier(operand)) {
        const cur = Number(this.lookupVariable(operand.text, frame)) || 0;
        this.setVariable(operand.text, cur + 1, frame);
        return cur + 1;
      }
      if (opKind === ts.SyntaxKind.MinusMinusToken && ts.isIdentifier(operand)) {
        const cur = Number(this.lookupVariable(operand.text, frame)) || 0;
        this.setVariable(operand.text, cur - 1, frame);
        return cur - 1;
      }
    }

    if (ts.isPostfixUnaryExpression(expr)) {
      const operand = expr.operand;
      if (ts.isIdentifier(operand)) {
        const cur = Number(this.lookupVariable(operand.text, frame)) || 0;
        if (expr.operator === ts.SyntaxKind.PlusPlusToken) {
          this.setVariable(operand.text, cur + 1, frame);
          return cur;
        }
        if (expr.operator === ts.SyntaxKind.MinusMinusToken) {
          this.setVariable(operand.text, cur - 1, frame);
          return cur;
        }
      }
    }

    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;

      // Assignment operations: x = ..., arr[i] = ..., node.next = ..., x += ...
      if (op === ts.SyntaxKind.EqualsToken) {
        const rhs = this.evalExpression(expr.right, frame);
        if (ts.isIdentifier(expr.left)) {
          this.setVariable(expr.left.text, rhs, frame);
        } else if (ts.isElementAccessExpression(expr.left)) {
          const arr = this.evalExpression(expr.left.expression, frame);
          const idx = this.evalExpression(expr.left.argumentExpression, frame);
          if (Array.isArray(arr)) {
            if (idx < 0 || idx >= arr.length) {
              this.activeDiagnostics.push({
                type: 'error',
                title: 'Array Index Out Of Bounds',
                message: `Index ${idx} is outside bounds for array of size ${arr.length}.`,
                line: this.getLineNumber(expr),
                suggestedFix: 'Clamp index between 0 and array.length - 1.'
              });
            }
            arr[idx] = rhs;
            this.updateHeapArrayByRef(arr);
          }
        } else if (ts.isPropertyAccessExpression(expr.left)) {
          const targetObj = this.evalExpression(expr.left.expression, frame);
          const propName = expr.left.name.text;
          if (targetObj && typeof targetObj === 'object') {
            targetObj[propName] = rhs;
            this.updateHeapObjectByRef(targetObj, propName, rhs);
          } else if (targetObj === null || targetObj === undefined) {
            this.activeDiagnostics.push({
              type: 'error',
              title: 'Null Pointer Dereference',
              message: `Cannot assign property '${propName}' of ${targetObj}.`,
              line: this.getLineNumber(expr),
              suggestedFix: 'Ensure node reference is non-null before mutating fields.'
            });
          }
        }
        return rhs;
      }

      if (op === ts.SyntaxKind.PlusEqualsToken && ts.isIdentifier(expr.left)) {
        const cur = Number(this.lookupVariable(expr.left.text, frame)) || 0;
        const rhs = Number(this.evalExpression(expr.right, frame)) || 0;
        this.setVariable(expr.left.text, cur + rhs, frame);
        return cur + rhs;
      }

      if (op === ts.SyntaxKind.MinusEqualsToken && ts.isIdentifier(expr.left)) {
        const cur = Number(this.lookupVariable(expr.left.text, frame)) || 0;
        const rhs = Number(this.evalExpression(expr.right, frame)) || 0;
        this.setVariable(expr.left.text, cur - rhs, frame);
        return cur - rhs;
      }

      const lhs = this.evalExpression(expr.left, frame);
      const rhs = this.evalExpression(expr.right, frame);

      switch (op) {
        case ts.SyntaxKind.PlusToken: return lhs + rhs;
        case ts.SyntaxKind.MinusToken: return lhs - rhs;
        case ts.SyntaxKind.AsteriskToken: return lhs * rhs;
        case ts.SyntaxKind.SlashToken: return lhs / rhs;
        case ts.SyntaxKind.PercentToken: return lhs % rhs;
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.EqualsEqualsEqualsToken: return lhs === rhs;
        case ts.SyntaxKind.ExclamationEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: return lhs !== rhs;
        case ts.SyntaxKind.LessThanToken: return lhs < rhs;
        case ts.SyntaxKind.LessThanEqualsToken: return lhs <= rhs;
        case ts.SyntaxKind.GreaterThanToken: return lhs > rhs;
        case ts.SyntaxKind.GreaterThanEqualsToken: return lhs >= rhs;
        case ts.SyntaxKind.AmpersandAmpersandToken: return lhs && rhs;
        case ts.SyntaxKind.BarBarToken: return lhs || rhs;
        default: return undefined;
      }
    }

    // Element access: arr[idx]
    if (ts.isElementAccessExpression(expr)) {
      const arr = this.evalExpression(expr.expression, frame);
      const idx = this.evalExpression(expr.argumentExpression, frame);
      if (Array.isArray(arr)) {
        if (idx < 0 || idx >= arr.length) {
          this.activeDiagnostics.push({
            type: 'warning',
            title: 'Index Out of Bounds Access',
            message: `Reading index ${idx} on array of length ${arr.length} returns undefined.`,
            line: this.getLineNumber(expr),
            suggestedFix: 'Check index bounds before subscript access.'
          });
        }
        return arr[idx];
      }
      return undefined;
    }

    // Property access: arr.length or node.val / node.next
    if (ts.isPropertyAccessExpression(expr)) {
      const obj = this.evalExpression(expr.expression, frame);
      const prop = expr.name.text;
      if (obj && prop === 'length') return obj.length;
      if (obj === null || obj === undefined) {
        this.activeDiagnostics.push({
          type: 'error',
          title: 'Null Dereference Warning',
          message: `Attempted to read property '${prop}' on ${obj}.`,
          line: this.getLineNumber(expr),
          suggestedFix: `Check if (${expr.expression.getText(this.sourceFile)} != null) before accessing .${prop}.`
        });
        return undefined;
      }
      return obj ? obj[prop] : undefined;
    }

    // Object Literal: { val: 10, next: null }
    if (ts.isObjectLiteralExpression(expr)) {
      const obj: Record<string, any> = {};
      for (const prop of expr.properties) {
        if (ts.isPropertyAssignment(prop)) {
          const key = prop.name.getText(this.sourceFile);
          obj[key] = this.evalExpression(prop.initializer, frame);
        }
      }
      return this.allocateHeapObject(obj);
    }

    // Array literal: [1, 2, 3]
    if (ts.isArrayLiteralExpression(expr)) {
      return expr.elements.map(el => this.evalExpression(el, frame));
    }

    // New Expression: new ListNode(10), new TreeNode(5)
    if (ts.isNewExpression(expr)) {
      const className = expr.expression.getText(this.sourceFile);
      const args = expr.arguments ? expr.arguments.map(a => this.evalExpression(a, frame)) : [];
      const instance: Record<string, any> = {};

      if (className === 'ListNode' || className === 'Node') {
        instance.val = args[0] !== undefined ? args[0] : 0;
        instance.next = args[1] !== undefined ? args[1] : null;
      } else if (className === 'TreeNode' || className === 'BSTNode') {
        instance.val = args[0] !== undefined ? args[0] : 0;
        instance.left = args[1] !== undefined ? args[1] : null;
        instance.right = args[2] !== undefined ? args[2] : null;
      } else {
        instance.type = className;
        args.forEach((a, idx) => { instance[`arg${idx}`] = a; });
      }

      return this.allocateHeapObject(instance, 'custom_node');
    }

    // Conditional ternary: a ? b : c
    if (ts.isConditionalExpression(expr)) {
      const cond = this.evalExpression(expr.condition, frame);
      return cond ? this.evalExpression(expr.whenTrue, frame) : this.evalExpression(expr.whenFalse, frame);
    }

    // Parenthesized expression: (a + b)
    if (ts.isParenthesizedExpression(expr)) {
      return this.evalExpression(expr.expression, frame);
    }

    // Function calls
    if (ts.isCallExpression(expr)) {
      return this.executeCallExpression(expr, frame);
    }

    return undefined;
  }

  // --- Real Function Call Stack & Recursion Tree Tracking ---

  private executeCallExpression(expr: ts.CallExpression, frame: InterpreterFrame): any {
    const fnName = expr.expression.getText(this.sourceFile);

    // console.log
    if (fnName === 'console.log') {
      const printed = expr.arguments.map(arg => {
        const val = this.evalExpression(arg, frame);
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }).join(' ');
      this.stdoutLog.push(printed);
      return undefined;
    }

    // Standard conversions: String(x), Number(x)
    if (fnName === 'String') {
      return String(expr.arguments[0] ? this.evalExpression(expr.arguments[0], frame) : '');
    }
    if (fnName === 'Number') {
      return Number(expr.arguments[0] ? this.evalExpression(expr.arguments[0], frame) : 0);
    }

    // setTimeout (Macrotask)
    if (fnName === 'setTimeout') {
      const taskDesc = expr.arguments[0]?.getText(this.sourceFile) || 'Timer Callback';
      this.macrotasks.push(taskDesc.replace(/[\(\);\{\}=>]/g, '').trim() || 'Timer Task');
      return undefined;
    }

    // Promise.resolve / queueMicrotask (Microtask)
    if (fnName.includes('Promise.resolve') || fnName.includes('queueMicrotask') || fnName.endsWith('.then')) {
      const taskDesc = expr.arguments[0]?.getText(this.sourceFile) || 'Promise Reaction';
      this.microtasks.push(taskDesc.replace(/[\(\);\{\}=>]/g, '').trim() || 'Microtask');
      return undefined;
    }

    // Built-in Math functions: Math.max, Math.min, Math.floor, Math.abs, Math.ceil, Math.round, Math.pow, Math.sqrt
    if (fnName.startsWith('Math.')) {
      const mathMethod = fnName.replace('Math.', '').trim();
      if (typeof (Math as any)[mathMethod] === 'function') {
        const args = expr.arguments.map(arg => this.evalExpression(arg, frame));
        return (Math as any)[mathMethod](...args);
      }
    }

    // Array manipulation methods: push, append, pop, shift, unshift, sort, reverse, slice, includes, indexOf
    if (ts.isPropertyAccessExpression(expr.expression)) {
      const methodName = expr.expression.name.text;
      const target = this.evalExpression(expr.expression.expression, frame);

      if (Array.isArray(target)) {
        if (methodName === 'push' || methodName === 'append') {
          const val = this.evalExpression(expr.arguments[0], frame);
          target.push(val);
          this.updateHeapArrayByRef(target);
          return target.length;
        }
        if (methodName === 'pop') {
          const val = target.pop();
          this.updateHeapArrayByRef(target);
          return val;
        }
        if (methodName === 'shift') {
          const val = target.shift();
          this.updateHeapArrayByRef(target);
          return val;
        }
        if (methodName === 'unshift') {
          const args = expr.arguments.map(a => this.evalExpression(a, frame));
          const res = target.unshift(...args);
          this.updateHeapArrayByRef(target);
          return res;
        }
        if (methodName === 'sort') {
          target.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
          this.updateHeapArrayByRef(target);
          return target;
        }
        if (methodName === 'reverse') {
          target.reverse();
          this.updateHeapArrayByRef(target);
          return target;
        }
        if (methodName === 'slice') {
          const start = expr.arguments[0] ? this.evalExpression(expr.arguments[0], frame) : undefined;
          const end = expr.arguments[1] ? this.evalExpression(expr.arguments[1], frame) : undefined;
          return target.slice(start, end);
        }
        if (methodName === 'includes' || methodName === 'contains') {
          const val = this.evalExpression(expr.arguments[0], frame);
          return target.includes(val);
        }
        if (methodName === 'indexOf') {
          const val = this.evalExpression(expr.arguments[0], frame);
          return target.indexOf(val);
        }
      }
    }


    // User-Defined Function Call: True Call Stack & Dynamic Call Tree Topology
    const fnDecl = this.userFunctions.get(fnName);
    if (fnDecl && fnDecl.body) {
      const evalArgs = expr.arguments.map(a => this.evalExpression(a, frame));
      const fnLine = this.getLineNumber(fnDecl);

      // Create a genuine new Call Frame
      const newFrame: InterpreterFrame = {
        frameId: `frame-${this.callStack.length + 1}`,
        functionName: fnName,
        line: fnLine,
        rawScope: {},
        parentFrame: frame
      };

      // Bind arguments to parameters
      const argRecord: Record<string, any> = {};
      fnDecl.parameters.forEach((param, pIdx) => {
        const pName = param.name.getText(this.sourceFile);
        const argVal = evalArgs[pIdx];
        newFrame.rawScope[pName] = argVal;
        argRecord[pName] = argVal;
      });

      // Construct CallTreeNode for 2D Recursion Tree
      const callNodeId = `call_${this.callTreeCounter++}`;
      const parentNodeId = this.activeCallTreeId;
      const parentNode = parentNodeId ? this.callTreeNodes.find(n => n.id === parentNodeId) : undefined;
      if (parentNode) {
        parentNode.children.push(callNodeId);
      }

      const callDepth = this.callStack.length;
      const callNode: CallTreeNode = {
        id: callNodeId,
        parentId: parentNodeId,
        functionName: fnName,
        args: argRecord,
        depth: callDepth,
        startTick: this.snapshots.length + 1,
        status: 'active',
        children: []
      };
      this.callTreeNodes.push(callNode);
      const prevActiveCallTreeId = this.activeCallTreeId;
      this.activeCallTreeId = callNodeId;

      // Check recursion depth limit
      if (callDepth > 15) {
        this.activeDiagnostics.push({
          type: 'warning',
          title: 'Deep Recursion Depth',
          message: `Function '${fnName}' reached recursion depth ${callDepth}. Watch for stack overflow.`,
          line: fnLine,
          suggestedFix: 'Ensure base case terminates cleanly before reaching recursion limit.'
        });
      }

      // Push frame onto call stack
      this.callStack.push(newFrame);
      this.recordSnapshot(
        fnLine,
        this.getLineText(fnLine),
        'call',
        `Called '${fnName}(${evalArgs.map(this.formatVal).join(', ')})' at recursion depth ${callDepth}.`,
        newFrame
      );

      // Execute function body statements
      this.executeStatement(fnDecl.body, newFrame);

      const retVal = (newFrame as any).returnValue;

      // Mark CallTreeNode as resolved
      callNode.status = 'resolved';
      callNode.returnValue = retVal;
      callNode.endTick = this.snapshots.length + 1;
      this.activeCallTreeId = prevActiveCallTreeId;

      // Pop frame from call stack upon completion
      this.callStack.pop();
      this.recordSnapshot(
        fnLine,
        this.getLineText(fnLine),
        'return',
        `Function '${fnName}' returned ${this.formatVal(retVal)} to caller frame.`,
        frame
      );

      return retVal;
    }

    return undefined;
  }

  // --- Comparison & Arithmetic Step Equation Builder ---

  private tryBuildComparisonExpression(expr: ts.Expression, frame: InterpreterFrame, isTrue: boolean): any {
    try {
      if (ts.isBinaryExpression(expr)) {
        const opText = expr.operatorToken.getText(this.sourceFile);
        const lhsVal = this.evalExpression(expr.left, frame);
        const rhsVal = this.evalExpression(expr.right, frame);
        const lhsStr = expr.left.getText(this.sourceFile);
        const rhsStr = expr.right.getText(this.sourceFile);

        return {
          expression: `${lhsStr} (${this.formatVal(lhsVal)}) ${opText} ${rhsStr} (${this.formatVal(rhsVal)})`,
          result: isTrue ? `TRUE (${opText} satisfied)` : `FALSE (${opText} not met)`,
          isSatisfied: isTrue
        };
      }
    } catch {
      // Fallback
    }
    return undefined;
  }

  // --- Strict Array Pointer Inference ---

  private scanIndexAccesses(node: ts.Node) {
    if (ts.isElementAccessExpression(node)) {
      const arrName = node.expression.getText(this.sourceFile).trim();
      if (ts.isIdentifier(node.argumentExpression)) {
        const idxVar = node.argumentExpression.text.trim();
        if (!this.arrayIndexAccessMap.has(arrName)) {
          this.arrayIndexAccessMap.set(arrName, new Set());
        }
        this.arrayIndexAccessMap.get(arrName)!.add(idxVar);
      }
    }
    ts.forEachChild(node, n => this.scanIndexAccesses(n));
  }

  private inferArrayPointers(currentFrame: InterpreterFrame) {
    let colorIdx = 0;
    this.heapStore.forEach((heapObj, heapId) => {
      if (heapObj.type === 'array' && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const arrVarName = this.findVarNameForHeapId(heapId, currentFrame);
        const validIndexVars = arrVarName ? this.arrayIndexAccessMap.get(arrVarName) : undefined;

        const pointers: InferredPointer[] = [];

        for (const [vName, vVal] of Object.entries(currentFrame.rawScope)) {
          if (validIndexVars && validIndexVars.has(vName)) {
            if (typeof vVal === 'number' && Number.isInteger(vVal) && vVal >= 0 && vVal < arrLen) {
              pointers.push({
                variableName: vName,
                index: vVal,
                color: POINTER_COLORS[colorIdx % POINTER_COLORS.length],
                label: `${vName} = ${vVal}`
              });
              colorIdx++;
            }
          }
        }
        heapObj.inferredPointers = pointers;
      }
    });
  }

  // --- Snapshot Recording with Memory Diffs & Diagnostics ---

  private recordSnapshot(
    line: number,
    codeSnippet: string,
    event: 'step' | 'call' | 'return' | 'loop' | 'async_tick' | 'init',
    explanation: string,
    activeFrame: InterpreterFrame,
    inlayHint?: string,
    evaluatedExpression?: any
  ) {
    this.inferArrayPointers(activeFrame);

    const snapshotCallStack: CallFrame[] = this.callStack.map(f => {
      const scopeRecord: Record<string, any> = {};
      for (const [k, v] of Object.entries(f.rawScope)) {
        const heapRef = this.rawObjectToHeapId.get(v);
        scopeRecord[k] = {
          name: k,
          type: Array.isArray(v) || heapRef ? 'reference' : 'primitive',
          value: heapRef || (Array.isArray(v) ? `Array(${v.length})` : v),
          rawType: Array.isArray(v) ? 'array' : typeof v
        };
      }
      return {
        frameId: f.frameId,
        functionName: f.functionName,
        line: f.line,
        scope: scopeRecord
      };
    });

    const heapObj: Record<string, HeapObject> = {};
    this.heapStore.forEach((v, k) => {
      heapObj[k] = JSON.parse(JSON.stringify(v));
    });

    // Deep copy of persistent CallTree for this snapshot
    const callTreeSnapshot: CallTreeNode[] = this.callTreeNodes.map(node => ({
      ...node,
      args: { ...node.args },
      children: [...node.children]
    }));

    // Calculate memory footprint & memory diff
    const prev = this.snapshots[this.snapshots.length - 1];
    let changedVars: string[] = [];
    let changedHeap: string[] = [];
    let mutationsCount = 0;
    let currentHeapBytes = 0;

    for (const h of Object.values(heapObj)) {
      if (h.type === 'array' && h.elements) {
        currentHeapBytes += 32 + h.elements.length * 8;
      } else if (h.fields) {
        currentHeapBytes += 32 + Object.keys(h.fields).length * 16;
      }
    }
    for (const f of snapshotCallStack) {
      currentHeapBytes += Object.keys(f.scope).length * 16;
    }

    if (prev) {
      const prevTopScope = prev.callStack[prev.callStack.length - 1]?.scope || {};
      const currTopScope = snapshotCallStack[snapshotCallStack.length - 1]?.scope || {};
      for (const [k, v] of Object.entries(currTopScope)) {
        if (!prevTopScope[k] || JSON.stringify(prevTopScope[k].value) !== JSON.stringify(v.value)) {
          changedVars.push(k);
          v.isChanged = true;
          mutationsCount++;
        }
      }
      for (const [id, currO] of Object.entries(heapObj)) {
        const prevO = prev.heap[id];
        if (!prevO || JSON.stringify(prevO) !== JSON.stringify(currO)) {
          changedHeap.push(id);
          mutationsCount++;
        }
      }
    }

    const prevPeak = prev?.memoryDiff?.peakHeapBytes || 0;
    const peakHeapBytes = Math.max(prevPeak, currentHeapBytes);

    const memoryDiff: MemoryDiff = {
      previousTick: prev ? prev.tick : 1,
      changedVariables: changedVars,
      changedHeapObjects: changedHeap,
      heapDeltaBytes: prev ? currentHeapBytes - (prev.memoryDiff?.peakHeapBytes || currentHeapBytes) : currentHeapBytes,
      peakHeapBytes,
      totalAllocatedObjects: this.heapStore.size,
      freedObjects: 0,
      mutationsCount
    };

    const diagnostics = [...this.activeDiagnostics];
    this.activeDiagnostics = []; // Drain

    const safeLine = Math.max(1, Math.min(line, this.originalLines.length));
    const safeSnippet = (this.getLineText(safeLine) || codeSnippet).trim();

    this.snapshots.push({
      tick: this.snapshots.length + 1,
      totalTicks: 0,
      line: safeLine,
      codeSnippet: safeSnippet,
      event,
      explanation,
      callStack: snapshotCallStack,
      heap: heapObj,
      callTree: callTreeSnapshot,
      activeCallTreeId: this.activeCallTreeId,
      memoryDiff,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      concurrency: {
        microtasks: [...this.microtasks],
        macrotasks: [...this.macrotasks],
        pendingTasks: [...this.unpolledFutures]
      },
      stdout: [...this.stdoutLog],
      inlayHint,
      evaluatedExpression
    });
  }

  // --- Heap & Declaration Helpers ---

  private scanDeclarations(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      this.userFunctions.set(node.name.text, node);
    } else if (ts.isClassDeclaration(node) && node.name) {
      this.userClasses.set(node.name.text, node);
    }
    ts.forEachChild(node, n => this.scanDeclarations(n));
  }

  private lookupVariable(name: string, frame: InterpreterFrame): any {
    let cur: InterpreterFrame | undefined = frame;
    while (cur) {
      if (name in cur.rawScope) return cur.rawScope[name];
      cur = cur.parentFrame;
    }
    return undefined;
  }

  private setVariable(name: string, val: any, frame: InterpreterFrame) {
    let cur: InterpreterFrame | undefined = frame;
    while (cur) {
      if (name in cur.rawScope) {
        cur.rawScope[name] = val;
        if (Array.isArray(val)) this.updateHeapArray(name, val);
        else if (val && typeof val === 'object' && !this.rawObjectToHeapId.has(val)) this.allocateHeapObject(val);
        return;
      }
      cur = cur.parentFrame;
    }
    frame.rawScope[name] = val;
    if (Array.isArray(val)) this.allocateHeapArray(name, val);
    else if (val && typeof val === 'object' && !this.rawObjectToHeapId.has(val)) this.allocateHeapObject(val);
  }

  private allocateHeapArray(name: string, arr: any[]) {
    const heapId = `@heap:${this.heapCounter++}`;
    this.heapStore.set(heapId, {
      id: heapId,
      name,
      type: 'array',
      elements: [...arr],
      inferredPointers: []
    });
    this.rawObjectToHeapId.set(arr, heapId);
  }

  private allocateHeapObject(obj: Record<string, any>, preferredType?: 'custom_node' | 'object'): any {
    if (this.rawObjectToHeapId.has(obj)) {
      return obj;
    }
    const heapId = `@heap:${this.heapCounter++}`;
    this.rawObjectToHeapId.set(obj, heapId);

    const isNode = ('val' in obj || 'value' in obj || 'data' in obj) &&
                   ('next' in obj || 'left' in obj || 'right' in obj || 'prev' in obj);
    const type = preferredType || (isNode ? 'custom_node' : 'object');

    const serializedFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') {
        if (this.rawObjectToHeapId.has(v)) {
          serializedFields[k] = this.rawObjectToHeapId.get(v);
        } else if (Array.isArray(v)) {
          serializedFields[k] = `[${v.join(', ')}]`;
        } else {
          serializedFields[k] = this.allocateHeapObject(v);
        }
      } else {
        serializedFields[k] = v;
      }
    }

    this.heapStore.set(heapId, {
      id: heapId,
      type,
      fields: serializedFields
    });

    return obj;
  }

  private updateHeapObjectByRef(obj: any, prop: string, rhs: any) {
    const heapId = this.rawObjectToHeapId.get(obj);
    if (heapId && this.heapStore.has(heapId)) {
      const stored = this.heapStore.get(heapId)!;
      if (!stored.fields) stored.fields = {};
      let valToStore = rhs;
      if (rhs && typeof rhs === 'object' && this.rawObjectToHeapId.has(rhs)) {
        valToStore = this.rawObjectToHeapId.get(rhs);
      }
      stored.fields[prop] = valToStore;
    }
  }

  private updateHeapArray(name: string, arr: any[]) {
    const heapId = this.rawObjectToHeapId.get(arr);
    if (heapId && this.heapStore.has(heapId)) {
      this.heapStore.get(heapId)!.elements = [...arr];
      return;
    }
    for (const h of this.heapStore.values()) {
      if (h.type === 'array') {
        h.elements = [...arr];
        return;
      }
    }
  }

  private updateHeapArrayByRef(arr: any[]) {
    const heapId = this.rawObjectToHeapId.get(arr);
    if (heapId && this.heapStore.has(heapId)) {
      this.heapStore.get(heapId)!.elements = [...arr];
      return;
    }
    for (const h of this.heapStore.values()) {
      if (h.type === 'array' && h.elements) {
        h.elements = [...arr];
        return;
      }
    }
  }

  private findVarNameForHeapId(heapId: string, frame: InterpreterFrame): string | undefined {
    for (const [k, v] of Object.entries(frame.rawScope)) {
      if (this.rawObjectToHeapId.get(v) === heapId) return k;
      if (Array.isArray(v)) return k;
    }
    return undefined;
  }

  private extractPromiseChain(expr: ts.CallExpression): { root: ts.Expression; thenArgs: ts.Expression[] } | null {
    if (ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === 'then') {
      const parent = expr.expression.expression;
      if (ts.isCallExpression(parent)) {
        const inner = this.extractPromiseChain(parent);
        if (inner) {
          return {
            root: inner.root,
            thenArgs: [...inner.thenArgs, ...expr.arguments]
          };
        }
      }
      return {
        root: parent,
        thenArgs: [...expr.arguments]
      };
    }
    return null;
  }

  private summarizeCallback(cb?: ts.Node): string {
    if (!cb) return 'Callback';
    const text = cb.getText(this.sourceFile);
    const logMatch = text.match(/console\.log\((.*?)\)/);
    if (logMatch) {
      let msg = logMatch[1].trim();
      if (msg.length > 32) msg = msg.slice(0, 30) + '…';
      return `console.log(${msg})`;
    }
    const clean = text.replace(/[\r\n\t]+/g, ' ').slice(0, 32);
    return clean || 'Callback';
  }

  private findCallbackLine(node: ts.Node | undefined, fallbackLine: number): number {
    if (!node) return fallbackLine;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (ts.isBlock(node.body) && node.body.statements.length > 0) {
        return this.getLineNumber(node.body.statements[0]);
      }
      return this.getLineNumber(node.body);
    }
    return this.getLineNumber(node);
  }

  private executeCallbackNode(node: ts.Node | undefined, frame: InterpreterFrame) {
    if (!node) return;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (ts.isBlock(node.body)) {
        for (const stmt of node.body.statements) {
          if (ts.isExpressionStatement(stmt)) {
            this.evalExpression(stmt.expression, frame);
          } else {
            this.executeStatement(stmt, frame);
          }
        }
      } else {
        this.evalExpression(node.body, frame);
      }
    } else if (ts.isCallExpression(node)) {
      this.evalExpression(node, frame);
    }
  }

  private recordActiveIndex(arr: any[], index: number, type: 'read' | 'write' | 'compare') {
    const heapId = this.rawObjectToHeapId.get(arr);
    if (heapId) {
      if (!this.activeIndicesMap.has(heapId)) {
        this.activeIndicesMap.set(heapId, []);
      }
      this.activeIndicesMap.get(heapId)!.push({ index, type });
    }
  }

  private drainEventLoop(frame: InterpreterFrame) {
    let microIndex = 1;
    let macroIndex = 1;

    if (this.microtaskQueue.length > 0) {
      while (this.microtaskQueue.length > 0) {
        const task = this.microtaskQueue.shift()!;

        const asyncFrame: InterpreterFrame = {
          frameId: `frame-micro-${microIndex++}`,
          functionName: '(microtask) → then',
          line: task.line,
          rawScope: {}
        };
        this.callStack.push(asyncFrame);

        this.executeCallbackNode(task.callbackNode, asyncFrame);

        if (task.chained && task.chained.length > 0) {
          const nextTask = task.chained.shift()!;
          nextTask.chained = task.chained;
          this.microtaskQueue.push(nextTask);
        }

        const isLastMicro = this.microtaskQueue.length === 0;
        const explanation = isLastMicro
          ? 'The microtask queue is drained to emptiness. Microtask runs before any timer, even though the timer was scheduled first.'
          : `Microtask #${microIndex - 1} runs. Returning from it resolves the chained promise, which queues next microtask behind the current one.`;

        this.recordSnapshot(
          task.line,
          task.codeSnippet || this.getLineText(task.line),
          'async_tick',
          explanation,
          asyncFrame,
          '[Microtask executing]'
        );

        this.callStack.pop();
      }
    } else {
      while (this.microtasks.length > 0) {
        const task = this.microtasks.shift()!;
        const logMatch = task.match(/console\.log\((.*?)\)/);
        if (logMatch) {
          this.stdoutLog.push(logMatch[1].replace(/["']/g, '').trim());
        }
        this.recordSnapshot(
          this.originalLines.length,
          `// Microtask: ${task}`,
          'async_tick',
          `[Microtask Queue] Draining microtask '${task}' before any macrotasks run.`,
          frame,
          `[Microtask: ${task}]`
        );
      }
    }

    if (this.macrotaskQueue.length > 0) {
      while (this.macrotaskQueue.length > 0) {
        const task = this.macrotaskQueue.shift()!;

        const asyncFrame: InterpreterFrame = {
          frameId: `frame-macro-${macroIndex++}`,
          functionName: '(timer) → setTimeout',
          line: task.line,
          rawScope: {}
        };
        this.callStack.push(asyncFrame);

        this.executeCallbackNode(task.callbackNode, asyncFrame);

        this.recordSnapshot(
          task.line,
          task.codeSnippet || this.getLineText(task.line),
          'async_tick',
          'Only now, with the microtask queue empty, does the event loop pick up the macrotask. This delay is microtask starvation.',
          asyncFrame,
          '[Macrotask executing]'
        );

        this.callStack.pop();
      }
    } else {
      while (this.macrotasks.length > 0) {
        const task = this.macrotasks.shift()!;
        const logMatch = task.match(/console\.log\((.*?)\)/);
        if (logMatch) {
          this.stdoutLog.push(logMatch[1].replace(/["']/g, '').trim());
        }
        this.recordSnapshot(
          this.originalLines.length,
          `// Macrotask: ${task}`,
          'async_tick',
          `[Macrotask Queue] Microtask queue empty. Executing macrotask '${task}'.`,
          frame,
          `[Macrotask: ${task}]`
        );
      }
    }
  }

  private getLineNumber(node: ts.Node): number {
    return this.sourceFile.getLineAndCharacterOfPosition(node.getStart(this.sourceFile)).line + 1;
  }

  private getLineText(line1Based: number): string {
    return this.originalLines[line1Based - 1] || '';
  }

  private formatVal(v: any): string {
    if (v === undefined) return 'undefined';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  // --- Python Preprocessor ---
  private pythonToJs(py: string): string {
    const lines = py.split('\n');
    const indentStack = [0];
    const out: string[] = [];
    const declaredVars = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        out.push(raw);
        continue;
      }

      const indent = raw.search(/\S/);
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        out.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
      }

      let line = trimmed
        .replace(/\blen\((.*?)\)/g, '$1.length')
        .replace(/\bstr\((.*?)\)/g, 'String($1)')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\b/g, '!')
        .replace(/\bprint\((.*)\)/g, 'console.log($1)');

      if (line.match(/^while\s+(.*):$/)) {
        const cond = line.match(/^while\s+(.*):$/)![1];
        out.push(' '.repeat(indent) + `while (${cond}) {`);
        indentStack.push(indent + 4);
      } else if (line.match(/^if\s+(.*):$/)) {
        const cond = line.match(/^if\s+(.*):$/)![1];
        out.push(' '.repeat(indent) + `if (${cond}) {`);
        indentStack.push(indent + 4);
      } else if (line.match(/^elif\s+(.*):$/)) {
        const cond = line.match(/^elif\s+(.*):$/)![1];
        out.push(' '.repeat(indent) + `else if (${cond}) {`);
        indentStack.push(indent + 4);
      } else if (line === 'else:') {
        out.push(' '.repeat(indent) + `else {`);
        indentStack.push(indent + 4);
      } else if (line.match(/^for\s+([a-zA-Z0-9_$]+)\s+in\s+range\((.*)\):$/)) {
        const forMatch = line.match(/^for\s+([a-zA-Z0-9_$]+)\s+in\s+range\((.*)\):$/)!;
        const v = forMatch[1];
        const r = forMatch[2];
        declaredVars.add(v);
        out.push(' '.repeat(indent) + `for (let ${v} = 0; ${v} < ${r}; ${v}++) {`);
        indentStack.push(indent + 4);
      } else if (line.match(/^def\s+([a-zA-Z0-9_$]+)\((.*)\):$/)) {
        const defMatch = line.match(/^def\s+([a-zA-Z0-9_$]+)\((.*)\):$/)!;
        out.push(' '.repeat(indent) + `function ${defMatch[1]}(${defMatch[2]}) {`);
        indentStack.push(indent + 4);
      } else {
        // Ternary assignment: v = a if cond else b
        const tern = line.match(/^([a-zA-Z0-9_$]+)\s*=\s*(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
        if (tern) {
          const v = tern[1];
          const prefix = declaredVars.has(v) ? '' : 'let ';
          declaredVars.add(v);
          out.push(' '.repeat(indent) + `${prefix}${v} = (${tern[3]}) ? (${tern[2]}) : (${tern[4]});`);
          continue;
        }

        // Multi assignment: a, b = x, y
        const multi = line.match(/^([a-zA-Z0-9_$]+),\s*([a-zA-Z0-9_$]+)\s*=\s*(.+?),\s*(.+)$/);
        if (multi) {
          const v1 = multi[1], v2 = multi[2];
          const p1 = declaredVars.has(v1) ? '' : 'let ';
          const p2 = declaredVars.has(v2) ? '' : 'let ';
          declaredVars.add(v1); declaredVars.add(v2);
          out.push(' '.repeat(indent) + `${p1}${v1} = ${multi[3]}; ${p2}${v2} = ${multi[4]};`);
          continue;
        }

        // Augmented assignment: v += ... or v -= ...
        if (line.includes('+=') || line.includes('-=')) {
          out.push(' '.repeat(indent) + line + (line.endsWith(';') ? '' : ';'));
          continue;
        }

        // Regular assignment: x = ...
        const assign = line.match(/^([a-zA-Z0-9_$]+)\s*=\s*(.+)$/);
        if (assign && !line.includes('==') && !line.includes('!=') && !line.includes('<=') && !line.includes('>=')) {
          const v = assign[1];
          const prefix = declaredVars.has(v) ? '' : 'let ';
          declaredVars.add(v);
          out.push(' '.repeat(indent) + `${prefix}${v} = ${assign[2]};`);
          continue;
        }

        out.push(' '.repeat(indent) + line + (line.endsWith(';') ? '' : ';'));
      }
    }

    while (indentStack.length > 1) {
      indentStack.pop();
      out.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
    }

    return out.join('\n');
  }

  // --- Rust Preprocessor ---
  private rustToJs(rs: string): string {
    const lines = rs.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const out: string[] = [];
    let inFunction = false;
    const declaredFunctions: { name: string; paramCount: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const trimmed = line.trim();

      // Skip empty or comment lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        out.push(line);
        continue;
      }

      // Track unpolled lazy futures (Rust Pull Model lesson)
      if (line.includes('let') && line.includes('fetch_data_async') && !line.includes('.await')) {
        this.unpolledFutures.push('fut');
      }

      // Tuple destructuring: let (mut a, mut b) = (x, y);
      const tupleMatch = line.match(/^(\s*)let\s+\((?:mut\s+)?([a-zA-Z0-9_$]+),\s*(?:mut\s+)?([a-zA-Z0-9_$]+)\)\s*=\s*\((.+)\);?\s*$/);
      if (tupleMatch) {
        const indent = tupleMatch[1];
        const v1 = tupleMatch[2];
        const v2 = tupleMatch[3];
        const rhs = tupleMatch[4];
        let depth = 0;
        let splitIdx = -1;
        for (let k = 0; k < rhs.length; k++) {
          if (rhs[k] === '(' || rhs[k] === '[') depth++;
          else if (rhs[k] === ')' || rhs[k] === ']') depth--;
          else if (rhs[k] === ',' && depth === 0) {
            splitIdx = k;
            break;
          }
        }
        if (splitIdx !== -1) {
          const e1 = this.cleanRustExpr(rhs.slice(0, splitIdx).trim());
          const e2 = this.cleanRustExpr(rhs.slice(splitIdx + 1).trim());
          out.push(`${indent}let ${v1} = ${e1}; let ${v2} = ${e2};`);
          continue;
        }
      }

      // fn name(...) -> ... {
      const fnMatch = line.match(/^(\s*)(pub\s+)?(async\s+)?fn\s+([a-zA-Z0-9_$]+)\s*\(([\s\S]*?)\)(.*?)\{?$/);
      if (fnMatch) {
        const indent = fnMatch[1];
        const fnName = fnMatch[4];
        const rawParams = fnMatch[5];

        const cleanParams = rawParams.split(',').map(p => {
          let clean = p.trim();
          clean = clean.replace(/&mut\s+/g, '').replace(/&/g, '').replace(/mut\s+/g, '');
          const colonIdx = clean.indexOf(':');
          if (colonIdx !== -1) clean = clean.substring(0, colonIdx).trim();
          return clean;
        }).filter(Boolean);

        declaredFunctions.push({ name: fnName, paramCount: cleanParams.length });
        out.push(`${indent}function ${fnName}(${cleanParams.join(', ')}) {`);
        inFunction = true;
        continue;
      }

      // Range loops: for x in start..end { or for x in start..=end {
      const forRangeMatch = line.match(/^(\s*)for\s+([a-zA-Z0-9_$]+)\s+in\s+([a-zA-Z0-9_$.()+\-*\/ ]+)\.\.(=)?([a-zA-Z0-9_$.()+\-*\/ ]+)\s*\{$/);
      if (forRangeMatch) {
        const indent = forRangeMatch[1];
        const v = forRangeMatch[2];
        const start = this.cleanRustExpr(forRangeMatch[3].trim());
        const isInclusive = Boolean(forRangeMatch[4]);
        const end = this.cleanRustExpr(forRangeMatch[5].trim());
        const op = isInclusive ? '<=' : '<';
        out.push(`${indent}for (let ${v} = ${start}; ${v} ${op} ${end}; ${v}++) {`);
        continue;
      }

      // Enumerate loop: for (i, x) in iter.iter().enumerate() { or for (i, &x) ...
      const forEnumMatch = line.match(/^(\s*)for\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*(?:&|mut\s+)?([a-zA-Z0-9_$]+)\s*\)\s+in\s+([a-zA-Z0-9_$.()]+)(?:\.iter\(\))?\.enumerate\(\)\s*\{$/);
      if (forEnumMatch) {
        const indent = forEnumMatch[1];
        const idxVar = forEnumMatch[2];
        const itemVar = forEnumMatch[3];
        const target = forEnumMatch[4].replace(/&/g, '').trim();
        out.push(`${indent}for (let ${idxVar} = 0; ${idxVar} < ${target}.length; ${idxVar}++) { const ${itemVar} = ${target}[${idxVar}];`);
        continue;
      }

      // Iterator loop: for x in arr { or for &x in &arr {
      const forOfMatch = line.match(/^(\s*)for\s+(?:&|mut\s+)?([a-zA-Z0-9_$]+)\s+in\s+(?:&|mut\s+)?([a-zA-Z0-9_$.()]+)\s*\{$/);
      if (forOfMatch && !line.includes('..')) {
        const indent = forOfMatch[1];
        const v = forOfMatch[2];
        const target = forOfMatch[3].trim();
        out.push(`${indent}for (const ${v} of ${target}) {`);
        continue;
      }

      // While loop: while cond {
      const whileMatch = line.match(/^(\s*)while\s+([^{]+)\s*\{$/);
      if (whileMatch) {
        const indent = whileMatch[1];
        const cond = this.cleanRustExpr(whileMatch[2].trim());
        out.push(`${indent}while (${cond}) {`);
        continue;
      }

      // Loop: loop {
      const loopMatch = line.match(/^(\s*)loop\s*\{$/);
      if (loopMatch) {
        out.push(`${loopMatch[1]}while (true) {`);
        continue;
      }

      // If condition: if cond {
      const ifMatch = line.match(/^(\s*)if\s+([^{]+)\s*\{$/);
      if (ifMatch) {
        const indent = ifMatch[1];
        const cond = this.cleanRustExpr(ifMatch[2].trim());
        out.push(`${indent}if (${cond}) {`);
        continue;
      }

      // Else if condition: } else if cond { or else if cond {
      const elseIfMatch = line.match(/^(\s*)(\}\s*)?else\s+if\s+([^{]+)\s*\{$/);
      if (elseIfMatch) {
        const indent = elseIfMatch[1];
        const cond = this.cleanRustExpr(elseIfMatch[3].trim());
        out.push(`${indent}} else if (${cond}) {`);
        continue;
      }

      // Semicolon-less implicit return at the end of a function body
      if (inFunction && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') &&
          !trimmed.startsWith('let') && !trimmed.startsWith('return') && !trimmed.startsWith('for') &&
          !trimmed.startsWith('while') && !trimmed.startsWith('if') && !trimmed.startsWith('else')) {
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)?.trim();
        if (nextNonEmpty === '}') {
          out.push(`${line.replace(trimmed, `return ${this.cleanRustExpr(trimmed)};`)}`);
          continue;
        }
      }

      // General Rust expression transformations
      const processedLine = this.cleanRustExpr(line);
      out.push(processedLine);
    }

    // Auto-invoke entry point
    if (rs.includes('fn main(')) {
      out.push('\nmain();');
    } else if (declaredFunctions.length > 0) {
      // If no main() is defined, check if any declared function is called at the top level
      const primaryFn = declaredFunctions[0];
      const hasCall = lines.some(l => l.includes(`${primaryFn.name}(`) && !l.includes('fn '));
      if (!hasCall) {
        // Synthesize a call with default sample args so the user sees live execution immediately
        const dummyArgs = new Array(primaryFn.paramCount).fill(0).map((_, idx) => (idx === 0 ? '[-1, 0, 1, 2, -1, -4]' : '0'));
        out.push(`\n${primaryFn.name}(${dummyArgs.join(', ')});`);
      }
    }

    return out.join('\n');
  }

  private cleanRustExpr(expr: string): string {
    return expr
      // Macros
      .replace(/println!\(\s*"[^"]*"\s*,\s*([\s\S]*?)\)\s*;?$/g, 'console.log($1);')
      .replace(/println!\(\s*"([^"]*)"\s*\)\s*;?$/g, 'console.log("$1");')
      .replace(/print!\(\s*"[^"]*"\s*,\s*([\s\S]*?)\)\s*;?$/g, 'console.log($1);')
      .replace(/eprintln!\(\s*"[^"]*"\s*,\s*([\s\S]*?)\)\s*;?$/g, 'console.error($1);')
      // Collections & constructors
      .replace(/vec!\[/g, '[')
      .replace(/Vec::new\(\)/g, '[]')
      .replace(/Vec::with_capacity\([^)]*\)/g, '[]')
      .replace(/\.len\(\)/g, '.length')
      .replace(/\.is_empty\(\)/g, '.length === 0')
      // Numeric & saturating operations
      .replace(/([a-zA-Z0-9_$]+)\.saturating_sub\((\d+)\)/g, 'Math.max(0, $1 - $2)')
      .replace(/\.sort\(\);?/g, '.sort((a, b) => a - b);')
      .replace(/\.sort_unstable\(\);?/g, '.sort((a, b) => a - b);')
      .replace(/\.reverse\(\)/g, '.reverse()')
      .replace(/std::cmp::min/g, 'Math.min')
      .replace(/cmp::min/g, 'Math.min')
      .replace(/std::cmp::max/g, 'Math.max')
      .replace(/cmp::max/g, 'Math.max')
      // Variable bindings & Rust types
      .replace(/let\s+mut\s+([a-zA-Z0-9_$]+)(\s*:\s*[a-zA-Z0-9_<>, \[\]]+)?\s*=/g, 'let $1 =')
      .replace(/let\s+([a-zA-Z0-9_$]+)(\s*:\s*[a-zA-Z0-9_<>, \[\]]+)?\s*=/g, 'let $1 =')
      .replace(/let\s+\((?:mut\s+)?([a-zA-Z0-9_$]+),\s*(?:mut\s+)?([a-zA-Z0-9_$]+)\)\s*=\s*\((.+?),\s*(.+?)\);?/g, 'let [$1, $2] = [$3, $4];')
      // Borrows & references (preserve logical && while stripping single &)
      .replace(/&mut\s+/g, '')
      .replace(/(?<!&)&([a-zA-Z0-9_$]+)/g, '$1')
      // Type casts (e.g. as usize, as i32)
      .replace(/\s+as\s+(?:usize|i32|i64|u32|u64|f32|f64|bool)/g, '');
  }
}

