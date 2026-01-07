import fs from 'fs';
import { STATE_PATH, ensureDataDir } from './paths.js';
import type { StateData } from './types.js';

ensureDataDir();

/**
 * Read state from disk
 * @returns State object with all persisted data
 */
function readState(): StateData {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8');
      return JSON.parse(raw) as StateData;
    }
  } catch (err) {
    const error = err as Error;
    console.warn('Failed to read state.json:', error.message);
  }
  return {};
}

/**
 * Write state to disk
 * @param state - State object to persist
 */
function writeState(state: StateData): void {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    const error = err as Error;
    console.warn('Failed to write state.json:', error.message);
  }
}

/**
 * Get a specific key from state
 * @param key - Key to retrieve
 * @param defaultValue - Default value if key doesn't exist
 * @returns Value for the key
 */
export function getStateKey<T>(key: string, defaultValue: T | null = null): T | null {
  const state = readState();
  return state[key] !== undefined ? (state[key] as T) : defaultValue;
}

/**
 * Set a specific key in state
 * @param key - Key to set
 * @param value - Value to set
 */
export function setStateKey(key: string, value: unknown): void {
  const state = readState();
  state[key] = value;
  writeState(state);
}

/**
 * Update multiple keys in state
 * @param updates - Object with key-value pairs to update
 */
export function updateState(updates: Record<string, unknown>): void {
  const state = readState();
  Object.assign(state, updates);
  writeState(state);
}

export { readState, writeState };
