import { Tray, Menu, nativeImage, NativeImage, MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { TrayState } from '../shared/types';

let tray: Tray | null = null;
let currentState: TrayState = TrayState.Unconfigured;
let isPaused = false;
let iconCache: Map<TrayState, NativeImage> | null = null;

interface TrayCallbacks {
  onCheckNow: () => void;
  onOpenSettings: () => void;
  onTogglePause: () => void;
  onOpenLogs: () => void;
  onQuit: () => void;
}

let callbacks: TrayCallbacks;

const ICON_FILENAMES: Record<TrayState, string> = {
  [TrayState.Normal]: 'tray-icon.png',
  [TrayState.Error]: 'tray-icon-error.png',
  [TrayState.Unconfigured]: 'tray-icon-unconfigured.png',
};

function loadIcons(): Map<TrayState, NativeImage> {
  const cache = new Map<TrayState, NativeImage>();
  for (const state of Object.values(TrayState)) {
    const iconPath = path.join(__dirname, '../../assets', ICON_FILENAMES[state]);
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

