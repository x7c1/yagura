import { periodDays, type Period } from "./period";

/**
 * The local day `time` falls on, as `YYYY-MM-DD`: the key the browser cache
 * stores a day's results under.
 */
export function dayKeyOf(time: Date): string {
  return (
    `${time.getFullYear()}-${pad(time.getMonth() + 1)}-` +
    `${pad(time.getDate())}`
  );
}

/** Local midnight at the start of the day `day` (a {@link dayKeyOf} key). */
export function startOfDay(day: string): Date {
  const [year, month, date] = parseDayKey(day);
  return new Date(year, month - 1, date);
}

/** Local midnight at the end of the day `day`: the start of the next one. */
export function startOfNextDay(day: string): Date {
  const [year, month, date] = parseDayKey(day);
  return new Date(year, month - 1, date + 1);
}

/** The keys of the period's days, oldest first; the last is today. */
export function periodDayKeys(period: Period): string[] {
  const { start } = period;
  return Array.from({ length: periodDays }, (_, index) =>
    dayKeyOf(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
    ),
  );
}

function parseDayKey(day: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new Error(`Not a day key: ${day}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
