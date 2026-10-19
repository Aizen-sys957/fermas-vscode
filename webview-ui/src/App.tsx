import { Console } from './components/Console';
import { ConcurrencyLens } from './components/ConcurrencyLens';
import { Curriculum } from './components/Curriculum';
import { EmptyState } from './components/EmptyState';
import { Header } from './components/Header';
import { MemoryLens } from './components/MemoryLens';
import { PredictFirst } from './components/PredictFirst';
import { Scrubber } from './components/Scrubber';
import { StepBanner } from './components/StepBanner';
import { Toolbar } from './components/Toolbar';
import { Notice } from './components/ui';
import { useStore } from './state/store';

export function App() {
  const { state, snapshot } = useStore();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Header />

      {state.viewMode === 'lessons' ? (
        <main className="fermas-scroll flex-1">
          <Curriculum />
        </main>
      ) : !snapshot ? (
        <main className="fermas-scroll flex-1">
          {state.error && <Notice tone="err">{state.error}</Notice>}
          <EmptyState />
        </main>
      ) : (
        <>
          <Toolbar />
          <Scrubber />
          <main className="fermas-scroll flex-1">
            {state.error && <Notice tone="err">{state.error}</Notice>}
            <StepBanner />
            <PredictFirst />
            {state.lens === 'concurrency' ? (
              <ConcurrencyLens snapshot={snapshot} />
            ) : (
              <MemoryLens snapshot={snapshot} />
            )}
          </main>
          <Console />
        </>
      )}
    </div>
  );
}
