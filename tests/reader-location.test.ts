import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialPreferences,
  loadPreferences,
  validLocation,
} from "../src/reader/location.ts";
import { chapterSegments } from "../src/reader/chapterSegments.ts";

test("reader preferences remember each mode without modifying plan progress", () => {
  const saved = {
    version: 1,
    mode: "bible",
    plan: { mode: "plan", day: 83 },
    bible: { mode: "bible", book: "JHN", chapter: 3, verse: 16 },
    continuous: true,
  };
  assert.deepEqual(loadPreferences(10, JSON.stringify(saved)), saved);
  assert.deepEqual(initialPreferences(10, "?day=7", JSON.stringify(saved)), {
    ...saved,
    mode: "plan",
    plan: { mode: "plan", day: 7 },
  });
  assert.deepEqual(
    initialPreferences(
      10,
      "?mode=bible&book=REV&chapter=22&verse=21",
      JSON.stringify(saved),
    ).bible,
    { mode: "bible", book: "REV", chapter: 22, verse: 21 },
  );
});

test("invalid saved locations and malformed storage fall back safely", () => {
  const initial = loadPreferences(10);
  for (const value of [
    "bad",
    "null",
    "[]",
    '{"version":9}',
    '{"version":1,"plan":{"mode":"plan","day":0},"bible":{"mode":"bible","book":"GEN","chapter":51},"continuous":"true"}',
  ]) {
    assert.deepEqual(loadPreferences(10, value), initial);
  }
  for (const location of [
    null,
    { mode: "bible", book: "GEN", chapter: 1, verse: 32 },
    { mode: "plan", day: 151 },
    { mode: "plan", day: 1, verse: 0 },
  ])
    assert.equal(validLocation(location), false);
});

test("source structure splits by Unicode codepoint without altering Arabic text", () => {
  const text = "فِي ٱلْبَدْءِ كَانَ ٱلْكَلِمَةُ 🌿";
  const blocks = [
    { kind: "paragraph" as const, marker: "p", verse: 1, offset: 0 },
    { kind: "poetry" as const, marker: "q2", verse: 1, offset: 14 },
  ];
  const segments = chapterSegments(text, blocks);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.equal(segments[0].text, Array.from(text).slice(0, 14).join(""));
  assert.equal(segments[1].blocks[0].marker, "q2");
});
