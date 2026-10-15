import { useEffect, useMemo, useState } from "react";
import { catalog } from "../bible/catalog";
import { parseReadingLocation } from "../bible/navigation";
import type { ReadingLocation } from "../bible/types";
import {
  initialPreferences,
  LOCATION_KEY,
  locationSearch,
  planLocation,
  sameLocation,
  validLocation,
  withLocation,
} from "./location";

/**
 * The reading mode and the last place in each mode, with history entries and
 * links. `reader` is the active reader's id ("" without one) and `scheduled`
 * their scheduled day, used until that reader has a place of their own.
 */
export function useReadingLocation(reader: string, scheduled: number) {
  const [state, setState] = useState(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCATION_KEY);
    } catch {
      /* session only */
    }
    return {
      reader,
      scheduled,
      preferences: initialPreferences(reader, location.search, saved),
    };
  });
  const { preferences } = state;
  const plan = useMemo(
    () => planLocation(preferences, state.reader, state.scheduled),
    [preferences, state.reader, state.scheduled],
  );
  const current = preferences.mode === "bible" ? preferences.bible : plan;
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    // An address that already names this place, such as an explicit ?day=
    // link, is kept so that a reload returns to it.
    const search = sameLocation(
      parseReadingLocation(location.search, catalog),
      current,
    )
      ? location.search
      : locationSearch(current);
    history.replaceState(
      { ...history.state, scripture: current },
      "",
      `${location.pathname}${search}${location.hash}`,
    );
    try {
      localStorage.setItem(LOCATION_KEY, JSON.stringify(preferences));
    } catch {
      /* session only */
    }
  }, [preferences, current]);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const next = validLocation(event.state?.scripture)
        ? (event.state.scripture as ReadingLocation)
        : parseReadingLocation(location.search, catalog);
      if (next) {
        setState((saved) => ({
          ...saved,
          preferences: withLocation(saved.preferences, saved.reader, next),
        }));
        setNavigation((n) => n + 1);
      }
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  function go(next: ReadingLocation, replace = false) {
    if (!validLocation(next)) return;
    const url = `${location.pathname}${locationSearch(next)}${location.hash}`;
    history[replace ? "replaceState" : "pushState"](
      { ...history.state, scripture: next },
      "",
      url,
    );
    setState((saved) => ({
      ...saved,
      preferences: withLocation(saved.preferences, saved.reader, next),
    }));
    setNavigation((n) => n + 1);
  }
  return {
    current,
    navigation,
    plan,
    preferences,
    go,
    chooseMode: (mode: "plan" | "bible") =>
      go(mode === "bible" ? preferences.bible : plan),
    /** Switch to another reader's plan place; returns the day it opens. */
    selectReader(nextReader: string, nextScheduled: number) {
      setState((saved) => ({
        ...saved,
        reader: nextReader,
        scheduled: nextScheduled,
      }));
      return planLocation(preferences, nextReader, nextScheduled).day;
    },
    setContinuous: (continuous: boolean) =>
      setState((saved) => ({
        ...saved,
        preferences: { ...saved.preferences, continuous },
      })),
  };
}
