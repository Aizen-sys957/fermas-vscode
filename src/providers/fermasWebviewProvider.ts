import * as vscode from 'vscode';
import { FermasEngine } from '../engine/tracer';
import { CurriculumService } from '../engine/curriculumServer';
import { FermasDecorations } from './fermasDecorations';
import { FermasInlayHintsProvider } from './fermasInlayHintsProvider';
import { MemorySnapshot, SupportedLanguage } from '../engine/types';

export class FermasWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'fermas.visualizerView';
  private _view?: vscode.WebviewView;
  private _panel?: vscode.WebviewPanel;
  private engine = new FermasEngine();
  private curriculum = new CurriculumService();
  private currentSnapshots: MemorySnapshot[] = [];
  private currentTick = 0;
  private currentLanguage: SupportedLanguage = 'javascript';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly decorations: FermasDecorations,
    private readonly inlayHints: FermasInlayHintsProvider
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.setupMessageListener(webviewView.webview);

    // Auto-populate immediately
    setTimeout(async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.getText().trim()) {
        await this.runTraceOnActiveEditor();
      } else {
        const modules = await this.curriculum.fetchCurriculum();
        webviewView.webview.postMessage({
          type: 'SET_CURRICULUM',
          modules
        });
      }
    }, 250);
  }

  public openInBesidePanel() {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'fermas.visualizerPanel',
      'Fermas Visualizer Canvas',
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
      this._panel = undefined;
    });

    if (this.currentSnapshots.length > 0) {
      this.postToWebviews({
        type: 'SET_TRACE',
        snapshots: this.currentSnapshots,
        language: this.currentLanguage,
        currentTick: this.currentTick
      });
    }
  }

  public async runTraceOnActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // If no active editor, open curriculum
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
      type: 'SET_TRACE',
      snapshots: this.currentSnapshots,
      language: this.currentLanguage,
      currentTick: 0
    });

    if (this.currentSnapshots.length > 0) {
      this.syncStepToEditor(0);
    }
  }

  public async openCurriculumBrowser() {
    const modules = await this.curriculum.fetchCurriculum();
    this.postToWebviews({
      type: 'OPEN_CURRICULUM',
      modules
    });
  }

  public stepForward() {
    if (this.currentTick < this.currentSnapshots.length - 1) {
      this.currentTick++;
      this.postToWebviews({ type: 'GOTO_TICK', tick: this.currentTick });
      this.syncStepToEditor(this.currentTick);
    }
  }

  public stepBack() {
    if (this.currentTick > 0) {
      this.currentTick--;
      this.postToWebviews({ type: 'GOTO_TICK', tick: this.currentTick });
      this.syncStepToEditor(this.currentTick);
    }
  }

  public resetTrace() {
    this.currentTick = 0;
    this.postToWebviews({ type: 'GOTO_TICK', tick: 0 });
    this.syncStepToEditor(0);
  }

  private setupMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'STEP_CHANGED': {
          this.currentTick = message.tick;
          this.syncStepToEditor(this.currentTick);
          break;
        }
        case 'REQUEST_CURRICULUM': {
          const modules = await this.curriculum.fetchCurriculum();
          webview.postMessage({ type: 'SET_CURRICULUM', modules });
          break;
        }
        case 'LOAD_MODULE': {
          const mod = this.curriculum.getModuleById(message.id);
          if (mod) {
            this.currentLanguage = mod.language;
            const result = this.engine.trace(mod.code, mod.language);
            this.currentSnapshots = result.snapshots;
            this.currentTick = 0;
            this.postToWebviews({
              type: 'SET_TRACE',
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
        case 'REQUEST_RETRACE': {
          await this.runTraceOnActiveEditor();
          break;
        }
      }
    });
  }

  private syncStepToEditor(tickIndex: number) {
    const snapshot = this.currentSnapshots[tickIndex];
    if (!snapshot) return;

    this.inlayHints.updateSnapshot(snapshot);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorations.highlightLine(editor, snapshot.line, snapshot.inlayHint);
    }
  }

  private postToWebviews(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'style.css'));

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
      <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">⚡</div>
      <div style="font-weight: bold; font-size: 1rem; color: #f8fafc; margin-bottom: 0.3rem;">Fermas Visualizer</div>
      <p style="font-size: 0.85rem;">Initializing runtime canvas...</p>
    </div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
