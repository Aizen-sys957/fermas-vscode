import { AstInterpreter } from './astInterpreter';
import { SupportedLanguage, TraceResult } from './types';

export class FermasEngine {
  private interpreter = new AstInterpreter();

  public trace(code: string, language: SupportedLanguage): TraceResult {
    try {
      const snapshots = this.interpreter.trace(code, language);
      return { language, code, snapshots };
    } catch (err: any) {
      return {
        language,
        code,
        snapshots: [],
        error: err?.message || 'Failed to trace execution'
      };
    }
  }

  public detectLanguageFromDoc(languageId: string): SupportedLanguage {
    if (languageId === 'python') return 'python';
    if (languageId === 'rust') return 'rust';
    if (languageId === 'typescript') return 'typescript';
    return 'javascript';
  }
}
