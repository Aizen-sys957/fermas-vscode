// Injected by the VS Code webview host.
declare function acquireVsCodeApi<TState = unknown>(): {
  postMessage(message: unknown): void;
  getState(): TState | undefined;
  setState(state: TState): void;
};
