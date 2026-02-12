import { safeStorage } from 'electron';
import Store from 'electron-store';
import { AppSettings, SeenEntry } from '../shared/types';

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
      soundEnabled: true,
      toastEnabled: true,
      ttsEnabled: true,
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

function migrateSettings(): void {
  const raw = store.get('settings') as unknown as Record<string, unknown>;

  // Already migrated
  if (typeof raw.soundEnabled === 'boolean') return;

  const mode = raw.notificationMode as string | undefined;
  const sound = raw.notificationSound as string | undefined;

  let toastEnabled = true;
  let ttsEnabled = true;
  let soundEnabled = true;

  if (mode === 'toast') {
    toastEnabled = true;
    ttsEnabled = false;
  } else if (mode === 'tts') {
    toastEnabled = false;
    ttsEnabled = true;
  } else if (mode === 'both') {
    toastEnabled = true;
    ttsEnabled = true;
  }

  if (sound === 'none') {
    soundEnabled = false;
  } else {
    soundEnabled = true;
  }

  delete raw.notificationMode;
  delete raw.notificationSound;

  raw.soundEnabled = soundEnabled;
  raw.toastEnabled = toastEnabled;
  raw.ttsEnabled = ttsEnabled;

  store.set('settings', raw as unknown as AppSettings);
}

migrateSettings();

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
