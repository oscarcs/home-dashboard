import fs from 'fs';
import os from 'os';
import path from 'path';

export function findPuppeteerExecutable(): string | undefined {
  const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  const platform = os.platform();

  if (platform === 'darwin') {
    return firstExisting([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]);
  }

  if (platform === 'linux') {
    return firstExisting([
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ]) || findCachedHeadlessShell();
  }

  return undefined;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find(candidate => fs.existsSync(candidate));
}

function findCachedHeadlessShell(): string | undefined {
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
  if (!fs.existsSync(cacheDir)) return undefined;

  const versions = fs.readdirSync(cacheDir)
    .filter(entry => fs.statSync(path.join(cacheDir, entry)).isDirectory())
    .sort(compareVersionDirectories)
    .reverse();

  for (const version of versions) {
    const executable = path.join(
      cacheDir,
      version,
      'chrome-headless-shell-linux64',
      'chrome-headless-shell'
    );
    if (fs.existsSync(executable)) return executable;
  }

  return undefined;
}

function compareVersionDirectories(a: string, b: string): number {
  const aVersion = a.replace(/^linux-/, '').split('.').map(Number);
  const bVersion = b.replace(/^linux-/, '').split('.').map(Number);
  const maxLength = Math.max(aVersion.length, bVersion.length);

  for (let i = 0; i < maxLength; i++) {
    const diff = (aVersion[i] || 0) - (bVersion[i] || 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b);
}
