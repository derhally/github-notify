import { Tray, Menu, nativeImage, NativeImage, MenuItemConstructorOptions, nativeTheme } from 'electron';
import path from 'node:path';
import { TrayState } from '../shared/types';

let tray: Tray | null = null;
let currentState: TrayState = TrayState.Unconfigured;
let isPaused = false;
let snoozeEndTime = 0;
let iconCache: Map<TrayState, NativeImage> | null = null;

interface TrayCallbacks {
  onCheckNow: () => void;
  onOpenSettings: () => void;
  onTogglePause: () => void;
  onSnooze: (durationMinutes: number) => void;
  onCancelSnooze: () => void;
  onOpenLogs: () => void;
  onQuit: () => void;
}

let callbacks: TrayCallbacks;

const ICON_FILENAMES: Record<TrayState, string> = {
  [TrayState.Normal]: 'tray-icon.png',
  [TrayState.Error]: 'tray-icon-error.png',
  [TrayState.Unconfigured]: 'tray-icon-unconfigured.png',
  [TrayState.Quiet]: 'tray-icon-quiet.png',
};

const LIGHT_THEME_OVERRIDES: Partial<Record<TrayState, string>> = {
  [TrayState.Normal]: 'tray-icon-dark.png',
};

function getIconFilename(state: TrayState): string {
  if (!nativeTheme.shouldUseDarkColors) {
    const override = LIGHT_THEME_OVERRIDES[state];
    if (override) return override;
  }
  return ICON_FILENAMES[state];
}

function loadIcons(): Map<TrayState, NativeImage> {
  const cache = new Map<TrayState, NativeImage>();
  for (const state of Object.values(TrayState)) {
    const iconPath = path.join(__dirname, 'assets', getIconFilename(state));
    const icon = nativeImage.createFromPath(iconPath);
    cache.set(state, icon.isEmpty() ? nativeImage.createEmpty() : icon);
  }
  return cache;
}

function getIcon(state: TrayState): NativeImage {
  if (!iconCache) {
    iconCache = loadIcons();
  }
  return iconCache.get(state) || nativeImage.createEmpty();
}

function onThemeUpdated(): void {
  iconCache = null;
  if (tray) {
    tray.setImage(getIcon(currentState));
  }
}

function formatSnoozeRemaining(): string {
  const remaining = snoozeEndTime - Date.now();
  if (remaining <= 0) return '';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function buildSnoozeMenuItems(): MenuItemConstructorOptions {
  const isActive = snoozeEndTime > Date.now();

  if (isActive) {
    return {
      label: `Cancel Snooze (${formatSnoozeRemaining()} left)`,
      click: () => {
        callbacks.onCancelSnooze();
        updateContextMenu();
      },
    };
  }

  return {
    label: 'Snooze',
    submenu: [
      { label: '30 minutes', click: () => callbacks.onSnooze(30) },
      { label: '1 hour', click: () => callbacks.onSnooze(60) },
      { label: '2 hours', click: () => callbacks.onSnooze(120) },
      { label: '4 hours', click: () => callbacks.onSnooze(240) },
    ],
  };
}

function buildContextMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Check Now',
      click: () => callbacks.onCheckNow(),
      enabled: !isPaused && currentState !== TrayState.Unconfigured,
    },
    {
      label: isPaused ? 'Resume Polling' : 'Pause Polling',
      click: () => {
        isPaused = !isPaused;
        callbacks.onTogglePause();
        updateContextMenu();
      },
      enabled: currentState !== TrayState.Unconfigured,
    },
    {
      ...buildSnoozeMenuItems(),
      enabled: currentState !== TrayState.Unconfigured,
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => callbacks.onOpenSettings(),
    },
    {
      label: 'Open Logs',
      click: () => callbacks.onOpenLogs(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => callbacks.onQuit(),
    },
  ];
  return Menu.buildFromTemplate(template);
}

function updateContextMenu(): void {
  if (tray) {
    tray.setContextMenu(buildContextMenu());
  }
}

export function createTray(cbs: TrayCallbacks): Tray {
  callbacks = cbs;

  tray = new Tray(getIcon(currentState));
  tray.setToolTip('GitHub Notify - Not configured');
  tray.setContextMenu(buildContextMenu());

  tray.on('click', () => {
    tray?.popUpContextMenu();
  });

  nativeTheme.on('updated', onThemeUpdated);

  return tray;
}

export function setTrayState(state: TrayState): void {
  if (currentState === state) return;
  currentState = state;
  if (!tray) return;

  tray.setImage(getIcon(state));
  updateContextMenu();
}

export function setTrayTooltip(tooltip: string): void {
  tray?.setToolTip(tooltip);
}

export function getIsPaused(): boolean {
  return isPaused;
}

export function setSnoozeEndTime(endTime: number): void {
  snoozeEndTime = endTime;
  updateContextMenu();
}

export function refreshContextMenu(): void {
  updateContextMenu();
}

