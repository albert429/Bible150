import { useEffect } from "react";
import { connectionAllowsPrefetch } from "../lib/network.ts";
import { adjacentChapter } from "../bible/navigation";
import { catalog } from "../bible/catalog";
import { chapters } from "../bible/client";
import {
  readingKey,
  type ReadingLocation,
  type ScriptureReading,
} from "../bible/types";
import { days, type Day } from "../plan/readings.ts";

export function useAdjacentPrefetch(
  selected: number,
  reading: Day | undefined,
  error: string | undefined,
  active: boolean,
) {
  useEffect(() => {
    if (
      !active ||
      reading?.day !== selected ||
      error ||
      !connectionAllowsPrefetch()
    )
      return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Let the selected reading and its fonts settle before scheduling neighbors.
    Promise.resolve(document.fonts?.ready).then(
      () => {
        if (cancelled) return;
        timer = setTimeout(() => {
          if (cancelled || !connectionAllowsPrefetch()) return;
          void days.prefetchDay(selected - 1);
          void days.prefetchDay(selected + 1);
        }, 500);
      },
      () => {},
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Requests already started belong to the shared client and may be foreground work.
    };
  }, [selected, reading?.day, error, active]);
}

/** Prepare only the immediate canonical neighbors, after text and fonts settle. */
export function useChapterPrefetch(
  location: ReadingLocation,
  reading: ScriptureReading | undefined,
  error: string | undefined,
) {
  const identity = readingKey(location);
  const loaded = reading ? readingKey(reading) : undefined;
  const book = location.mode === "bible" ? location.book : undefined;
  const chapter = location.mode === "bible" ? location.chapter : undefined;
  useEffect(() => {
    if (
      !book ||
      !chapter ||
      loaded !== identity ||
      error ||
      !connectionAllowsPrefetch()
    )
      return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    Promise.resolve(document.fonts?.ready).then(
      () => {
        if (cancelled) return;
        timer = setTimeout(() => {
          if (cancelled || !connectionAllowsPrefetch()) return;
          const current = { mode: "bible" as const, book, chapter };
          for (const direction of [-1, 1] as const) {
            const next = adjacentChapter(catalog, current, direction);
            if (next) void chapters.prefetchChapter(next);
          }
        }, 500);
      },
      () => {},
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [identity, loaded, book, chapter, error]);
}
