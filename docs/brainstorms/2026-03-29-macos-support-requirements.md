---
date: 2026-03-29
topic: macos-support
---

# macOS Support

## Problem Frame

GitHub Notify is a Windows-only tray app for GitHub PR notifications. Mac users on the team or in the community cannot use it. Several core features (mic detection, sound playback, packaging) use Windows-specific APIs (PowerShell, registry, Squirrel installer), preventing the app from running on macOS without targeted platform abstractions.

## Requirements

**Platform Abstraction**

- R1. Platform-specific code in `mic-detector.ts`, `sound.ts`, and `main.ts` must be gated with inline `process.platform` conditionals. No abstraction layer or platform module directory is needed — three `if` branches across three files is sufficient
- R2. The mic detection feature must use a long-lived Swift CLI binary on macOS that queries CoreAudio's `kAudioDevicePropertyDeviceIsRunningSomewhere` API and emits state changes to stdout via listener callbacks. The Electron main process spawns this binary and parses its output. This replaces the PowerShell/registry approach used on Windows
- R3. Custom sound playback must use macOS's built-in `afplay` CLI tool via `child_process`, replacing the PowerShell `Media.SoundPlayer` approach

**Features That Should Work Without Major Changes**

- R4. Text-to-speech must work on macOS via the `say` npm package (which uses the native `say` command on macOS)
- R5. Token encryption must use Electron's `safeStorage` API, which automatically uses Keychain on macOS (no code changes expected, but must be verified)
- R6. Auto-launch must use Electron's `setLoginItemSettings`, which works on macOS natively
- R7. System tray icon and context menu must work on macOS, including all icon states (normal, error, unconfigured, quiet)
- R8. Toast notifications must work via Electron's `Notification` API on macOS

**Packaging & Distribution**

- R9. macOS builds must produce a DMG installer via Electron Forge's `MakerDMG`
- R10. macOS builds must target Apple Silicon (arm64) only
- R11. macOS code signing and notarization are deferred; users will bypass Gatekeeper manually

**CI/CD**

- R12. GitHub Actions workflow must be updated to build macOS artifacts on a macOS runner alongside the existing Windows build
- R13. macOS DMG must be published to GitHub Releases alongside the Windows installer

**Assets**

- R14. App icon must be provided in `.icns` format at `assets/app-icon.icns` for macOS (in addition to the existing `.ico` for Windows). This is a hard build prerequisite — the macOS build will fail without it
- R15. Tray icons must be converted to macOS template images (monochrome with alpha channel, 16x16 @1x / 32x32 @2x) using Electron's `Template.png` naming convention or `nativeImage.setTemplateImage(true)`. The existing light/dark theme-switching logic in `tray.ts` already works cross-platform

**macOS-Specific Behavior**

- R16. The `electron-squirrel-startup` import is safe on macOS (returns `false`, no-op) — verify this during implementation but no code change is expected
- R17. The `tray.on('click')` handler that calls `popUpContextMenu()` should be gated to Windows only; on macOS, the context menu opens automatically and the explicit call may cause double-triggering
- R18. The macOS menu bar will be visible on the settings window (`setMenuBarVisibility(false)` is a no-op on macOS). This is standard macOS behavior and acceptable

## Success Criteria

- The app installs from a DMG and runs as a tray app on macOS (Apple Silicon)
- All notification channels (toast, TTS, sound) function on macOS
- Mic detection auto-mute works on macOS during active calls
- Settings window opens, saves, and persists correctly on macOS
- GitHub token is encrypted at rest via Keychain on macOS
- Auto-launch toggle works on macOS
- CI produces and publishes both Windows and macOS artifacts on release

## Scope Boundaries

- No code signing or notarization (deferred)
- No Intel (x64) macOS build
- No Linux support
- No universal binary; arm64 only
- No changes to existing Windows behavior or features

## Key Decisions

- **DMG over ZIP**: DMG is the standard macOS distribution format and most familiar to users
- **Swift CLI binary for mic detection**: A long-lived process using CoreAudio's `kAudioDevicePropertyDeviceIsRunningSomewhere` API with listener callbacks for event-driven state changes. No node-gyp/electron-rebuild complexity since the project has no native addons. Reference implementation: [ProZsolt/onair](https://github.com/ProZsolt/onair)
- **`afplay` for sound**: Zero-dependency, built into macOS, mirrors the child_process pattern used on Windows
- **Apple Silicon only**: Simplifies build matrix; Intel Macs can still run via Rosetta 2
- **No code signing initially**: Avoids $99/year Apple Developer cost and CI complexity for a personal/small project

## Dependencies / Assumptions

- The `say` npm package works on macOS without configuration changes (it should, as it uses the native `say` command)
- Electron 40.x supports macOS arm64 builds (it does)
- `MakerDMG` from `@electron-forge/maker-dmg` is compatible with the current Forge version
- A Swift CLI binary can be compiled and bundled outside ASAR via Forge's `packagerConfig.extraResource`, resolved at runtime via `process.resourcesPath`. Note: the existing `OnlyLoadAppFromAsar` fuse does not block this since the binary is spawned via `child_process`, not loaded as code
- The CoreAudio `kAudioDevicePropertyDeviceIsRunningSomewhere` API works for detecting mic usage without elevated privileges or TCC permissions (confirmed — it queries device metadata, not audio data)

## Outstanding Questions

### Resolve Before Planning

(None — all blocking questions resolved)

### Deferred to Planning

- [Affects R15][Technical] How should the existing tray icon PNGs be converted to macOS template images (monochrome, correct sizes)?
- [Affects R14][Technical] How should the `.icns` icon file be generated from the existing icon assets?
- [Affects R12, R13][Technical] CI strategy for parallel builds — if Windows and macOS jobs both call `npm run publish` against the same release tag, there is a race condition on release asset upload. May need sequential jobs or a separate upload step
- [Affects R2][Technical] Swift binary build pipeline: compile before Forge package step, copy to known location, add to `packagerConfig.extraResource`, ensure executable permissions are preserved. Process lifecycle management (startup failure, unexpected exit, cleanup on app quit) needs design
- [Affects R2][Technical] Known limitation: Bluetooth microphones may not correctly report running state via CoreAudio on all macOS versions

## Next Steps

`/ce:plan` for structured implementation planning.
