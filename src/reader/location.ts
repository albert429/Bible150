import { catalog } from "../bible/catalog.ts";
import {
  parseReadingLocation,
  readingSearch,
  validBibleLocation,
} from "../bible/navigation.ts";
import type {
  BibleLocation,
  PlanLocation,
  ReadingLocation,
} from "../bible/types.ts";
import { isPlanDay } from "../plan/schedule.ts";

export const LOCATION_KEY = "bible-reader-location-v1";
/** Reading mode, canonical place and listening preference; never plan progress. */
export type ReaderPreferences = {
  version: 1;
  mode: "plan" | "bible";
  /** Session only: the plan reopens on the reader's scheduled day, as it always has. */
  plan: PlanLocation;
  bible: BibleLocation;
  continuous: boolean;
};
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
/** `day` is the active reader's scheduled day (or 1 without a reader). */
export function loadPreferences(
  day: number,
  raw?: string | null,
): ReaderPreferences {
  const initial: ReaderPreferences = {
    version: 1,
    mode: "plan",
    plan: { mode: "plan", day },
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
/** What is stored: the plan day is profile-specific and comes from the schedule. */
export function storedPreferences({
  version,
  mode,
  bible,
  continuous,
}: ReaderPreferences) {
  return JSON.stringify({ version, mode, bible, continuous });
}
export function initialPreferences(
  day: number,
  search: string,
  raw?: string | null,
) {
  const saved = loadPreferences(day, raw);
  const linked = parseReadingLocation(search, catalog);
  return linked
    ? { ...saved, mode: linked.mode, [linked.mode]: linked }
    : saved;
}
/**
 * The address bar for a location. Plan reading stays at the bare app URL, so a
 * reload or home-screen shortcut still opens the scheduled day; canonical
 * chapters get a shareable static link. History state carries both.
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
