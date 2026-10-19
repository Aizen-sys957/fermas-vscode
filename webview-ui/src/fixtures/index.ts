import type { MemorySnapshot, SupportedLanguage } from '../types';
import microtasks from './js-microtasks.json';
import threeSum from './js-three-sum.json';

export interface Fixture {
  language: SupportedLanguage;
  fileName: string;
  snapshots: MemorySnapshot[];
}

/**
 * Reference traces.
 *
 * These let the panel be built, demoed and reviewed with no engine and no
 * network. They are also the specification the backend must reproduce — if the
 * backend cannot produce a trace shaped like one of these, that is a contract
 * conversation, not a frontend workaround.
 */
export const FIXTURES = {
  'js-microtasks': {
    language: 'javascript',
    fileName: 'microtasks.js',
    snapshots: microtasks as unknown as MemorySnapshot[],
  },
  'js-three-sum': {
    language: 'javascript',
    fileName: 'three-sum.js',
    snapshots: threeSum as unknown as MemorySnapshot[],
  },
} satisfies Record<string, Fixture>;

export type FixtureName = keyof typeof FIXTURES;

export const FIXTURE_NAMES = Object.keys(FIXTURES) as FixtureName[];
