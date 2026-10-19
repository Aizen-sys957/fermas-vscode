import * as vscode from 'vscode';
import { FermasEngine } from '../engine/tracer';
import { CurriculumService } from '../engine/curriculumServer';
import { FermasDecorations } from './fermasDecorations';
import { FermasInlayHintsProvider } from './fermasInlayHintsProvider';
import { MemorySnapshot, SupportedLanguage } from '../engine/types';

/**
 * Owns the panel UI.
 *
 * The same UI is hosted in two places and this class talks to both:
 *   - a view in the activity bar (left), and
 *   - a view in the secondary sidebar (right, beside the code),
 * plus an optional wide editor-tab panel.
 *
 * See docs/FERMAS-CONTRACT.md for the message protocol.
 */
export class FermasWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'fermas.visualizerView';
  public static readonly secondaryViewType = 'fermas.visualizerViewSecondary';

  private readonly views = new Set<vscode.WebviewView>();
  private panel?: vscode.WebviewPanel;

  private readonly engine = new FermasEngine();
  private readonly curriculum = new CurriculumService();

  private currentSnapshots: MemorySnapshot[] = [];
  private currentTick = 0;
  private currentLanguage: SupportedLanguage = 'javascript';
  private currentFileName = '';
  private currentError?: string;
  private currentModuleId?: string;
  private isLiveSyncEnabled = true;
  private liveSyncTimer?: NodeJS.Timeout;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly decorations: FermasDecorations,
    private readonly inlayHints: FermasInlayHintsProvider,
  ) {}

  public onDocumentChange(doc: vscode.TextDocument): void {
    if (!this.isLiveSyncEnabled) return;
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document !== doc) return;
    if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return;

    if (this.liveSyncTimer) {
      clearTimeout(this.liveSyncTimer);
    }

    this.liveSyncTimer = setTimeout(() => {
      void this.runTraceOnActiveEditor();
    }, 350);
  }


  // -------------------------------------------------------------------------
  // Webview hosting
  // -------------------------------------------------------------------------

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.views.add(webviewView);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.setupMessageListener(webviewView.webview);

    webviewView.onDidDispose(() => {
      this.views.delete(webviewView);
    });

    // First view to resolve populates itself from the active editor.
    void this.primeIfEmpty();
  }

  public openInBesidePanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'fermas.visualizerPanel',
      'Fermas Visualizer',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
    this.setupMessageListener(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.pushTrace(this.panel.webview);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  public async runTraceOnActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await this.openCurriculumBrowser();
      return;
    }

    const doc = editor.document;
    const language = this.engine.detectLanguageFromDoc(doc.languageId);
    const result = this.engine.trace(doc.getText(), language);

    this.currentLanguage = language;
    this.currentSnapshots = result.snapshots;
    this.currentTick = 0;
    this.currentFileName = doc.fileName.split(/[\\/]/).pop() ?? doc.fileName;
    this.currentError = result.error;
    this.currentModuleId = undefined;

    this.postToWebviews({
      type: 'SET_TRACE',
      snapshots: this.currentSnapshots,
      language: this.currentLanguage,
      currentTick: 0,
      fileName: this.currentFileName,
      error: this.currentError,
    });

    this.syncStepToEditor(0);
  }

  public async openCurriculumBrowser(): Promise<void> {
    const modules = await this.curriculum.fetchCurriculum();
    this.postToWebviews({ type: 'OPEN_CURRICULUM', modules });
  }

  public stepForward(): void {
    if (this.currentTick < this.currentSnapshots.length - 1) {
      this.goToTick(this.currentTick + 1);
    }
  }

  public stepBack(): void {
    if (this.currentTick > 0) {
      this.goToTick(this.currentTick - 1);
    }
  }

  public resetTrace(): void {
    this.goToTick(0);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async primeIfEmpty(): Promise<void> {
    if (this.currentSnapshots.length > 0) return;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.getText().trim()) {
      await this.runTraceOnActiveEditor();
    } else {
      await this.openCurriculumBrowser();
    }
  }

  private goToTick(tick: number): void {
    this.currentTick = tick;
    this.postToWebviews({ type: 'GOTO_TICK', tick });
    this.syncStepToEditor(tick);
  }

  private setupMessageListener(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(async (message: { type: string; [key: string]: unknown }) => {
      switch (message.type) {
        case 'STEP_CHANGED': {
          const tick = Number(message.tick);
          if (Number.isFinite(tick)) {
            this.currentTick = tick;
            this.syncStepToEditor(tick);
          }
          break;
        }
        case 'REQUEST_CURRICULUM': {
          const modules = await this.curriculum.fetchCurriculum();
          webview.postMessage({ type: 'SET_CURRICULUM', modules });
          break;
        }
        case 'LOAD_MODULE': {
          await this.loadModule(String(message.id));
          break;
        }
        case 'REQUEST_RETRACE': {
          await this.runTraceOnActiveEditor();
          break;
        }
        case 'OPEN_PANEL': {
          this.openInBesidePanel();
          break;
        }
        case 'TOGGLE_LIVE_SYNC': {
          this.isLiveSyncEnabled = Boolean(message.enabled);
          this.postToWebviews({ type: 'SET_LIVE_SYNC', enabled: this.isLiveSyncEnabled });
          break;
        }
        case 'IMPORT_GITHUB': {
          await this.importFromGitHub(
            String(message.repoUrl || ''),
            String(message.branch || 'main'),
            String(message.path || '')
          );
          break;
        }
        case 'REVEAL_LINE': {
          const line = Number(message.line);
          const editor = vscode.window.activeTextEditor;
          if (editor && Number.isFinite(line)) {
            this.decorations.highlightLine(editor, line);
          }
          break;
        }
      }
    });
  }

  private async importFromGitHub(repoInput: string, branch: string, filePath: string): Promise<void> {
    try {
      // Clean up input
      let rawUrl = '';
      const trimmed = repoInput.trim().replace(/^https?:\/\//, '');

      if (trimmed.startsWith('raw.githubusercontent.com/')) {
        rawUrl = `https://${trimmed}`;
      } else if (trimmed.startsWith('github.com/')) {
        const parts = trimmed.replace('github.com/', '').split('/');
        const owner = parts[0];
        const repo = parts[1];
        const subPath = parts.slice(2).join('/') || filePath || 'solution.ts';
        rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/${subPath}`;
      } else {
        const parts = trimmed.split('/');
        if (parts.length >= 2) {
          const owner = parts[0];
          const repo = parts[1];
          const subPath = parts.slice(2).join('/') || filePath || 'solution.ts';
          rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/${subPath}`;
        }
      }

      if (!rawUrl) {
        throw new Error('Please provide a valid GitHub repo format (e.g. github.com/owner/repo)');
      }

      const res = await fetch(rawUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch from GitHub (HTTP ${res.status}): ${rawUrl}`);
      }

      const code = await res.text();
      const detectedLang = rawUrl.endsWith('.py')
        ? 'python'
        : rawUrl.endsWith('.rs')
        ? 'rust'
        : rawUrl.endsWith('.ts')
        ? 'typescript'
        : 'javascript';

      this.currentLanguage = detectedLang;
      this.currentFileName = rawUrl.split('/').pop() || 'github-solution.ts';

      const result = this.engine.trace(code, detectedLang);
      this.currentSnapshots = result.snapshots;
      this.currentTick = 0;
      this.currentError = result.error;

      this.postToWebviews({
        type: 'SET_TRACE',
        snapshots: this.currentSnapshots,
        language: this.currentLanguage,
        currentTick: 0,
        fileName: this.currentFileName,
        error: this.currentError,
      });

      // Open in VS Code editor
      const doc = await vscode.workspace.openTextDocument({
        content: code,
        language: detectedLang,
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      this.syncStepToEditor(0);
    } catch (err: any) {
      vscode.window.showErrorMessage(`GitHub Ingestion: ${err?.message || err}`);
      this.postToWebviews({
        type: 'SET_ERROR',
        message: `GitHub Ingestion Error: ${err?.message || err}`
      });
    }
  }


  private async loadModule(id: string): Promise<void> {
    const module = await this.curriculum.fetchCurriculum().then((modules) =>
      modules.find((candidate) => candidate.id === id),
    );
    if (!module) return;

    this.currentLanguage = module.language;
    this.currentModuleId = module.id;
    this.currentFileName = module.title;

    const result = this.engine.trace(module.code, module.language);
    this.currentSnapshots = result.snapshots;
    this.currentTick = 0;
    this.currentError = result.error;

    this.postToWebviews({
      type: 'SET_TRACE',
      snapshots: this.currentSnapshots,
      language: this.currentLanguage,
      currentTick: 0,
      fileName: this.currentFileName,
      activeModule: module,
      error: this.currentError,
    });

    const doc = await vscode.workspace.openTextDocument({
      content: module.code,
      language: module.language,
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    this.syncStepToEditor(0);
  }

  private syncStepToEditor(tickIndex: number): void {
    const snapshot = this.currentSnapshots[tickIndex];
    if (!snapshot) return;

    this.inlayHints.updateSnapshot(snapshot);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorations.highlightLine(editor, snapshot.line, snapshot.inlayHint);
    }
  }

  private pushTrace(webview: vscode.Webview): void {
    webview.postMessage({
      type: 'SET_TRACE',
      snapshots: this.currentSnapshots,
      language: this.currentLanguage,
      currentTick: this.currentTick,
      fileName: this.currentFileName,
      error: this.currentError,
    });
  }

  private postToWebviews(message: unknown): void {
    for (const view of this.views) {
      void view.webview.postMessage(message);
    }
    if (this.panel) {
      void this.panel.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'style.css'),
    );
    const nonce = createNonce();

    // style-src keeps 'unsafe-inline' because components set inline style
    // attributes (pointer badge colours). Scripts are never inline.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fermas</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index++) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}
