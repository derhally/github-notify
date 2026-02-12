export enum TrayState {
  Normal = 'normal',
  Error = 'error',
  Unconfigured = 'unconfigured',
  Quiet = 'quiet',
}

export interface AppSettings {
  pollInterval: number;
  soundEnabled: boolean;
  toastEnabled: boolean;
  ttsEnabled: boolean;
  customSoundPath: string;
  autoStart: boolean;
  filters: string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  micMuteEnabled: boolean;
}

export interface GitHubPR {
  number: number;
  title: string;
  repoFullName: string;
  author: string;
  url: string;
}

export interface SeenEntry {
  key: string;
  seenAt: number;
}

export interface ElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  saveToken: (token: string) => Promise<void>;
  hasToken: () => Promise<boolean>;
  testConnection: (token?: string) => Promise<{ success: boolean; username?: string; message: string }>;
  openSoundFileDialog: () => Promise<string | null>;
}

export function getPRKey(pr: GitHubPR): string {
  return `${pr.repoFullName}#${pr.number}`;
}

export function isOctokitError(error: unknown): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const obj = error as Record<string, unknown>;
  return typeof obj.status === 'number' && typeof obj.message === 'string';
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
