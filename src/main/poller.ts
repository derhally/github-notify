import {
  initOctokit,
  getAuthenticatedUser,
  fetchAssignedPRs,
  fetchReviewRequestedPRs,
  deduplicatePRs,
} from './github-api';
import { getSettings, getToken, getSeenPRs, saveSeenPRs, pruneSeenPRs } from './store';
import { notifyNewPRs } from './notifications';
import { setTrayState, setTrayTooltip, getIsPaused } from './tray';
import { log } from './logger';
import { isNotificationSuppressed } from './quiet-hours';
import { TrayState, GitHubPR, SeenEntry, getPRKey, isOctokitError } from '../shared/types';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let pollCount = 0;
const PRUNE_EVERY_N_POLLS = 12;

function filterByAllowlist(prs: GitHubPR[], filters: string[]): GitHubPR[] {
  if (filters.length === 0) return prs;

  const normalizedFilters = filters.map((f) => f.trim().toLowerCase()).filter(Boolean);
  if (normalizedFilters.length === 0) return prs;

  return prs.filter((pr) => {
    const repo = pr.repoFullName.toLowerCase();
    return normalizedFilters.some((filter) => {
      if (filter.includes('/')) {
        return repo === filter;
      }
      return repo.startsWith(filter + '/');
    });
  });
}

function findNewPRs(allPRs: GitHubPR[], seenEntries: SeenEntry[]): GitHubPR[] {
  const seenKeys = new Set(seenEntries.map((e) => e.key));
  return allPRs.filter((pr) => !seenKeys.has(getPRKey(pr)));
}

function updateSeenSet(allPRs: GitHubPR[], existingSeen: SeenEntry[]): SeenEntry[] {
  const seenMap = new Map(existingSeen.map((e) => [e.key, e]));
  const now = Date.now();

  for (const pr of allPRs) {
    const key = getPRKey(pr);
    if (!seenMap.has(key)) {
      seenMap.set(key, { key, seenAt: now });
    }
  }

  return Array.from(seenMap.values());
}

export async function pollNow(): Promise<void> {
  if (isPolling || getIsPaused()) return;

  isPolling = true;

  try {
    const token = getToken();
    if (!token) {
      setTrayState(TrayState.Unconfigured);
      setTrayTooltip('GitHub Notify - No token configured');
      return;
    }

    initOctokit(token);
    const username = await getAuthenticatedUser();
    const settings = getSettings();

    log(`Polling for PRs assigned to ${username}`);

    const [assignedResult, reviewResult] = await Promise.all([
      fetchAssignedPRs(username),
      fetchReviewRequestedPRs(username),
    ]);

    if (!assignedResult.changed && !reviewResult.changed) {
      log('No changes detected (304 responses)');
      setTrayState(TrayState.Normal);
      return;
    }

    const allPRs = deduplicatePRs(assignedResult.prs, reviewResult.prs);
    const filteredPRs = filterByAllowlist(allPRs, settings.filters);

    const seenEntries = getSeenPRs();
    const newPRs = findNewPRs(filteredPRs, seenEntries);

    log(`Found ${filteredPRs.length} total PRs, ${newPRs.length} new`);

    if (newPRs.length > 0 && !isNotificationSuppressed()) {
      notifyNewPRs(newPRs, settings.notificationMode, settings.notificationSound, settings.customSoundPath);
    } else if (newPRs.length > 0) {
      log(`${newPRs.length} new PRs suppressed (quiet hours/snooze active)`);
    }

    const updatedSeen = updateSeenSet(filteredPRs, seenEntries);
    saveSeenPRs(updatedSeen);

    pollCount++;
    if (pollCount % PRUNE_EVERY_N_POLLS === 0) {
      pruneSeenPRs();
    }

    const suppressed = isNotificationSuppressed();
    setTrayState(suppressed ? TrayState.Quiet : TrayState.Normal);
    const now = new Date().toLocaleTimeString();
    const statusPrefix = suppressed ? 'Quiet - ' : '';
    setTrayTooltip(`GitHub Notify - ${statusPrefix}${filteredPRs.length} PRs tracked\nLast check: ${now}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`Poll error: ${message}`);

    if (isOctokitError(error) && error.status === 401) {
      setTrayState(TrayState.Error);
      setTrayTooltip('GitHub Notify - Token invalid');
      stopPolling();
    } else {
      setTrayState(TrayState.Error);
      setTrayTooltip(`GitHub Notify - Error: ${message}`);
    }
  } finally {
    isPolling = false;
  }
}

export function startPolling(): void {
  stopPolling();

  const settings = getSettings();
  const intervalMs = settings.pollInterval * 1000;

  log(`Starting polling every ${settings.pollInterval}s`);
  void pollNow();
  pollTimer = setInterval(() => void pollNow(), intervalMs);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function restartPolling(): void {
  pruneSeenPRs();
  startPolling();
}
