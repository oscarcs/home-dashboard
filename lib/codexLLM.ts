import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Logger } from './types';

type LLMProvider = 'codex' | 'gemini' | 'none';

interface GenerateCodexJSONOptions {
  prompt: string;
  schema: Record<string, unknown>;
  logger?: Logger;
  timeoutMs?: number;
}

interface GenerateCodexJSONResult<T> {
  data: T;
  durationMs: number;
  model: string;
  tokensUsed: number | null;
}

export function getLLMProvider(): LLMProvider {
  const raw = (process.env.LLM_PROVIDER || 'codex').trim().toLowerCase();
  if (raw === 'gemini' || raw === 'none') return raw;
  return 'codex';
}

export function isConfiguredLLMProvider(): boolean {
  const provider = getLLMProvider();
  if (provider === 'none') return false;
  if (provider === 'gemini') return !!process.env.GEMINI_API_KEY;
  return true;
}

export function getLLMSignature(): string {
  const provider = getLLMProvider();
  if (provider === 'codex') {
    return JSON.stringify({
      provider,
      model: process.env.CODEX_LLM_MODEL || 'gpt-5.4-mini',
      effort: process.env.CODEX_LLM_REASONING_EFFORT || 'low',
    });
  }

  if (provider === 'gemini') {
    return JSON.stringify({
      provider,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    });
  }

  return JSON.stringify({ provider });
}

export async function generateCodexJSON<T>({
  prompt,
  schema,
  logger = console,
  timeoutMs = Number(process.env.CODEX_LLM_TIMEOUT_MS || 90000),
}: GenerateCodexJSONOptions): Promise<GenerateCodexJSONResult<T>> {
  const codexBin = process.env.CODEX_BIN || 'codex';
  const model = process.env.CODEX_LLM_MODEL || 'gpt-5.4-mini';
  const effort = process.env.CODEX_LLM_REASONING_EFFORT || 'low';
  const workdir = process.env.CODEX_LLM_WORKDIR || os.tmpdir();
  const startedAt = Date.now();

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'home-dashboard-codex-'));
  const schemaPath = path.join(tmpDir, 'schema.json');
  const outputPath = path.join(tmpDir, 'response.json');

  await writeFile(schemaPath, JSON.stringify(schema), 'utf8');

  const args = [
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-m',
    model,
    '-c',
    'approval_policy="never"',
    '-c',
    `model_reasoning_effort="${effort}"`,
    '-c',
    'model_verbosity="low"',
    '-C',
    workdir,
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputPath,
    '-',
  ];

  try {
    const output = await runCodex(codexBin, args, prompt, timeoutMs);
    const raw = (await readFile(outputPath, 'utf8')).trim();
    const parsed = JSON.parse(raw) as T;

    return {
      data: parsed,
      durationMs: Date.now() - startedAt,
      model,
      tokensUsed: parseTokensUsed(output),
    };
  } catch (error) {
    logger.warn?.('[CodexLLM] Generation failed:', error);
    throw error;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function runCodex(
  codexBin: string,
  args: string[],
  input: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, args, {
      env: {
        ...process.env,
        NO_COLOR: '1',
        TERM: process.env.TERM || 'dumb',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const invocationId = randomUUID();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);

    child.stdout.on('data', chunk => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderrChunks.push(Buffer.from(chunk)));
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (timedOut) {
        reject(new Error(`Codex timed out after ${timeoutMs}ms (${invocationId})`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}: ${tail(stdout + stderr)}`));
        return;
      }

      resolve(stdout + stderr);
    });

    child.stdin.end(input);
  });
}

function parseTokensUsed(output: string): number | null {
  const match = output.match(/tokens used\s+([\d,]+)/i);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}

function tail(value: string): string {
  return value.trim().slice(-1200);
}
