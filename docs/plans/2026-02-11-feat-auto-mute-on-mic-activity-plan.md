---
title: "Auto-Mute Notifications on Mic Activity"
type: feat
date: 2026-02-11
---

# Auto-Mute Notifications on Mic Activity

Automatically suppress notifications when the user's microphone is in use (e.g., during a video call). This adds a third suppression source alongside quiet hours and manual snooze. Enabled by default.

## Acceptance Criteria

- [x] New `micMuteEnabled` setting (default `true`) in AppSettings
- [x] Toggle appears in Settings UI after the Quiet Hours section, labeled "Mute During Calls"
- [x] When enabled, microphone activity is detected by polling the Windows registry (`CapabilityAccessManager\ConsentStore\microphone`) every 5 seconds via PowerShell
- [x] When any app has `LastUsedTimeStop == 0` and `LastUsedTimeStart > 0`, mic is considered active
- [x] Both packaged (UWP/Store) and non-packaged (desktop .exe) apps are detected via recursive registry enumeration
- [x] When mic is active, `isNotificationSuppressed()` returns `true` -- no toast, TTS, or sound
- [x] Polling continues normally during mic suppression; PRs are tracked silently in the seen set (no notification burst when mic goes inactive)
- [x] Tray icon shows existing `TrayState.Quiet` icon when mic is active
- [x] Tray tooltip indicates mic-based suppression (e.g., "Mic in use - notifications paused")
- [x] Tooltip precedence when multiple sources overlap: Snooze > Mic Active > Quiet Hours
- [x] Mic detector updates tray state on state transitions (active <-> inactive), not just at GitHub poll time
- [x] Concurrency guard prevents overlapping PowerShell invocations (follow `isPlaying` pattern from `sound.ts`)
- [x] PowerShell timeout of 4 seconds per invocation
- [x] Fail-open: if PowerShell fails or times out, mic is assumed NOT in use
- [x] Logging on state transitions only (mic became active / inactive) and errors, not every poll tick
- [x] On system resume (`powerMonitor.on('resume')`), trigger an immediate mic state check
- [x] When setting is toggled off, polling stops (`clearInterval`); when toggled on, polling starts immediately
- [x] Cleanup on app quit (`before-quit`)
- [x] Settings validation updated in `isValidSettings()` for `micMuteEnabled: boolean`
- [x] Requires Windows 10 version 1903+; gracefully degrades on older versions (fail-open)
- [x] TypeScript compiles with no errors

## Context

### Detection Approach

Windows 10 (1903+) tracks microphone access in `CapabilityAccessManager` registry keys. Each app that accesses the mic gets an entry with `LastUsedTimeStart` and `LastUsedTimeStop` FILETIME timestamps. When `LastUsedTimeStop == 0`, the mic is currently in active use by that application.

Registry path: `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`

- Packaged apps (Teams from Store): stored as direct child keys
- Non-packaged apps (Zoom, Discord desktop): stored under `NonPackaged` subkey

PowerShell one-liner for detection:

```powershell
$active = (Get-ChildItem "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone" -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.GetValue("LastUsedTimeStop") -eq 0 -and $_.GetValue("LastUsedTimeStart") -ne 0 }).Count -gt 0
if ($active) { "true" } else { "false" }
```

### Architecture Fit

This integrates as a third condition in the existing `isNotificationSuppressed()` function in `src/main/quiet-hours.ts`. The mic detector is a new module (`src/main/mic-detector.ts`) that follows the single-purpose module pattern used throughout the codebase. It uses `execFile('powershell', ...)` consistent with `src/main/sound.ts`.

The mic detector exposes:
- `startMicDetection(onStateChange: (active: boolean) => void): void`
- `stopMicDetection(): void`
- `isMicActive(): boolean`

The `onStateChange` callback allows `main.ts` to update tray state immediately on transitions, rather than waiting for the next GitHub poll cycle.

## MVP

### src/main/mic-detector.ts (new)

```typescript
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
```

### Changes to existing files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `micMuteEnabled: boolean` to `AppSettings` |
| `src/main/store.ts` | Add default `micMuteEnabled: true` |
| `src/main/ipc-handlers.ts` | Add `typeof obj.micMuteEnabled === 'boolean'` to `isValidSettings()` |
| `src/main/quiet-hours.ts` | Add `isMicActive()` check to `isNotificationSuppressed()` |
| `src/main/main.ts` | Initialize/stop mic detector based on setting, handle `onStateChange` to update tray, trigger check on `powerMonitor.on('resume')`, cleanup on `before-quit` |
| `src/renderer/settings.ts` | Add "Mute During Calls" toggle after Quiet Hours section |
| `src/main/mic-detector.ts` | New -- mic detection module (see above) |

## References

- Suppression check: `src/main/quiet-hours.ts:37-47`
- Poller suppression guard: `src/main/poller.ts:94`
- Sound PowerShell pattern: `src/main/sound.ts:14-37`
- Settings model: `src/shared/types.ts:19-30`
- Settings validation: `src/main/ipc-handlers.ts:17-42`
- Settings UI: `src/renderer/settings.ts:55-82`
- Store defaults: `src/main/store.ts:15-27`
- Tray state management: `src/main/tray.ts:7-8,20-24`
- Power resume handler: `src/main/main.ts:195-197`
- Snooze tooltip precedence: `src/main/main.ts:56-70`
- Registry approach: [MS Q&A: Detect mic access](https://learn.microsoft.com/en-us/answers/questions/214055/is-it-possible-to-get-status-or-event-when-device)
- Registry keys: [CyberEngage: CapabilityAccessManager](https://www.cyberengage.org/post/registry-system-configiuration-tracking-microphone-and-camera-usage-in-windows-program-execution)
