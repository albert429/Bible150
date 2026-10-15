import type { Day, Passage } from "../plan/readings.ts";

export type BibleBook = {
  usfm: string;
  name: string;
  testament: "OT" | "NT";
  chapters: number;
  verseCounts: number[];
};

/** A source block anchored before a verse, or at a Unicode codepoint within it. */
export type BibleBlock = {
  kind: "heading" | "superscription" | "acrostic" | "paragraph" | "poetry";
  marker: string;
  verse: number;
  offset: number;
  text?: string;
};

export type BibleChapter = {
  mode: "bible";
  usfm: string;
  book: string;
  chapter: number;
  verseCount: number;
  passages: [Passage];
  structure: BibleBlock[];
};
export type ScriptureReading = Day | BibleChapter;
export type PlanLocation = { mode: "plan"; day: number; verse?: number };
export type BibleLocation = {
  mode: "bible";
  book: string;
  chapter: number;
  verse?: number;
};
export type ReadingLocation = PlanLocation | BibleLocation;

export function isBibleChapter(
  reading: ScriptureReading,
): reading is BibleChapter {
  return "mode" in reading && reading.mode === "bible";
}

/** One cache/player identity; canonical chapters never masquerade as plan days. */
export function readingKey(
  reading: ScriptureReading | ReadingLocation,
): string {
  if ("mode" in reading && reading.mode === "bible")
    return `bible:${"usfm" in reading ? reading.usfm : reading.book}:${reading.chapter}`;
  return `plan:${reading.day}`;
}
