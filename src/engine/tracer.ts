import { AstInterpreter } from './astInterpreter';
import { SupportedLanguage, TraceResult } from './types';

export class FermasEngine {
  private interpreter = new AstInterpreter();

  public trace(code: string, language: SupportedLanguage): TraceResult {
    try {
      const snapshots = this.interpreter.trace(code, language);
      if (snapshots.length === 0) {
        return {
          language,
          code,
          snapshots: [this.createFallbackSnapshot(code, 'Empty program')]
        };
      }
      return { language, code, snapshots };
    } catch (err: any) {
      return {
        language,
        code,
        snapshots: [this.createFallbackSnapshot(code, err?.message || 'Failed to trace execution')],
        error: err?.message || 'Failed to trace execution'
      };
    }
  }

  private createFallbackSnapshot(code: string, msg: string) {
    return {
      tick: 1,
      totalTicks: 1,
      line: 1,
      codeSnippet: code.split('\n')[0] || '',
      event: 'init' as const,
      explanation: `Execution note: ${msg}`,
      callStack: [{ frameId: 'frame-main', functionName: 'main', line: 1, scope: {} }],
      heap: {},
      concurrency: { microtasks: [], macrotasks: [], pendingTasks: [] },
      stdout: []
    };
  }

  public detectLanguageFromDoc(languageId: string): SupportedLanguage {
    if (languageId === 'python') return 'python';
    if (languageId === 'rust') return 'rust';
    if (languageId === 'typescript') return 'typescript';
    return 'javascript';
  }
}
