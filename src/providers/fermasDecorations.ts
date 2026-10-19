import * as vscode from 'vscode';

export class FermasDecorations {
  private activeLineDecoration: vscode.TextEditorDecorationType;
  private pointerDecoration: vscode.TextEditorDecorationType;

  constructor() {
    this.activeLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('editor.lineHighlightBackground'),
      border: '1px solid #3b82f6',
      overviewRulerColor: '#3b82f6',
      overviewRulerLane: vscode.OverviewRulerLane.Full
    });

    this.pointerDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 1.5rem',
        color: '#93c5fd',
        fontWeight: 'bold'
      }
    });
  }

  public highlightLine(editor: vscode.TextEditor, line1Based: number, hintText?: string) {
    if (line1Based < 1 || line1Based > editor.document.lineCount) return;
    const line0Based = line1Based - 1;
    const range = editor.document.lineAt(line0Based).range;

    editor.setDecorations(this.activeLineDecoration, [range]);

    if (hintText) {
      const hintDecoration: vscode.DecorationOptions = {
        range,
        renderOptions: {
          after: {
            contentText: ` ${hintText}`,
            color: '#60a5fa',
            fontStyle: 'italic'
          }
        }
      };
      editor.setDecorations(this.pointerDecoration, [hintDecoration]);
    } else {
      editor.setDecorations(this.pointerDecoration, []);
    }

    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  public clear(editor: vscode.TextEditor) {
    editor.setDecorations(this.activeLineDecoration, []);
    editor.setDecorations(this.pointerDecoration, []);
  }

  public dispose() {
    this.activeLineDecoration.dispose();
    this.pointerDecoration.dispose();
  }
}
