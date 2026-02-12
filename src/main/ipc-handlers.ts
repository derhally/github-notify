import { ipcMain, dialog } from 'electron';
import path from 'node:path';
import { getSettings, saveSettings, saveToken, hasToken, getToken } from './store';
import { testConnection } from './github-api';
import { AppSettings } from '../shared/types';

const TIME_PATTERN = /^\d{2}:\d{2}$/;

function isValidTime(time: string): boolean {
  if (!TIME_PATTERN.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isValidCustomSoundPath(soundEnabled: boolean, filePath: string): boolean {
  if (!soundEnabled) return true;
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
    typeof obj.soundEnabled === 'boolean' &&
    typeof obj.toastEnabled === 'boolean' &&
    typeof obj.ttsEnabled === 'boolean' &&
    (obj.soundEnabled === true || obj.toastEnabled === true || obj.ttsEnabled === true) &&
    typeof obj.customSoundPath === 'string' &&
    isValidCustomSoundPath(obj.soundEnabled as boolean, obj.customSoundPath as string) &&
    typeof obj.autoStart === 'boolean' &&
    Array.isArray(obj.filters) &&
    obj.filters.length <= 100 &&
    obj.filters.every((f: unknown) => typeof f === 'string' && f.length <= 200) &&
    typeof obj.quietHoursEnabled === 'boolean' &&
    typeof obj.quietHoursStart === 'string' &&
    isValidTime(obj.quietHoursStart) &&
    typeof obj.quietHoursEnd === 'string' &&
    isValidTime(obj.quietHoursEnd) &&
    typeof obj.micMuteEnabled === 'boolean'
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
    const tokenToTest = typeof token === 'string' && token.length > 0 ? token : getToken();
    if (typeof tokenToTest !== 'string' || tokenToTest.length === 0 || tokenToTest.length > 500) {
      return { success: false, message: 'No token set. Please enter a token first.' };
    }
    return testConnection(tokenToTest);
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
