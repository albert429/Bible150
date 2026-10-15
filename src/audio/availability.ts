import type { BibleBook } from "../bible/types.ts";

/**
 * Published canonical recordings as one "1"/"0" per chapter in catalog order:
 * a few bytes in the main bundle instead of 1,189 identity strings.
 */
export function chapterAvailability(
  catalog: readonly BibleBook[],
  identities: Iterable<string>,
): string {
  const published = new Set(identities);
  return catalog
    .flatMap((book) =>
      Array.from({ length: book.chapters }, (_, index) =>
        published.has(`bible:${book.usfm}:${index + 1}`) ? "1" : "0",
      ),
    )
    .join("");
}

export function chapterHasAudio(
  catalog: readonly BibleBook[],
  availability: string,
  location: { book: string; chapter: number },
): boolean {
  let index = 0;
  for (const book of catalog) {
    if (book.usfm === location.book)
      return (
        Number.isInteger(location.chapter) &&
        location.chapter >= 1 &&
        location.chapter <= book.chapters &&
        availability[index + location.chapter - 1] === "1"
      );
    index += book.chapters;
  }
  return false;
}
