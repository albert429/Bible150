import { test } from "node:test";
import assert from "node:assert/strict";
import type { BibleChapter } from "../src/bible/types.ts";
import {
  activeCueIndex,
  announcementAt,
  audioManifestUrl,
  matchesReading,
  readingHash,
  stepCueIndex,
  validManifest,
  type AudioManifestV2,
} from "../src/audio/manifest.ts";
const reading: BibleChapter = {
  mode: "bible",
  usfm: "GEN",
  book: "التكوين",
  chapter: 1,
  verseCount: 2,
  structure: [],
  passages: [
    {
      book: "التكوين",
      chapter: 1,
      start: 1,
      end: 2,
      verses: [
        { number: 1, text: "أول" },
        { number: 2, text: "ثان" },
      ],
    },
  ],
};
const canonical = async (): Promise<AudioManifestV2> => ({
  version: 2,
  identity: "bible:GEN:1",
  book: "GEN",
  chapter: 1,
  readingHash: await readingHash(reading),
  src: "/audio/chapters/assets/GEN-1-abcd.m4a",
  duration: 10,
  alignment: "chapter",
  cues: [],
  announcements: [],
});
test("Canonical manifests validate identity, transcript, namespace and explicit chapter timing", async () => {
  const m = await canonical();
  assert.ok(validManifest(m, "bible:GEN:1"));
  assert.ok(await matchesReading(m, reading));
  assert.equal(activeCueIndex(m, 5), -1);
  for (const broken of [
    { ...m, identity: "bible:GEN:2" },
    { ...m, chapter: 2 },
    { ...m, src: "/audio/chapters/assets/EXO-1-abcd.m4a" },
    { ...m, alignment: "verse" },
    { ...m, cues: [{ passage: 0, verse: 1, start: 0, end: 2 }] },
  ])
    assert.equal(validManifest(broken, "bible:GEN:1"), false);
  assert.equal(
    await matchesReading(m, {
      ...reading,
      passages: [
        { ...reading.passages[0], verses: [{ number: 1, text: "تغيير" }] },
      ],
    }),
    false,
  );
});
test("Announcements clear the highlight and both next controls land directly on the upcoming verse", async () => {
  const m: AudioManifestV2 = {
    ...(await canonical()),
    alignment: "verse",
    cues: [
      { passage: 0, verse: 1, start: 3, end: 5 },
      { passage: 0, verse: 2, start: 7, end: 9 },
    ],
    announcements: [
      {
        passage: 0,
        start: 0,
        end: 3,
        reference: "سفر التكوين، الإصحاح الأول",
        kind: "source",
      },
      {
        passage: 0,
        start: 5,
        end: 7,
        reference: "الآية الثانية",
        kind: "reference",
      },
    ],
  };
  assert.ok(validManifest(m, "bible:GEN:1"));
  assert.equal(activeCueIndex(m, 0), -1);
  assert.equal(activeCueIndex(m, 2.99), -1);
  assert.equal(stepCueIndex(m, 1, 1), 0);
  assert.equal(stepCueIndex(m, 6, 1), 1);
  assert.equal(activeCueIndex(m, 3), 0);
  assert.equal(activeCueIndex(m, 6), -1);
  assert.equal(activeCueIndex(m, 7), 1);
  assert.equal(announcementAt(m, 6)?.reference, "الآية الثانية");
  assert.equal(
    validManifest(
      { ...m, announcements: [{ ...m.announcements[0], end: 4 }] },
      "bible:GEN:1",
    ),
    false,
  );
});
test("Old manifests cannot inject unchecked announcement intervals", () => {
  const m = {
    version: 1 as const,
    day: 1,
    readingHash: "a".repeat(64),
    src: "/audio/days/001-abcd.m4a",
    duration: 4,
    cues: [{ passage: 0, verse: 1, start: 1, end: 4 }],
    announcements: [null],
  };
  assert.ok(validManifest(m, "1"));
  assert.equal(announcementAt(m, 2), undefined);
  assert.equal(activeCueIndex(m, 0), -1);
  assert.equal(stepCueIndex(m, 0, 1), 0);
});
test("Manifest URLs retain public day compatibility and isolate chapters", () => {
  assert.equal(audioManifestUrl("1"), "/audio/1.json");
  assert.equal(audioManifestUrl("plan:1"), "/audio/1.json");
  assert.equal(
    audioManifestUrl("bible:PSA:119"),
    "/audio/chapters/PSA/119.json",
  );
  assert.throws(() => audioManifestUrl("bible:../:1"));
});
