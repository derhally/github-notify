import { getSettings } from './store';
import { getSnoozeUntil, clearSnooze } from './store';

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

export function isInQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const s = parseTime(start);
  const e = parseTime(end);
  const startMinutes = s.hours * 60 + s.minutes;
  const endMinutes = e.hours * 60 + e.minutes;

  if (startMinutes > endMinutes) {
    // Overnight range (e.g., 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  // Same-day range (e.g., 13:00 to 14:00)
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function isSnoozed(): boolean {
  const until = getSnoozeUntil();
  if (until === 0) return false;

  if (Date.now() >= until) {
    clearSnooze();
    return false;
  }

  return true;
}

export function isNotificationSuppressed(): boolean {
  if (isSnoozed()) return true;

  const settings = getSettings();
  if (settings.quietHoursEnabled && isInQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
    return true;
  }

  return false;
}
