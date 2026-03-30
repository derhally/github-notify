import { execFile, spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';
import { log } from './logger';

const POLL_INTERVAL_MS = 5_000;
const PS_TIMEOUT_MS = 4_000;

const PS_SCRIPT = `
$active = (Get-ChildItem "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.GetValue("LastUsedTimeStop") -eq 0 -and $_.GetValue("LastUsedTimeStart") -ne 0 }).Count -gt 0
if ($active) { "true" } else { "false" }
`;

let intervalId: ReturnType<typeof setInterval> | null = null;
let isChecking = false;
let micActive = false;
let swiftProcess: ChildProcess | null = null;

export function isMicActive(): boolean {
  return micActive;
}

export function startMicDetection(onStateChange: (active: boolean) => void): void {
  stopMicDetection();

  if (process.platform === 'darwin') {
    startMacMicDetection(onStateChange);
  } else {
    checkMic(onStateChange);
    intervalId = setInterval(() => checkMic(onStateChange), POLL_INTERVAL_MS);
  }
}

export function stopMicDetection(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (swiftProcess) {
    swiftProcess.kill();
    swiftProcess = null;
  }
  micActive = false;
  isChecking = false;
}

export function checkMicNow(onStateChange: (active: boolean) => void): void {
  if (process.platform === 'darwin') {
    // On macOS the Swift binary is event-driven; no manual poll needed.
    // The current state is already up-to-date.
    return;
  }
  checkMic(onStateChange);
}

function getMicDetectorPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mic-detector');
  }
  return path.join(app.getAppPath(), 'swift-mic-detector', '.build', 'arm64-apple-macosx', 'release', 'mic-detector');
}

function startMacMicDetection(onStateChange: (active: boolean) => void): void {
  const binaryPath = getMicDetectorPath();
  let lineBuffer = '';

  const proc = spawn(binaryPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  swiftProcess = proc;

  proc.stdout.setEncoding('utf-8');
  proc.stdout.on('data', (chunk: string) => {
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed) as { micActive: boolean };
        const wasActive = micActive;
        micActive = data.micActive;
        if (micActive !== wasActive) {
          log(`Mic ${micActive ? 'active' : 'inactive'}`);
          onStateChange(micActive);
        }
      } catch {
        log(`Mic detector: invalid JSON: ${trimmed}`);
      }
    }
  });

  proc.stderr.setEncoding('utf-8');
  proc.stderr.on('data', (data: string) => {
    log(`Mic detector stderr: ${data.trim()}`);
  });

  proc.on('error', (err) => {
    log(`Mic detector failed to start: ${err.message}`);
    swiftProcess = null;
    micActive = false;
    onStateChange(false);
  });

  proc.on('exit', (code) => {
    swiftProcess = null;
    if (code !== null && code !== 0) {
      log(`Mic detector exited with code ${code}`);
      micActive = false;
      onStateChange(false);
    }
  });

  log('macOS mic detector started');
}

function checkMic(onStateChange: (active: boolean) => void): void {
  if (isChecking) return;
  isChecking = true;

  execFile(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
    { timeout: PS_TIMEOUT_MS },
    (error, stdout) => {
      isChecking = false;
      const wasActive = micActive;

      if (error) {
        log(`Mic detection error: ${error.message}`);
        micActive = false; // fail-open
      } else {
        micActive = stdout.trim() === 'true';
      }

      if (micActive !== wasActive) {
        log(`Mic ${micActive ? 'active' : 'inactive'}`);
        onStateChange(micActive);
      }
    },
  );
}
