import * as vscode from 'vscode';
import { MemorySnapshot } from '../engine/types';

export class FermasInlayHintsProvider implements vscode.InlayHintsProvider {
  private currentSnapshot: MemorySnapshot | null = null;
  private onDidChangeInlayHintsEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeInlayHints = this.onDidChangeInlayHintsEmitter.event;

  public updateSnapshot(snapshot: MemorySnapshot | null) {
    this.currentSnapshot = snapshot;
    this.onDidChangeInlayHintsEmitter.fire();
  }

  public provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlayHint[]> {
    if (!this.currentSnapshot || !this.currentSnapshot.inlayHint) {
      return [];
    }

    const line0 = this.currentSnapshot.line - 1;
    if (line0 < 0 || line0 >= document.lineCount) return [];

    const line = document.lineAt(line0);
    const position = line.range.end;

    const hint = new vscode.InlayHint(
      position,
      `  ⚡ ${this.currentSnapshot.inlayHint}`,
      vscode.InlayHintKind.Parameter
    );
    hint.paddingLeft = true;
    hint.tooltip = `Fermas Execution State at Tick #${this.currentSnapshot.tick}: ${this.currentSnapshot.explanation}`;

    return [hint];
  }
}
