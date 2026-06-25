import { cp, mkdir, rm } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const standaloneNodeModules = path.join(root, '.next', 'standalone', 'node_modules');

const packagesToCopy = [
  ['node_modules', 'sharp'],
  ['node_modules', '@img', 'sharp-linux-x64'],
  ['node_modules', '@img', 'sharp-libvips-linux-x64'],
];

await mkdir(path.join(standaloneNodeModules, '@img'), { recursive: true });

for (const parts of packagesToCopy) {
  const source = path.join(root, ...parts);
  const destination = path.join(standaloneNodeModules, ...parts.slice(1));

  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}
