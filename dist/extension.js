"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode5 = __toESM(require("vscode"));

// src/providers/fermasWebviewProvider.ts
var vscode = __toESM(require("vscode"));

// src/engine/jsTracer.ts
var POINTER_COLORS = ["#818cf8", "#34d399", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa"];
var JsTracer = class {
  snapshots = [];
  heapStore = /* @__PURE__ */ new Map();
  stdoutLog = [];
  heapCounter = 1;
  trace(code, language = "javascript") {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;
    try {
      this.executeAndRecord(code, language);
    } catch (err) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split("\n")[0] || "",
        event: "step",
        explanation: `Execution notice: ${err?.message || "Completed"}`,
        callStack: [{
          frameId: "frame-1",
          functionName: "global",
          line: 1,
          scope: {}
        }],
        inlayHint: `[Error: ${err?.message}]`
      });
    }
    if (this.snapshots.length === 0) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split("\n")[0] || "",
        event: "init",
        explanation: "Program initialized.",
        callStack: [{
          frameId: "frame-1",
          functionName: "global",
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
  executeAndRecord(code, language) {
    const lines = code.split("\n");
    let scope = {};
    let callStackFrames = [{
      frameId: "frame-main",
      functionName: "main",
      line: 1,
      scope: {}
    }];
    let microtasks = [];
    let macrotasks = [];
    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || "",
      event: "init",
      explanation: "Initializing program execution environment.",
      callStack: this.cloneCallStack(callStackFrames, scope),
      concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] }
    });
    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500;
    const functions = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const fnMatch = line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2].split(",").map((p) => p.trim()).filter(Boolean);
        functions[fnName] = { params, bodyLines: [i + 1] };
      }
    }
    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        lineIdx++;
        continue;
      }
      if (trimmed.includes("setTimeout")) {
        const match = trimmed.match(/setTimeout\s*\(\s*(?:\(\)\s*=>|function\s*\(\)\s*\{)?\s*([^,\n]*)/);
        const taskDesc = match ? match[1].trim() : "Timer Callback";
        macrotasks.push(taskDesc.replace(/[\(\);\{\}]/g, "").trim() || "Timer Task");
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `Enqueued Macrotask: setTimeout callback placed in Macrotask/Timer Queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
          inlayHint: `[Macrotask Enqueued: ${macrotasks[macrotasks.length - 1]}]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.includes("Promise.resolve") || trimmed.includes("queueMicrotask")) {
        const match = trimmed.match(/(?:then|queueMicrotask)\s*\(\s*(?:\(\)\s*=>|function\s*\(\)\s*\{)?\s*([^,\n]*)/);
        const microDesc = match ? match[1].trim() : "Promise Reaction";
        microtasks.push(microDesc.replace(/[\(\);\{\}]/g, "").trim() || "Microtask");
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `Enqueued Microtask: Promise resolution pushes callback directly to high-priority Microtask Queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
          inlayHint: `[Microtask Enqueued (Priority)]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.startsWith("console.log")) {
        const contentMatch = trimmed.match(/console\.log\((.*)\)/);
        let evaluatedLog = "";
        if (contentMatch) {
          const expr = contentMatch[1].trim();
          evaluatedLog = this.evaluateExpression(expr, scope);
        }
        this.stdoutLog.push(evaluatedLog);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Standard output emitted: ${evaluatedLog}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${evaluatedLog}]`
        });
        lineIdx++;
        continue;
      }
      const sortMatch = trimmed.match(/([a-zA-Z0-9_$]+)\.sort\s*\(/);
      if (sortMatch) {
        const arrVar = sortMatch[1];
        if (scope[arrVar] && Array.isArray(scope[arrVar])) {
          scope[arrVar].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
          this.updateHeapObject(arrVar, scope[arrVar]);
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: "step",
            explanation: `Array '${arrVar}' sorted in ascending order: [${scope[arrVar].join(", ")}]`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[Sorted: [${scope[arrVar].join(", ")}]]`
          });
        }
        lineIdx++;
        continue;
      }
      const assignMatch = trimmed.match(/^(?:(?:let|const|var)\s+)?([a-zA-Z0-9_$,\s]+?)\s*=\s*(.+?);?$/);
      if (assignMatch && !trimmed.startsWith("for") && !trimmed.startsWith("while") && !trimmed.startsWith("if")) {
        const varPart = assignMatch[1].trim();
        const exprPart = assignMatch[2].trim();
        if (varPart.includes(",")) {
          const varNames = varPart.replace(/[\[\]]/g, "").split(",").map((s) => s.trim());
          const valMatches = exprPart.replace(/[\[\]]/g, "").split(",").map((s) => s.trim());
          for (let k = 0; k < varNames.length; k++) {
            const vName = varNames[k];
            const valExpr = valMatches[k] || "0";
            scope[vName] = this.evaluateRaw(valExpr, scope);
          }
        } else {
          const varName = varPart;
          const evaluatedVal = this.evaluateRaw(exprPart, scope);
          scope[varName] = evaluatedVal;
          if (Array.isArray(evaluatedVal)) {
            this.allocateHeapArray(varName, evaluatedVal);
          }
        }
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Assignment: Updated ${varPart} in current scope frame.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${varPart} = ${JSON.stringify(scope[varPart.split(",")[0].trim()])}]`
        });
        lineIdx++;
        continue;
      }
      const incDecMatch = trimmed.match(/^([a-zA-Z0-9_$]+)(\+\+|--);?$/);
      if (incDecMatch) {
        const varName = incDecMatch[1];
        const op = incDecMatch[2];
        if (typeof scope[varName] === "number") {
          scope[varName] = op === "++" ? scope[varName] + 1 : scope[varName] - 1;
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: "step",
            explanation: `${op === "++" ? "Incremented" : "Decremented"} variable '${varName}' to ${scope[varName]}.`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${varName} -> ${scope[varName]}]`
          });
        }
        lineIdx++;
        continue;
      }
      const whileMatch = trimmed.match(/^while\s*\((.*)\)\s*\{?$/);
      if (whileMatch) {
        const cond = whileMatch[1].trim();
        const isTrue = this.evaluateCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "loop",
          explanation: `Evaluating while condition '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? "True (Continue loop)" : "False (Exit loop)",
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? "TRUE" : "FALSE"}]`
        });
        if (!isTrue) {
          lineIdx = this.findMatchingClosingBrace(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }
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
          event: "loop",
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
      const ifMatch = trimmed.match(/^if\s*\((.*)\)\s*\{?$/);
      if (ifMatch) {
        const cond = ifMatch[1].trim();
        const isTrue = this.evaluateCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Branch evaluation '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? "True (Branch taken)" : "False (Skip branch)",
            isSatisfied: isTrue
          },
          inlayHint: `[${isTrue ? "Branch Taken" : "Branch Skipped"}]`
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
        event: "step",
        explanation: `Executing: ${trimmed}`,
        callStack: this.cloneCallStack(callStackFrames, scope)
      });
      lineIdx++;
    }
    while (microtasks.length > 0) {
      const task = microtasks.shift();
      this.recordSnapshot({
        line: lines.length,
        codeSnippet: `// Microtask Execution: ${task}`,
        event: "async_tick",
        explanation: `[Event Loop Tick] Microtask Queue draining: Executing callback '${task}'. Microtasks have strict priority!`,
        callStack: this.cloneCallStack(callStackFrames, scope),
        concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
        inlayHint: `[Microtask Executing: ${task}]`
      });
    }
    while (macrotasks.length > 0) {
      const task = macrotasks.shift();
      this.recordSnapshot({
        line: lines.length,
        codeSnippet: `// Macrotask Execution: ${task}`,
        event: "async_tick",
        explanation: `[Event Loop Tick] Microtask queue is empty. Macrotask/Timer Queue executing: '${task}'.`,
        callStack: this.cloneCallStack(callStackFrames, scope),
        concurrency: { microtasks: [...microtasks], macrotasks: [...macrotasks], pendingTasks: [] },
        inlayHint: `[Macrotask Executing: ${task}]`
      });
    }
  }
  recordSnapshot(partial) {
    this.inferArrayPointers(partial.callStack);
    const heapObj = {};
    this.heapStore.forEach((v, k) => {
      heapObj[k] = JSON.parse(JSON.stringify(v));
    });
    const snapshot = {
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
  inferArrayPointers(callStack) {
    const activeFrame = callStack[callStack.length - 1];
    if (!activeFrame)
      return;
    let colorIdx = 0;
    this.heapStore.forEach((heapObj) => {
      if (heapObj.type === "array" && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const pointers = [];
        for (const [varName, scopeVar] of Object.entries(activeFrame.scope)) {
          if (typeof scopeVar.value === "number" && Number.isInteger(scopeVar.value)) {
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
  allocateHeapArray(name, arr) {
    const heapId = `@heap:${this.heapCounter++}`;
    this.heapStore.set(heapId, {
      id: heapId,
      type: "array",
      elements: [...arr],
      inferredPointers: []
    });
  }
  updateHeapObject(name, updatedArr) {
    for (const heapObj of this.heapStore.values()) {
      if (heapObj.type === "array") {
        heapObj.elements = [...updatedArr];
        break;
      }
    }
  }
  cloneCallStack(frames, currentScope) {
    const activeScope = {};
    for (const [k, v] of Object.entries(currentScope)) {
      activeScope[k] = {
        name: k,
        type: Array.isArray(v) || typeof v === "object" && v !== null ? "reference" : "primitive",
        value: Array.isArray(v) ? `Array(${v.length})` : v,
        rawType: typeof v
      };
    }
    return frames.map((f) => ({
      ...f,
      scope: { ...activeScope }
    }));
  }
  evaluateRaw(expr, scope) {
    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${expr});`);
      return fn(...values);
    } catch {
      if (expr.startsWith("[") && expr.endsWith("]")) {
        try {
          return JSON.parse(expr);
        } catch {
          return expr.slice(1, -1).split(",").map((s) => Number(s.trim()) || s.trim());
        }
      }
      if (!isNaN(Number(expr)))
        return Number(expr);
      if (expr === "true")
        return true;
      if (expr === "false")
        return false;
      return expr;
    }
  }
  evaluateExpression(expr, scope) {
    try {
      const val = this.evaluateRaw(expr, scope);
      return typeof val === "object" ? JSON.stringify(val) : String(val);
    } catch {
      return expr;
    }
  }
  evaluateCondition(cond, scope) {
    try {
      const res = this.evaluateRaw(cond, scope);
      return Boolean(res);
    } catch {
      return false;
    }
  }
  findMatchingClosingBrace(lines, startIdx) {
    let braceCount = 0;
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].includes("{"))
        braceCount++;
      if (lines[i].includes("}")) {
        braceCount--;
        if (braceCount <= 0)
          return i + 1;
      }
    }
    return lines.length;
  }
};

// src/engine/pythonTracer.ts
var POINTER_COLORS2 = ["#818cf8", "#34d399", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa"];
var PythonTracer = class {
  snapshots = [];
  heapStore = /* @__PURE__ */ new Map();
  stdoutLog = [];
  heapCounter = 1;
  trace(code) {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;
    try {
      this.executeAndRecord(code);
    } catch (err) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split("\n")[0] || "",
        event: "step",
        explanation: `Python trace notice: ${err?.message || "Completed"}`,
        callStack: [{
          frameId: "frame-py-main",
          functionName: "<module>",
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
  executeAndRecord(code) {
    const lines = code.split("\n");
    let scope = {};
    let callStackFrames = [{
      frameId: "frame-py-main",
      functionName: "<module>",
      line: 1,
      scope: {}
    }];
    let readyTasks = [];
    let pendingCoroutines = [];
    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || "",
      event: "init",
      explanation: "Python interpreter initialized module execution.",
      callStack: this.cloneCallStack(callStackFrames, scope)
    });
    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500;
    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;
      if (!trimmed || trimmed.startsWith("#")) {
        lineIdx++;
        continue;
      }
      if (trimmed.includes("asyncio.create_task")) {
        const match = trimmed.match(/asyncio\.create_task\((.*)\)/);
        const taskName = match ? match[1].trim() : "async_coroutine()";
        readyTasks.push(taskName);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `Python Event Loop: Scheduled task '${taskName}' on the ready queue.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...readyTasks], macrotasks: [], pendingTasks: [...pendingCoroutines] },
          inlayHint: `[Task Scheduled: ${taskName}]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.match(/([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)/) && trimmed.includes("async")) {
        const parts = trimmed.split("=");
        const varName = parts[0].trim();
        pendingCoroutines.push(varName);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `\u26A0\uFE0F Unawaited Coroutine: Calling an async function returns a coroutine object without executing it!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [], macrotasks: [], pendingTasks: [...pendingCoroutines] },
          inlayHint: `[Coroutine object created (Unawaited)]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.startsWith("print(")) {
        const match = trimmed.match(/print\((.*)\)/);
        let printed = "";
        if (match) {
          printed = this.evaluatePythonExpression(match[1].trim(), scope);
        }
        this.stdoutLog.push(printed);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Output: ${printed}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${printed}]`
        });
        lineIdx++;
        continue;
      }
      const sortMatch = trimmed.match(/([a-zA-Z0-9_$]+)\.sort\s*\(\)/);
      if (sortMatch) {
        const listVar = sortMatch[1];
        if (scope[listVar] && Array.isArray(scope[listVar])) {
          scope[listVar].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
          this.updateHeapObject(listVar, scope[listVar]);
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: "step",
            explanation: `List '${listVar}' sorted in-place: [${scope[listVar].join(", ")}]`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[Sorted: [${scope[listVar].join(", ")}]]`
          });
        }
        lineIdx++;
        continue;
      }
      const assignMatch = trimmed.match(/^([a-zA-Z0-9_$,\s]+?)\s*=\s*(.+)$/);
      if (assignMatch && !trimmed.startsWith("if") && !trimmed.startsWith("while") && !trimmed.startsWith("for") && !trimmed.startsWith("def")) {
        const lhs = assignMatch[1].trim();
        const rhs = assignMatch[2].trim();
        if (lhs.includes(",")) {
          const varNames = lhs.split(",").map((s) => s.trim());
          const valExprs = rhs.split(",").map((s) => s.trim());
          for (let k = 0; k < varNames.length; k++) {
            const vName = varNames[k];
            scope[vName] = this.evaluatePythonRaw(valExprs[k] || "0", scope);
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
          event: "step",
          explanation: `Assigned: ${lhs} = ${JSON.stringify(scope[lhs.split(",")[0].trim()])}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${lhs} = ${JSON.stringify(scope[lhs.split(",")[0].trim()])}]`
        });
        lineIdx++;
        continue;
      }
      const augMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
      if (augMatch) {
        const vName = augMatch[1];
        const op = augMatch[2];
        const delta = this.evaluatePythonRaw(augMatch[3], scope);
        if (typeof scope[vName] === "number") {
          if (op === "+=")
            scope[vName] += delta;
          if (op === "-=")
            scope[vName] -= delta;
          if (op === "*=")
            scope[vName] *= delta;
          if (op === "/=")
            scope[vName] /= delta;
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: "step",
            explanation: `Updated '${vName}' (${op} ${delta}) -> ${scope[vName]}`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${vName} = ${scope[vName]}]`
          });
        }
        lineIdx++;
        continue;
      }
      const whileMatch = trimmed.match(/^while\s+(.*):$/);
      if (whileMatch) {
        const cond = whileMatch[1].trim();
        const isTrue = this.evaluatePythonCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "loop",
          explanation: `While condition '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? "True (Iterating)" : "False (Exiting loop)",
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? "TRUE" : "FALSE"}]`
        });
        if (!isTrue) {
          lineIdx = this.findPythonBlockEnd(lines, lineIdx);
          continue;
        }
        lineIdx++;
        continue;
      }
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
          event: "loop",
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
      const ifMatch = trimmed.match(/^(?:if|elif)\s+(.*):$/);
      if (ifMatch) {
        const cond = ifMatch[1].trim();
        const isTrue = this.evaluatePythonCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Branch '${cond}': evaluates to ${isTrue}.`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? "True (Branch taken)" : "False (Skip branch)",
            isSatisfied: isTrue
          },
          inlayHint: `[${isTrue ? "Branch Taken" : "Branch Skipped"}]`
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
        event: "step",
        explanation: `Executing: ${trimmed}`,
        callStack: this.cloneCallStack(callStackFrames, scope)
      });
      lineIdx++;
    }
  }
  recordSnapshot(partial) {
    this.inferArrayPointers(partial.callStack);
    const heapObj = {};
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
  inferArrayPointers(callStack) {
    const activeFrame = callStack[callStack.length - 1];
    if (!activeFrame)
      return;
    let colorIdx = 0;
    this.heapStore.forEach((heapObj) => {
      if (heapObj.type === "array" && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const pointers = [];
        for (const [varName, scopeVar] of Object.entries(activeFrame.scope)) {
          if (typeof scopeVar.value === "number" && Number.isInteger(scopeVar.value)) {
            const idx = scopeVar.value;
            if (idx >= 0 && idx < arrLen) {
              pointers.push({
                variableName: varName,
                index: idx,
                color: POINTER_COLORS2[colorIdx % POINTER_COLORS2.length],
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
  allocateHeapArray(name, arr) {
    const heapId = `@heap:${this.heapCounter++}`;
    this.heapStore.set(heapId, {
      id: heapId,
      type: "array",
      elements: [...arr],
      inferredPointers: []
    });
  }
  updateHeapObject(name, updatedArr) {
    for (const heapObj of this.heapStore.values()) {
      if (heapObj.type === "array") {
        heapObj.elements = [...updatedArr];
        break;
      }
    }
  }
  cloneCallStack(frames, currentScope) {
    const activeScope = {};
    for (const [k, v] of Object.entries(currentScope)) {
      activeScope[k] = {
        name: k,
        type: Array.isArray(v) || typeof v === "object" && v !== null ? "reference" : "primitive",
        value: Array.isArray(v) ? `List(${v.length})` : v,
        rawType: typeof v
      };
    }
    return frames.map((f) => ({
      ...f,
      scope: { ...activeScope }
    }));
  }
  evaluatePythonRaw(expr, scope) {
    let sanitized = expr.replace(/\blen\((.*?)\)/g, "$1.length").replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/\bnot\b/g, "!");
    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${sanitized});`);
      return fn(...values);
    } catch {
      if (expr.startsWith("[") && expr.endsWith("]")) {
        try {
          return JSON.parse(expr);
        } catch {
          return expr.slice(1, -1).split(",").map((s) => Number(s.trim()) || s.trim());
        }
      }
      if (!isNaN(Number(expr)))
        return Number(expr);
      return expr;
    }
  }
  evaluatePythonExpression(expr, scope) {
    const val = this.evaluatePythonRaw(expr, scope);
    return typeof val === "object" ? JSON.stringify(val) : String(val);
  }
  evaluatePythonCondition(cond, scope) {
    return Boolean(this.evaluatePythonRaw(cond, scope));
  }
  findPythonBlockEnd(lines, currentIdx) {
    const baseIndent = lines[currentIdx].search(/\S/);
    for (let i = currentIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim())
        continue;
      const indent = line.search(/\S/);
      if (indent <= baseIndent) {
        return i;
      }
    }
    return lines.length;
  }
};

// src/engine/rustTracer.ts
var POINTER_COLORS3 = ["#818cf8", "#34d399", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa"];
var RustTracer = class {
  snapshots = [];
  heapStore = /* @__PURE__ */ new Map();
  stdoutLog = [];
  heapCounter = 1;
  trace(code) {
    this.snapshots = [];
    this.heapStore.clear();
    this.stdoutLog = [];
    this.heapCounter = 1;
    try {
      this.executeAndRecord(code);
    } catch (err) {
      this.recordSnapshot({
        line: 1,
        codeSnippet: code.split("\n")[0] || "",
        event: "step",
        explanation: `Rust trace notice: ${err?.message || "Completed"}`,
        callStack: [{
          frameId: "frame-rust-main",
          functionName: "main",
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
  executeAndRecord(code) {
    const lines = code.split("\n");
    let scope = {};
    let callStackFrames = [{
      frameId: "frame-rust-main",
      functionName: "main",
      line: 1,
      scope: {}
    }];
    let unpolledFutures = [];
    let polledTasks = [];
    this.recordSnapshot({
      line: 1,
      codeSnippet: lines[0] || "",
      event: "init",
      explanation: "Rust runtime initialized: main thread allocation.",
      callStack: this.cloneCallStack(callStackFrames, scope)
    });
    let lineIdx = 0;
    let safetyCounter = 0;
    const MAX_STEPS = 500;
    while (lineIdx < lines.length && safetyCounter++ < MAX_STEPS) {
      const rawLine = lines[lineIdx];
      const trimmed = rawLine.trim();
      const currentLineNum = lineIdx + 1;
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        lineIdx++;
        continue;
      }
      if (trimmed.match(/let\s+([a-zA-Z0-9_$]+)\s*=\s*([a-zA-Z0-9_$]+)\s*\([^)]*\);?$/) && !trimmed.includes(".await") && (trimmed.includes("async") || trimmed.includes("fut") || trimmed.includes("work"))) {
        const parts = trimmed.split("=");
        const varName = parts[0].replace("let", "").trim();
        unpolledFutures.push(varName);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `\u26A0\uFE0F Rust Lazy Future: '${varName}' instantiated. Rust futures are pull-based: ZERO CPU cycles execute until actively polled or .awaited!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [], macrotasks: [], pendingTasks: [...unpolledFutures] },
          inlayHint: `[Future: Lazy / Unpolled]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.includes(".await")) {
        const match = trimmed.match(/([a-zA-Z0-9_$]+)\.await/);
        const futName = match ? match[1] : "future";
        unpolledFutures = unpolledFutures.filter((f) => f !== futName);
        polledTasks.push(futName);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "async_tick",
          explanation: `Executor Polling: .await called on '${futName}'. Executor drives poll(cx) and executes state machine until Ready!`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          concurrency: { microtasks: [...polledTasks], macrotasks: [], pendingTasks: [...unpolledFutures] },
          inlayHint: `[Executor: Polled & Ready]`
        });
        lineIdx++;
        continue;
      }
      if (trimmed.startsWith("println!(")) {
        const match = trimmed.match(/println!\((.*)\);?$/);
        let printed = "";
        if (match) {
          const raw = match[1];
          printed = raw.replace(/"/g, "").replace(/\{\}/g, "").trim();
        }
        this.stdoutLog.push(printed);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Rust stdout: ${printed}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          stdout: [...this.stdoutLog],
          inlayHint: `[stdout: ${printed}]`
        });
        lineIdx++;
        continue;
      }
      const vecMatch = trimmed.match(/let\s+(?:mut\s+)?([a-zA-Z0-9_$]+)\s*=\s*vec!\[(.*)\];?$/);
      if (vecMatch) {
        const varName = vecMatch[1];
        const elements = vecMatch[2].split(",").map((s) => Number(s.trim()) || s.trim());
        scope[varName] = elements;
        this.allocateHeapArray(varName, elements);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
          explanation: `Allocated heap Vector 'Vec<i32>' for '${varName}': [${elements.join(", ")}]`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[Vec<i32>: [${elements.join(", ")}]]`
        });
        lineIdx++;
        continue;
      }
      const letTupleMatch = trimmed.match(/let\s*\((?:mut\s+)?([a-zA-Z0-9_$]+),\s*(?:mut\s+)?([a-zA-Z0-9_$]+)\)\s*=\s*\((.*),\s*(.*)\);?$/);
      if (letTupleMatch) {
        const v1 = letTupleMatch[1].trim();
        const v2 = letTupleMatch[2].trim();
        scope[v1] = this.evaluateRustRaw(letTupleMatch[3], scope);
        scope[v2] = this.evaluateRustRaw(letTupleMatch[4], scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "step",
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
          event: "step",
          explanation: `Bound variable '${varName}' = ${JSON.stringify(val)}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          inlayHint: `[${varName} = ${JSON.stringify(val)}]`
        });
        lineIdx++;
        continue;
      }
      const mutOpMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\s*(\+=|-=)\s*(.+);?$/);
      if (mutOpMatch) {
        const vName = mutOpMatch[1];
        const op = mutOpMatch[2];
        const delta = this.evaluateRustRaw(mutOpMatch[3], scope);
        if (typeof scope[vName] === "number") {
          if (op === "+=")
            scope[vName] += delta;
          if (op === "-=")
            scope[vName] -= delta;
          this.recordSnapshot({
            line: currentLineNum,
            codeSnippet: trimmed,
            event: "step",
            explanation: `Mutated variable '${vName}' (${op} ${delta}) -> ${scope[vName]}`,
            callStack: this.cloneCallStack(callStackFrames, scope),
            inlayHint: `[${vName} = ${scope[vName]}]`
          });
        }
        lineIdx++;
        continue;
      }
      const whileMatch = trimmed.match(/^while\s+(.*)\s*\{?$/);
      if (whileMatch) {
        const cond = whileMatch[1].replace("{", "").trim();
        const isTrue = this.evaluateRustCondition(cond, scope);
        this.recordSnapshot({
          line: currentLineNum,
          codeSnippet: trimmed,
          event: "loop",
          explanation: `Evaluating while condition '${cond}': ${isTrue}`,
          callStack: this.cloneCallStack(callStackFrames, scope),
          evaluatedExpression: {
            expression: cond,
            result: isTrue ? "True (Iterate)" : "False (Exit)",
            isSatisfied: isTrue
          },
          inlayHint: `[Condition: ${isTrue ? "TRUE" : "FALSE"}]`
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
        event: "step",
        explanation: `Executing: ${trimmed}`,
        callStack: this.cloneCallStack(callStackFrames, scope)
      });
      lineIdx++;
    }
  }
  recordSnapshot(partial) {
    this.inferArrayPointers(partial.callStack);
    const heapObj = {};
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
  inferArrayPointers(callStack) {
    const activeFrame = callStack[callStack.length - 1];
    if (!activeFrame)
      return;
    let colorIdx = 0;
    this.heapStore.forEach((heapObj) => {
      if (heapObj.type === "array" && heapObj.elements) {
        const arrLen = heapObj.elements.length;
        const pointers = [];
        for (const [varName, scopeVar] of Object.entries(activeFrame.scope)) {
          if (typeof scopeVar.value === "number" && Number.isInteger(scopeVar.value)) {
            const idx = scopeVar.value;
            if (idx >= 0 && idx < arrLen) {
              pointers.push({
                variableName: varName,
                index: idx,
                color: POINTER_COLORS3[colorIdx % POINTER_COLORS3.length],
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
  allocateHeapArray(name, arr) {
    const heapId = `@heap:${this.heapCounter++}`;
    this.heapStore.set(heapId, {
      id: heapId,
      type: "array",
      elements: [...arr],
      inferredPointers: []
    });
  }
  cloneCallStack(frames, currentScope) {
    const activeScope = {};
    for (const [k, v] of Object.entries(currentScope)) {
      activeScope[k] = {
        name: k,
        type: Array.isArray(v) ? "reference" : "primitive",
        value: Array.isArray(v) ? `Vec<i32>(${v.length})` : v,
        rawType: typeof v
      };
    }
    return frames.map((f) => ({
      ...f,
      scope: { ...activeScope }
    }));
  }
  evaluateRustRaw(expr, scope) {
    let sanitized = expr.replace(/\.len\(\)/g, ".length").replace(/&mut\s+/g, "").replace(/&/g, "");
    try {
      const keys = Object.keys(scope);
      const values = Object.values(scope);
      const fn = new Function(...keys, `return (${sanitized});`);
      return fn(...values);
    } catch {
      if (!isNaN(Number(expr)))
        return Number(expr);
      return expr;
    }
  }
  evaluateRustCondition(cond, scope) {
    return Boolean(this.evaluateRustRaw(cond, scope));
  }
  findMatchingClosingBrace(lines, startIdx) {
    let braceCount = 0;
    for (let i = startIdx; i < lines.length; i++) {
      if (lines[i].includes("{"))
        braceCount++;
      if (lines[i].includes("}")) {
        braceCount--;
        if (braceCount <= 0)
          return i + 1;
      }
    }
    return lines.length;
  }
};

// src/engine/tracer.ts
var FermasEngine = class {
  jsTracer = new JsTracer();
  pyTracer = new PythonTracer();
  rustTracer = new RustTracer();
  trace(code, language) {
    try {
      if (language === "python") {
        const snapshots = this.pyTracer.trace(code);
        return { language, code, snapshots };
      } else if (language === "rust") {
        const snapshots = this.rustTracer.trace(code);
        return { language, code, snapshots };
      } else {
        const snapshots = this.jsTracer.trace(code, language);
        return { language, code, snapshots };
      }
    } catch (err) {
      return {
        language,
        code,
        snapshots: [],
        error: err?.message || "Failed to trace execution"
      };
    }
  }
  detectLanguageFromDoc(languageId) {
    if (languageId === "python")
      return "python";
    if (languageId === "rust")
      return "rust";
    if (languageId === "typescript")
      return "typescript";
    return "javascript";
  }
};

// src/engine/curriculumServer.ts
var BUILTIN_CURRICULUM = [
  {
    id: "three-sum-two-pointers",
    title: "Three-Sum & The Two-Pointer Convergence",
    category: "Algorithms & DSA",
    language: "javascript",
    difficulty: "Intermediate",
    description: "Watch how sorting an array enables linear two-pointer scanning (left and right) to locate triplets summing to zero in O(N^2).",
    tags: ["DSA", "Two Pointers", "Arrays", "Sorting"],
    code: `// Three-Sum: Finding triplets that sum to 0
let nums = [-4, -1, -1, 0, 1, 2];
nums.sort();

let res = [];
let target = 0;

for (let i = 0; i < nums.length - 2; i++) {
  let left = i + 1;
  let right = nums.length - 1;

  while (left < right) {
    let sum = nums[i] + nums[left] + nums[right];
    if (sum === target) {
      console.log("Found triplet: " + nums[i] + ", " + nums[left] + ", " + nums[right]);
      left++;
      right--;
    } else if (sum < target) {
      left++;
    } else {
      right--;
    }
  }
}`,
    quiz: {
      question: "When the current sum is less than the target, why do we increment the left pointer instead of decrementing right?",
      options: [
        "Because the array is sorted, moving left to the right increases the total sum",
        "Because left must always match i",
        "Because right has already reached the end",
        "It makes no difference in a sorted array"
      ],
      correctIndex: 0,
      explanation: "Since the array is sorted in ascending order, nums[left + 1] >= nums[left]. Incrementing left is the only move guaranteed to increase or maintain the sum."
    }
  },
  {
    id: "js-microtask-starvation",
    title: "The JavaScript Microtask Priority Trap",
    category: "Concurrency & Runtimes",
    language: "javascript",
    difficulty: "Intermediate",
    description: "Demystifies why Promise.resolve().then() executes before setTimeout(..., 0), and how microtasks can completely starve the macrotask queue.",
    tags: ["Event Loop", "Promises", "Microtasks", "Macrotasks"],
    code: `console.log("1. Synchronous Start");

setTimeout(() => {
  console.log("4. Macrotask (setTimeout 0ms)");
}, 0);

Promise.resolve().then(() => {
  console.log("2. Microtask #1 (Promise)");
}).then(() => {
  console.log("3. Microtask #2 (Chained Promise)");
});

console.log("1. Synchronous End");`,
    quiz: {
      question: 'Why does "Microtask #2" execute before "Macrotask (setTimeout 0ms)" even though setTimeout has a 0ms delay?',
      options: [
        "The Microtask Queue is completely drained before the Event Loop checks the Macrotask Queue",
        "setTimeout(..., 0) has a mandatory 1-second delay in V8",
        "Promises run on a separate background thread in JavaScript",
        "The call stack is bypassed by setTimeout"
      ],
      correctIndex: 0,
      explanation: "In the JS event loop specification, whenever the Call Stack empties, all tasks in the Microtask Queue are executed until the microtask queue is 100% empty before picking the next macrotask."
    }
  },
  {
    id: "rust-lazy-future-ghost",
    title: "The Rust Ghost Future (Lazy vs Eager)",
    category: "Concurrency & Runtimes",
    language: "rust",
    difficulty: "Advanced",
    description: "Contrasts Rust futures with JS Promises. Demonstrates why unpolled Rust futures allocate state but execute ZERO CPU instructions.",
    tags: ["Rust", "Futures", "Tokio", "Async/Await", "Poll"],
    code: `// In Rust, calling an async function does NOT start it!
let mut nums = vec![-4, -1, 0, 1, 2];
let (mut left, mut right) = (0, nums.len() - 1);

// This future is allocated, but LAZY:
let fut = fetch_data_async();

println!("Notice that the future never executed!");
println!("Rust futures require an explicit .await or executor poll!");

while left < right {
    let sum = nums[left] + nums[right];
    if sum < 0 {
        left += 1;
    } else {
        right -= 1;
    }
}`,
    quiz: {
      question: "What happens when you call an async fn in Rust without .await?",
      options: [
        "It returns an anonymous Future state machine struct, doing zero work until polled",
        "It runs in the background thread pool like JavaScript",
        "The compiler immediately throws a runtime panic",
        "It blocks the current OS thread"
      ],
      correctIndex: 0,
      explanation: "Rust futures follow a zero-cost pull model. Unlike JS Promises (which eagerly run when instantiated), Rust futures only make progress when driven by an executor calling poll()."
    }
  },
  {
    id: "python-two-pointer-water",
    title: "Python: Container With Most Water",
    category: "Algorithms & DSA",
    language: "python",
    difficulty: "Intermediate",
    description: "Dynamic two-pointer optimization shrinking the boundary from both ends to find the maximum water area in O(N).",
    tags: ["Python", "DSA", "Two Pointers", "Optimization"],
    code: `# Container With Most Water
heights = [1, 8, 6, 2, 5, 4, 8, 3, 7]
left, right = 0, len(heights) - 1
max_area = 0

while left < right:
    width = right - left
    h = heights[left] if heights[left] < heights[right] else heights[right]
    area = width * h
    if area > max_area:
        max_area = area
    
    if heights[left] < heights[right]:
        left += 1
    else:
        right -= 1

print("Maximum area calculated: " + str(max_area))`,
    quiz: {
      question: "Why do we move the pointer pointing to the shorter vertical line inward?",
      options: [
        "Moving the taller line can never produce a larger area since area is constrained by the shorter line",
        "Because the shorter line is always on the left",
        "To increase the width of the container",
        "To reverse the direction of search"
      ],
      correctIndex: 0,
      explanation: "Area is bounded by min(h[left], h[right]) * width. Moving the taller line inward reduces width while keeping the height bound <= the shorter line, which can never yield a larger area."
    }
  }
];
var CurriculumService = class {
  cache = [...BUILTIN_CURRICULUM];
  remoteUrl = "http://localhost:3456/api/curriculum";
  async fetchCurriculum() {
    try {
      const response = await fetch(this.remoteUrl, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          this.cache = data;
          console.log(`[Fermas] Successfully synced ${data.length} modules from remote server.`);
        }
      }
    } catch {
      console.log("[Fermas] Using offline built-in curriculum cache.");
    }
    return this.cache;
  }
  getModuleById(id) {
    return this.cache.find((m) => m.id === id);
  }
};

// src/providers/fermasWebviewProvider.ts
var FermasWebviewProvider = class {
  constructor(extensionUri, decorations, inlayHints) {
    this.extensionUri = extensionUri;
    this.decorations = decorations;
    this.inlayHints = inlayHints;
  }
  static viewType = "fermas.visualizerView";
  _view;
  _panel;
  engine = new FermasEngine();
  curriculum = new CurriculumService();
  currentSnapshots = [];
  currentTick = 0;
  currentLanguage = "javascript";
  resolveWebviewView(webviewView, context, _token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.setupMessageListener(webviewView.webview);
    setTimeout(async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.getText().trim()) {
        await this.runTraceOnActiveEditor();
      } else {
        const modules = await this.curriculum.fetchCurriculum();
        webviewView.webview.postMessage({
          type: "SET_CURRICULUM",
          modules
        });
      }
    }, 250);
  }
  openInBesidePanel() {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    this._panel = vscode.window.createWebviewPanel(
      "fermas.visualizerPanel",
      "Fermas Visualizer Canvas",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );
    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);
    this.setupMessageListener(this._panel.webview);
    this._panel.onDidDispose(() => {
      this._panel = void 0;
    });
    if (this.currentSnapshots.length > 0) {
      this.postToWebviews({
        type: "SET_TRACE",
        snapshots: this.currentSnapshots,
        language: this.currentLanguage,
        currentTick: this.currentTick
      });
    }
  }
  async runTraceOnActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await this.openCurriculumBrowser();
      return;
    }
    const doc = editor.document;
    const code = doc.getText();
    const lang = this.engine.detectLanguageFromDoc(doc.languageId);
    this.currentLanguage = lang;
    const result = this.engine.trace(code, lang);
    this.currentSnapshots = result.snapshots;
    this.currentTick = 0;
    this.postToWebviews({
      type: "SET_TRACE",
      snapshots: this.currentSnapshots,
      language: this.currentLanguage,
      currentTick: 0
    });
    if (this.currentSnapshots.length > 0) {
      this.syncStepToEditor(0);
    }
  }
  async openCurriculumBrowser() {
    const modules = await this.curriculum.fetchCurriculum();
    this.postToWebviews({
      type: "OPEN_CURRICULUM",
      modules
    });
  }
  stepForward() {
    if (this.currentTick < this.currentSnapshots.length - 1) {
      this.currentTick++;
      this.postToWebviews({ type: "GOTO_TICK", tick: this.currentTick });
      this.syncStepToEditor(this.currentTick);
    }
  }
  stepBack() {
    if (this.currentTick > 0) {
      this.currentTick--;
      this.postToWebviews({ type: "GOTO_TICK", tick: this.currentTick });
      this.syncStepToEditor(this.currentTick);
    }
  }
  resetTrace() {
    this.currentTick = 0;
    this.postToWebviews({ type: "GOTO_TICK", tick: 0 });
    this.syncStepToEditor(0);
  }
  setupMessageListener(webview) {
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "STEP_CHANGED": {
          this.currentTick = message.tick;
          this.syncStepToEditor(this.currentTick);
          break;
        }
        case "REQUEST_CURRICULUM": {
          const modules = await this.curriculum.fetchCurriculum();
          webview.postMessage({ type: "SET_CURRICULUM", modules });
          break;
        }
        case "LOAD_MODULE": {
          const mod = this.curriculum.getModuleById(message.id);
          if (mod) {
            this.currentLanguage = mod.language;
            const result = this.engine.trace(mod.code, mod.language);
            this.currentSnapshots = result.snapshots;
            this.currentTick = 0;
            this.postToWebviews({
              type: "SET_TRACE",
              snapshots: this.currentSnapshots,
              language: this.currentLanguage,
              currentTick: 0,
              activeModule: mod
            });
            const doc = await vscode.workspace.openTextDocument({
              content: mod.code,
              language: mod.language
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            this.syncStepToEditor(0);
          }
          break;
        }
        case "REQUEST_RETRACE": {
          await this.runTraceOnActiveEditor();
          break;
        }
      }
    });
  }
  syncStepToEditor(tickIndex) {
    const snapshot = this.currentSnapshots[tickIndex];
    if (!snapshot)
      return;
    this.inlayHints.updateSnapshot(snapshot);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorations.highlightLine(editor, snapshot.line, snapshot.inlayHint);
    }
  }
  postToWebviews(message) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }
  getHtmlForWebview(webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "style.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fermas Visualizer</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body class="bg-slate-950 text-slate-100 antialiased font-sans select-none overflow-x-hidden">
  <div id="root">
    <div style="padding: 1.5rem; text-align: center; color: #94a3b8;">
      <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">\u26A1</div>
      <div style="font-weight: bold; font-size: 1rem; color: #f8fafc; margin-bottom: 0.3rem;">Fermas Visualizer</div>
      <p style="font-size: 0.85rem;">Initializing runtime canvas...</p>
    </div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
};

// src/providers/fermasCodeLensProvider.ts
var vscode2 = __toESM(require("vscode"));
var FermasCodeLensProvider = class {
  onDidChangeCodeLensesEmitter = new vscode2.EventEmitter();
  onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;
  refresh() {
    this.onDidChangeCodeLensesEmitter.fire();
  }
  provideCodeLenses(document, token) {
    const codeLenses = [];
    const text = document.getText();
    const lines = text.split("\n");
    const topRange = new vscode2.Range(0, 0, 0, 0);
    codeLenses.push(
      new vscode2.CodeLens(topRange, {
        title: "\u26A1 Run Entire File in Fermas Visualizer",
        command: "fermas.visualize",
        tooltip: "Launch omniscient step-by-step visualizer for this file"
      }),
      new vscode2.CodeLens(topRange, {
        title: "\u{1F4DA} Browse CS Puzzles & Demos",
        command: "fermas.openCurriculum",
        tooltip: "Open remote dynamic lessons and CS challenges"
      })
    );
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/) || line.match(/def\s+([a-zA-Z0-9_$]+)\s*\(/) || line.match(/fn\s+([a-zA-Z0-9_$]+)\s*\(/)) {
        const range = new vscode2.Range(i, 0, i, 0);
        codeLenses.push(
          new vscode2.CodeLens(range, {
            title: "\u26A1 Visualize Function with Fermas",
            command: "fermas.visualize",
            tooltip: "Trace and visualize execution of this function"
          })
        );
      }
    }
    return codeLenses;
  }
};

// src/providers/fermasInlayHintsProvider.ts
var vscode3 = __toESM(require("vscode"));
var FermasInlayHintsProvider = class {
  currentSnapshot = null;
  onDidChangeInlayHintsEmitter = new vscode3.EventEmitter();
  onDidChangeInlayHints = this.onDidChangeInlayHintsEmitter.event;
  updateSnapshot(snapshot) {
    this.currentSnapshot = snapshot;
    this.onDidChangeInlayHintsEmitter.fire();
  }
  provideInlayHints(document, range, token) {
    if (!this.currentSnapshot || !this.currentSnapshot.inlayHint) {
      return [];
    }
    const line0 = this.currentSnapshot.line - 1;
    if (line0 < 0 || line0 >= document.lineCount)
      return [];
    const line = document.lineAt(line0);
    const position = line.range.end;
    const hint = new vscode3.InlayHint(
      position,
      `  \u26A1 ${this.currentSnapshot.inlayHint}`,
      vscode3.InlayHintKind.Parameter
    );
    hint.paddingLeft = true;
    hint.tooltip = `Fermas Execution State at Tick #${this.currentSnapshot.tick}: ${this.currentSnapshot.explanation}`;
    return [hint];
  }
};

// src/providers/fermasDecorations.ts
var vscode4 = __toESM(require("vscode"));
var FermasDecorations = class {
  activeLineDecoration;
  pointerDecoration;
  constructor() {
    this.activeLineDecoration = vscode4.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode4.ThemeColor("editor.lineHighlightBackground"),
      border: "1px solid #3b82f6",
      overviewRulerColor: "#3b82f6",
      overviewRulerLane: vscode4.OverviewRulerLane.Full
    });
    this.pointerDecoration = vscode4.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1.5rem",
        color: "#93c5fd",
        fontWeight: "bold"
      }
    });
  }
  highlightLine(editor, line1Based, hintText) {
    if (line1Based < 1 || line1Based > editor.document.lineCount)
      return;
    const line0Based = line1Based - 1;
    const range = editor.document.lineAt(line0Based).range;
    editor.setDecorations(this.activeLineDecoration, [range]);
    if (hintText) {
      const hintDecoration = {
        range,
        renderOptions: {
          after: {
            contentText: ` ${hintText}`,
            color: "#60a5fa",
            fontStyle: "italic"
          }
        }
      };
      editor.setDecorations(this.pointerDecoration, [hintDecoration]);
    } else {
      editor.setDecorations(this.pointerDecoration, []);
    }
    editor.revealRange(range, vscode4.TextEditorRevealType.InCenterIfOutsideViewport);
  }
  clear(editor) {
    editor.setDecorations(this.activeLineDecoration, []);
    editor.setDecorations(this.pointerDecoration, []);
  }
  dispose() {
    this.activeLineDecoration.dispose();
    this.pointerDecoration.dispose();
  }
};

// src/extension.ts
function activate(context) {
  console.log("\u26A1 Fermas extension is now active!");
  const decorations = new FermasDecorations();
  const inlayHintsProvider = new FermasInlayHintsProvider();
  const webviewProvider = new FermasWebviewProvider(context.extensionUri, decorations, inlayHintsProvider);
  const codeLensProvider = new FermasCodeLensProvider();
  context.subscriptions.push(
    vscode5.window.registerWebviewViewProvider(FermasWebviewProvider.viewType, webviewProvider)
  );
  const selector = [
    { language: "javascript" },
    { language: "typescript" },
    { language: "python" },
    { language: "rust" }
  ];
  context.subscriptions.push(
    vscode5.languages.registerCodeLensProvider(selector, codeLensProvider),
    vscode5.languages.registerInlayHintsProvider(selector, inlayHintsProvider)
  );
  const statusBarItem = vscode5.window.createStatusBarItem(vscode5.StatusBarAlignment.Right, 100);
  statusBarItem.command = "fermas.visualize";
  statusBarItem.text = "$(play) Fermas: Trace";
  statusBarItem.tooltip = "Click to visualize active code in Fermas";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode5.commands.registerCommand("fermas.visualize", () => {
      webviewProvider.runTraceOnActiveEditor();
    }),
    vscode5.commands.registerCommand("fermas.openCurriculum", () => {
      webviewProvider.openCurriculumBrowser();
    }),
    vscode5.commands.registerCommand("fermas.stepForward", () => {
      webviewProvider.stepForward();
    }),
    vscode5.commands.registerCommand("fermas.stepBack", () => {
      webviewProvider.stepBack();
    }),
    vscode5.commands.registerCommand("fermas.resetTrace", () => {
      webviewProvider.resetTrace();
    })
  );
  context.subscriptions.push(
    vscode5.workspace.onDidChangeTextDocument(() => codeLensProvider.refresh()),
    vscode5.window.onDidChangeActiveTextEditor(() => codeLensProvider.refresh()),
    decorations
  );
}
function deactivate() {
  console.log("\u26A1 Fermas extension deactivated.");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
