# GitHub Notify

A Windows system tray application that monitors your GitHub account for newly assigned pull requests and notifies you via toast notifications, text-to-speech, or both.

[![License: Unlicense](https://img.shields.io/badge/License-Unlicense-blue.svg)](LICENSE)

## Features

- **PR monitoring** -- Detects PRs assigned to you or where your review is requested
- **Toast notifications** -- Windows toast notifications with click-through to the PR in your browser
- **Text-to-speech** -- Reads PR details aloud using the Windows speech engine
- **Encrypted token storage** -- GitHub PAT encrypted at rest using Windows DPAPI via Electron's `safeStorage`
- **ETag caching** -- Conditional API requests minimize rate limit usage
- **Repository filtering** -- Monitor all repos or limit to specific orgs/repos
- **Auto-start** -- Optionally launch with Windows
- **Single instance** -- Only one instance runs at a time; launching again focuses the existing window
- **System resume** -- Polls immediately when your machine wakes from sleep

## How It Works

GitHub Notify runs in the system tray and polls the GitHub Search API on a configurable interval (default: every 5 minutes). It runs two search queries per cycle -- one for PRs assigned to you and one for PRs where your review is requested -- then deduplicates the results. PRs not seen since the last check trigger a notification. ETag caching ensures that polls where nothing has changed consume no API quota.

## Requirements

- Windows 10 or 11
- Node.js 20+ and npm (for building from source)
- A [GitHub Personal Access Token](#github-token-setup) with appropriate scopes

## Quick Start

```bash
git clone https://github.com/derhally/github-notify.git
cd github-notify
npm install
npm start
```

On first launch the app opens the Settings window because no token is configured. Enter your GitHub PAT, click **Test Connection** to verify it works, then **Save**. The app begins polling immediately.

## GitHub Token Setup

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give the token a descriptive name (e.g. "GitHub Notify")
4. Select scopes:
   - `repo` -- required if you want to monitor **private** repositories
   - `public_repo` -- sufficient if you only monitor **public** repositories
5. Click **Generate token** and copy the value
6. Paste it into the **GitHub Token** field in the Settings window

The token is encrypted using Windows DPAPI before being stored on disk. It is never written in plaintext.

## Configuration

All settings are accessible from the tray icon's **Settings** menu item.

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Poll Interval | 300s (5 min) | 60 -- 3600s | How often to check GitHub for new PRs |
| Notification Mode | Both | Toast / TTS / Both | How notifications are delivered |
| Auto Start | On | On / Off | Launch automatically when you log in to Windows |
| Filters | (empty) | One entry per line | Limit which repos trigger notifications |

Changes take effect immediately -- no restart required.

### Repository Filtering

By default, the app monitors all repositories. To limit monitoring to specific orgs or repos, add filter entries in the Settings window (one per line):

| Filter | Matches |
|--------|---------|
| `my-org` | All repos in the `my-org` organization |
| `owner/repo-name` | Only the `owner/repo-name` repository |

Filters are case-insensitive. Leave the filter list empty to monitor everything.

### Notification Modes

| Mode | Behavior |
|------|----------|
| **Toast** | Shows a Windows toast notification per PR (up to 5, then a summary). Click a notification to open the PR in your browser. |
| **TTS** | Reads each PR aloud: *"New pull request in owner/repo: PR title, by author"*. Titles longer than 100 characters are truncated. |
| **Both** | Shows toasts first, then reads them aloud. |

When more than 5 new PRs are detected in a single poll, the first 5 are shown individually and the rest are summarized as *"N more new pull requests need your attention"*.

## Tray Icon

The tray icon indicates the app's current state:

| State | Meaning |
|-------|---------|
| **Normal** | Running and healthy. Tooltip shows the number of tracked PRs and last poll time. |
| **Error** | An API error occurred (network failure, rate limit). Polling continues and the icon returns to normal on the next successful poll. |
| **Unconfigured** | No GitHub token has been configured. Open Settings to add one. |

### Context Menu

Right-click (or left-click) the tray icon to access:

- **Check Now** -- Run a poll immediately
- **Pause / Resume Polling** -- Toggle polling on or off
- **Settings** -- Open the configuration window
- **Open Logs** -- Open the log file in your default text editor
- **Quit** -- Exit the application

## Building for Production

```bash
# Package the app (no installer)
npm run package

# Create a Windows installer (.exe via Squirrel)
npm run make
```

Output is written to the `out/` directory.

## Architecture

GitHub Notify is an Electron application with three process layers:

```
Main Process          Preload (contextBridge)       Renderer
+-----------------+   +----------------------+   +------------------+
| Tray manager    |   |                      |   |                  |
| Poller          |   |  Typed IPC bridge    |   |  Settings UI     |
| GitHub API      |<->|  (5 channels)        |<->|  (created on     |
| Notifications   |   |                      |   |   demand)        |
| TTS             |   +----------------------+   +------------------+
| Store (encrypt) |
| Logger          |
+-----------------+
```

- **Main process** -- All business logic: polling, API calls, notifications, TTS, encrypted storage
- **Preload** -- A thin `contextBridge` adapter exposing 5 typed IPC methods
- **Renderer** -- Settings window only, created on demand and destroyed on close

### Project Structure

```
src/
  main/
    main.ts              App entry, lifecycle, tray creation
    tray.ts              Tray icon, context menu, state management
    poller.ts            Poll timer, diff engine, filter logic
    github-api.ts        Octokit client, ETag caching, search queries
    notifications.ts     Toast and TTS notification dispatch
    tts.ts               say.js Promise wrapper
    store.ts             electron-store + safeStorage for token
    ipc-handlers.ts      IPC channel registration with input validation
    auto-launch.ts       Windows startup registration
    logger.ts            Rotating file logger
  preload/
    preload.ts           contextBridge API exposure
  renderer/
    settings.ts          Settings window UI logic
    styles.css           Settings window styles
  shared/
    types.ts             Shared interfaces, enums, type guards
```

## Security

- **Token encryption** -- PAT encrypted via Electron's `safeStorage` (Windows DPAPI)
- **Context isolation** -- Renderer runs in an isolated context with no access to Node.js APIs
- **Sandbox** -- Renderer process is sandboxed
- **Content Security Policy** -- `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- **Navigation blocked** -- The renderer cannot navigate away from the settings page or open new windows
- **IPC validation** -- All IPC inputs are validated at runtime (type, range, and format checks)
- **Electron Fuses** -- `RunAsNode` disabled, `NodeOptions` disabled, ASAR integrity validation enabled, app loads only from ASAR

## Troubleshooting

**Token invalid / tray shows error icon after saving token**
- Verify the token has the correct scopes (`repo` or `public_repo`)
- Use the **Test Connection** button in Settings to check the token
- Generate a new token if the current one has expired

**No notifications appearing**
- Check that polling is not paused (tray menu should show "Pause Polling", not "Resume Polling")
- Verify your filters are not excluding the repos you expect
- Open the logs (**Open Logs** in tray menu) to see poll results
- Ensure Windows notifications are enabled for the app in Windows Settings > Notifications

**App won't start / nothing happens**
- Another instance may already be running. Check the system tray for an existing icon.
- If the icon is not visible, check the tray overflow area (click the `^` arrow in the taskbar)

**TTS not working**
- TTS uses the Windows built-in speech engine (SAPI). Ensure at least one voice is installed in Windows Settings > Time & Language > Speech
- Check the logs for TTS errors

**Rate limiting**
- The app respects GitHub's rate limits via the throttling plugin. If you hit limits, increase the poll interval in Settings.
- ETag caching means polls with no changes consume zero quota.

**Finding log files**
- Click **Open Logs** in the tray context menu, or navigate to:
  ```
  %APPDATA%/github-notify/github-notify.log
  ```
- Logs rotate automatically at 5 MB.

## License

[Unlicense](LICENSE) -- This software is released into the public domain.
