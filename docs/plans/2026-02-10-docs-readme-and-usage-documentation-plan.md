---
title: "README and Usage Documentation"
type: docs
date: 2026-02-10
---

# README and Usage Documentation

## Overview

Create a high-quality README.md and supporting documentation for the GitHub Notify tray application. The README should serve as both a landing page for the GitHub repository and a comprehensive guide for users to install, configure, and use the app.

## Deliverables

### 1. README.md

A polished top-level README covering:

- [x] **Header & badges** -- App name, one-line description, license badge
- [x] **Feature highlights** -- Bullet list of key capabilities
- [x] **How it works** -- Brief explanation of the polling/notification mechanism
- [x] **Screenshots/visuals** -- ASCII or description placeholders for tray menu, settings window, toast notification (actual screenshots require a running Windows instance)
- [x] **Requirements** -- Windows 10/11, Node.js 20+, GitHub PAT
- [x] **Quick start** -- Clone, install, run in 3 steps
- [x] **Configuration** -- All settings with defaults, ranges, and descriptions
- [x] **GitHub token setup** -- Step-by-step PAT creation instructions
- [x] **Repository filtering** -- Syntax and examples for org/repo allowlists
- [x] **Notification modes** -- Explanation of toast, TTS, and both
- [x] **Tray icon states** -- What each icon color means
- [x] **Building for production** -- Package and make commands
- [x] **Architecture overview** -- Brief description of the three-process Electron model
- [x] **Security** -- How the token is encrypted, CSP, sandboxing
- [x] **Troubleshooting** -- Common issues and solutions
- [x] **License** -- MIT

### Content Details

**Configuration Table:**

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Poll Interval | 300s (5 min) | 60-3600s | How often to check GitHub |
| Notification Mode | Both | toast / tts / both | How to deliver notifications |
| Auto Start | true | on/off | Launch with Windows |
| Filters | (empty) | org or owner/repo per line | Limit monitored repos |

**Tray Menu Items:**
- Check Now -- Trigger immediate poll
- Pause/Resume Polling -- Toggle polling
- Settings -- Open configuration window
- Open Logs -- View log file
- Quit -- Exit app

**Tray Icon States:**
- Normal (default icon) -- Running, token valid
- Error (red/warning icon) -- API error or invalid token
- Unconfigured (grey icon) -- No token configured

**Token Scopes:**
- `repo` -- Required for private repository PRs
- `public_repo` -- Sufficient for public repos only

**Filter Syntax:**
- `my-org` -- Matches all repos in `my-org`
- `owner/repo-name` -- Matches a specific repo
- Empty list -- Monitor all repos (default)

**Troubleshooting Topics:**
- Token invalid / 401 errors
- No notifications appearing
- App won't start (single instance lock)
- TTS not working
- Rate limiting
- Finding log files (`%APPDATA%/github-notify/github-notify.log`)

## Acceptance Criteria

- [ ] README.md exists at project root
- [ ] README covers installation, configuration, and usage
- [ ] All configurable settings are documented with defaults and ranges
- [ ] GitHub PAT creation steps are clear
- [ ] Filter syntax is documented with examples
- [ ] Troubleshooting section addresses common issues
- [ ] Content is concise and scannable (tables, bullet lists)
- [ ] No placeholder text or TODOs in final output

## References

- Settings defaults: `src/main/store.ts`
- Types and enums: `src/shared/types.ts`
- Tray menu: `src/main/tray.ts`
- Filter logic: `src/main/poller.ts`
- Notification batching: `src/main/notifications.ts`
- Logger location: `src/main/logger.ts`
- IPC validation: `src/main/ipc-handlers.ts`
- Security config: `forge.config.ts`, `index.html`
