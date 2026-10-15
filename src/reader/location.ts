import { catalog } from "../bible/catalog.ts";
import {
  parseReadingLocation,
  readingSearch,
  validBibleLocation,
} from "../bible/navigation.ts";
import {
  readingKey,
  type BibleLocation,
  type PlanLocation,
  type ReadingLocation,
} from "../bible/types.ts";
import { isPlanDay } from "../plan/schedule.ts";

export const LOCATION_KEY = "bible-reader-location-v1";
/** The last mode and place in each mode on this device; never plan progress. */
export type ReaderPreferences = {
  version: 1;
  mode: "plan" | "bible";
  /** Each reader's last plan place, by reader id ("" without a reader). */
  plans: Record<string, PlanLocation>;
  bible: BibleLocation;
  continuous: boolean;
};
const MAX_READERS = 20;
export function validLocation(value: unknown): value is ReadingLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as ReadingLocation;
  if (location.mode === "bible") return validBibleLocation(catalog, location);
  return (
    location.mode === "plan" &&
    isPlanDay(location.day) &&
    (location.verse === undefined ||
      (Number.isSafeInteger(location.verse) && location.verse > 0))
  );
}
const validPlans = (value: unknown) =>
  Object.fromEntries(
    Object.entries(
      value && typeof value === "object" && !Array.isArray(value) ? value : {},
    )
      .filter(
        ([reader, place]) =>
          reader.length <= 100 &&
          validLocation(place) &&
          (place as ReadingLocation).mode === "plan",
      )
      .slice(-MAX_READERS),
  ) as Record<string, PlanLocation>;
export function loadPreferences(raw?: string | null): ReaderPreferences {
  const initial: ReaderPreferences = {
    version: 1,
    mode: "plan",
    plans: {},
    bible: { mode: "bible", book: "GEN", chapter: 1 },
    continuous: false,
  };
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object") return initial;
    const value = saved as Partial<ReaderPreferences>;
    if (value.version !== 1) return initial;
    return {
      ...initial,
      mode: value.mode === "bible" ? "bible" : "plan",
      plans: validPlans(value.plans),
      bible:
        validLocation(value.bible) && value.bible.mode === "bible"
          ? value.bible
          : initial.bible,
      continuous: value.continuous === true,
    };
  } catch {
    return initial;
  }
}
/** A reader's last plan place, or their scheduled day before they have one. */
export const planLocation = (
  preferences: ReaderPreferences,
  reader: string,
  scheduled: number,
): PlanLocation =>
  // Own properties only: ids such as "constructor" or "__proto__" are valid.
  (Object.prototype.hasOwnProperty.call(preferences.plans, reader)
    ? preferences.plans[reader]
    : undefined) ?? { mode: "plan", day: scheduled };
/** Move to a place; a plan place belongs to the active reader only. */
export function withLocation(
  preferences: ReaderPreferences,
  reader: string,
  location: ReadingLocation,
): ReaderPreferences {
  if (location.mode === "bible")
    return { ...preferences, mode: "bible", bible: location };
  const others = Object.entries(preferences.plans).filter(
    ([id]) => id !== reader,
  );
  return {
    ...preferences,
    mode: "plan",
    plans: {
      ...Object.fromEntries(others.slice(-(MAX_READERS - 1))),
      [reader]: location,
    },
  };
}
export function initialPreferences(
  reader: string,
  search: string,
  raw?: string | null,
) {
  const saved = loadPreferences(raw);
  const linked = parseReadingLocation(search, catalog);
  return linked ? withLocation(saved, reader, linked) : saved;
}
export const sameLocation = (a?: ReadingLocation, b?: ReadingLocation) =>
  !!a && !!b && readingKey(a) === readingKey(b) && a.verse === b.verse;
/**
 * The address for a place reached inside the app. Canonical chapters get a
 * shareable static link. Plan days stay at the bare app URL, so a home-screen
 * shortcut (the app has no web manifest) cannot pin one day; the stored place
 * reopens it instead. An explicit ?day= link is kept while it is current.
 */
export const locationSearch = (location: ReadingLocation) =>
  location.mode === "bible" ? readingSearch(location) : "";

const POSITION_KEY = "bible-reader-audio-position-v1";
export function playbackPosition(identity: string): number {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "{}");
    const value = saved[identity];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  } catch {
    return 0;
  }
}
export function savePlaybackPosition(identity: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "{}");
    const entries = Object.entries(
      saved && typeof saved === "object" ? saved : {},
    )
      .filter(([key]) => key !== identity)
      .slice(-19);
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({ ...Object.fromEntries(entries), [identity]: seconds }),
    );
  } catch {
    /* Reading remains usable when storage is blocked. */
  }
}
