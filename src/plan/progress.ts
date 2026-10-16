import { catalog } from "../bible/catalog.ts";
import { findBibleBook } from "../bible/navigation.ts";
import {
  trackOf,
  type AnyReadingLocation,
  type ReadingTrack,
} from "../bible/types.ts";
import {
  MAX_CHRONOLOGY_READINGS,
  isChronologyId,
} from "../chronology/types.ts";
import {
  LOCATION_KEY,
  freshPlaces,
  loadPreferences,
  parseReaderPlaces,
  placesFromPreferences,
  type ReaderPlaces,
} from "../reader/location.ts";
import { PLAN_DAYS, isPlanDay } from "./schedule.ts";

/** The youth-plan view of a reader; `completed` lists finished plan days. */
export type Reader = {
  id: string;
  name: string;
  startDate: string;
  completed: number[];
};
/**
 * Explicitly completed readings per track: youth plan days, canonical
 * chapters as `USFM:chapter` (e.g. `GEN:1`) and chronology reading ids.
 */
export type TrackCompletion = {
  bible: string[];
  plan: number[];
  "chrono:OT": string[];
  "chrono:NT": string[];
};
/** A stored reader. `completed` always mirrors `completion.plan`. */
export type ReaderProfile = Reader &
  ReaderPlaces & { completion: TrackCompletion };
/** Everything on this device; the guest reads without a profile. */
export type ProgressState = {
  version: 2;
  activeId: string | null;
  profiles: ReaderProfile[];
  guest: ReaderPlaces;
  continuous: boolean;
};
/** The reader portion of a version 2 backup file. */
export type BackupReader = Omit<ReaderProfile, "id" | "completed">;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Legacy v1 progress; read only to migrate, never written or removed. */
export const PROGRESS_KEY = "nt-reading-progress-v1";
export const STATE_KEY = "bible-reader-state-v2";
export const MAX_READERS = 100;
export const MAX_BACKUP_BYTES = 262144;
const MAX_ID = 100;
const BIBLE_CHAPTERS = catalog.reduce((sum, book) => sum + book.chapters, 0);

const INVALID = "بيانات القراءة غير صالحة. اختر نسخة احتياطية صحيحة.";
const BLOCKED = "لا يسمح المتصفح بحفظ التقدم. اسمح بتخزين بيانات الموقع أولًا.";
const UNREADABLE =
  "تعذر قراءة التقدم المحفوظ. لم نغيّر بياناتك. جرّب استعادة نسخة احتياطية على متصفح آخر.";
const UNSAVED =
  "لم يتم الحفظ. مساحة المتصفح ممتلئة أو التخزين محظور. احتفظ بنسخة احتياطية وحاول مجددًا.";

export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    value <= "2100-12-31" &&
    !isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const validId = (id: unknown): id is string =>
  typeof id === "string" && !!id && id.length <= MAX_ID;
export const validChapterId = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^([A-Z0-9]{3}):(\d{1,3})$/.exec(value);
  const book = match && findBibleBook(catalog, match[1]);
  return !!book && Number(match[2]) >= 1 && Number(match[2]) <= book.chapters;
};
const unique = <T>(items: T[]) => [...new Set(items)];
const days = (items: number[]) => unique(items).sort((a, b) => a - b);

function validateReader(value: unknown): Omit<Reader, "id"> {
  const r = value as Partial<Reader> | null;
  if (
    !r ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.trim().length > 60 ||
    !validDate(r.startDate) ||
    !Array.isArray(r.completed) ||
    r.completed.length > PLAN_DAYS ||
    r.completed.some((n) => !isPlanDay(n))
  )
    throw Error(INVALID);
  return {
    name: r.name.trim(),
    startDate: r.startDate,
    completed: days(r.completed),
  };
}
export const emptyCompletion = (plan: number[] = []): TrackCompletion => ({
  bible: [],
  plan: days(plan),
  "chrono:OT": [],
  "chrono:NT": [],
});
function parseCompletion(value: unknown): TrackCompletion {
  if (
    !record(value) ||
    !onlyKeys(value, ["bible", "plan", "chrono:OT", "chrono:NT"])
  )
    throw Error(INVALID);
  const list = <T>(
    items: unknown,
    max: number,
    valid: (item: unknown) => item is T,
  ): T[] => {
    if (!Array.isArray(items) || items.length > max || !items.every(valid))
      throw Error(INVALID);
    return unique(items);
  };
  return {
    bible: list(value.bible, BIBLE_CHAPTERS, validChapterId),
    plan: days(
      list(value.plan, PLAN_DAYS, (n): n is number => isPlanDay(n as number)),
    ),
    "chrono:OT": list(
      value["chrono:OT"],
      MAX_CHRONOLOGY_READINGS,
      isChronologyId,
    ),
    "chrono:NT": list(
      value["chrono:NT"],
      MAX_CHRONOLOGY_READINGS,
      isChronologyId,
    ),
  };
}
const places = (value: unknown) => {
  const parsed = parseReaderPlaces(value);
  if (!parsed) throw Error(INVALID);
  return parsed;
};
/** A v2 backup reader or stored profile body, rebuilt from known fields. */
function parseBackupReader(value: unknown): BackupReader {
  if (!record(value)) throw Error(INVALID);
  const completion = parseCompletion(value.completion);
  const { name, startDate } = validateReader({
    name: value.name,
    startDate: value.startDate,
    completed: completion.plan,
  });
  return { name, startDate, ...places(value), completion };
}
const profile = (id: string, body: BackupReader): ReaderProfile => ({
  id,
  name: body.name,
  startDate: body.startDate,
  completed: body.completion.plan,
  track: body.track,
  places: body.places,
  completion: body.completion,
});
const freshState = (): ProgressState => ({
  version: 2,
  activeId: null,
  profiles: [],
  guest: freshPlaces(),
  continuous: false,
});

function parseState(raw: string): ProgressState {
  const data: unknown = JSON.parse(raw);
  if (
    !record(data) ||
    data.version !== 2 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length > MAX_READERS ||
    typeof data.continuous !== "boolean"
  )
    throw Error();
  const profiles = data.profiles.map((p: unknown) => {
    if (!record(p) || !validId(p.id)) throw Error();
    return profile(p.id, parseBackupReader(p));
  });
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    throw Error();
  if (data.activeId !== null && !profiles.some((p) => p.id === data.activeId))
    throw Error();
  return {
    version: 2,
    activeId: data.activeId as string | null,
    profiles,
    guest: places(data.guest),
    continuous: data.continuous,
  };
}

/** Legacy v1 progress, validated exactly as before. */
function legacyProgress(raw: string) {
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length > MAX_READERS
  )
    throw Error();
  const profiles: Reader[] = data.profiles.map((p: Reader) => {
    if (!validId(p.id)) throw Error();
    return { id: p.id, ...validateReader(p) };
  });
  if (new Set(profiles.map((p) => p.id)).size !== profiles.length)
    throw Error();
  if (data.activeId !== null && !profiles.some((p) => p.id === data.activeId))
    throw Error();
  return { activeId: data.activeId as string | null, profiles };
}

/**
 * The v2 state built from v1 progress and v1 device places. Readers keep
 * their mode and places; v1 completed days are youth plan days. Without any
 * v1 data this is the fresh state (the Bible at Genesis 1).
 */
export function migrateLegacy(
  progress: string | null,
  location: string | null,
): ProgressState {
  if (!progress && !location) return freshState();
  const preferences = loadPreferences(location);
  const { activeId, profiles } = progress
    ? legacyProgress(progress)
    : { activeId: null, profiles: [] };
  return {
    version: 2,
    activeId,
    profiles: profiles.map((r) => ({
      ...r,
      ...placesFromPreferences(preferences, r.id),
      completion: emptyCompletion(r.completed),
    })),
    guest: placesFromPreferences(preferences, ""),
    continuous: preferences.continuous,
  };
}

function readItem(storage: StorageLike, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    throw Error(BLOCKED);
  }
}
type Loaded = { state: ProgressState; source: "v2" | "legacy" | "fresh" };
function load(storage: StorageLike): Loaded {
  const raw = readItem(storage, STATE_KEY);
  try {
    if (raw) return { state: parseState(raw), source: "v2" };
    const progress = readItem(storage, PROGRESS_KEY);
    let location: string | null = null;
    try {
      location = storage.getItem(LOCATION_KEY);
    } catch {
      /* places are optional */
    }
    return {
      state: migrateLegacy(progress, location),
      source: progress || location ? "legacy" : "fresh",
    };
  } catch (err) {
    if ((err as Error).message === BLOCKED) throw err;
    throw Error(UNREADABLE, { cause: err });
  }
}
/**
 * The device's state. Before the first v2 write this is migrated in memory
 * from the untouched v1 keys, so a failed write is simply retried later.
 */
export const loadProgress = (storage: StorageLike): ProgressState =>
  load(storage).state;

const serialize = (state: ProgressState) =>
  JSON.stringify({
    version: 2,
    activeId: state.activeId,
    profiles: state.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.startDate,
      track: p.track,
      places: p.places,
      completion: p.completion,
    })),
    guest: state.guest,
    continuous: state.continuous,
  });
/** One atomic write of the whole state, confirmed by reading it back. */
function persist(storage: StorageLike, state: ProgressState) {
  const text = serialize(state);
  try {
    storage.setItem(STATE_KEY, text);
    if (storage.getItem(STATE_KEY) !== text) throw Error();
  } catch {
    throw Error(UNSAVED);
  }
}
const update = (
  storage: StorageLike,
  change: (state: ProgressState) => ProgressState,
) => {
  const next = change(loadProgress(storage));
  persist(storage, next);
  return next;
};

/**
 * Commit a pending v1 migration. Safe to repeat: v1 keys are never changed,
 * and until a v2 write succeeds every load migrates again.
 */
export function migrateProgress(storage: StorageLike): {
  state: ProgressState;
  migrated: boolean;
} {
  const { state, source } = load(storage);
  if (source !== "legacy") return { state, migrated: source === "v2" };
  try {
    persist(storage, state);
    return { state, migrated: true };
  } catch {
    return { state, migrated: false };
  }
}

export function currentReader(storage: StorageLike) {
  const s = loadProgress(storage);
  return s.profiles.find((p) => p.id === s.activeId) || null;
}
/** A reader's places; "" (or an unknown id) is the guest. */
export function readerPlaces(state: ProgressState, id: string): ReaderPlaces {
  const reader = id ? state.profiles.find((p) => p.id === id) : undefined;
  return reader ? { track: reader.track, places: reader.places } : state.guest;
}
function addProfile(
  storage: StorageLike,
  body: BackupReader | ((state: ProgressState) => BackupReader),
): ReaderProfile {
  let created: ReaderProfile | undefined;
  update(storage, (s) => {
    if (s.profiles.length >= MAX_READERS)
      throw Error("وصلت إلى الحد الأقصى للقراء على هذا الجهاز.");
    created = profile(
      crypto.randomUUID(),
      typeof body === "function" ? body(s) : body,
    );
    return { ...s, activeId: created.id, profiles: [...s.profiles, created] };
  });
  return created!;
}
/**
 * A new active reader. They keep the current reading choice and Bible and
 * chronology places; the youth plan opens on their own scheduled day.
 */
export function createReader(
  storage: StorageLike,
  name: string,
  startDate: string,
  completed: number[] = [],
): ReaderProfile {
  const reader = validateReader({ name, startDate, completed });
  return addProfile(storage, (s) => {
    const { track, places: from } = readerPlaces(s, s.activeId ?? "");
    const kept = { ...from };
    delete kept.plan;
    return {
      name: reader.name,
      startDate: reader.startDate,
      track,
      places: kept,
      completion: emptyCompletion(reader.completed),
    };
  });
}
function changeProfile(
  storage: StorageLike,
  id: string,
  change: (reader: ReaderProfile) => ReaderProfile,
): ReaderProfile {
  let updated: ReaderProfile | undefined;
  update(storage, (s) => {
    const reader = s.profiles.find((p) => p.id === id);
    if (!reader) throw Error("اختر القارئ أولًا.");
    updated = change(reader);
    return {
      ...s,
      profiles: s.profiles.map((p) => (p.id === id ? updated! : p)),
    };
  });
  return updated!;
}
/** The completion entry for a place: plan day, `USFM:chapter` or reading id. */
export function completionEntry(location: AnyReadingLocation) {
  if (location.mode === "plan") return location.day;
  if (location.mode === "bible") return `${location.book}:${location.chapter}`;
  return location.readingId;
}
export function isReadingComplete(
  reader: Pick<ReaderProfile, "completion">,
  location: AnyReadingLocation,
): boolean {
  const done: (string | number)[] = reader.completion[trackOf(location)];
  return done.includes(completionEntry(location));
}
/**
 * Mark or unmark one reading as completed. Completion is only ever explicit;
 * opening, reading or listening never records it.
 */
export function setReadingCompletion(
  storage: StorageLike,
  id: string,
  location: AnyReadingLocation,
  completed: boolean,
): ReaderProfile {
  const track: ReadingTrack = trackOf(location);
  const entry = completionEntry(location);
  const valid =
    track === "plan"
      ? isPlanDay(entry as number)
      : track === "bible"
        ? validChapterId(entry)
        : isChronologyId(entry);
  if (!valid) throw Error("القراءة غير صالحة.");
  return changeProfile(storage, id, (reader) => {
    const done = new Set<string | number>(reader.completion[track]);
    if (completed) done.add(entry);
    else done.delete(entry);
    const list = [...done];
    const completion = {
      ...reader.completion,
      [track]: track === "plan" ? days(list as number[]) : list,
    } as TrackCompletion;
    if (
      completion[track].length >
      (track === "bible" ? BIBLE_CHAPTERS : MAX_CHRONOLOGY_READINGS)
    )
      throw Error("القراءة غير صالحة.");
    return { ...reader, completion, completed: completion.plan };
  });
}
/** Youth plan days; kept for existing callers. */
export function setCompletion(
  storage: StorageLike,
  id: string,
  day: number,
  completed: boolean,
): ReaderProfile {
  if (!isPlanDay(day)) throw Error("اليوم غير صالح.");
  return setReadingCompletion(storage, id, { mode: "plan", day }, completed);
}
export function selectReader(storage: StorageLike, id: string | null) {
  let selected: ReaderProfile | null = null;
  update(storage, (s) => {
    if (id !== null && !s.profiles.some((p) => p.id === id))
      throw Error("القارئ غير موجود.");
    selected = s.profiles.find((p) => p.id === id) || null;
    return { ...s, activeId: id };
  });
  return selected;
}
/** Save a reader's places ("" is the guest) and, optionally, continuous play. */
export function saveReaderPlaces(
  storage: StorageLike,
  id: string,
  places: ReaderPlaces,
  continuous?: boolean,
) {
  const parsed = parseReaderPlaces(places);
  if (!parsed) throw Error(INVALID);
  update(storage, (s) => {
    if (id && !s.profiles.some((p) => p.id === id))
      throw Error("القارئ غير موجود.");
    return {
      ...s,
      guest: id ? s.guest : parsed,
      profiles: id
        ? s.profiles.map((p) => (p.id === id ? { ...p, ...parsed } : p))
        : s.profiles,
      continuous: continuous ?? s.continuous,
    };
  });
}

/** A version 2 backup: every track's completion and place for one reader. */
export function exportBackup(reader: Reader | ReaderProfile) {
  const completion =
    "completion" in reader
      ? parseCompletion(reader.completion)
      : emptyCompletion(reader.completed);
  const body = parseBackupReader({
    name: reader.name,
    startDate: reader.startDate,
    ...("track" in reader
      ? { track: reader.track, places: reader.places }
      : { track: "plan", places: {} }),
    completion,
  });
  return JSON.stringify({ version: 2, reader: body }, null, 2);
}
/**
 * Import a v1 (youth plan days only) or v2 backup as a separate new reader,
 * so no existing progress is overwritten.
 */
export function importBackup(storage: StorageLike, text: string) {
  if (text.length > MAX_BACKUP_BYTES)
    throw Error("ملف النسخة الاحتياطية كبير جدًا.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("اختر ملف نسخة احتياطية بصيغة JSON.");
  }
  if (record(data) && data.version === 1) {
    const r = validateReader(data.reader);
    return addProfile(storage, {
      name: r.name,
      startDate: r.startDate,
      track: "plan",
      places: {},
      completion: emptyCompletion(r.completed),
    });
  }
  if (!record(data) || data.version !== 2)
    throw Error("نسخة احتياطية غير مدعومة.");
  if (
    !onlyKeys(data, ["version", "reader"]) ||
    !record(data.reader) ||
    !onlyKeys(data.reader, [
      "name",
      "startDate",
      "track",
      "places",
      "completion",
    ])
  )
    throw Error(INVALID);
  return addProfile(storage, parseBackupReader(data.reader));
}
