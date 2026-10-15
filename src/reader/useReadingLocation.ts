import { useEffect, useState } from "react";
import { catalog } from "../bible/catalog";
import { parseReadingLocation, readingSearch } from "../bible/navigation";
import type { ReadingLocation } from "../bible/types";
import { initialPreferences, LOCATION_KEY, validLocation } from "./location";

export function useReadingLocation(initialDay: number) {
  const [preferences, setPreferences] = useState(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCATION_KEY);
    } catch {
      /* session only */
    }
    return initialPreferences(initialDay, location.search, saved);
  });
  const current = preferences[preferences.mode];
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    history.replaceState(
      { ...history.state, scripture: current },
      "",
      `${location.pathname}${readingSearch(current)}${location.hash}`,
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
        setPreferences((saved) => ({
          ...saved,
          mode: next.mode,
          [next.mode]: next,
        }));
        setNavigation((n) => n + 1);
      }
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  function go(next: ReadingLocation, replace = false) {
    if (!validLocation(next)) return;
    const url = `${location.pathname}${readingSearch(next)}${location.hash}`;
    history[replace ? "replaceState" : "pushState"](
      { ...history.state, scripture: next },
      "",
      url,
    );
    setPreferences((saved) => ({
      ...saved,
      mode: next.mode,
      [next.mode]: next,
    }));
    setNavigation((n) => n + 1);
  }
  return {
    current,
    navigation,
    preferences,
    go,
    chooseMode: (mode: "plan" | "bible") => go(preferences[mode]),
    resetPlan: (day: number) =>
      setPreferences((saved) => ({ ...saved, plan: { mode: "plan", day } })),
    setContinuous: (continuous: boolean) =>
      setPreferences((saved) => ({ ...saved, continuous })),
  };
}
