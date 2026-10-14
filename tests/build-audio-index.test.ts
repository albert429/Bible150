// scripts/build-audio-index.js resolves every path from its own location, so it
// runs here on a copy inside a scratch repository and never touches public/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readingHash } from "../src/audio/manifest.ts";
import type { Day } from "../src/readings.ts";

const script = new URL("../scripts/build-audio-index.js", import.meta.url);
const reading: Day = {
  day: 1,
  verseCount: 2,
  passages: [
    {
      book: "لوقا",
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
const manifest = (readingHash: string) => ({
  version: 1,
  day: 1,
  readingHash,
  src: "/audio/days/001-abc123.m4a",
  duration: 9,
  cues: [{ passage: 0, verse: 1, start: 0, end: 2 }],
});

function repository(days: number[], hash: string) {
  const root = mkdtempSync(join(tmpdir(), "audio-index-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "data/audio/manifests"), { recursive: true });
  copyFileSync(script, join(root, "scripts/build-audio-index.js"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(join(root, "data/plan.json"), JSON.stringify([reading]));
  writeFileSync(
    join(root, "data/audio/catalog.json"),
    JSON.stringify({ days }),
  );
  writeFileSync(
    join(root, "data/audio/manifests/1.json"),
    JSON.stringify(manifest(hash)),
  );
  return root;
}
const run = (root: string) =>
  spawnSync(process.execPath, [join(root, "scripts/build-audio-index.js")], {
    encoding: "utf8",
  });

test("A manifest whose hash matches the Scripture is published to public/audio", async () => {
  const hash = await readingHash(reading);
  const root = repository([1], hash);
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Prepared 1 audio manifests/);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, "public/audio/1.json"), "utf8")),
      manifest(hash),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("A stale manifest hash fails the build and publishes nothing", () => {
  const root = repository([1], "0".repeat(64));
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Audio for day 1 is stale/);
    assert.equal(existsSync(join(root, "public/audio/1.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("A catalog day that is not in the plan fails the build", async () => {
  const root = repository([2], await readingHash(reading));
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid audio day 2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
