import fs from 'fs';
import { AUTH_PATH } from './paths';

/**
 * Get base URL from request headers
 * @param req - Request object with headers
 * @returns Base URL (e.g., "http://localhost:7272")
 */
export function getBaseUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const protoStr = typeof proto === 'string' ? proto : proto?.[0] || 'http';
  const host = req.headers.host || 'localhost';
  const hostStr = typeof host === 'string' ? host : host?.[0] || 'localhost';
  return `${protoStr.split(',')[0]}://${hostStr}`;
}

/**
 * Read auth.json file
 * @returns Auth data or empty object
 */
export function readAuthFile(): Record<string, unknown> {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8')) as Record<string, unknown>;
    }
  } catch (e) {
    const error = e as Error;
    console.warn('Failed to read auth file:', error.message);
  }
  return {};
}

/**
 * Write auth.json file
 * @param auth - Auth data to write
 */
export function writeAuthFile(auth: Record<string, unknown>): void {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2));
}

/**
 * Update specific section of auth.json
 * @param section - Section name (e.g., 'google')
 * @param data - Data to set for that section
 */
export function updateAuthSection(section: string, data: unknown): void {
  const auth = readAuthFile();
  auth[section] = data;
  writeAuthFile(auth);
}

/**
 * Delete specific section from auth.json
 * @param section - Section name to delete
 */
export function deleteAuthSection(section: string): void {
  const auth = readAuthFile();
  delete auth[section];
  writeAuthFile(auth);
}
