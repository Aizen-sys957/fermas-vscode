import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { onHostMessage, persist, post, readPersisted } from '../bridge';
import { FIXTURES, type FixtureName } from '../fixtures';
import type {
  CurriculumModule,
  HostMessage,
  Lens,
  MemorySnapshot,
  PlaybackRate,
  SupportedLanguage,
  ViewMode,
} from '../types';

export interface AppState {
  source: 'host' | 'fixture' | 'none';
  viewMode: ViewMode;
  lens: Lens;
  language: SupportedLanguage;
  fileName: string;
  snapshots: MemorySnapshot[];
  tick: number;
  playing: boolean;
  rate: PlaybackRate;
  modules: CurriculumModule[];
  activeModule?: CurriculumModule;
  answerIndex?: number;
  error?: string;
}

type Action =
  | {
      type: 'trace';
      snapshots: MemorySnapshot[];
      language: SupportedLanguage;
      tick: number;
      fileName?: string;
      activeModule?: CurriculumModule;
      source: 'host' | 'fixture';
      error?: string;
    }
  | { type: 'goto'; tick: number }
  | { type: 'curriculum'; modules: CurriculumModule[] }
  | { type: 'error'; message: string }
  | { type: 'lens'; lens: Lens }
  | { type: 'viewMode'; viewMode: ViewMode }
  | { type: 'playing'; playing: boolean }
  | { type: 'rate'; rate: PlaybackRate }
  | { type: 'answer'; index: number }
  | { type: 'module'; module?: CurriculumModule };

const persisted = readPersisted();

const initialState: AppState = {
  source: 'none',
  viewMode: persisted?.viewMode ?? 'editor',
  lens: persisted?.lens ?? 'concurrency',
  language: 'javascript',
  fileName: '',
  snapshots: [],
  tick: persisted?.tick ?? 0,
  playing: false,
  rate: 1,
  modules: [],
};

function clamp(tick: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(tick, 0), total - 1);
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'trace': {
      const tick = clamp(action.tick, action.snapshots.length);
      return {
        ...state,
        source: action.source,
        snapshots: action.snapshots,
        language: action.language,
        fileName: action.fileName ?? state.fileName,
        activeModule: action.activeModule,
        tick,
        playing: false,
        answerIndex: undefined,
        error: action.error,
        viewMode: 'editor',
      };
    }
    case 'goto':
      return { ...state, tick: clamp(action.tick, state.snapshots.length) };
    case 'curriculum':
      return { ...state, modules: action.modules };
    case 'error':
      return { ...state, error: action.message, playing: false };
    case 'lens':
      return { ...state, lens: action.lens };
    case 'viewMode':
      return { ...state, viewMode: action.viewMode, playing: false };
    case 'playing':
      return { ...state, playing: action.playing };
    case 'rate':
      return { ...state, rate: action.rate };
    case 'answer':
      return { ...state, answerIndex: action.index };
    case 'module':
      return { ...state, activeModule: action.module, viewMode: 'editor', answerIndex: undefined };
    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  snapshot: MemorySnapshot | undefined;
  total: number;
  goto: (tick: number, origin?: 'user' | 'host') => void;
  step: (delta: number) => void;
  first: () => void;
  last: () => void;
  togglePlay: () => void;
  setRate: (rate: PlaybackRate) => void;
  setLens: (lens: Lens) => void;
  setViewMode: (viewMode: ViewMode) => void;
  answerQuiz: (index: number) => void;
  retrace: () => void;
  requestCurriculum: () => void;
  loadModule: (id: string) => void;
  loadFixture: (name: FixtureName) => void;
  openPanel: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Keep the latest values reachable from the message listener without
  // re-subscribing on every tick.
  const stateRef = useRef(state);
  stateRef.current = state;

  const goto = useCallback((tick: number, origin: 'user' | 'host' = 'user') => {
    dispatch({ type: 'goto', tick });
    if (origin === 'user') {
      post({ type: 'STEP_CHANGED', tick });
    }
  }, []);

  const step = useCallback(
    (delta: number) => {
      goto(stateRef.current.tick + delta);
    },
    [goto],
  );

  const first = useCallback(() => goto(0), [goto]);
  const last = useCallback(() => goto(stateRef.current.snapshots.length - 1), [goto]);

  const togglePlay = useCallback(() => {
    const current = stateRef.current;
    if (current.snapshots.length === 0) return;
    if (!current.playing && current.tick >= current.snapshots.length - 1) {
      goto(0);
    }
    dispatch({ type: 'playing', playing: !current.playing });
  }, [goto]);

  const setRate = useCallback((rate: PlaybackRate) => dispatch({ type: 'rate', rate }), []);
  const setLens = useCallback((lens: Lens) => dispatch({ type: 'lens', lens }), []);
  const setViewMode = useCallback((viewMode: ViewMode) => {
    dispatch({ type: 'viewMode', viewMode });
    if (viewMode === 'lessons') post({ type: 'REQUEST_CURRICULUM' });
  }, []);
  const answerQuiz = useCallback((index: number) => dispatch({ type: 'answer', index }), []);
  const retrace = useCallback(() => post({ type: 'REQUEST_RETRACE' }), []);
  const requestCurriculum = useCallback(() => post({ type: 'REQUEST_CURRICULUM' }), []);
  const loadModule = useCallback((id: string) => post({ type: 'LOAD_MODULE', id }), []);
  const openPanel = useCallback(() => post({ type: 'OPEN_PANEL' }), []);

  const loadFixture = useCallback(
    (name: FixtureName) => {
      const fixture = FIXTURES[name];
      dispatch({
        type: 'trace',
        snapshots: fixture.snapshots,
        language: fixture.language,
        tick: 0,
        fileName: fixture.fileName,
        source: 'fixture',
      });
    },
    [],
  );

  // Host -> webview
  useEffect(() => {
    return onHostMessage((message: HostMessage) => {
      switch (message.type) {
        case 'SET_TRACE':
          dispatch({
            type: 'trace',
            snapshots: message.snapshots,
            language: message.language,
            tick: message.currentTick ?? 0,
            fileName: message.fileName,
            activeModule: message.activeModule,
            source: 'host',
            error: message.error,
          });
          break;
        case 'GOTO_TICK':
          dispatch({ type: 'goto', tick: message.tick });
          break;
        case 'SET_CURRICULUM':
        case 'OPEN_CURRICULUM':
          dispatch({ type: 'curriculum', modules: message.modules });
          break;
        case 'SET_ERROR':
          dispatch({ type: 'error', message: message.message });
          break;
      }
    });
  }, []);

  useEffect(() => {
    post({ type: 'REQUEST_CURRICULUM' });
  }, []);

  // Playback
  useEffect(() => {
    if (!state.playing) return;
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (current.tick >= current.snapshots.length - 1) {
        dispatch({ type: 'playing', playing: false });
        return;
      }
      goto(current.tick + 1);
    }, 700 / state.rate);
    return () => window.clearInterval(interval);
  }, [state.playing, state.rate, goto]);

  // Persist across panel hide/show
  useEffect(() => {
    persist({ viewMode: state.viewMode, lens: state.lens, tick: state.tick });
  }, [state.viewMode, state.lens, state.tick]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      snapshot: state.snapshots[state.tick],
      total: state.snapshots.length,
      goto,
      step,
      first,
      last,
      togglePlay,
      setRate,
      setLens,
      setViewMode,
      answerQuiz,
      retrace,
      requestCurriculum,
      loadModule,
      loadFixture,
      openPanel,
    }),
    [
      state,
      goto,
      step,
      first,
      last,
      togglePlay,
      setRate,
      setLens,
      setViewMode,
      answerQuiz,
      retrace,
      requestCurriculum,
      loadModule,
      loadFixture,
      openPanel,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>.');
  return value;
}
