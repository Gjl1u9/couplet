const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DAY_MS = DAY * 1000;

function amount(seconds: number): { count: number; unit: string } {
  if (seconds < HOUR) {
    return { count: Math.max(Math.round(seconds / MINUTE), 1), unit: 'min' };
  }
  if (seconds < DAY) return { count: Math.round(seconds / HOUR), unit: 'hour' };
  return { count: Math.round(seconds / DAY), unit: 'day' };
}

/** `10 min`, `1 hour`, or `3 days`. */
export function formatInterval(seconds: number): string {
  const { count, unit } = amount(seconds);
  const plural = unit !== 'min' && count !== 1 ? 's' : '';
  return `${String(count)} ${unit}${plural}`;
}

/** `10-min` or `3-day`, for use before a noun. */
export function formatIntervalAdjective(seconds: number): string {
  const { count, unit } = amount(seconds);
  return `${String(count)}-${unit}`;
}

/** `3:24`, or `1:02:08` for long videos. */
export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

export function formatDue(dueAt: number, now: number): string {
  return dueAt <= now ? 'Now' : `In ${formatInterval((dueAt - now) / 1000)}`;
}

export const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

export function savedGroup(savedAt: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(savedAt)) / DAY_MS);
  if (days <= 0) return 'Today';
  return days === 1 ? 'Yesterday' : 'Earlier';
}

export interface MarkedText {
  readonly before: string;
  readonly mark: string;
  readonly after: string;
}

/** Finds the word to mark, or `null` when a word saved long ago is not in its cue. */
export function markWord(
  text: string,
  form: string,
  offset: number | null,
): MarkedText | null {
  const at =
    offset !== null && text.startsWith(form, offset)
      ? offset
      : text.toLocaleLowerCase().indexOf(form.toLocaleLowerCase());
  if (at < 0 || form === '') return null;
  return {
    before: text.slice(0, at),
    mark: text.slice(at, at + form.length),
    after: text.slice(at + form.length),
  };
}
