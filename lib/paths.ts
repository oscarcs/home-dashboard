import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.join(__dirname, '..');
export const DATA_DIR: string = process.env.DATA_DIR || path.join(ROOT, 'data');

export function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
}

export const AUTH_PATH = path.join(DATA_DIR, 'auth.json');
export const STATE_PATH = path.join(DATA_DIR, 'state.json');
