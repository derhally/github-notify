---
title: "feat: Add macOS support"
type: feat
status: active
date: 2026-03-29
origin: docs/brainstorms/2026-03-29-macos-support-requirements.md
---

# feat: Add macOS support

## Overview

Add full macOS support to GitHub Notify so the app runs as a native menu bar app on Apple Silicon Macs with feature parity to the Windows version. This involves replacing Windows-specific implementations (PowerShell mic detection, PowerShell sound playback, Squirrel installer) with macOS equivalents, adding DMG packaging, and restructuring CI/CD for multi-platform builds.

## Problem Frame

GitHub Notify is a Windows-only tray app. Mac users cannot use it because three features use Windows-specific APIs (PowerShell/registry for mic detection, PowerShell for sound playback, Squirrel for installation) and the build/CI pipeline only targets Windows. The core Electron APIs (notifications, safeStorage, auto-launch, tray) are already cross-platform. (see origin: docs/brainstorms/2026-03-29-macos-support-requirements.md)

## Requirements Trace

- R1. Platform-specific code gated with inline `process.platform` conditionals in `mic-detector.ts`, `sound.ts`, `main.ts`, and `tray.ts`
- R2. Mic detection via long-lived Swift CLI binary using CoreAudio `kAudioDevicePropertyDeviceIsRunningSomewhere`
- R3. Sound playback via `afplay` on macOS
- R4. TTS via `say` npm package (already cross-platform)
- R5. Token encryption via `safeStorage` / Keychain (already cross-platform)
- R6. Auto-launch via `setLoginItemSettings` (already cross-platform)
- R7. Tray icon and context menu on macOS with all states
- R8. Toast notifications via Electron `Notification` API (already cross-platform)
- R9. DMG packaging via `MakerDMG`
- R10. Apple Silicon (arm64) only
- R11. No code signing (deferred)
- R12. CI builds on both Windows and macOS runners
- R13. Both platform artifacts published to same GitHub Release
- R14. `.icns` app icon at `assets/app-icon.icns`
- R15. Tray icons as macOS template images (monochrome, @2x Retina)
- R16. `electron-squirrel-startup` is safe on macOS (no change needed)
- R17. `tray.on('click')` gated to Windows only
- R18. macOS menu bar visibility difference is acceptable

## Scope Boundaries

- No code signing or notarization (deferred)
- No Intel (x64) macOS build
- No Linux support
- No universal binary; arm64 only
- No changes to existing Windows behavior or features
- No new test infrastructure (project has none currently)

## Context & Research

### Relevant Code and Patterns

- `src/main/mic-detector.ts` — Entire file is Windows-only. Spawns short-lived `execFile('powershell', ...)` calls on 5s interval with 4s timeout. Exports: `isMicActive()`, `startMicDetection(callback)`, `stopMicDetection()`, `checkMicNow(callback)`. Fail-open pattern: errors set `micActive = false`
- `src/main/sound.ts` — Entire file is Windows-only. Uses `execFile('powershell', ...)` to play WAV via `Media.SoundPlayer`. Has `isPlaying` mutex. Single export: `playCustomSound(filePath)`
- `src/main/tray.ts` — State machine with `TrayState` enum (Normal, Error, Unconfigured, Quiet). Icon cache in `Map<TrayState, NativeImage>`, invalidated on theme change. `LIGHT_THEME_OVERRIDES` maps Normal→dark icon. `tray.on('click')` calls `popUpContextMenu()`
- `src/main/main.ts` — `electron-squirrel-startup` import (line 3), `app.setAppUserModelId` (line 19), `powerMonitor.on('resume')` triggers `checkMicNow()`
- `forge.config.ts` — `MakerSquirrel` only, `icon: 'assets/app-icon'` (no extension), ASAR enabled, `OnlyLoadAppFromAsar` fuse, no `extraResource`, no `appBundleId`
- `vite.main.config.ts` — Custom `copy-tray-icons` plugin copies `tray-icon*` from `assets/` to `.vite/build/assets/`
- `.github/workflows/release-please.yml` — Two jobs: `release-please` on ubuntu, `build-and-release` on `windows-latest` calling `npm run publish`
- Assets: `app-icon.ico`, 5 tray PNGs (16x16 colored emoji faces)

### Institutional Learnings

- Draft release flow: release-please creates draft release with tag → forge publisher finds draft by tag and uploads artifacts. `tag-git-on-release: true` is critical and must not be removed (see `docs/solutions/integration-issues/release-please-draft-tags-github-actions-electron-forge.md`)
- Both release-please and forge touch the same release by design. `generateReleaseNotes: true` was removed from forge config because release-please handles changelog (see `docs/solutions/integration-issues/electron-forge-github-actions-release.md`)
- `contents: write` permission is required for any job uploading release assets

### External References

- Electron Forge MakerDMG: defaults to `platforms: ['darwin']`, MakerSquirrel defaults to `['win32']` — just list both makers, Forge only runs platform-matching makers
- `packagerConfig.extraResource`: copies files outside ASAR to `<App>.app/Contents/Resources/` on macOS, resolved at runtime via `process.resourcesPath`
- macOS template images: monochrome (black + alpha), auto-invert for dark/light mode. Use `setTemplateImage(true)` or `Template` filename suffix. @2x naming for Retina
- `.icns` generation: `sips` for resizing + `iconutil -c icns` for conversion
- GitHub Actions `macos-latest` runners have Swift and Xcode pre-installed
- PublisherGithub has no concurrency protection — confirmed TOCTOU race on parallel uploads (see `PublisherGithub.ts` source)
- ProZsolt/onair: reference Objective-C implementation of CoreAudio `kAudioDevicePropertyDeviceIsRunningSomewhere` listener

## Key Technical Decisions

- **Inline platform conditionals, not an abstraction layer**: Only 3-4 files need platform branching. `if (process.platform === 'darwin')` inside existing functions is simpler than a platform module directory. (see origin: R1)
- **Swift CLI binary over N-API addon**: Project has no native addon infrastructure (no node-gyp). A Swift binary spawned via `child_process` mirrors the existing PowerShell pattern and avoids electron-rebuild complexity. (see origin: Key Decisions)
- **Event-driven mic detection with fail-open recovery**: The Swift binary runs as a long-lived process emitting state changes. On unexpected exit, fail-open (set `micActive = false`), log warning. User can toggle mic mute off/on in settings to re-spawn. On system resume, kill and restart the binary to guarantee fresh CoreAudio state
- **`app.dock.hide()` on macOS**: Essential for a tray-only app. Without it, users see a persistent dock icon they cannot interact with meaningfully. Discovered via flow analysis — not in origin doc
- **`appBundleId` in packagerConfig**: Required for proper Keychain identity (`safeStorage`), notification grouping, and login item persistence. Without it, these features bind to the generic Electron bundle ID. Discovered via flow analysis — not in origin doc
- **Separate CI build and publish steps**: Use `electron-forge make` (not `publish`) in parallel matrix jobs, upload artifacts, then a single downstream job uploads to the GitHub Release with `gh release upload --clobber`. Eliminates the PublisherGithub TOCTOU race condition
- **`setTemplateImage(true)` over filename convention**: Simpler with the existing icon loading architecture. Skip `LIGHT_THEME_OVERRIDES` on macOS since template images handle dark/light automatically
- **Keep `.wav`-only sound format**: Cross-platform consistency. `afplay` supports `.wav` so no issue on macOS

## Open Questions

### Resolved During Planning

- **Dock icon on macOS**: Call `app.dock.hide()` early in app lifecycle. Standard for macOS tray apps. Without it, users see a bouncing dock icon on launch and persistent dock icon during operation
- **macOS bundle identifier**: Add `appBundleId: 'com.derhally.github-notify'` to `packagerConfig` for proper Keychain, notification, and login item identity
- **Swift binary crash recovery**: Fail-open (set `micActive = false`), log warning. No auto-restart. User toggles mic mute off/on in settings to retry. Consistent with existing Windows fail-open pattern
- **`checkMicNow()` on macOS**: Kill and restart the Swift binary. Guarantees fresh CoreAudio state after system sleep. Startup cost of a native binary is negligible
- **Swift binary not found at runtime**: Disable mic detection silently, log warning. Do NOT set error tray state (core PR notification feature still works)
- **CI race condition**: Separate build (matrix) and publish (single job) steps. Both platform jobs use `electron-forge make`, upload artifacts to workflow, final job downloads all and uploads with `gh release upload --clobber`
- **Template images vs dark-mode overrides**: Use `setTemplateImage(true)` on macOS. Skip `LIGHT_THEME_OVERRIDES` on macOS since template images auto-invert. Create monochrome icon assets for macOS
- **Swift binary JSON protocol**: Line-delimited JSON, one object per line: `{"micActive": boolean}`. Parse per-line, log and skip malformed lines
- **`afplay` timeout**: 30-second timeout via `execFile` `timeout` option to prevent hung process from blocking all future sounds
- **`electron-squirrel-startup` on macOS**: Safe — returns `false` on non-Windows. The package checks for Squirrel-specific `process.argv` entries that only exist on Windows. No code change needed (R16 confirmed)
- **`.icns` generation**: Use `sips` + `iconutil` locally on macOS. One-time manual step, commit the result to `assets/app-icon.icns`
- **Tray icon approach for error/quiet/unconfigured states**: Use `setTemplateImage(true)` for all states (monochrome on macOS). Different icon shapes convey state instead of color. macOS auto-inverts all template icons for dark/light mode

### Deferred to Implementation

- Exact monochrome icon designs for each tray state — must be distinguishable as silhouettes without color
- Whether `nativeImage.createFromPath` correctly loads @2x variants when using `setTemplateImage(true)` (test visually on macOS)
- Bluetooth microphone reporting behavior with CoreAudio — known limitation, fail-open handles it
- Default audio device switching during operation — Unit 5 now handles this via a listener on `kAudioHardwarePropertyDefaultInputDevice`, but the interaction with existing device listeners should be verified during implementation

## Implementation Units

- [ ] **Unit 1: Generate macOS icon assets**

**Goal:** Create the `.icns` app icon and monochrome template tray icon PNGs required for macOS builds.

**Requirements:** R14, R15

**Dependencies:** None — prerequisite for all other units

**Files:**
- Create: `assets/app-icon.icns`
- Create: `assets/tray-icon-mac.png` (16x16, monochrome black + alpha, normal state)
- Create: `assets/tray-icon-mac@2x.png` (32x32, monochrome black + alpha, normal state)
- Create: `assets/tray-icon-mac-error.png` (16x16, monochrome, error state — distinct shape)
- Create: `assets/tray-icon-mac-error@2x.png` (32x32, monochrome, error state)
- Create: `assets/tray-icon-mac-unconfigured.png` (16x16, monochrome, unconfigured state — distinct shape)
- Create: `assets/tray-icon-mac-unconfigured@2x.png` (32x32, monochrome, unconfigured state)
- Create: `assets/tray-icon-mac-quiet.png` (16x16, monochrome, quiet state — distinct shape)
- Create: `assets/tray-icon-mac-quiet@2x.png` (32x32, monochrome, quiet state)

**Approach:**
- Extract the largest PNG from `app-icon.ico` using ImageMagick or a similar tool
- Use `sips` to generate all required sizes for the `.iconset` directory
- Use `iconutil -c icns` to produce `app-icon.icns`
- Create monochrome tray icons: black shapes on transparent background. Each state should have a visually distinct silhouette (not just color differences)
- The `copy-tray-icons` Vite plugin already globs `tray-icon*` so the new files will be picked up automatically

**Patterns to follow:**
- Existing tray icons in `assets/` (16x16 PNG, RGBA)

**Verification:**
- `app-icon.icns` exists and contains all required sizes (16 through 1024)
- All 8 macOS tray icon files exist with correct dimensions
- Tray icons are monochrome (black + alpha only) and visually distinguishable per state

---

- [ ] **Unit 2: Forge config, macOS app lifecycle, and platform gates**

**Goal:** Configure Electron Forge for macOS DMG builds, add macOS-specific app lifecycle behavior, and apply platform gates to Windows-specific code paths.

**Requirements:** R1, R9, R10, R16, R17

**Dependencies:** Unit 1 (`.icns` must exist for macOS builds)

**Files:**
- Modify: `forge.config.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/tray.ts`
- Modify: `package.json`

**Approach:**
- Install `@electron-forge/maker-dmg` as a dev dependency
- Add `MakerDMG` to the `makers` array in `forge.config.ts`. No platform-gating code needed — MakerDMG defaults to `platforms: ['darwin']` and MakerSquirrel defaults to `['win32']`
- Add `appBundleId: 'com.derhally.github-notify'` to `packagerConfig` for macOS identity (Keychain, notifications, login items)
- Do NOT add `extraResource` here — that belongs in Unit 6 when the Swift binary exists. Adding it now would break `npm run make` since the binary path does not exist yet
- In `main.ts`: add `if (process.platform === 'darwin') app.dock.hide()` early in the ready handler (before `createTray`)
- In `tray.ts`: gate `tray.on('click', () => tray?.popUpContextMenu())` to `process.platform !== 'darwin'`
- Verify `electron-squirrel-startup` import is safe on macOS (it is — returns `false` on non-Windows)

**Patterns to follow:**
- Existing `forge.config.ts` maker configuration pattern (class-based constructors)
- Existing `main.ts` app lifecycle code in the `app.whenReady()` handler

**Test scenarios:**
- Happy path: `npm run make` on macOS produces a DMG in `out/make/`
- Happy path: App launches on macOS without a dock icon, tray icon appears in menu bar
- Happy path: Left-clicking tray icon on macOS opens context menu once (no double-trigger)
- Edge case: `npm run make` on Windows still produces Squirrel installer (no regression)
- Edge case: `electron-squirrel-startup` returns `false` on macOS, app does not quit

**Verification:**
- `npm run make` succeeds on macOS and produces a `.dmg` file
- `npm run make` still succeeds on Windows (no regression)
- App launches on macOS as a menu bar app (no dock icon)
- Tray context menu opens correctly on macOS left-click

---

- [ ] **Unit 3: macOS tray icon rendering**

**Goal:** Load and display monochrome template tray icons on macOS with automatic dark/light mode support, while preserving the existing colored icon behavior on Windows.

**Requirements:** R7, R15

**Dependencies:** Unit 1 (macOS icon assets), Unit 2 (platform gate for click handler)

**Files:**
- Modify: `src/main/tray.ts`
- Modify: `vite.main.config.ts` (if the glob pattern needs updating)

**Approach:**
- Add a macOS icon filename map alongside the existing `ICON_FILENAMES`. On macOS, map each `TrayState` to the corresponding `tray-icon-mac-*.png` file
- After loading each `NativeImage` on macOS, call `image.setTemplateImage(true)` so macOS handles dark/light inversion automatically
- On macOS, skip the `LIGHT_THEME_OVERRIDES` logic entirely — template images make it unnecessary. The `nativeTheme.on('updated')` listener can remain (it still invalidates the cache), but the override map should not apply on macOS
- Verify the `copy-tray-icons` Vite plugin glob `tray-icon*` matches the new `tray-icon-mac*` files — it should, since the glob is prefix-based
- For @2x Retina: Electron's `nativeImage.createFromPath` auto-detects `@2x` files if they share the same base path. Load `tray-icon-mac.png` and Electron picks up `tray-icon-mac@2x.png` automatically

**Patterns to follow:**
- Existing `loadIcons()` and `getIconFilename()` functions in `tray.ts`
- Existing `ICON_FILENAMES` map structure

**Test scenarios:**
- Happy path: Normal state shows the monochrome robot icon on macOS
- Happy path: Error state shows a visually distinct monochrome icon on macOS
- Happy path: Quiet state shows a visually distinct monochrome icon on macOS
- Happy path: Icon auto-inverts when switching between macOS dark and light mode
- Happy path: Retina displays show crisp @2x icons
- Edge case: Theme change on macOS invalidates cache and reloads correct icon
- Edge case: Windows behavior unchanged — colored icons, LIGHT_THEME_OVERRIDES active

**Verification:**
- All four tray states display distinct, correctly rendered icons on macOS
- Icons adapt automatically to macOS dark/light mode without the override map
- Windows icon behavior is unchanged

---

- [ ] **Unit 4: macOS sound playback via afplay**

**Goal:** Replace the PowerShell `Media.SoundPlayer` approach with macOS's built-in `afplay` command for custom notification sounds.

**Requirements:** R3

**Dependencies:** None (independent of other units)

**Files:**
- Modify: `src/main/sound.ts`

**Approach:**
- Add a `process.platform` check at the top of `playCustomSound()`
- On macOS: use `execFile('afplay', [filePath])` with a 30-second `timeout` option
- On Windows: keep the existing PowerShell `Media.SoundPlayer` approach unchanged
- The file extension validation (`.wav` only) and `isPlaying` mutex apply to both platforms
- `afplay` supports `.wav` natively, so no format change needed

**Patterns to follow:**
- Existing `playCustomSound()` structure: validation → mutex check → `execFile` → callback resets mutex
- Existing `PS_TIMEOUT_MS` pattern from `mic-detector.ts` for child process timeouts

**Test scenarios:**
- Happy path: Playing a `.wav` file via `afplay` produces audible sound on macOS
- Happy path: Playing a `.wav` file via PowerShell still works on Windows (no regression)
- Edge case: `isPlaying` mutex prevents overlapping `afplay` calls
- Error path: Invalid file path logs error and resets `isPlaying`
- Error path: `afplay` timeout (30s) kills the process and resets `isPlaying`
- Edge case: File path containing spaces works correctly (macOS default app path has spaces)

**Verification:**
- Custom sound plays correctly on macOS
- The `isPlaying` mutex resets properly after playback completes, errors, or timeout
- Windows sound playback unchanged

---

- [ ] **Unit 5: Swift mic-detector CLI binary**

**Goal:** Create a Swift CLI tool that monitors microphone activity via CoreAudio and outputs state changes as line-delimited JSON to stdout.

**Requirements:** R2

**Dependencies:** None (can be developed independently, but must be integrated in Unit 6)

**Files:**
- Create: `swift-mic-detector/Package.swift`
- Create: `swift-mic-detector/Sources/main.swift`
- Modify: `.gitignore` (add `swift-mic-detector/.build/`)

**Approach:**
- Create a Swift Package Manager project in `swift-mic-detector/` at the repo root
- Add `swift-mic-detector/.build/` to `.gitignore` — SPM produces build artifacts here that should not be committed
- The binary should:
  1. Get the default input audio device via `kAudioHardwarePropertyDefaultInputDevice`
  2. Query `kAudioDevicePropertyDeviceIsRunningSomewhere` for initial state
  3. Register an `AudioObjectAddPropertyListenerBlock` for state changes
  4. On each state change, emit one line to stdout: `{"micActive": true}` or `{"micActive": false}`
  5. Emit the initial state immediately on startup so the Electron process knows the current state
  6. Run indefinitely via `RunLoop.main.run()` (or `dispatchMain()`)
- **Critical: stdout buffering.** When writing to a pipe (not a terminal), Swift buffers stdout fully by default. Call `setlinebuf(stdout)` at startup or `fflush(stdout)` after each `print()` to ensure state changes reach the Electron process immediately. Without this, output will sit in the buffer indefinitely
- Handle errors gracefully: if CoreAudio fails, emit `{"micActive": false}` and exit with non-zero status
- Also register a listener on `kAudioObjectSystemObject` for `kAudioHardwarePropertyDefaultInputDevice` changes. When the default input device changes (e.g., user plugs in a USB headset), re-query and re-register the device listener on the new device. Without this, the binary watches a stale device
- Reference implementation: ProZsolt/onair (Objective-C, uses the same CoreAudio APIs)
- Build with `swift build -c release` to produce a static binary at `.build/release/mic-detector`

**Patterns to follow:**
- ProZsolt/onair (`onair.m`) for CoreAudio property listener pattern
- Line-delimited JSON (NDJSON) for stdout protocol — each line is one complete JSON object

**Test scenarios:**
- Happy path: Binary starts, emits initial `{"micActive": false}` when no mic is in use
- Happy path: When a mic-using app starts (e.g., QuickTime audio recording), binary emits `{"micActive": true}`
- Happy path: When the mic-using app stops, binary emits `{"micActive": false}`
- Edge case: Binary emits initial state even if mic is already active at launch
- Error path: If no audio input device exists, binary emits `{"micActive": false}` and exits cleanly
- Edge case: Binary survives brief system sleep (CoreAudio listener may or may not fire on wake)

**Verification:**
- `swift build -c release` produces a binary at `.build/release/mic-detector`
- Running the binary manually shows initial state output and responds to mic state changes
- Binary runs indefinitely without excessive CPU or memory usage

---

- [ ] **Unit 6: macOS mic detection integration**

**Goal:** Integrate the Swift mic-detector binary into the Electron main process as a long-lived child process, replacing the PowerShell polling approach on macOS.

**Requirements:** R1, R2

**Dependencies:** Unit 5 (Swift binary must exist)

**Files:**
- Modify: `src/main/mic-detector.ts`
- Modify: `forge.config.ts` (add `extraResource` for the Swift binary)

**Approach:**
- Add `process.platform` conditional in `startMicDetection()`:
  - On Windows: existing PowerShell polling (unchanged)
  - On macOS: spawn the Swift binary as a long-lived child process
- macOS implementation:
  - Resolve binary path: `path.join(process.resourcesPath, 'mic-detector')` when packaged, development fallback to `swift-mic-detector/.build/release/mic-detector`
  - Spawn with `child_process.spawn()` (not `execFile` — this is long-lived)
  - Read stdout line-by-line. Parse each line as JSON: `{"micActive": boolean}`. Skip malformed lines with a log warning
  - On each parsed state change, call the `onStateChange` callback (same interface as Windows)
  - Store the `ChildProcess` reference for cleanup
- `stopMicDetection()` on macOS: kill the child process (`childProcess.kill()`)
- `checkMicNow()` on macOS: kill the current binary and restart it (guarantees fresh CoreAudio state, handles system resume)
- Error handling (fail-open):
  - If binary not found or spawn fails: log warning, set `micActive = false`, do not set error tray state
  - If binary exits unexpectedly: log warning, set `micActive = false`. No auto-restart — user can toggle mic mute in settings to retry
  - If stdout emits malformed JSON: log warning, skip the line
- Add `extraResource` to `forge.config.ts` with a platform conditional: only include `'./swift-mic-detector/.build/release/mic-detector'` when `process.platform === 'darwin'`. Without this condition, the Windows build will fail because the Swift binary path does not exist on Windows. Since `forge.config.ts` is a Node module, `process.platform` checks work at config evaluation time
- Store the `onStateChange` callback reference in module scope (not per-binary). When `checkMicNow()` kills and restarts the binary, the new child process's stdout listener must re-use the same callback. The existing Windows implementation effectively does this via closure — mirror that pattern
- Ensure executable permissions survive packaging: `extraResource` preserves permissions on macOS

**Patterns to follow:**
- Existing `startMicDetection()` / `stopMicDetection()` API contract (callback-based, `isMicActive()` getter)
- Existing fail-open pattern: errors set `micActive = false` and log
- Node.js `readline` module or manual `stdout.on('data')` with newline splitting for line-delimited parsing

**Test scenarios:**
- Happy path: `startMicDetection()` spawns the Swift binary, initial state is received
- Happy path: Mic state change (mic becomes active) triggers `onStateChange(true)`
- Happy path: `stopMicDetection()` kills the Swift binary process
- Happy path: `isMicActive()` returns the last known state
- Error path: Binary not found at expected path — logs warning, `micActive` stays `false`
- Error path: Binary exits unexpectedly — logs warning, `micActive` set to `false`
- Error path: Binary emits malformed JSON line — line is skipped, previous state preserved
- Integration: `checkMicNow()` kills and restarts the binary, receives fresh initial state
- Integration: `powerMonitor.on('resume')` → `checkMicNow()` → binary restarts with correct state
- Edge case: App quits while binary is running — binary process is killed in cleanup
- Edge case: `stopMicDetection()` called when binary is not running (no-op, no crash)
- Edge case: Windows mic detection continues to work via PowerShell (no regression)

**Verification:**
- Mic detection works on macOS: active mic is detected, inactive mic shows not active
- `stopMicDetection()` cleanly terminates the Swift binary (no orphan processes)
- `checkMicNow()` provides fresh state
- Windows mic detection is unaffected

---

- [ ] **Unit 7: Multi-platform CI/CD**

**Goal:** Restructure the GitHub Actions workflow to build and publish both Windows and macOS artifacts to the same GitHub Release.

**Requirements:** R12, R13

**Dependencies:** All other units (this is the final integration step)

**Files:**
- Modify: `.github/workflows/release-please.yml`
- Modify: `forge.config.ts` (remove `PublisherGithub` — CI will no longer use `npm run publish`)

**Approach:**
- Keep the existing `release-please` job unchanged (runs on `ubuntu-latest`, outputs `release_created` and `tag_name`)
- Replace the single `build-and-release` job with a matrix `build` job + a downstream `publish` job:
  - **`build` job**: matrix strategy with `os: [windows-latest, macos-latest]`, `fail-fast: false`. Steps: checkout, setup Node 20, `npm ci`, compile Swift binary (macOS only, conditional step: `if: matrix.os == 'macos-latest'`), `npx electron-forge make --arch arm64` (macOS) or `npx electron-forge make` (Windows), upload artifacts with `actions/upload-artifact@v4` using platform-specific names (`windows-artifacts`, `macos-artifacts`). Upload path: `out/make/**/*`
  - **`publish` job**: `needs: [release-please, build]`, runs on `ubuntu-latest`, `permissions: contents: write`. Downloads all artifacts with `actions/download-artifact@v4` (`merge-multiple: true`), uploads to the GitHub Release with `gh release upload "$tag" ... --clobber`. Target file patterns: `*.exe`, `*.nupkg`, `*.dmg` (Forge output from Squirrel and DMG makers)
- The separate publish job eliminates the PublisherGithub race condition entirely — only one job touches the Release API
- Remove `PublisherGithub` from `forge.config.ts` `publishers` array and uninstall `@electron-forge/publisher-github` — it is no longer used since CI calls `electron-forge make` (not `publish`) and uploads artifacts manually
- Swift compilation step (macOS only): `cd swift-mic-detector && swift build -c release --arch arm64`
- The Swift binary must be compiled BEFORE `electron-forge make` so that `extraResource` can pick it up
- Preserve `contents: write` permission for the publish job
- Do NOT modify release-please config — the existing setup creates releases and tags correctly per institutional learnings

**Patterns to follow:**
- Existing `release-please.yml` structure (two-job workflow with `needs` dependency)
- Existing `npm ci` + `npm run publish` pipeline (replace `publish` with `make`)
- GitHub Actions matrix strategy with `fail-fast: false`

**Test scenarios:**
- Happy path: Push to main triggers release-please, which creates a release, which triggers parallel builds on Windows and macOS, which upload artifacts, which are published to the same release
- Happy path: GitHub Release contains both the Windows `.exe`/`.nupkg` and the macOS `.dmg`
- Error path: macOS build fails but Windows build succeeds — Windows artifacts are still published, release is partial but not lost
- Error path: Windows build fails but macOS build succeeds — macOS artifacts are still published
- Edge case: `fail-fast: false` ensures both builds complete independently
- Edge case: `--clobber` flag allows re-running the publish job safely (idempotent)

**Verification:**
- CI workflow runs successfully on both platforms
- GitHub Release contains artifacts for both Windows and macOS
- Release notes from release-please are preserved (no duplicate or overwritten release)

## System-Wide Impact

- **Interaction graph:** `main.ts` → `mic-detector.ts` → Swift binary (new child process relationship). `main.ts` → `tray.ts` (new platform conditional for click handler). `main.ts` → `app.dock.hide()` (new macOS call). `forge.config.ts` → `MakerDMG` + `extraResource` (new build artifacts)
- **Error propagation:** Swift binary errors fail-open (same as Windows PowerShell errors). `afplay` errors fail silently (same as Windows sound errors). Missing `.icns` is a build-time failure, not a runtime failure
- **State lifecycle risks:** Swift binary child process must be killed on app quit to prevent orphan processes. The `isPlaying` mutex in `sound.ts` must reset correctly after `afplay` timeout or error
- **API surface parity:** All four exported functions from `mic-detector.ts` (`isMicActive`, `startMicDetection`, `stopMicDetection`, `checkMicNow`) maintain identical external behavior on both platforms
- **Unchanged invariants:** IPC channels, settings schema, token storage format, polling logic, quiet hours logic, notification grouping — all unchanged. The renderer (settings window) requires no changes

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Swift binary may not survive system sleep; CoreAudio listeners could become stale | `checkMicNow()` kills and restarts the binary on resume. Fail-open ensures stale state does not block notifications |
| Bluetooth microphones may not report via `kAudioDevicePropertyDeviceIsRunningSomewhere` on all macOS versions | Known limitation. Fail-open handles it — mic reports as inactive, notifications are not suppressed |
| `extraResource` may not preserve executable permissions in edge cases | Verify during packaging. If permissions are stripped, add a `chmod +x` in a Forge `postPackage` hook |
| macOS tray template icons may not render correctly at all DPI scales | Provide both @1x and @2x assets. Test visually on macOS Retina display |
| Unsigned DMG triggers Gatekeeper warning | Accepted (R11). Users bypass with right-click → Open. Document in README |
| CI `gh release upload` may fail if release-please has not yet created the release | The `publish` job depends on `release-please` job via `needs`. Release is guaranteed to exist before upload |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-29-macos-support-requirements.md](docs/brainstorms/2026-03-29-macos-support-requirements.md)
- **Institutional learnings:** [docs/solutions/integration-issues/electron-forge-github-actions-release.md](docs/solutions/integration-issues/electron-forge-github-actions-release.md), [docs/solutions/integration-issues/release-please-draft-tags-github-actions-electron-forge.md](docs/solutions/integration-issues/release-please-draft-tags-github-actions-electron-forge.md)
- **ProZsolt/onair:** Reference CoreAudio mic detection implementation (Objective-C)
- **Electron Forge MakerDMG docs:** electronforge.io/config/makers/dmg
- **Electron nativeImage template images:** electronjs.org/docs/latest/api/native-image
- **Electron Tray macOS considerations:** electronjs.org/docs/latest/api/tray
