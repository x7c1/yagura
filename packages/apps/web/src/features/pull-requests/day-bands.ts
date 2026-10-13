import { dayKeyOf } from "@yagura/activity";

/**
 * Which of two alternating bands each of `times` falls in: 0 for the first
 * time's local day, then switching each time the local day changes from one
 * time to the next. Times of one day in a row share a band, however many
 * there are.
 */
export function dayBands(times: readonly Date[]): (0 | 1)[] {
  const bands: (0 | 1)[] = [];
  let band: 0 | 1 = 0;
  let previous: string | null = null;
  for (const time of times) {
    const day = dayKeyOf(time);
    if (previous !== null && day !== previous) {
      band = band === 0 ? 1 : 0;
    }
    bands.push(band);
    previous = day;
  }
  return bands;
}
