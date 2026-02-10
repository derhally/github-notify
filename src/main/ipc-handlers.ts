import { ipcMain, dialog } from 'electron';
import path from 'node:path';
import { getSettings, saveSettings, saveToken, hasToken } from './store';
import { testConnection } from './github-api';
import { AppSettings, NotificationMode, NotificationSound } from '../shared/types';

const VALID_SOUND_VALUES: string[] = Object.values(NotificationSound);

function isValidCustomSoundPath(soundMode: string, filePath: string): boolean {
  if (soundMode !== NotificationSound.Custom) return true;
  if (filePath === '') return true;
  if (path.extname(filePath).toLowerCase() !== '.wav') return false;
  if (!path.isAbsolute(filePath)) return false;
  return true;
}

function isValidSettings(value: unknown): value is AppSettings {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.pollInterval === 'number' &&
    obj.pollInterval >= 60 &&
    obj.pollInterval <= 3600 &&
    typeof obj.notificationMode === 'string' &&
    Object.values(NotificationMode).includes(obj.notificationMode as NotificationMode) &&
    typeof obj.notificationSound === 'string' &&
    VALID_SOUND_VALUES.includes(obj.notificationSound as NotificationSound) &&
    typeof obj.customSoundPath === 'string' &&
    isValidCustomSoundPath(obj.notificationSound as string, obj.customSoundPath as string) &&
    typeof obj.autoStart === 'boolean' &&
    Array.isArray(obj.filters) &&
    obj.filters.length <= 100 &&
    obj.filters.every((f: unknown) => typeof f === 'string' && f.length <= 200)
  );
}

export function registerIpcHandlers(onSettingsChanged: () => void): void {
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:save', (_event, settings: unknown) => {
    if (!isValidSettings(settings)) {
      throw new Error('Invalid settings');
    }
    saveSettings(settings);
    onSettingsChanged();
  });

  ipcMain.handle('token:save', (_event, token: unknown) => {
    if (typeof token !== 'string' || token.length === 0 || token.length > 500) {
      throw new Error('Invalid token');
    }
    saveToken(token);
  });

  ipcMain.handle('token:has', () => {
    return hasToken();
  });

  ipcMain.handle('token:test', (_event, token: unknown) => {
    if (typeof token !== 'string' || token.length === 0 || token.length > 500) {
      return { success: false, message: 'Invalid token provided' };
    }
    return testConnection(token);
  });

  ipcMain.handle('dialog:open-sound-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Notification Sound',
      filters: [{ name: 'Sound Files', extensions: ['wav'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
