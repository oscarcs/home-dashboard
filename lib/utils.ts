import fs from 'fs';
import type { Request } from 'express';
import { AUTH_PATH } from './paths.js';

/**
 * Get base URL from Express request
 * @param req - Express request object
 * @returns Base URL (e.g., "http://localhost:7272")
 */
export function getBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString()
    .split(',')[0];
  const host = req.get('host');
  return `${proto}://${host}`;
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
