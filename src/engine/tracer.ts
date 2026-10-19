import { JsTracer } from './jsTracer';
import { PythonTracer } from './pythonTracer';
import { RustTracer } from './rustTracer';
import { SupportedLanguage, TraceResult } from './types';

export class FermasEngine {
  private jsTracer = new JsTracer();
  private pyTracer = new PythonTracer();
  private rustTracer = new RustTracer();

  public trace(code: string, language: SupportedLanguage): TraceResult {
    try {
      if (language === 'python') {
        const snapshots = this.pyTracer.trace(code);
        return { language, code, snapshots };
      } else if (language === 'rust') {
        const snapshots = this.rustTracer.trace(code);
        return { language, code, snapshots };
      } else {
        // javascript or typescript
        const snapshots = this.jsTracer.trace(code, language);
        return { language, code, snapshots };
      }
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
