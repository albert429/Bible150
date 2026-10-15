import { isPlanDay } from "../plan/schedule.ts";
import type { BibleBook, BibleLocation, ReadingLocation } from "./types.ts";

export const findBibleBook = (catalog: readonly BibleBook[], code: string) =>
  catalog.find((book) => book.usfm === code);

export function validBibleLocation(
  catalog: readonly BibleBook[],
  location: BibleLocation,
): boolean {
  const book = findBibleBook(catalog, location.book);
  return !!(
    book &&
    Number.isInteger(location.chapter) &&
    location.chapter >= 1 &&
    location.chapter <= book.chapters &&
    (location.verse === undefined ||
      (Number.isInteger(location.verse) &&
        location.verse >= 1 &&
        location.verse <= book.verseCounts[location.chapter - 1]))
  );
}

/** Returns undefined at Genesis 1 / Revelation 22 instead of wrapping around. */
export function adjacentChapter(
  catalog: readonly BibleBook[],
  location: BibleLocation,
  direction: -1 | 1,
): BibleLocation | undefined {
  if (!validBibleLocation(catalog, location)) return;
  const index = catalog.findIndex((book) => book.usfm === location.book);
  const book = catalog[index];
  const chapter = location.chapter + direction;
  if (chapter >= 1 && chapter <= book.chapters)
    return { mode: "bible", book: book.usfm, chapter };
  const next = catalog[index + direction];
  if (next)
    return {
      mode: "bible",
      book: next.usfm,
      chapter: direction === 1 ? 1 : next.chapters,
    };
}

const integer = (value: string | null) =>
  value !== null && /^\d+$/.test(value) ? Number(value) : NaN;

/** Parse and validate both canonical links and the existing ?day=N links. */
export function parseReadingLocation(
  search: string,
  catalog: readonly BibleBook[],
): ReadingLocation | undefined {
  const query = new URLSearchParams(search);
  const verse = query.has("verse") ? integer(query.get("verse")) : undefined;
  if (verse !== undefined && (!Number.isSafeInteger(verse) || verse < 1))
    return;
  if (query.get("mode") === "bible") {
    const location: BibleLocation = {
      mode: "bible",
      book: query.get("book") || "",
      chapter: integer(query.get("chapter")),
      ...(verse === undefined ? {} : { verse }),
    };
    return validBibleLocation(catalog, location) ? location : undefined;
  }
  if (query.has("mode") && query.get("mode") !== "plan") return;
  const day = integer(query.get("day"));
  if (isPlanDay(day))
    return { mode: "plan", day, ...(verse === undefined ? {} : { verse }) };
}

export function readingSearch(location: ReadingLocation): string {
  const query = new URLSearchParams();
  if (location.mode === "bible") {
    query.set("mode", "bible");
    query.set("book", location.book);
    query.set("chapter", String(location.chapter));
  } else query.set("day", String(location.day));
  if (location.verse !== undefined) query.set("verse", String(location.verse));
  return `?${query}`;
}
