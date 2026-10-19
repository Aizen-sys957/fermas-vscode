import * as vscode from 'vscode';
import { FermasWebviewProvider } from './providers/fermasWebviewProvider';
import { FermasCodeLensProvider } from './providers/fermasCodeLensProvider';
import { FermasInlayHintsProvider } from './providers/fermasInlayHintsProvider';
import { FermasDecorations } from './providers/fermasDecorations';

export function activate(context: vscode.ExtensionContext) {
  console.log('⚡ Fermas extension is now active!');

  const decorations = new FermasDecorations();
  const inlayHintsProvider = new FermasInlayHintsProvider();
  const webviewProvider = new FermasWebviewProvider(context.extensionUri, decorations, inlayHintsProvider);
  const codeLensProvider = new FermasCodeLensProvider();

  // Register the panel in both containers: activity bar and, the one that
  // matters most, the secondary sidebar so it sits beside the code.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FermasWebviewProvider.viewType, webviewProvider),
    vscode.window.registerWebviewViewProvider(FermasWebviewProvider.secondaryViewType, webviewProvider)
  );

  // Register CodeLens & InlayHints for JS/TS, Python, Rust
  const selector: vscode.DocumentSelector = [
    { language: 'javascript' },
    { language: 'typescript' },
    { language: 'python' },
    { language: 'rust' }
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider),
    vscode.languages.registerInlayHintsProvider(selector, inlayHintsProvider)
  );

  // Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'fermas.visualize';
  statusBarItem.text = '$(play) Fermas: Trace';
  statusBarItem.tooltip = 'Click to visualize active code in Fermas';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('fermas.visualize', () => {
      webviewProvider.runTraceOnActiveEditor();
    }),
    vscode.commands.registerCommand('fermas.openPanel', () => {
      webviewProvider.openInBesidePanel();
    }),
    vscode.commands.registerCommand('fermas.openCurriculum', () => {
      webviewProvider.openCurriculumBrowser();
    }),
    vscode.commands.registerCommand('fermas.stepForward', () => {
      webviewProvider.stepForward();
    }),
    vscode.commands.registerCommand('fermas.stepBack', () => {
      webviewProvider.stepBack();
    }),
    vscode.commands.registerCommand('fermas.resetTrace', () => {
      webviewProvider.resetTrace();
    })
  );

  // Refresh CodeLens and trigger real-time debounced live sync on document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      codeLensProvider.refresh();
      webviewProvider.onDocumentChange(e.document);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => codeLensProvider.refresh()),
    decorations
  );
}


export function deactivate() {
  console.log('⚡ Fermas extension deactivated.');
}
