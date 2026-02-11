import { execFile } from 'node:child_process';
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

export function isMicActive(): boolean {
  return micActive;
}

export function startMicDetection(onStateChange: (active: boolean) => void): void {
  stopMicDetection();
  checkMic(onStateChange);
  intervalId = setInterval(() => checkMic(onStateChange), POLL_INTERVAL_MS);
}

export function stopMicDetection(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  micActive = false;
  isChecking = false;
}

export function checkMicNow(onStateChange: (active: boolean) => void): void {
  checkMic(onStateChange);
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
