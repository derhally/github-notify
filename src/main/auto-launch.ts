import { app } from 'electron';

export function setAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
  });
}
