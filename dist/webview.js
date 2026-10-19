"use strict";
(() => {
  // src/webview/main.ts
  var vscode = acquireVsCodeApi();
  var state = {
    snapshots: [],
    currentTick: 0,
    language: "javascript",
    isPlaying: false,
    activeTab: "visualizer",
    curriculumModules: []
  };
  var playInterval = null;
  function init() {
    window.addEventListener("message", (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "SET_TRACE": {
          state.snapshots = msg.snapshots;
          state.language = msg.language;
          state.currentTick = msg.currentTick || 0;
          state.activeModule = msg.activeModule;
          state.activeTab = "visualizer";
          state.quizAnswerIndex = void 0;
          render();
          break;
        }
        case "GOTO_TICK": {
          state.currentTick = msg.tick;
          render();
          break;
        }
        case "OPEN_CURRICULUM":
        case "SET_CURRICULUM": {
          state.curriculumModules = msg.modules;
          state.activeTab = "curriculum";
          render();
          break;
        }
      }
    });
    vscode.postMessage({ type: "REQUEST_CURRICULUM" });
    render();
  }
  function setTick(newTick) {
    if (newTick < 0 || newTick >= state.snapshots.length)
      return;
    state.currentTick = newTick;
    vscode.postMessage({ type: "STEP_CHANGED", tick: state.currentTick });
    render();
  }
  function togglePlay() {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
      playInterval = setInterval(() => {
        if (state.currentTick < state.snapshots.length - 1) {
          setTick(state.currentTick + 1);
        } else {
          clearInterval(playInterval);
          state.isPlaying = false;
          render();
        }
      }, 800);
    } else {
      clearInterval(playInterval);
    }
    render();
  }
  function render() {
    const root = document.getElementById("root");
    if (!root)
      return;
    root.innerHTML = "";
    root.appendChild(renderNavbar());
    if (state.activeTab === "curriculum") {
      root.appendChild(renderCurriculumScreen());
    } else {
      root.appendChild(renderVisualizerScreen());
    }
  }
  function renderNavbar() {
    const nav = document.createElement("div");
    nav.className = "flex justify-between items-center mb-4 pb-3 border-b border-slate-800";
    nav.style.display = "flex";
    nav.style.justifyContent = "space-between";
    nav.style.alignItems = "center";
    nav.style.borderBottom = "1px solid var(--border-color)";
    nav.style.paddingBottom = "0.75rem";
    nav.style.marginBottom = "1rem";
    const brand = document.createElement("div");
    brand.style.display = "flex";
    brand.style.alignItems = "center";
    brand.style.gap = "0.5rem";
    const title = document.createElement("span");
    title.style.fontWeight = "bold";
    title.style.fontSize = "1.1rem";
    title.style.letterSpacing = "-0.025em";
    title.innerHTML = "\u26A1 <b>Fermas</b>";
    const langBadge = document.createElement("span");
    langBadge.className = "badge " + (state.language === "rust" ? "badge-amber" : state.language === "python" ? "badge-emerald" : "badge-blue");
    langBadge.textContent = state.language.toUpperCase();
    brand.appendChild(title);
    brand.appendChild(langBadge);
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "0.5rem";
    const tabToggle = document.createElement("button");
    tabToggle.className = "btn btn-secondary";
    tabToggle.innerHTML = state.activeTab === "curriculum" ? "\u{1F4CA} Open Visualizer" : "\u{1F4DA} CS Curriculum";
    tabToggle.onclick = () => {
      state.activeTab = state.activeTab === "curriculum" ? "visualizer" : "curriculum";
      if (state.activeTab === "curriculum") {
        vscode.postMessage({ type: "REQUEST_CURRICULUM" });
      }
      render();
    };
    const retraceBtn = document.createElement("button");
    retraceBtn.className = "btn btn-primary";
    retraceBtn.innerHTML = "\u{1F504} Retrace Code";
    retraceBtn.onclick = () => {
      vscode.postMessage({ type: "REQUEST_RETRACE" });
    };
    actions.appendChild(tabToggle);
    actions.appendChild(retraceBtn);
    nav.appendChild(brand);
    nav.appendChild(actions);
    return nav;
  }
  function renderVisualizerScreen() {
    const container = document.createElement("div");
    if (state.snapshots.length === 0) {
      const emptyCard = document.createElement("div");
      emptyCard.className = "card";
      emptyCard.style.textAlign = "center";
      emptyCard.style.padding = "2.5rem 1rem";
      emptyCard.innerHTML = `
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">\u26A1</div>
      <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">No Active Trace Yet</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.2rem;">
        Click <b>"Retrace Code"</b> to analyze your open editor file, or explore the <b>CS Curriculum</b>.
      </p>
      <button id="btn-explore" class="btn btn-primary">\u{1F4DA} Browse Curriculum Examples</button>
    `;
      emptyCard.querySelector("#btn-explore")?.addEventListener("click", () => {
        state.activeTab = "curriculum";
        vscode.postMessage({ type: "REQUEST_CURRICULUM" });
        render();
      });
      container.appendChild(emptyCard);
      return container;
    }
    const snapshot = state.snapshots[state.currentTick] || state.snapshots[0];
    container.appendChild(renderControlsBar());
    const explCard = document.createElement("div");
    explCard.className = "card";
    explCard.style.borderLeft = "4px solid #38bdf8";
    explCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
      <span style="font-weight: 600; font-size: 0.85rem; color: #38bdf8;">
        LINE ${snapshot.line}: <code>${escapeHtml(snapshot.codeSnippet)}</code>
      </span>
      <span class="badge badge-indigo">Tick #${snapshot.tick} of ${snapshot.totalTicks}</span>
    </div>
    <div style="font-size: 0.9rem; line-height: 1.4; color: var(--text-main);">
      ${snapshot.explanation}
    </div>
  `;
    container.appendChild(explCard);
    if (snapshot.evaluatedExpression) {
      const exprCard = document.createElement("div");
      exprCard.className = "card";
      exprCard.style.background = "rgba(56, 189, 248, 0.08)";
      exprCard.style.borderColor = "rgba(56, 189, 248, 0.3)";
      exprCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: monospace; font-size: 0.95rem; font-weight: 600;">
          \u{1F50D} Expression: <b>${escapeHtml(snapshot.evaluatedExpression.expression)}</b>
        </span>
        <span class="badge ${snapshot.evaluatedExpression.isSatisfied ? "badge-emerald" : "badge-amber"}">
          ${escapeHtml(snapshot.evaluatedExpression.result)}
        </span>
      </div>
    `;
      container.appendChild(exprCard);
    }
    const heapArrays = Object.values(snapshot.heap).filter((h) => h.type === "array" && h.elements);
    if (heapArrays.length > 0) {
      container.appendChild(renderArrayCanvas(heapArrays));
    }
    if (snapshot.concurrency && (snapshot.concurrency.microtasks.length > 0 || snapshot.concurrency.macrotasks.length > 0 || snapshot.concurrency.pendingTasks.length > 0)) {
      container.appendChild(renderConcurrencySwimlanes(snapshot.concurrency));
    }
    container.appendChild(renderCallStackAndScope(snapshot));
    if (state.activeModule?.quiz) {
      container.appendChild(renderQuizCard(state.activeModule.quiz));
    }
    if (snapshot.stdout && snapshot.stdout.length > 0) {
      const consoleCard = document.createElement("div");
      consoleCard.className = "card";
      consoleCard.innerHTML = `
      <div class="card-header">Standard Output</div>
      <pre style="background: var(--bg-primary); padding: 0.6rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.85rem; color: #34d399;">${snapshot.stdout.map(escapeHtml).join("\n")}</pre>
    `;
      container.appendChild(consoleCard);
    }
    return container;
  }
  function renderControlsBar() {
    const bar = document.createElement("div");
    bar.className = "controls-bar";
    const btnFirst = document.createElement("button");
    btnFirst.className = "btn btn-secondary";
    btnFirst.innerHTML = "\u23EE";
    btnFirst.title = "First step";
    btnFirst.onclick = () => setTick(0);
    const btnPrev = document.createElement("button");
    btnPrev.className = "btn btn-secondary";
    btnPrev.innerHTML = "\u25C0";
    btnPrev.title = "Step back";
    btnPrev.onclick = () => setTick(state.currentTick - 1);
    const btnPlay = document.createElement("button");
    btnPlay.className = "btn btn-primary";
    btnPlay.innerHTML = state.isPlaying ? "\u23F8 Pause" : "\u25B6 Play";
    btnPlay.onclick = () => togglePlay();
    const btnNext = document.createElement("button");
    btnNext.className = "btn btn-secondary";
    btnNext.innerHTML = "\u25B6";
    btnNext.title = "Step forward";
    btnNext.onclick = () => setTick(state.currentTick + 1);
    const btnLast = document.createElement("button");
    btnLast.className = "btn btn-secondary";
    btnLast.innerHTML = "\u23ED";
    btnLast.title = "Last step";
    btnLast.onclick = () => setTick(state.snapshots.length - 1);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "scrubber-slider";
    slider.min = "0";
    slider.max = String(Math.max(0, state.snapshots.length - 1));
    slider.value = String(state.currentTick);
    slider.oninput = (e) => {
      setTick(Number(e.target.value));
    };
    const tickLabel = document.createElement("span");
    tickLabel.style.fontSize = "0.85rem";
    tickLabel.style.fontFamily = "monospace";
    tickLabel.style.minWidth = "80px";
    tickLabel.style.textAlign = "right";
    tickLabel.textContent = `${state.currentTick + 1}/${state.snapshots.length}`;
    bar.appendChild(btnFirst);
    bar.appendChild(btnPrev);
    bar.appendChild(btnPlay);
    bar.appendChild(btnNext);
    bar.appendChild(btnLast);
    bar.appendChild(slider);
    bar.appendChild(tickLabel);
    return bar;
  }
  function renderArrayCanvas(arrays) {
    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "card-header";
    header.textContent = "Data Structure Memory Ribbon (Arrays & Auto-Inferred Pointers)";
    card.appendChild(header);
    arrays.forEach((arr) => {
      const track = document.createElement("div");
      track.className = "array-track";
      const pointers = arr.inferredPointers || [];
      arr.elements.forEach((val, idx) => {
        const cell = document.createElement("div");
        cell.className = "array-cell";
        const matchingPointers = pointers.filter((p) => p.index === idx);
        if (matchingPointers.length > 0) {
          const flag = document.createElement("div");
          flag.className = "pointer-flag";
          matchingPointers.forEach((p) => {
            const pill = document.createElement("div");
            pill.className = "pointer-pill";
            pill.style.background = p.color;
            pill.style.color = "#0f172a";
            pill.textContent = p.label || p.variableName;
            flag.appendChild(pill);
          });
          const arrow = document.createElement("div");
          arrow.className = "pointer-arrow";
          arrow.style.color = matchingPointers[0].color;
          flag.appendChild(arrow);
          cell.appendChild(flag);
        }
        const valBox = document.createElement("div");
        valBox.className = "array-val-box" + (matchingPointers.length > 0 ? " highlight" : "");
        valBox.textContent = String(val);
        const idxLabel = document.createElement("div");
        idxLabel.className = "array-index-label";
        idxLabel.textContent = `[${idx}]`;
        cell.appendChild(valBox);
        cell.appendChild(idxLabel);
        track.appendChild(cell);
      });
      const wrap = document.createElement("div");
      wrap.className = "array-container";
      wrap.appendChild(track);
      card.appendChild(wrap);
    });
    return card;
  }
  function renderConcurrencySwimlanes(concurrency) {
    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "card-header";
    header.textContent = "Runtime Concurrency & Event Loop Queues";
    card.appendChild(header);
    const microLane = document.createElement("div");
    microLane.className = "swimlane";
    microLane.innerHTML = `
    <div class="swimlane-title" style="color: #38bdf8;">\u26A1 Microtask Queue (Strict Priority)</div>
    <div>${concurrency.microtasks.length > 0 ? concurrency.microtasks.map((t) => `<span class="task-pill" style="border-left-color: #38bdf8;">${escapeHtml(t)}</span>`).join("") : '<span style="color: var(--text-muted); font-size: 0.8rem;">(Empty)</span>'}</div>
  `;
    card.appendChild(microLane);
    const macroLane = document.createElement("div");
    macroLane.className = "swimlane";
    macroLane.innerHTML = `
    <div class="swimlane-title" style="color: #fbbf24;">\u23F1 Macrotask / Timer Queue</div>
    <div>${concurrency.macrotasks.length > 0 ? concurrency.macrotasks.map((t) => `<span class="task-pill" style="border-left-color: #fbbf24;">${escapeHtml(t)}</span>`).join("") : '<span style="color: var(--text-muted); font-size: 0.8rem;">(Empty)</span>'}</div>
  `;
    card.appendChild(macroLane);
    if (concurrency.pendingTasks.length > 0) {
      const pendLane = document.createElement("div");
      pendLane.className = "swimlane";
      pendLane.innerHTML = `
      <div class="swimlane-title" style="color: #fb7185;">\u{1F578} Unpolled / Lazy Futures</div>
      <div>${concurrency.pendingTasks.map((t) => `<span class="task-pill" style="border-left-color: #fb7185;">${escapeHtml(t)}</span>`).join("")}</div>
    `;
      card.appendChild(pendLane);
    }
    return card;
  }
  function renderCallStackAndScope(snapshot) {
    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "card-header";
    header.textContent = "Call Stack & Local Frame Variables";
    card.appendChild(header);
    snapshot.callStack.forEach((frame) => {
      const frameBox = document.createElement("div");
      frameBox.style.marginBottom = "0.8rem";
      frameBox.innerHTML = `
      <div style="font-weight: 600; font-size: 0.85rem; color: #818cf8; margin-bottom: 0.3rem;">
        Frame: <code>${escapeHtml(frame.functionName)}()</code> (Line ${frame.line})
      </div>
    `;
      const varList = Object.values(frame.scope);
      if (varList.length === 0) {
        frameBox.innerHTML += `<div style="font-size: 0.8rem; color: var(--text-muted);">(No local variables)</div>`;
      } else {
        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.fontSize = "0.8rem";
        table.style.fontFamily = "monospace";
        table.style.borderCollapse = "collapse";
        varList.forEach((v) => {
          const row = document.createElement("tr");
          row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
          row.innerHTML = `
          <td style="padding: 0.25rem 0.5rem; color: #38bdf8; font-weight: bold;">${escapeHtml(v.name)}</td>
          <td style="padding: 0.25rem 0.5rem; color: var(--text-muted);">${escapeHtml(v.rawType)}</td>
          <td style="padding: 0.25rem 0.5rem; color: #f8fafc;">${escapeHtml(typeof v.value === "object" ? JSON.stringify(v.value) : String(v.value))}</td>
        `;
          table.appendChild(row);
        });
        frameBox.appendChild(table);
      }
      card.appendChild(frameBox);
    });
    return card;
  }
  function renderQuizCard(quiz) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.border = "1px solid #818cf8";
    const header = document.createElement("div");
    header.className = "card-header";
    header.style.color = "#818cf8";
    header.textContent = "\u{1F3AF} Predict-First Intuition Check";
    card.appendChild(header);
    const qText = document.createElement("div");
    qText.style.fontWeight = "600";
    qText.style.fontSize = "0.95rem";
    qText.style.marginBottom = "0.8rem";
    qText.textContent = quiz.question;
    card.appendChild(qText);
    quiz.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option";
      if (state.quizAnswerIndex !== void 0) {
        if (idx === quiz.correctIndex) {
          btn.classList.add("correct");
        } else if (idx === state.quizAnswerIndex) {
          btn.classList.add("wrong");
        }
      }
      btn.textContent = `${["A", "B", "C", "D"][idx]}. ${opt}`;
      btn.onclick = () => {
        state.quizAnswerIndex = idx;
        render();
      };
      card.appendChild(btn);
    });
    if (state.quizAnswerIndex !== void 0) {
      const isCorrect = state.quizAnswerIndex === quiz.correctIndex;
      const expl = document.createElement("div");
      expl.style.marginTop = "0.8rem";
      expl.style.padding = "0.75rem";
      expl.style.borderRadius = "0.375rem";
      expl.style.background = isCorrect ? "rgba(52, 211, 153, 0.1)" : "rgba(251, 113, 133, 0.1)";
      expl.style.border = isCorrect ? "1px solid #34d399" : "1px solid #fb7185";
      expl.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 0.3rem; color: ${isCorrect ? "#34d399" : "#fb7185"};">
        ${isCorrect ? "\u2705 Spot on!" : "\u274C Cognitive Dissonance Alert!"}
      </div>
      <div style="font-size: 0.85rem; line-height: 1.4;">${quiz.explanation}</div>
    `;
      card.appendChild(expl);
    }
    return card;
  }
  function renderCurriculumScreen() {
    const container = document.createElement("div");
    const banner = document.createElement("div");
    banner.className = "card";
    banner.style.background = "linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(129, 140, 248, 0.2))";
    banner.innerHTML = `
    <h2 style="font-size: 1.2rem; font-weight: bold; margin-bottom: 0.4rem;">\u{1F4DA} Dynamic CS Curriculum & Challenge Library</h2>
    <p style="font-size: 0.85rem; color: #cbd5e1;">
      Select any counterintuitive CS concept below. The code will load directly into your editor and start step-by-step interactive execution.
    </p>
  `;
    container.appendChild(banner);
    const modules = state.curriculumModules;
    if (modules.length === 0) {
      const loading = document.createElement("div");
      loading.className = "card";
      loading.style.textAlign = "center";
      loading.textContent = "Syncing curriculum from server...";
      container.appendChild(loading);
      return container;
    }
    modules.forEach((mod) => {
      const item = document.createElement("div");
      item.className = "card";
      item.style.cursor = "pointer";
      item.style.transition = "transform 0.15s ease, border-color 0.15s ease";
      item.onmouseenter = () => {
        item.style.borderColor = "#38bdf8";
      };
      item.onmouseleave = () => {
        item.style.borderColor = "var(--border-color)";
      };
      const langBadgeClass = mod.language === "rust" ? "badge-amber" : mod.language === "python" ? "badge-emerald" : "badge-blue";
      item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <div>
          <span class="badge ${langBadgeClass}" style="margin-right: 0.4rem;">${mod.language.toUpperCase()}</span>
          <span class="badge badge-indigo">${mod.category}</span>
          <h3 style="font-size: 1.05rem; font-weight: 600; margin-top: 0.3rem;">${escapeHtml(mod.title)}</h3>
        </div>
        <span class="badge badge-rose">${mod.difficulty}</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.8rem; line-height: 1.4;">
        ${escapeHtml(mod.description)}
      </p>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 0.3rem;">
          ${mod.tags.map((t) => `<span style="font-size: 0.75rem; color: #94a3b8; background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 0.25rem;">#${escapeHtml(t)}</span>`).join("")}
        </div>
        <button class="btn btn-primary" style="font-size: 0.8rem; padding: 0.3rem 0.7rem;">\u26A1 Load Challenge</button>
      </div>
    `;
      item.onclick = () => {
        vscode.postMessage({ type: "LOAD_MODULE", id: mod.id });
      };
      container.appendChild(item);
    });
    return container;
  }
  function escapeHtml(str) {
    if (!str)
      return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  init();
})();
//# sourceMappingURL=webview.js.map
