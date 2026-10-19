import type { HostMessage, PersistedState, WebviewMessage } from './types';

const api = acquireVsCodeApi<PersistedState>();

export function post(message: WebviewMessage): void {
  api.postMessage(message);
}

export function onHostMessage(handler: (message: HostMessage) => void): () => void {
  const listener = (event: MessageEvent<HostMessage>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function readPersisted(): PersistedState | undefined {
  return api.getState();
}

export function persist(state: PersistedState): void {
  api.setState(state);
}
