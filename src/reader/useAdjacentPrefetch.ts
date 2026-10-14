import { useEffect } from "react";
import { connectionAllowsPrefetch } from "../lib/network.ts";
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
