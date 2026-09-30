import { t } from './index';

/** "hace 2 h", "ayer": lo justo para ubicar una foto en el día. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = t().streak;
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return s.justNow;
  if (min < 60) return s.minutesAgo.replace('{{count}}', String(min));
  const h = Math.round(min / 60);
  if (h < 24) return s.hoursAgo.replace('{{count}}', String(h));
  const d = Math.round(h / 24);
  if (d === 1) return s.yesterday;
  return s.daysAgo.replace('{{count}}', String(d));
}
