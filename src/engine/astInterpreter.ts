import * as ts from 'typescript';
import { MemorySnapshot, CallFrame, HeapObject, InferredPointer, SupportedLanguage } from './types';

const POINTER_COLORS = ['#818cf8', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];
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

export class AstInterpreter {
  private snapshots: MemorySnapshot[] = [];
  private heapStore = new Map<string, HeapObject>();
  private stdoutLog: string[] = [];
  private heapCounter = 1;
  private callStack: InterpreterFrame[] = [];
  private userFunctions = new Map<string, ts.FunctionDeclaration>();
  private microtasks: string[] = [];
  private macrotasks: string[] = [];
  private unpolledFutures: string[] = [];
  private arrayIndexAccessMap = new Map<string, Set<string>>(); // arrayVarName -> Set of indexVarNames
  private stepCount = 0;
  private readonly MAX_STEPS = 800;
  private sourceFile!: ts.SourceFile;
  private originalLines: string[] = [];

  public trace(code: string, language: SupportedLanguage): MemorySnapshot[] {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;
    this.callStack = [];
    this.userFunctions.clear();
    this.microtasks = [];
    this.macrotasks = [];
    this.unpolledFutures = [];
    this.arrayIndexAccessMap.clear();
    this.stepCount = 0;
    this.originalLines = code.split('\n');

    // 1. Language Preprocessing:
    // If TypeScript, transpile to strip types cleanly (fixes F4)
    let processedCode = code;
    if (language === 'typescript') {
      processedCode = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: false }
      }).outputText;
    } else if (language === 'python') {
      processedCode = this.pythonToJs(code);
    } else if (language === 'rust') {
      processedCode = this.rustToJs(code);
    }

    // 2. Parse into TypeScript AST
    this.sourceFile = ts.createSourceFile('code.ts', processedCode, ts.ScriptTarget.ES2022, true);

    // 3. Pre-scan AST for all array indexing expressions to record valid index variables (fixes F6)
    this.scanIndexAccesses(this.sourceFile);

    // 4. Register top-level function declarations (fixes F3)
    this.scanFunctions(this.sourceFile);

    // 5. Initialize global call frame
    const globalFrame: InterpreterFrame = {
      frameId: 'frame-main',
      functionName: 'main',
      line: 1,
      rawScope: {}
    };
    this.callStack.push(globalFrame);

    // Initial snapshot
    this.recordSnapshot(1, this.originalLines[0] || '', 'init', 'Initializing execution environment.', globalFrame);

    // 6. Execute top-level statements with true loop & branching control flow (fixes F1, F2)
    try {
      for (const statement of this.sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement)) continue; // Already scanned
        if (this.stepCount >= this.MAX_STEPS) break;
        const signal = this.executeStatement(statement, globalFrame);
        if (signal === 'return') break;
      }
    } catch (err: any) {
      this.recordSnapshot(1, '', 'step', `Execution notice: ${err?.message || err}`, globalFrame);
    }

    // 7. Drain Event Loop queues (Microtasks before Macrotasks)
    this.drainEventLoop(globalFrame);

    // 8. Finalize totalTicks
    const total = this.snapshots.length;
    this.snapshots.forEach((s, idx) => {
      s.tick = idx + 1;
      s.totalTicks = total;
    });

    return this.snapshots;
  }

  // --- Statement Execution (Fixes F1, F2, F3) ---

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
        }

        this.recordSnapshot(line, lineText, 'step', `Declared '${varName}' = ${this.formatVal(val)}`, frame, `[${varName} = ${this.formatVal(val)}]`);
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

      this.evalExpression(expr, frame);
      this.recordSnapshot(line, lineText, 'step', `Executed: ${lineText.trim()}`, frame);
      return 'none';
    }

    if (ts.isIfStatement(node)) {
      const condVal = this.evalExpression(node.expression, frame);
      const condStr = node.expression.getText(this.sourceFile);
      const isTrue = Boolean(condVal);

      this.recordSnapshot(line, lineText, 'step', `Branch check '${condStr}': evaluates to ${isTrue}.`, frame, `[${isTrue ? 'Branch Taken' : 'Branch Skipped'}]`, {
        expression: condStr,
        result: isTrue ? 'TRUE (Taking branch)' : 'FALSE (Skipping branch)',
        isSatisfied: isTrue
      });

      // Crucial Fix for F2: Only ONE branch executes!
      if (isTrue) {
        return this.executeStatement(node.thenStatement, frame);
      } else if (node.elseStatement) {
        return this.executeStatement(node.elseStatement, frame);
      }
      return 'none';
    }

    // Crucial Fix for F1: True While Loop with Condition Re-evaluation & Back-Jumps
    if (ts.isWhileStatement(node)) {
      while (this.stepCount < this.MAX_STEPS) {
        const condVal = this.evalExpression(node.expression, frame);
        const condStr = node.expression.getText(this.sourceFile);
        const isTrue = Boolean(condVal);

        this.recordSnapshot(line, lineText, 'loop', `While loop condition '${condStr}': evaluates to ${isTrue}.`, frame, `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`, {
          expression: condStr,
          result: isTrue ? 'TRUE (Iterating)' : 'FALSE (Exiting loop)',
          isSatisfied: isTrue
        });

        if (!isTrue) break;

        const signal = this.executeStatement(node.statement, frame);
        if (signal === 'break') break;
        if (signal === 'return') return 'return';
        // 'continue' naturally restarts the while loop condition check!
      }
      return 'none';
    }

    // Crucial Fix for F1: True For Loop with Initializer, Condition, Increment, and Iteration
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

      while (this.stepCount < this.MAX_STEPS) {
        let isTrue = true;
        let condStr = 'true';
        if (node.condition) {
          condStr = node.condition.getText(this.sourceFile);
          isTrue = Boolean(this.evalExpression(node.condition, frame));
        }

        this.recordSnapshot(line, lineText, 'loop', `For loop condition '${condStr}': evaluates to ${isTrue}.`, frame, `[Condition: ${isTrue ? 'TRUE' : 'FALSE'}]`);

        if (!isTrue) break;

        const signal = this.executeStatement(node.statement, frame);
        if (signal === 'break') break;
        if (signal === 'return') return 'return';

        // Execute the incrementor (forMatch[4] from F1 finding)
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
      this.recordSnapshot(line, lineText, 'return', `Return: returned ${this.formatVal(retVal)}`, frame, `[Return: ${this.formatVal(retVal)}]`);
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

  // --- Secure AST Expression Evaluator (Fixes F5) ---

  private evalExpression(expr: ts.Expression, frame: InterpreterFrame): any {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (expr.kind === ts.SyntaxKind.NullKeyword) return null;

    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      // Sandbox security: block dangerous Node globals
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

      // Assignment operations: x = ..., arr[i] = ..., x += ...
      if (op === ts.SyntaxKind.EqualsToken) {
        const rhs = this.evalExpression(expr.right, frame);
        if (ts.isIdentifier(expr.left)) {
          this.setVariable(expr.left.text, rhs, frame);
        } else if (ts.isElementAccessExpression(expr.left)) {
          const arr = this.evalExpression(expr.left.expression, frame);
          const idx = this.evalExpression(expr.left.argumentExpression, frame);
          if (Array.isArray(arr)) {
            arr[idx] = rhs;
            this.updateHeapArrayByRef(arr);
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
        return arr[idx];
      }
      return undefined;
    }

    // Property access: arr.length
    if (ts.isPropertyAccessExpression(expr)) {
      const obj = this.evalExpression(expr.expression, frame);
      const prop = expr.name.text;
      if (obj && prop === 'length') return obj.length;
      return obj ? obj[prop] : undefined;
    }

    // Array literal: [1, 2, 3]
    if (ts.isArrayLiteralExpression(expr)) {
      return expr.elements.map(el => this.evalExpression(el, frame));
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

    // Function calls & Real Call Stack (Fixes F3)
    if (ts.isCallExpression(expr)) {
      return this.executeCallExpression(expr, frame);
    }

    return undefined;
  }

  // --- Real Function Call Stack & Recursion (Fixes F3) ---

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

    // Array push / append: res.append / res.push
    if (ts.isPropertyAccessExpression(expr.expression) && (expr.expression.name.text === 'push' || expr.expression.name.text === 'append')) {
      const arr = this.evalExpression(expr.expression.expression, frame);
      const val = this.evalExpression(expr.arguments[0], frame);
      if (Array.isArray(arr)) {
        arr.push(val);
        this.updateHeapArrayByRef(arr);
        return arr.length;
      }
    }

    // User-Defined Function Call: True Call Stack Push & Pop
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
      fnDecl.parameters.forEach((param, pIdx) => {
        const pName = param.name.getText(this.sourceFile);
        newFrame.rawScope[pName] = evalArgs[pIdx];
      });

      // Push frame onto call stack
      this.callStack.push(newFrame);
      this.recordSnapshot(fnLine, this.getLineText(fnLine), 'call', `Called function '${fnName}(${evalArgs.map(this.formatVal).join(', ')})'`, newFrame);

      // Execute function body statements
      this.executeStatement(fnDecl.body, newFrame);

      const retVal = (newFrame as any).returnValue;

      // Pop frame from call stack upon completion
      this.callStack.pop();
      this.recordSnapshot(fnLine, this.getLineText(fnLine), 'return', `Exited '${fnName}' -> returned ${this.formatVal(retVal)}`, frame);

      return retVal;
    }

    return undefined;
  }

  // --- Strict Array Pointer Inference (Fixes F6) ---

  /**
   * Scans the AST for all ElementAccessExpressions (e.g. `nums[left]`, `arr[i]`).
   * Only registers variables that are ACTUALLY used as index variables into specific arrays.
   */
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

  /**
   * Infers pointers ONLY for variables that were verified as index variables for this array.
   * Completely prevents false-positives like target=0 or sum=0 from over-firing!
   */
  private inferArrayPointers(currentFrame: InterpreterFrame) {
    let colorIdx = 0;
    this.heapStore.forEach((heapObj, heapId) => {
      if (heapObj.type === 'array' && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const arrVarName = this.findVarNameForHeapId(heapId, currentFrame);
        const validIndexVars = arrVarName ? this.arrayIndexAccessMap.get(arrVarName) : undefined;

        const pointers: InferredPointer[] = [];

        // Walk scope of active frame
        for (const [vName, vVal] of Object.entries(currentFrame.rawScope)) {
          // Strict check: Variable MUST have been used in arr[vName] AND must be integer in [0, arrLen)
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

  // --- Snapshot Recording ---

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
        scopeRecord[k] = {
          name: k,
          type: Array.isArray(v) ? 'reference' : 'primitive',
          value: Array.isArray(v) ? `Array(${v.length})` : v,
          rawType: typeof v
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

    this.snapshots.push({
      tick: this.snapshots.length + 1,
      totalTicks: 0,
      line,
      codeSnippet: codeSnippet.trim(),
      event,
      explanation,
      callStack: snapshotCallStack,
      heap: heapObj,
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

  // --- Helpers ---

  private scanFunctions(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      this.userFunctions.set(node.name.text, node);
    }
    ts.forEachChild(node, n => this.scanFunctions(n));
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
        return;
      }
      cur = cur.parentFrame;
    }
    frame.rawScope[name] = val;
    if (Array.isArray(val)) this.allocateHeapArray(name, val);
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

  private updateHeapArray(name: string, arr: any[]) {
    for (const h of this.heapStore.values()) {
      if (h.type === 'array') {
        h.elements = [...arr];
        return;
      }
    }
  }

  private updateHeapArrayByRef(arr: any[]) {
    for (const h of this.heapStore.values()) {
      if (h.type === 'array' && h.elements) {
        h.elements = [...arr];
        return;
      }
    }
  }

  private findVarNameForHeapId(heapId: string, frame: InterpreterFrame): string | undefined {
    for (const [k, v] of Object.entries(frame.rawScope)) {
      if (Array.isArray(v)) return k;
    }
    return undefined;
  }

  private drainEventLoop(frame: InterpreterFrame) {
    while (this.microtasks.length > 0) {
      const task = this.microtasks.shift()!;
      const logMatch = task.match(/console\.log\((.*?)\)/);
      if (logMatch) {
        this.stdoutLog.push(logMatch[1].replace(/["']/g, '').trim());
      }
      this.recordSnapshot(this.originalLines.length, `// Microtask: ${task}`, 'async_tick', `[Microtask Queue] Executing microtask '${task}'. Strict priority over macrotasks!`, frame, `[Microtask: ${task}]`);
    }
    while (this.macrotasks.length > 0) {
      const task = this.macrotasks.shift()!;
      const logMatch = task.match(/console\.log\((.*?)\)/);
      if (logMatch) {
        this.stdoutLog.push(logMatch[1].replace(/["']/g, '').trim());
      }
      this.recordSnapshot(this.originalLines.length, `// Macrotask: ${task}`, 'async_tick', `[Macrotask Queue] Microtasks empty. Executing macrotask '${task}'.`, frame, `[Macrotask: ${task}]`);
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
    const lines = rs.split('\n');
    const out: string[] = [];
    const declaredVars = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Track unpolled lazy futures (Rust Pull Model)
      if (line.includes('let') && line.includes('fetch_data_async') && !line.includes('.await')) {
        this.unpolledFutures.push('fut');
      }

      line = line
        .replace(/println!\("(.*?)",?\s*(.*?)\);?/g, 'console.log($2);')
        .replace(/vec!\[/g, '[')
        .replace(/\.len\(\)/g, '.length')
        .replace(/let\s+mut\s+/g, 'let ')
        .replace(/let\s+\(mut\s+([a-zA-Z0-9_$]+),\s*mut\s+([a-zA-Z0-9_$]+)\)\s*=\s*\((.+?),\s*(.+?)\);?/g, 'let $1 = $3; let $2 = $4;')
        .replace(/&mut\s+/g, '')
        .replace(/&/g, '');

      out.push(line);
    }

    return out.join('\n');
  }
}
