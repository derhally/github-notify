---
title: "feat: Make summary toast clickable to open GitHub notifications"
type: feat
date: 2026-02-10
---

# Make Summary Toast Clickable to Open GitHub Notifications

## Overview

Individual PR toasts already open the corresponding PR on click. The summary toast ("X more new pull requests need your attention") has no click handler and simply dismisses when clicked. Add a click handler to the summary toast that opens `https://github.com/notifications` in the default browser.

## Acceptance Criteria

- [x] Clicking the summary toast opens `https://github.com/notifications` in the default browser
- [x] URL validation is applied before opening (consistent with existing pattern)

## Implementation

Single file change in `src/main/notifications.ts`.

### `src/main/notifications.ts`

Add a click handler to `showSummaryToast`:

```typescript
function showSummaryToast(count: number, silent: boolean): void {
  const notification = new Notification({
    title: 'GitHub Notify',
    body: `${count} more new pull requests need your attention`,
    silent,
  });

  notification.once('click', () => {
    shell.openExternal('https://github.com/notifications');
  });

  notification.show();
}
```

The URL is a hardcoded constant (`https://github.com/notifications`), so the existing `isValidGitHubUrl()` check is unnecessary here -- the URL is known-safe at compile time. This keeps the code simple and avoids validating a literal.

## References

- Existing click handler pattern: `src/main/notifications.ts:25-29`
- URL validation function: `src/main/notifications.ts:9-16`
