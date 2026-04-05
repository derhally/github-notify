import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI, AppSettings } from '../shared/types';

const api: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  saveToken: (token: string) => ipcRenderer.invoke('token:save', token),
  hasToken: () => ipcRenderer.invoke('token:has'),
  testConnection: (token?: string) => ipcRenderer.invoke('token:test', token),
  openSoundFileDialog: () => ipcRenderer.invoke('dialog:open-sound-file'),
  openNotificationSettings: () => ipcRenderer.invoke('shell:open-notification-settings'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
