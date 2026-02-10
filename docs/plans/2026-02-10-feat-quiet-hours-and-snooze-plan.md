---
title: "Quiet Hours and Snooze"
type: feat
date: 2026-02-10
---

# Quiet Hours and Snooze

## Overview

Add two complementary ways to suppress notifications without stopping polling:

1. **Quiet Hours** -- A recurring daily schedule (e.g., 10 PM to 8 AM) during which notifications are silently suppressed. PRs are still tracked in the seen set so they never trigger late notifications when quiet hours end.
2. **Snooze** -- A one-time temporary mute accessible from the tray context menu with fixed-preset durations (30 min, 1 hr, 2 hr, 4 hr). The snooze expires automatically.

Both features suppress notification dispatch only. Polling continues normally and new PRs are added to the seen set, ensuring no notification burst when quiet hours end or snooze expires.

A distinct tray icon indicates when quiet hours or snooze is active.

## Implementation

### Phase 1: Types and Store

- [x] Add `TrayState.Quiet` to the `TrayState` enum in `src/shared/types.ts`
- [x] Add quiet hours fields to `AppSettings` in `src/shared/types.ts`:
  ```typescript
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:MM" 24-hour format
  quietHoursEnd: string;   // "HH:MM" 24-hour format
  ```
- [x] Add defaults in `src/main/store.ts`: `quietHoursEnabled: false`, `quietHoursStart: '22:00'`, `quietHoursEnd: '08:00'`
- [x] Add `snoozeUntil` as a top-level `StoreSchema` field (not part of `AppSettings`, since it is ephemeral runtime state):
  ```typescript
  interface StoreSchema {
    encryptedToken: string;
    settings: AppSettings;
    seenPRs: SeenEntry[];
    snoozeUntil: number; // epoch ms, 0 = not snoozed
  }
  ```
- [x] Add store accessors: `getSnoozeUntil()`, `setSnoozeUntil(until: number)`, `clearSnooze()`
- [x] Add validation for quiet hours fields in `isValidSettings()` in `src/main/ipc-handlers.ts`:
  - `quietHoursEnabled` is boolean
  - `quietHoursStart` and `quietHoursEnd` match `/^\d{2}:\d{2}$/` and represent valid times (hours 0-23, minutes 0-59)

### Phase 2: Quiet Hours Logic

- [x] Create `src/main/quiet-hours.ts` with the schedule evaluation logic:
  ```typescript
  export function isInQuietHours(start: string, end: string): boolean
  ```
  - Handles overnight ranges (e.g., 22:00 to 08:00) and same-day ranges (e.g., 13:00 to 14:00)
  - Compares against the current local time
- [x] Add a combined check function:
  ```typescript
  export function isNotificationSuppressed(): boolean
  ```
  - Returns `true` if quiet hours is enabled and currently active, OR if snooze is active (`snoozeUntil > Date.now()`)
  - Auto-clears expired snooze (sets `snoozeUntil` to 0)

### Phase 3: Poller Integration

- [x] Import `isNotificationSuppressed` in `src/main/poller.ts`
- [x] Add suppression check before notification dispatch (before line 93), NOT at the poll guard (line 56):
  ```typescript
  if (newPRs.length > 0 && !isNotificationSuppressed()) {
    notifyNewPRs(newPRs, settings.notificationMode, settings.notificationSound, settings.customSoundPath);
  } else if (newPRs.length > 0) {
    log(`${newPRs.length} new PRs suppressed (quiet hours/snooze active)`);
  }
  ```
  This ensures PRs are still added to the seen set (lines 97-98 execute regardless) so no notification burst occurs when suppression ends.

### Phase 4: Tray Icon and Context Menu

- [x] Create `assets/tray-icon-quiet.png` -- A GitHub mark icon with a visual indicator (e.g., moon overlay or muted appearance) to show quiet/snooze state
- [x] Add `TrayState.Quiet` to `ICON_FILENAMES` map in `src/main/tray.ts`
- [x] Add snooze submenu to the tray context menu in `buildContextMenu()`:
  ```typescript
  {
    label: 'Snooze',
    submenu: [
      { label: '30 minutes', click: () => callbacks.onSnooze(30) },
      { label: '1 hour', click: () => callbacks.onSnooze(60) },
      { label: '2 hours', click: () => callbacks.onSnooze(120) },
      { label: '4 hours', click: () => callbacks.onSnooze(240) },
    ],
    enabled: currentState !== TrayState.Unconfigured,
  },
  ```
- [x] When snooze is active, replace the "Snooze" submenu with a single "Cancel Snooze" item that shows remaining time:
  ```typescript
  {
    label: `Cancel Snooze (${remainingText})`,
    click: () => callbacks.onCancelSnooze(),
  },
  ```
- [x] Add `onSnooze: (durationMinutes: number) => void` and `onCancelSnooze: () => void` to `TrayCallbacks` interface
- [x] Export `setSnoozeActive(active: boolean)` or use `setTrayState` to switch to `TrayState.Quiet` when snooze or quiet hours is active

### Phase 5: Main Process Wiring

- [x] Wire `onSnooze` callback in `main.ts`:
  - Call `setSnoozeUntil(Date.now() + durationMinutes * 60 * 1000)`
  - Call `setTrayState(TrayState.Quiet)` and update tooltip to show snooze end time
  - Set a `setTimeout` to auto-restore `TrayState.Normal` and update the context menu when snooze expires
  - Log the snooze activation
- [x] Wire `onCancelSnooze` callback:
  - Call `clearSnooze()`
  - Restore `TrayState.Normal`
  - Update context menu
  - Log cancellation
- [x] On app start (in `app.whenReady`), check if a persisted snooze is still active:
  - If `getSnoozeUntil() > Date.now()`, set the appropriate tray state and schedule the expiry timer
  - If `getSnoozeUntil() <= Date.now()` and `> 0`, clear it
- [x] On each poll cycle, update tray state based on quiet hours status:
  - If quiet hours is enabled and currently active, set `TrayState.Quiet` (unless already in that state)
  - If quiet hours becomes inactive and no snooze is active, restore `TrayState.Normal`

### Phase 6: Settings UI

- [x] Add quiet hours controls to the settings form in `src/renderer/settings.ts`:
  ```html
  <div class="form-group">
    <div class="toggle-row">
      <label>Quiet Hours</label>
      <label class="toggle">
        <input type="checkbox" id="quiet-hours-enabled" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="form-group" id="quiet-hours-times" style="display: none;">
    <label>Schedule</label>
    <div class="time-row">
      <input type="time" id="quiet-hours-start" />
      <span>to</span>
      <input type="time" id="quiet-hours-end" />
    </div>
    <div class="hint">Notifications are suppressed during this window. Polling continues normally.</div>
  </div>
  ```
- [x] Add DOM element references and event listeners for the new controls
- [x] Show/hide time inputs based on the enabled checkbox
- [x] Wire the new fields into `saveSettings()` and `loadSettings()`
- [x] Add CSS for `.time-row` layout (flexbox, gap between inputs)
- [x] Increase the settings window height in `main.ts` if needed (currently 660px)

### Phase 7: Tooltip Updates

- [x] Update tray tooltip to indicate quiet hours or snooze status:
  - During quiet hours: `"GitHub Notify - Quiet hours active\n5 PRs tracked\nLast check: 10:30 PM"`
  - During snooze: `"GitHub Notify - Snoozed until 3:00 PM\n5 PRs tracked\nLast check: 1:00 PM"`
  - Normal: unchanged (current behavior)

## Technical Considerations

- **Notification suppression, not polling suppression**: The key design decision is to suppress at the notification dispatch point in `poller.ts` (before line 93) rather than at the poll guard (line 56). This ensures PRs are always tracked in the seen set, so there is no burst of notifications when suppression ends. This is the better user experience.
- **Quiet hours overnight handling**: The schedule must handle overnight ranges where `start > end` (e.g., 22:00 to 08:00). The `isInQuietHours` function checks: if start > end, the current time is in quiet hours if `now >= start OR now < end`; otherwise, `now >= start AND now < end`.
- **Snooze vs. quiet hours priority**: Both are checked independently. If either is active, notifications are suppressed. There is no conflict -- snooze and quiet hours can overlap safely.
- **Snooze persistence**: Snooze is persisted to `electron-store` as a top-level field so it survives app restarts. On startup, if the persisted snooze time has passed, it is cleared.
- **Snooze timer accuracy**: Using `setTimeout` for the auto-expiry is sufficient since it only needs to update the tray icon/menu. The actual notification suppression check is done on each poll cycle via `isNotificationSuppressed()`.
- **Tray icon state precedence**: `TrayState.Unconfigured` > `TrayState.Error` > `TrayState.Quiet` > `TrayState.Normal`. The quiet state is only shown when the app is otherwise in a healthy state.
- **HH:MM validation**: The `<input type="time">` in the renderer produces "HH:MM" format natively. The main process validates with a regex and range check.
- **No IPC changes for snooze**: Snooze is entirely tray-driven (context menu -> callback -> store). It does not need IPC channels or preload bridge changes. Only quiet hours settings flow through IPC via the existing `settings:save`/`settings:get` channels.

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `TrayState.Quiet`, add `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd` to `AppSettings` |
| `src/main/store.ts` | Add defaults for quiet hours fields, add `snoozeUntil` schema field and accessors |
| `src/main/ipc-handlers.ts` | Add validation for quiet hours fields in `isValidSettings()` |
| `src/main/quiet-hours.ts` | New -- `isInQuietHours()` and `isNotificationSuppressed()` |
| `src/main/poller.ts` | Add suppression check before notification dispatch |
| `src/main/tray.ts` | Add `TrayState.Quiet` icon, snooze submenu, `onSnooze`/`onCancelSnooze` callbacks |
| `assets/tray-icon-quiet.png` | New -- tray icon for quiet/snooze state |
| `src/main/main.ts` | Wire snooze callbacks, manage snooze timer lifecycle, update tray state on poll |
| `src/renderer/settings.ts` | Add quiet hours toggle and time picker UI |
| `src/renderer/styles.css` | Add `.time-row` styles |

## Acceptance Criteria

- [x] Quiet hours can be enabled/disabled in settings with start and end times
- [x] During quiet hours, no notifications are shown (toast, TTS, or sound)
- [x] Polling continues normally during quiet hours; PRs are tracked silently
- [x] No notification burst when quiet hours end -- already-seen PRs are not re-notified
- [x] Snooze can be activated from the tray context menu with 30min, 1hr, 2hr, 4hr presets
- [x] Snooze expires automatically and the tray icon returns to normal
- [x] Active snooze can be cancelled from the tray menu
- [x] A distinct tray icon is shown during quiet hours or snooze
- [x] Tray tooltip indicates quiet hours or snooze status
- [x] Snooze survives app restart (persisted to store)
- [x] Overnight quiet hours schedules work correctly (e.g., 22:00 to 08:00)
- [x] Settings persist across app restarts
- [x] Invalid quiet hours times are rejected by validation
- [x] TypeScript compiles with no errors

## References

- Tray state management: `src/main/tray.ts:7-8,20-24,43-75`
- Notification dispatch: `src/main/poller.ts:93-95`
- Poll guard: `src/main/poller.ts:56`
- Settings model: `src/shared/types.ts:19-26`
- Settings validation: `src/main/ipc-handlers.ts:17-35`
- Settings UI: `src/renderer/settings.ts:6-73`
- Store schema: `src/main/store.ts:5-9`
- Store defaults: `src/main/store.ts:11-24`
- Main process callbacks: `src/main/main.ts:88-110`
