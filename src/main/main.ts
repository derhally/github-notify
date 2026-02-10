import { app, BrowserWindow, powerMonitor, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createTray, setTrayState, getIsPaused } from './tray';
import { registerIpcHandlers } from './ipc-handlers';
import { startPolling, stopPolling, restartPolling, pollNow } from './poller';
import { hasToken, getSettings } from './store';
import { setAutoLaunch } from './auto-launch';
import { log, flushLogs, getLogFilePath } from './logger';
import { TrayState } from '../shared/types';

if (started) {
  app.quit();
}

app.setAppUserModelId('com.github-notify.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let settingsWindow: BrowserWindow | null = null;

function openSettings(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 660,
    resizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    settingsWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (event) => { event.preventDefault(); });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function onSettingsChanged(): void {
  const settings = getSettings();
  setAutoLaunch(settings.autoStart);
  restartPolling();
  log('Settings changed, polling restarted');
}

app.on('window-all-closed', () => {
  // Keep tray app alive
});

app.on('second-instance', () => {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.focus();
  } else {
    openSettings();
  }
});

app.whenReady().then(() => {
  log('GitHub Notify starting');

  registerIpcHandlers(onSettingsChanged);

  createTray({
    onCheckNow: () => {
      log('Manual poll triggered');
      void pollNow();
    },
    onOpenSettings: openSettings,
    onTogglePause: () => {
      if (getIsPaused()) {
        stopPolling();
        log('Polling paused');
      } else {
        startPolling();
        log('Polling resumed');
      }
    },
    onOpenLogs: () => {
      shell.openPath(getLogFilePath());
    },
    onQuit: () => {
      log('User quit');
      app.quit();
    },
  });

  if (hasToken()) {
    setTrayState(TrayState.Normal);
    startPolling();
  } else {
    setTrayState(TrayState.Unconfigured);
    openSettings();
  }

  const settings = getSettings();
  setAutoLaunch(settings.autoStart);

  powerMonitor.on('resume', () => {
    log('System resumed from sleep, polling immediately');
    if (!getIsPaused() && hasToken()) {
      void pollNow();
    }
  });

  app.on('before-quit', () => {
    stopPolling();
    log('GitHub Notify shutting down');
    void flushLogs();
  });
});
