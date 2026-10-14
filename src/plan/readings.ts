import { createJsonClient } from "../lib/jsonClient.ts";

export type Verse = { number: number; text: string; heading?: string };
export type Passage = {
  book: string;
  chapter: number;
  start: number;
  end: number;
  verses?: Verse[];
};
export type Day = { day: number; verseCount: number; passages: Passage[] };

// Public Scripture only. Personal progress stays in the existing storage module.
export function createReadingsClient(
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  const validDay = (day: Day) =>
    day && Number.isInteger(day.day) && Array.isArray(day.passages);
  const { load, peek } = createJsonClient<Day | Day[]>(
    {
      url: (key) => `/readings/${key}.json`,
      validate: (data, key): data is Day | Day[] =>
        key === "plan"
          ? Array.isArray(data) && data.length === 150 && data.every(validDay)
          : validDay(data as Day) && (data as Day).day === Number(key),
      message: (key) =>
        key === "plan"
          ? "تعذر تحميل خطة القراءة. تحقق من الاتصال وحاول مرة أخرى."
          : "تعذر تحميل القراءة. تحقق من الاتصال وحاول مرة أخرى.",
    },
    fetcher,
    timeoutMs,
  );
  return {
    load,
    peek,
    // Background failures are intentionally silent; load retains normal retry behavior.
    prefetchDay: (day: number): Promise<void> => {
      if (!Number.isInteger(day) || day < 1 || day > 150)
        return Promise.resolve();
      return load(String(day)).then(
        () => {},
        () => {},
      );
    },
  };
}
export const readings = createReadingsClient();
