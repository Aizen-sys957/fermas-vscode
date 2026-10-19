import * as vscode from 'vscode';
import { FermasEngine } from '../engine/tracer';
import { GitCurriculumService } from '../engine/gitCurriculumService';
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
  private readonly curriculum = new GitCurriculumService();

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
    context?: vscode.ExtensionContext,
  ) {
    if (context) {
      this.curriculum.setContext(context);
    }
  }

  public setContext(context: vscode.ExtensionContext) {
    this.curriculum.setContext(context);
  }

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
    const modules = this.curriculum.getModules();
    const sources = this.curriculum.getSources();
    const activeSourceId = this.curriculum.getActiveSourceId();
    this.postToWebviews({
      type: 'OPEN_CURRICULUM',
      modules,
      sources,
      activeSourceId,
    });
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
          const modules = this.curriculum.getModules();
          const sources = this.curriculum.getSources();
          const activeSourceId = this.curriculum.getActiveSourceId();
          webview.postMessage({
            type: 'SET_CURRICULUM',
            modules,
            sources,
            activeSourceId,
          });
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
        case 'IMPORT_GIT_REPO':
        case 'IMPORT_GITHUB': {
          await this.importFromGitRepo(
            String(message.repoUrl || ''),
            String(message.branch || 'main'),
            String(message.path || 'fermas.json')
          );
          break;
        }
        case 'SELECT_CURRICULUM_SOURCE': {
          const sourceId = String(message.sourceId);
          const modules = await this.curriculum.selectSource(sourceId);
          const sources = this.curriculum.getSources();
          const activeSourceId = this.curriculum.getActiveSourceId();
          this.postToWebviews({
            type: 'SET_CURRICULUM',
            modules,
            sources,
            activeSourceId,
          });
          break;
        }
        case 'DELETE_CURRICULUM_SOURCE': {
          const sourceId = String(message.sourceId);
          const modules = await this.curriculum.deleteSource(sourceId);
          const sources = this.curriculum.getSources();
          const activeSourceId = this.curriculum.getActiveSourceId();
          this.postToWebviews({
            type: 'SET_CURRICULUM',
            modules,
            sources,
            activeSourceId,
          });
          break;
        }
        case 'REFRESH_CURRICULUM': {
          const activeId = this.curriculum.getActiveSourceId();
          if (activeId !== 'builtin') {
            const src = this.curriculum.getSources().find(s => s.id === activeId);
            if (src) {
              await this.importFromGitRepo(src.repoUrl, src.branch, src.manifestPath);
            }
          } else {
            const modules = this.curriculum.getModules();
            this.postToWebviews({
              type: 'SET_CURRICULUM',
              modules,
              sources: this.curriculum.getSources(),
              activeSourceId: 'builtin',
            });
          }
          break;
        }
        case 'EXPORT_TEMPLATE': {
          await this.exportCurriculumTemplate();
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

  private async importFromGitRepo(repoInput: string, branch: string, manifestPath: string): Promise<void> {
    try {
      if (!repoInput.trim()) {
        throw new Error('Please enter a GitHub repository (e.g. owner/repo or github.com/owner/repo)');
      }

      vscode.window.showInformationMessage(`Importing DSA tutorials from ${repoInput}...`);
      const source = await this.curriculum.importFromGit(repoInput, branch, manifestPath);

      vscode.window.showInformationMessage(
        `Successfully imported "${source.name}" with ${source.modules.length} modules from Git!`
      );

      const modules = this.curriculum.getModules();
      const sources = this.curriculum.getSources();
      const activeSourceId = this.curriculum.getActiveSourceId();

      this.postToWebviews({
        type: 'SET_CURRICULUM',
        modules,
        sources,
        activeSourceId,
      });

      // Automatically trace first problem
      if (source.modules.length > 0) {
        await this.loadModule(source.modules[0].id);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Git Import: ${err?.message || err}`);
      this.postToWebviews({
        type: 'SET_ERROR',
        message: `Git Curriculum Ingestion Error: ${err?.message || err}`
      });
    }
  }

  private async exportCurriculumTemplate(): Promise<void> {
    try {
      const template = this.curriculum.generateStarterTemplate();
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        vscode.window.showErrorMessage('Please open a folder or workspace in VS Code to export the tutorial template.');
        return;
      }

      const rootUri = wsFolder.uri;
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(rootUri, 'fermas.json'),
        Buffer.from(template.manifest, 'utf-8')
      );
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(rootUri, 'README.md'),
        Buffer.from(template.readmeMd, 'utf-8')
      );

      const probFolder = vscode.Uri.joinPath(rootUri, 'problems');
      await vscode.workspace.fs.createDirectory(probFolder);

      const t1 = vscode.Uri.joinPath(probFolder, 'two-sum');
      await vscode.workspace.fs.createDirectory(t1);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(t1, 'solution.ts'),
        Buffer.from(template.sampleProblemTs, 'utf-8')
      );

      const t2 = vscode.Uri.joinPath(probFolder, 'valid-palindrome');
      await vscode.workspace.fs.createDirectory(t2);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(t2, 'solution.py'),
        Buffer.from(template.sampleProblemPy, 'utf-8')
      );

      const t3 = vscode.Uri.joinPath(probFolder, 'three-sum');
      await vscode.workspace.fs.createDirectory(t3);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(t3, 'solution.rs'),
        Buffer.from(template.sampleProblemRs, 'utf-8')
      );

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(rootUri, 'fermas.json'));
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      vscode.window.showInformationMessage('Created Fermas DSA Tutorial template (fermas.json + problems/) in workspace!');
    } catch (err: any) {
      vscode.window.showErrorMessage(`Export Template Error: ${err?.message || err}`);
    }
  }

  private async loadModule(id: string): Promise<void> {
    const module = this.curriculum.getModuleById(id);
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
