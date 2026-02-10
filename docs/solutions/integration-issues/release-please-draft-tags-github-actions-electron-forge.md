---
title: "Configure release-please for Electron app with existing tag-triggered release workflow"
category: integration-issues
tags:
  - release-please
  - GitHub Actions
  - versioning
  - changelog
  - electron-forge
  - draft releases
  - git tags
date_solved: 2026-02-10
severity: medium
symptoms:
  - "Manual release process: bump version, create tag, push"
  - "No automated changelog or versioning"
  - "Draft releases not creating git tags, breaking existing release.yml trigger"
  - "release-please workflow fails with permission error creating PRs"
root_cause:
  - "GitHub does not create git tags for draft releases by default"
  - "Repository setting 'Allow GitHub Actions to create or approve pull requests' not enabled"
affected_components:
  - release-please-config.json
  - .release-please-manifest.json
  - .github/workflows/release-please.yml
  - forge.config.ts
---

# Configure release-please with Existing Tag-Triggered Electron Forge Workflow

## Problem

The app had a manual release process: bump version in `package.json`, create a git tag, push. The tag triggers `.github/workflows/release.yml` which builds a Windows installer via electron-forge and creates a draft GitHub release. There was no CHANGELOG.md and no automated versioning.

release-please automates version bumping, changelog generation, and release creation based on conventional commits. The challenge was integrating it without breaking the existing tag-triggered build workflow.

## Key Gotchas

### 1. Draft releases don't create git tags

GitHub does not create git tags for draft releases by default. Since the existing `release.yml` triggers on `v*.*.*` tags, using `draft: true` in release-please would silently break the entire build pipeline -- no tag means no workflow trigger, no installer built.

**Fix:** Set `tag-git-on-release: true` in `release-please-config.json` to force tag creation even for drafts.

### 2. GitHub Actions needs permission to create PRs

The workflow failed immediately with:

> GitHub Actions is not permitted to create or approve pull requests.

This is a **repository setting**, not a workflow file issue. The `permissions: pull-requests: write` block in the workflow YAML is necessary but not sufficient.

**Fix:** Settings > Actions > General > Workflow permissions > enable "Allow GitHub Actions to create and approve pull requests".

### 3. Both release-please and electron-forge create releases

release-please creates a draft release with changelog. electron-forge's `PublisherGithub` also creates releases. With `draft: true` on both, electron-forge finds the existing draft release by tag name and uploads the installer to it rather than creating a duplicate.

**Fix:** Remove `generateReleaseNotes: true` from `forge.config.ts` (release-please handles release notes). Keep `draft: true` so forge uploads to the existing draft.

## Solution

### Workflow Chain

```
Conventional commits land on main
  -> release-please creates/updates a release PR
  -> PR merged
  -> release-please creates git tag + draft GitHub release with changelog
  -> Tag push triggers release.yml
  -> electron-forge builds Windows installer, uploads to existing draft
  -> Maintainer publishes draft when ready
```

### Configuration Files

**`release-please-config.json`**

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "github-notify",
      "changelog-path": "CHANGELOG.md",
      "draft": true,
      "tag-git-on-release": true,
      "include-v-in-tag": true,
      "bump-minor-pre-major": true
    }
  }
}
```

- `draft: true` -- keeps releases as drafts for manual review
- `tag-git-on-release: true` -- **critical** -- forces git tag creation for drafts
- `include-v-in-tag: true` -- matches existing tag format (`v0.2.0`)
- `bump-minor-pre-major: true` -- `feat:` bumps minor while pre-1.0

**`.release-please-manifest.json`**

```json
{
  ".": "0.2.0"
}
```

Bootstraps release-please from the current version.

**`.github/workflows/release-please.yml`**

```yaml
name: Release Please

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

**`forge.config.ts` change**

```typescript
// Removed: generateReleaseNotes: true
// release-please handles changelog and release notes now
publishers: [
  new PublisherGithub({
    repository: { owner: 'derhally', name: 'github-notify' },
    prerelease: false,
    draft: true,  // Kept: finds existing draft and uploads to it
  }),
],
```

### No changes to `release.yml`

The existing workflow triggers on `v*.*.*` tags and runs `npm run publish`. It works as-is because release-please creates the tag, which triggers the workflow, and electron-forge finds the existing draft release.

## Prevention

- Always set `tag-git-on-release: true` when using `draft: true` with release-please and a tag-triggered downstream workflow
- Enable "Allow GitHub Actions to create or approve pull requests" in repo settings before the first push to main
- After merging a release PR, verify: git tag exists, draft release exists, and `release.yml` triggered

## Verification Steps

1. Push a conventional commit to main
2. Verify release-please creates a PR with updated `package.json`, new `CHANGELOG.md`, and updated manifest
3. Merge the PR
4. Verify a git tag and draft release are created
5. Verify `release.yml` triggers and builds the installer
6. Check the draft release has the installer attached

## Related

- [Electron Forge GitHub Actions Release](./electron-forge-github-actions-release.md) -- original CI/CD setup
- [release-please-action docs](https://github.com/googleapis/release-please-action)
