import { safeStorage } from 'electron';
import Store from 'electron-store';
import { AppSettings, NotificationMode, NotificationSound, SeenEntry } from '../shared/types';

interface StoreSchema {
  encryptedToken: string;
  settings: AppSettings;
  seenPRs: SeenEntry[];
  snoozeUntil: number;
}

const store = new Store<StoreSchema>({
  defaults: {
    encryptedToken: '',
    settings: {
      pollInterval: 300,
      notificationMode: NotificationMode.Both,
      notificationSound: NotificationSound.Default,
      customSoundPath: '',
      autoStart: true,
      filters: [],
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      micMuteEnabled: true,
    },
    seenPRs: [],
    snoozeUntil: 0,
  },
});

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  const encrypted = safeStorage.encryptString(token);
  store.set('encryptedToken', encrypted.toString('base64'));
}

export function getToken(): string | null {
  const raw = store.get('encryptedToken');
  if (!raw) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buffer = Buffer.from(raw, 'base64');
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
}

export function hasToken(): boolean {
  return !!store.get('encryptedToken');
}

export function getSettings(): AppSettings {
  return store.get('settings');
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings);
}

export function getSeenPRs(): SeenEntry[] {
  return store.get('seenPRs');
}

export function saveSeenPRs(entries: SeenEntry[]): void {
  store.set('seenPRs', entries);
}

export function pruneSeenPRs(maxAgeDays: number = 30): void {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const current = getSeenPRs();
  const pruned = current.filter((entry) => entry.seenAt > cutoff);
  saveSeenPRs(pruned);
}

export function getSnoozeUntil(): number {
  return store.get('snoozeUntil');
}

export function setSnoozeUntil(until: number): void {
  store.set('snoozeUntil', until);
}

export function clearSnooze(): void {
  store.set('snoozeUntil', 0);
}
