import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAnyReadingLocation,
  parseReadingLocation,
  readingSearch,
  validChronologicalLocation,
} from "../src/bible/navigation.ts";
import { catalog } from "../src/bible/catalog.ts";
import {
  readingKey,
  trackOf,
  type ChronologicalLocation,
} from "../src/bible/types.ts";
import {
  chronologyCatalogErrors,
  isChronologicalReadingData,
} from "../src/chronology/validate.ts";
import {
  PROGRESS_KEY,
  STATE_KEY,
  createReader,
  currentReader,
  exportBackup,
  importBackup,
  isReadingComplete,
  loadProgress,
  migrateProgress,
  readerPlaces,
  saveReaderPlaces,
  selectReader,
  setCompletion,
  setReadingCompletion,
} from "../src/plan/progress.ts";
import {
  LOCATION_KEY,
  currentPlace,
  locationSearch,
  parseTrackPlaces,
  trackPlace,
  withPlace,
} from "../src/reader/location.ts";

type Store = ReturnType<typeof storage>;
function storage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    failWrites: 0,
    getItem: (k: string) => values.get(k) ?? null,
    setItem(this: { failWrites: number }, k: string, v: string) {
      if (this.failWrites > 0) {
        this.failWrites--;
        throw Error("QuotaExceededError");
      }
      values.set(k, v);
    },
  };
}
const ot = (readingId: string): ChronologicalLocation => ({
  mode: "chronological",
  testament: "OT",
  readingId,
});
const nt = (readingId: string): ChronologicalLocation => ({
  ...ot(readingId),
  testament: "NT",
});
const legacyProgress = JSON.stringify({
  version: 1,
  activeId: "reader-a",
  profiles: [
    { id: "reader-a", name: "أ", startDate: "2026-09-01", completed: [3, 1] },
    { id: "constructor", name: "ب", startDate: "2026-10-01", completed: [] },
  ],
});
const legacyLocation = JSON.stringify({
  version: 1,
  mode: "bible",
  plans: {
    "reader-a": { mode: "plan", day: 40 },
    "": { mode: "plan", day: 5, verse: 2 },
  },
  bible: { mode: "bible", book: "JHN", chapter: 3, verse: 16 },
  continuous: true,
});
const legacy = () =>
  storage({ [PROGRESS_KEY]: legacyProgress, [LOCATION_KEY]: legacyLocation });

test("a fresh device opens the Bible at Genesis 1 and writes nothing", () => {
  const s = storage();
  const state = loadProgress(s);
  assert.deepEqual(state.guest, { track: "bible", places: {} });
  assert.deepEqual(currentPlace(state.guest, 1), {
    mode: "bible",
    book: "GEN",
    chapter: 1,
  });
  assert.deepEqual(migrateProgress(s).migrated, false);
  assert.equal(s.values.size, 0);
});

test("v1 progress and places migrate into v2, keeping the originals", () => {
  const s = legacy();
  const { state, migrated } = migrateProgress(s);
  assert.ok(migrated);
  assert.equal(s.getItem(PROGRESS_KEY), legacyProgress);
  assert.equal(s.getItem(LOCATION_KEY), legacyLocation);
  assert.deepEqual(loadProgress(s), state);
  assert.equal(state.activeId, "reader-a");
  assert.equal(state.continuous, true);
  const [a, b] = state.profiles;
  // v1 completed days are youth plan days, never chronology.
  assert.deepEqual(a.completed, [1, 3]);
  assert.deepEqual(a.completion, {
    bible: [],
    plan: [1, 3],
    "chrono:OT": [],
    "chrono:NT": [],
  });
  // Each reader keeps the saved mode and places.
  assert.equal(a.track, "bible");
  assert.deepEqual(a.places.plan, { mode: "plan", day: 40 });
  assert.deepEqual(currentPlace(a, 1), {
    mode: "bible",
    book: "JHN",
    chapter: 3,
    verse: 16,
  });
  assert.equal(b.id, "constructor");
  assert.deepEqual(trackPlace(b, "plan", 9), { mode: "plan", day: 9 });
  assert.deepEqual(state.guest.places.plan, { mode: "plan", day: 5, verse: 2 });
  // Repeating is harmless.
  assert.deepEqual(migrateProgress(s).state, state);
});

test("legacy users without saved places keep the plan they were reading", () => {
  const progressOnly = loadProgress(
    storage({ [PROGRESS_KEY]: legacyProgress }),
  );
  assert.ok(progressOnly.profiles.every((p) => p.track === "plan"));
  assert.equal(progressOnly.guest.track, "plan");
  const placesOnly = loadProgress(storage({ [LOCATION_KEY]: legacyLocation }));
  assert.equal(placesOnly.guest.track, "bible");
  assert.deepEqual(placesOnly.profiles, []);
});

test("a failed migration write keeps v1 intact and is retried", () => {
  const s = legacy();
  s.failWrites = 1;
  const failed = migrateProgress(s);
  assert.equal(failed.migrated, false);
  assert.equal(s.getItem(STATE_KEY), null);
  assert.equal(s.getItem(PROGRESS_KEY), legacyProgress);
  assert.equal(s.getItem(LOCATION_KEY), legacyLocation);
  // Still readable this session, from the migrated state in memory.
  assert.deepEqual(loadProgress(s), failed.state);
  // A failed change is not reported as saved and writes nothing.
  s.failWrites = 1;
  assert.throws(() => setCompletion(s, "reader-a", 7, true), /لم يتم الحفظ/);
  assert.equal(s.getItem(STATE_KEY), null);
  // The next change (or load) commits the migration together with it.
  setCompletion(s, "reader-a", 7, true);
  assert.deepEqual(loadProgress(s).profiles[0].completed, [1, 3, 7]);
  assert.equal(s.getItem(PROGRESS_KEY), legacyProgress);
  assert.ok(migrateProgress(s).migrated);
  // Once v2 exists, v1 is no longer read.
  s.setItem(PROGRESS_KEY, "corrupt");
  assert.deepEqual(loadProgress(s).profiles[0].completed, [1, 3, 7]);
});

test("a write that does not read back is not treated as saved", () => {
  const s = legacy();
  const lossy = { getItem: s.getItem, setItem: () => {} };
  assert.equal(migrateProgress(lossy).migrated, false);
  assert.throws(() => selectReader(lossy, null), /لم يتم الحفظ/);
});

test("corrupt v2 storage is reported and never overwritten", () => {
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 2,
      activeId: null,
      profiles: [],
      guest: { track: "bible", places: { __proto__: null, x: 1 } },
      continuous: false,
    }),
  ]) {
    const s = storage({ [STATE_KEY]: raw, [PROGRESS_KEY]: legacyProgress });
    assert.throws(() => loadProgress(s), /تعذر قراءة التقدم/);
    assert.throws(() => createReader(s, "New", "2026-10-01"));
    assert.throws(() =>
      saveReaderPlaces(s, "", { track: "bible", places: {} }),
    );
    assert.throws(() => migrateProgress(s));
    assert.equal(s.getItem(STATE_KEY), raw);
    assert.equal(s.getItem(PROGRESS_KEY), legacyProgress);
  }
  const blocked = {
    getItem: () => {
      throw Error("SecurityError");
    },
    setItem: () => {},
  };
  assert.throws(() => loadProgress(blocked), /لا يسمح المتصفح/);
});

test("each reader keeps separate places and completion in every track", () => {
  const s = storage();
  saveReaderPlaces(s, "", withPlace(loadProgress(s).guest, ot("ot-001")));
  // A new reader keeps the guest's reading choice and non-plan places.
  const a = createReader(s, "أ", "2026-10-01");
  assert.equal(a.track, "chrono:OT");
  assert.deepEqual(a.places, { "chrono:OT": ot("ot-001") });
  const b = createReader(s, "ب", "2026-10-01");
  setReadingCompletion(s, a.id, ot("ot-002"), true);
  setReadingCompletion(s, a.id, nt("ot-002"), true);
  setReadingCompletion(
    s,
    a.id,
    { mode: "bible", book: "GEN", chapter: 1 },
    true,
  );
  setReadingCompletion(s, a.id, { mode: "plan", day: 4 }, true);
  setReadingCompletion(s, b.id, nt("mark-1"), true);
  const state = loadProgress(s);
  const [ra, rb] = state.profiles;
  assert.deepEqual(ra.completion, {
    bible: ["GEN:1"],
    plan: [4],
    "chrono:OT": ["ot-002"],
    "chrono:NT": ["ot-002"],
  });
  assert.deepEqual(ra.completed, [4]);
  assert.ok(isReadingComplete(ra, nt("ot-002")));
  assert.ok(!isReadingComplete(rb, nt("ot-002")));
  assert.ok(isReadingComplete(rb, nt("mark-1")));
  assert.ok(!isReadingComplete(ra, ot("mark-1")));
  // Unmarking is explicit and only touches that reading.
  setReadingCompletion(s, a.id, nt("ot-002"), false);
  assert.deepEqual(loadProgress(s).profiles[0].completion["chrono:OT"], [
    "ot-002",
  ]);
  // Places move per reader and per track.
  const moved = withPlace(
    withPlace(readerPlaces(state, a.id), { mode: "plan", day: 9 }),
    { mode: "bible", book: "PSA", chapter: 23 },
  );
  saveReaderPlaces(s, a.id, moved, true);
  const after = loadProgress(s);
  assert.deepEqual(readerPlaces(after, a.id), {
    track: "bible",
    places: {
      "chrono:OT": ot("ot-001"),
      plan: { mode: "plan", day: 9 },
      bible: { mode: "bible", book: "PSA", chapter: 23 },
    },
  });
  assert.deepEqual(readerPlaces(after, b.id).places.plan, undefined);
  assert.deepEqual(readerPlaces(after, "").track, "chrono:OT");
  assert.equal(after.continuous, true);
  assert.throws(() =>
    saveReaderPlaces(s, "missing", { track: "bible", places: {} }),
  );
});

test("links: shared URLs win, legacy ?day= links work, chronology is opt-in", () => {
  assert.deepEqual(parseAnyReadingLocation("?day=7", catalog), {
    mode: "plan",
    day: 7,
  });
  const link = "?mode=chronological&testament=NT&reading=mark-1&verse=3";
  assert.deepEqual(parseAnyReadingLocation(link, catalog), {
    ...nt("mark-1"),
    verse: 3,
  });
  assert.equal(readingSearch({ ...nt("mark-1"), verse: 3 }), link);
  assert.equal(locationSearch(ot("ot-001")), readingSearch(ot("ot-001")));
  assert.equal(parseReadingLocation(link, catalog), undefined);
  for (const query of [
    "?mode=chronological&testament=XX&reading=a",
    "?mode=chronological&testament=OT&reading=__proto__",
    "?mode=chronological&testament=OT&reading=Bad%20Id",
    `?mode=chronological&testament=OT&reading=${"a".repeat(41)}`,
    "?mode=chronological&testament=OT",
    "?mode=chronological&testament=OT&reading=a&verse=0",
  ])
    assert.equal(parseAnyReadingLocation(query, catalog), undefined, query);
  // Explicit links replace the saved place in their own track only.
  const saved = withPlace(
    { track: "plan", places: { plan: { mode: "plan", day: 80 } } },
    ot("ot-009"),
  );
  const linked = withPlace(saved, parseAnyReadingLocation("?day=3", catalog)!);
  assert.deepEqual(currentPlace(linked, 1), { mode: "plan", day: 3 });
  assert.deepEqual(linked.places["chrono:OT"], ot("ot-009"));
  // Without chronology support the Bible place stands in.
  assert.deepEqual(currentPlace(saved, 1, false), {
    mode: "bible",
    book: "GEN",
    chapter: 1,
  });
});

test("identities keep plan, Bible and each testament's chronology apart", () => {
  assert.equal(readingKey(ot("ot-001")), "chrono:OT:ot-001");
  assert.equal(readingKey(nt("ot-001")), "chrono:NT:ot-001");
  assert.equal(readingKey({ mode: "plan", day: 2 }), "plan:2");
  assert.equal(
    readingKey({ mode: "bible", book: "GEN", chapter: 1 }),
    "bible:GEN:1",
  );
  assert.equal(trackOf(nt("x")), "chrono:NT");
  const reading = {
    mode: "chronological" as const,
    testament: "OT" as const,
    id: "ot-001",
    stageId: "creation",
    title: "الخليقة",
    estimatedMinutes: 5,
    verseCount: 2,
    passages: [
      {
        occurrenceId: "gen-1-1",
        book: "GEN",
        chapter: 1,
        start: 1,
        end: 2,
        verses: [
          { number: 1, text: "١" },
          { number: 2, text: "٢" },
        ],
      },
    ],
  };
  const miscounted = { ...reading, verseCount: 3 };
  assert.equal(readingKey(reading), "chrono:OT:ot-001");
  assert.ok(isChronologicalReadingData(reading, "OT", "ot-001"));
  assert.ok(!isChronologicalReadingData(reading, "NT", "ot-001"));
  assert.ok(!isChronologicalReadingData(miscounted, "OT", "ot-001"));
});

test("invalid ids, references and prototype keys are rejected", () => {
  const s = storage();
  const r = createReader(s, "أ", "2026-10-01");
  for (const location of [
    { mode: "bible" as const, book: "GEN", chapter: 51 },
    { mode: "bible" as const, book: "XYZ", chapter: 1 },
    ot("__proto__"),
    ot("constructor."),
    { mode: "plan" as const, day: 151 },
  ])
    assert.throws(() => setReadingCompletion(s, r.id, location, true));
  assert.ok(!validChronologicalLocation({ ...ot("a"), testament: "XX" }));
  for (const places of [
    JSON.parse('{"__proto__":{"mode":"plan","day":1}}'),
    { plan: { mode: "bible", book: "GEN", chapter: 1 } },
    { "chrono:OT": nt("a") },
    { extra: { mode: "plan", day: 1 } },
    [],
  ])
    assert.equal(parseTrackPlaces(places), undefined);
  const before = s.getItem(STATE_KEY);
  const backup = JSON.parse(exportBackup(currentReader(s)!));
  for (const text of [
    JSON.stringify({ ...backup, extra: 1 }),
    JSON.stringify({ ...backup, reader: { ...backup.reader, admin: true } }),
    exportBackup(currentReader(s)!).replace(
      '"completion": {',
      '"completion": { "__proto__": { "polluted": true },',
    ),
    exportBackup(currentReader(s)!).replace(
      '"places": {}',
      '"places": { "__proto__": { "mode": "plan", "day": 1 } }',
    ),
    JSON.stringify({
      ...backup,
      reader: {
        ...backup.reader,
        completion: { ...backup.reader.completion, bible: ["GEN:99"] },
      },
    }),
    JSON.stringify({
      ...backup,
      reader: {
        ...backup.reader,
        completion: {
          ...backup.reader.completion,
          "chrono:OT": Array.from({ length: 1501 }, (_, i) => `r-${i}`),
        },
      },
    }),
    "x".repeat(262145),
  ])
    assert.throws(() => importBackup(s, text));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(s.getItem(STATE_KEY), before);
});

test("v2 backups round trip every track; v1 backups map to the youth plan", () => {
  const first = storage();
  const r = createReader(first, "ميخائيل", "2026-10-01");
  setReadingCompletion(first, r.id, ot("ot-003"), true);
  setReadingCompletion(
    first,
    r.id,
    { mode: "bible", book: "REV", chapter: 22 },
    true,
  );
  setCompletion(first, r.id, 3, true);
  saveReaderPlaces(first, r.id, {
    track: "chrono:NT",
    places: { "chrono:NT": { ...nt("mark-1"), verse: 4 } },
  });
  const text = exportBackup(currentReader(first)!);
  const data = JSON.parse(text);
  assert.equal(data.version, 2);
  assert.deepEqual(Object.keys(data.reader).sort(), [
    "completion",
    "name",
    "places",
    "startDate",
    "track",
  ]);
  const second = storage();
  const existing = createReader(second, "قارئ آخر", "2026-09-01");
  setCompletion(second, existing.id, 2, true);
  const restored = importBackup(second, text);
  assert.notEqual(restored.id, r.id);
  const { id: _a, ...want } = currentReader(first)!;
  const { id: _b, ...got } = restored;
  assert.deepEqual(got, want);
  assert.equal(exportBackup(restored), text);
  assert.deepEqual(
    loadProgress(second).profiles.find((p) => p.id === existing.id)!.completed,
    [2],
  );
  const v1 = importBackup(
    second,
    JSON.stringify({
      version: 1,
      reader: { name: "قديم", startDate: "2026-10-01", completed: [5, 1] },
    }),
  );
  assert.equal(v1.track, "plan");
  assert.deepEqual(v1.completion, {
    bible: [],
    plan: [1, 5],
    "chrono:OT": [],
    "chrono:NT": [],
  });
});

test("a device holds at most 100 readers", () => {
  const s: Store = storage();
  for (let i = 0; i < 100; i++) createReader(s, `r${i}`, "2026-10-01");
  assert.throws(() => createReader(s, "extra", "2026-10-01"));
  assert.throws(() => importBackup(s, exportBackup(currentReader(s)!)));
  assert.equal(loadProgress(s).profiles.length, 100);
});

test("chronology catalogs are checked against their own testament", () => {
  const good = {
    version: 1,
    testament: "OT",
    title: "العهد القديم زمنيًا",
    sources: [{ id: "ot-pdf", title: "PDF" }],
    stages: [
      {
        id: "beginnings",
        title: "البدايات",
        substages: [{ id: "creation", title: "الخليقة" }],
        provenance: { source: "ot-pdf", page: 1 },
      },
    ],
    readings: [
      {
        id: "ot-001",
        stageId: "beginnings",
        substageId: "creation",
        title: "الخليقة",
        estimatedMinutes: 6,
        passages: [
          {
            id: "gen-1",
            usfm: "GEN",
            chapter: 1,
            from: 1,
            to: 31,
            provenance: {
              source: "ot-pdf",
              page: 2,
              pageEnd: 3,
              group: "1",
              exceptions: [{ kind: "split", note: "Split across two days." }],
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(chronologyCatalogErrors(good, "OT", catalog), []);
  assert.ok(chronologyCatalogErrors(good, "NT", catalog).length);
  const bad = structuredClone(good);
  bad.readings[0].passages[0].to = 32;
  bad.readings[0].substageId = "missing";
  bad.readings[0].passages[0].provenance.source = "unknown";
  bad.readings[0].passages[0].provenance.exceptions[0].kind = "whim";
  assert.equal(chronologyCatalogErrors(bad, "OT", catalog).length, 2);
  const nt = structuredClone(good);
  nt.readings[0].passages[0].usfm = "MRK";
  assert.ok(chronologyCatalogErrors(nt, "OT", catalog).length);
});
