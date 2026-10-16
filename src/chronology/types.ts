/**
 * Pure contracts for the self-paced Old and New Testament chronologies.
 * Types only: catalogs and readings are fetched on demand, never imported.
 */
import type { Testament } from "../bible/types.ts";
import type { Passage, PassageRef } from "../plan/readings.ts";

/**
 * Where an item comes from in the source PDF. `page`/`pageEnd` are 1-based
 * printed-PDF pages; `group` is the source's own grouping label. Any place the
 * app deliberately departs from the source is recorded in `exceptions`.
 */
export type SourceProvenance = {
  source: string;
  page?: number;
  pageEnd?: number;
  group?: string;
  exceptions?: ProvenanceException[];
};
export const PROVENANCE_EXCEPTION_KINDS = [
  "split",
  "merged",
  "reordered",
  "added",
  "omitted",
  "corrected",
  "other",
] as const;
export type ProvenanceExceptionKind =
  (typeof PROVENANCE_EXCEPTION_KINDS)[number];
export type ProvenanceException = {
  kind: ProvenanceExceptionKind;
  note: string;
};

export type ChronologySubstage = {
  id: string;
  title: string;
  provenance?: SourceProvenance;
};
export type ChronologyStage = {
  id: string;
  title: string;
  substages?: ChronologySubstage[];
  provenance?: SourceProvenance;
};

/** One contiguous verse range: `usfm` chapter `chapter`, verses `from`–`to`. */
export type PassageOccurrence = {
  id: string;
  usfm: string;
  chapter: number;
  from: number;
  to: number;
  provenance?: SourceProvenance;
};

/** A catalog entry: enough to list, label and estimate, without Scripture. */
export type ChronologicalReadingSummary = {
  id: string;
  stageId: string;
  substageId?: string;
  title: string;
  estimatedMinutes: number;
  passages: PassageOccurrence[];
  provenance?: SourceProvenance;
};

/** The small per-testament index, in reading order. */
export type ChronologyCatalog = {
  version: 1;
  testament: Testament;
  title: string;
  sources: { id: string; title: string }[];
  stages: ChronologyStage[];
  readings: ChronologicalReadingSummary[];
};

/** A fetched passage: the existing Scripture shape plus its occurrence. */
export type ChronologicalPassage = Passage & {
  occurrenceId: string;
  provenance?: SourceProvenance;
};

/** A fetched reading; `passages` follow the summary's occurrence order. */
export type ChronologicalReading = Omit<
  ChronologicalReadingSummary,
  "passages"
> & {
  mode: "chronological";
  testament: Testament;
  verseCount: number;
  passages: ChronologicalPassage[];
};

/** Lowercase ASCII slug, e.g. `ot-001` or `creation-2`, up to 40 chars. */
export const CHRONOLOGY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CHRONOLOGY_ID = 40;
/** Upper bound on readings per testament, for storage and backup checks. */
export const MAX_CHRONOLOGY_READINGS = 1500;

export const isChronologyId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_CHRONOLOGY_ID &&
  CHRONOLOGY_ID.test(value);

export const occurrenceRef = (occurrence: PassageOccurrence): PassageRef => ({
  book: occurrence.usfm,
  chapter: occurrence.chapter,
  start: occurrence.from,
  end: occurrence.to,
});
