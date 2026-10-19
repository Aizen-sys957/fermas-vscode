import * as vscode from 'vscode';

export class FermasCodeLensProvider implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  public refresh() {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // First line top-level runner
    const topRange = new vscode.Range(0, 0, 0, 0);
    codeLenses.push(
      new vscode.CodeLens(topRange, {
        title: '⚡ Run Entire File in Fermas Visualizer',
        command: 'fermas.visualize',
        tooltip: 'Launch omniscient step-by-step visualizer for this file'
      }),
      new vscode.CodeLens(topRange, {
        title: '📚 Browse CS Puzzles & Demos',
        command: 'fermas.openCurriculum',
        tooltip: 'Open remote dynamic lessons and CS challenges'
      })
    );

    // Scan for function headers (JS/TS, Python, Rust)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/) ||
        line.match(/def\s+([a-zA-Z0-9_$]+)\s*\(/) ||
        line.match(/fn\s+([a-zA-Z0-9_$]+)\s*\(/)
      ) {
        const range = new vscode.Range(i, 0, i, 0);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '⚡ Visualize Function with Fermas',
            command: 'fermas.visualize',
            tooltip: 'Trace and visualize execution of this function'
          })
        );
      }
    }

    return codeLenses;
  }
}
