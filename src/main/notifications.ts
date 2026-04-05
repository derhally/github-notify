import { Notification, shell } from 'electron';
import { GitHubPR } from '../shared/types';
import { speak } from './tts';
import { playCustomSound } from './sound';
import { log } from './logger';

const MAX_INDIVIDUAL_NOTIFICATIONS = 5;
const activeNotifications = new Set<Notification>();

export function checkNotificationSupport(): void {
  log(`Notification.isSupported(): ${Notification.isSupported()}`);
}

function isValidGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com';
  } catch {
    return false;
  }
}

function showToast(pr: GitHubPR, silent: boolean): void {
  if (!Notification.isSupported()) {
    log(`Toast skipped (notifications not supported): ${pr.repoFullName}#${pr.number}`);
    return;
  }

  const notification = new Notification({
    title: `${pr.repoFullName} #${pr.number}`,
    body: `${pr.title}\nby @${pr.author}`,
    silent,
  });

  activeNotifications.add(notification);

  notification.once('show', () => {
    log(`Toast displayed: ${pr.repoFullName}#${pr.number}`);
  });

  notification.once('click', () => {
    activeNotifications.delete(notification);
    if (isValidGitHubUrl(pr.url)) {
      shell.openExternal(pr.url);
    }
  });

  notification.once('close', () => {
    activeNotifications.delete(notification);
  });

  notification.show();
}

function showSummaryToast(count: number, silent: boolean): void {
  if (!Notification.isSupported()) {
    log('Summary toast skipped (notifications not supported)');
    return;
  }

  const notification = new Notification({
    title: 'GitHub Notify',
    body: `${count} more new pull requests need your attention`,
    silent,
  });

  activeNotifications.add(notification);

  notification.once('show', () => {
    log(`Summary toast displayed: ${count} more PRs`);
  });

  notification.once('click', () => {
    activeNotifications.delete(notification);
    shell.openExternal('https://github.com/notifications');
  });

  notification.once('close', () => {
    activeNotifications.delete(notification);
  });

  notification.show();
}

function sanitizeForTTS(text: string): string {
  return text.replace(/[^a-zA-Z0-9\s.,!?:;\-()#/]/g, '');
}

function buildTTSText(pr: GitHubPR): string {
  const title = pr.title.length > 100 ? pr.title.substring(0, 100) + '...' : pr.title;
  return `New pull request in ${sanitizeForTTS(pr.repoFullName)}: ${sanitizeForTTS(title)}, by ${sanitizeForTTS(pr.author)}`;
}


async function speakPRs(prs: GitHubPR[], remaining: number): Promise<void> {
  for (const pr of prs) {
    const text = buildTTSText(pr);
    try {
      await speak(text);
    } catch (error: unknown) {
      log(`TTS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      break;
    }
  }
  if (remaining > 0) {
    try {
      await speak(`And ${remaining} more pull requests need your attention.`);
    } catch (error: unknown) {
      log(`TTS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export function notifyNewPRs(
  prs: GitHubPR[],
  soundEnabled: boolean,
  toastEnabled: boolean,
  ttsEnabled: boolean,
  customSoundPath: string,
): void {
  if (prs.length === 0) return;

  log(`Notifying for ${prs.length} new PR(s) (toast=${toastEnabled}, sound=${soundEnabled}, tts=${ttsEnabled})`);

  const toNotifyIndividually = prs.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS);
  const remaining = prs.length - MAX_INDIVIDUAL_NOTIFICATIONS;

  // Suppress toast sound when using custom sound or no sound
  const silentToast = !soundEnabled || !!customSoundPath;

  if (soundEnabled && customSoundPath) {
    playCustomSound(customSoundPath);
  }

  if (toastEnabled) {
    for (const pr of toNotifyIndividually) {
      showToast(pr, silentToast);
    }
    if (remaining > 0) {
      showSummaryToast(remaining, silentToast);
    }
  }

  if (ttsEnabled) {
    void speakPRs(toNotifyIndividually, remaining);
  }
}
