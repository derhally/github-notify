import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const FLUSH_INTERVAL_MS = 1000;
let logFilePath: string | null = null;
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let bytesWritten = 0;

function getLogPath(): string {
  if (!logFilePath) {
    const userDataPath = app.getPath('userData');
    logFilePath = path.join(userDataPath, 'github-notify.log');
  }
  return logFilePath;
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const logPath = getLogPath();
    if (bytesWritten < MAX_LOG_SIZE) return;

    const stats = await fs.promises.stat(logPath).catch(() => null);
    if (!stats || stats.size <= MAX_LOG_SIZE) return;

    const backupPath = logPath + '.old';
    await fs.promises.unlink(backupPath).catch(() => {});
    await fs.promises.rename(logPath, backupPath);
    bytesWritten = 0;
  } catch {
    // Ignore rotation errors
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  const lines = buffer.join('');
  buffer = [];

  try {
    await rotateIfNeeded();
    await fs.promises.appendFile(getLogPath(), lines);
    bytesWritten += Buffer.byteLength(lines);
  } catch {
    // Fallback: lines already printed to console
  }
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;

  buffer.push(line);

  if (!flushTimer) {
    flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  }

  console.log(`[GitHub Notify] ${message}`);
}

export async function flushLogs(): Promise<void> {
  await flush();
}

export function getLogFilePath(): string {
  return getLogPath();
}
