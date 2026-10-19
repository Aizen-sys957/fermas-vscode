import { Header } from './components/Header';
import { DynamicVisualizerView } from './components/DynamicVisualizerView';
import { RecursionTreeView } from './components/RecursionTreeView';
import { TimelineMemoryDiffView } from './components/TimelineMemoryDiffView';
import { AlgorithmHubView } from './components/AlgorithmHubView';
import { Console } from './components/Console';
import { Notice } from './components/ui';
import { useStore } from './state/store';

export function App() {
  const { state } = useStore();

  const currentView =
    state.viewMode === 'editor'
      ? 'visualizer'
      : state.viewMode === 'lessons'
      ? 'algo-hub'
      : state.viewMode;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--vscode-editor-background,#1e1e1e)] text-[var(--vscode-foreground,#cccccc)]">
      <Header />

      {state.error && (
        <div className="p-2">
          <Notice tone="err">{state.error}</Notice>
        </div>
      )}

      <main className="fermas-scroll flex-1 overflow-y-auto">
        {currentView === 'visualizer' && <DynamicVisualizerView />}
        {currentView === 'recursion-tree' && <RecursionTreeView />}
        {currentView === 'timeline-memory' && <TimelineMemoryDiffView />}
        {currentView === 'algo-hub' && <AlgorithmHubView />}
      </main>

      <Console />
    </div>
  );
}
