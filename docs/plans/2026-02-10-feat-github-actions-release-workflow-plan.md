---
title: "GitHub Actions Release Workflow"
type: feat
date: 2026-02-10
---

# GitHub Actions Release Workflow

## Overview

Set up a GitHub Actions workflow that automatically builds and publishes the Electron app to GitHub Releases when a version tag (`v*.*.*`) is pushed to the repository.

## Proposed Solution

Use Electron Forge's built-in `publish` command with the `@electron-forge/publisher-github` package. The `publish` command runs the full pipeline -- `package` -> `make` -> upload to GitHub Releases -- in a single step. A GitHub Actions workflow triggers on tag push and runs on a Windows runner (required for Squirrel.Windows maker).

## Implementation

### Phase 1: Add GitHub Publisher to Forge Config

- [x] Install `@electron-forge/publisher-github` as a dev dependency
- [x] Add `publishers` config to `forge.config.ts` pointing to `derhally/github-notify`
- [x] Set `draft: true` so releases can be reviewed before going public

#### forge.config.ts changes

```typescript
import { PublisherGitHub } from '@electron-forge/publisher-github';

// Add to config:
publishers: [
  new PublisherGitHub({
    repository: {
      owner: 'derhally',
      name: 'github-notify',
    },
    prerelease: false,
    draft: true,
  }),
],
```

### Phase 2: Create GitHub Actions Workflow

- [x] Create `.github/workflows/release.yml`
- [x] Trigger on tag push matching `v*.*.*`
- [x] Run on `windows-latest` (required for Squirrel.Windows)
- [x] Use Node.js 20 with npm caching via `actions/setup-node@v4`
- [x] Use `npm ci` for deterministic installs
- [x] Run `npm run publish` with `GITHUB_TOKEN`
- [x] Set `contents: write` permission for release creation

#### .github/workflows/release.yml

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build-and-release:
    runs-on: windows-latest

    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Publish to GitHub Releases
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run publish
```

### Phase 3: Version Bump Workflow

To create a release:

```bash
# 1. Update version in package.json
npm version patch   # or minor, or major

# 2. Push the commit and tag
git push origin main --tags
```

`npm version` automatically updates `package.json`, creates a git commit, and creates the `v*.*.*` tag.

## Technical Considerations

- **Windows-only build**: The app uses Windows DPAPI (`safeStorage`), Windows SAPI (`say.js`), and Squirrel.Windows maker. Building on other platforms would produce non-functional artifacts.
- **No code signing**: The installer will trigger Windows SmartScreen warnings. Code signing can be added later by configuring a certificate in the Squirrel maker config.
- **Draft releases**: Using `draft: true` means releases are not visible to the public until manually published on GitHub. This allows reviewing the artifacts before release.
- **GITHUB_TOKEN**: Automatically provided by GitHub Actions with the permissions specified in the workflow. No manual secret creation needed.
- **Build artifacts**: Squirrel produces `GitHubNotify Setup.exe`, a `.nupkg` file, and a `RELEASES` manifest. All are uploaded to the GitHub Release.

## Acceptance Criteria

- [ ] Pushing a `v*.*.*` tag triggers the workflow
- [ ] Workflow builds on `windows-latest` and completes successfully
- [ ] A draft GitHub Release is created with the Squirrel installer attached
- [ ] The release contains `GitHubNotify-{version} Setup.exe`
- [ ] `npm run publish` works locally when `GITHUB_TOKEN` is set

## References

- [Electron Forge GitHub Publisher](https://www.electronforge.io/config/publishers/github)
- [Electron Forge Build Lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle)
- [GitHub Actions - Trigger on tags](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- [GITHUB_TOKEN permissions](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)
- Current forge config: `forge.config.ts`
- Current package scripts: `package.json`
