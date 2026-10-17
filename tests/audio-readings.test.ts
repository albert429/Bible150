// The committed chronological playlists against the canonical chapters,
// the contract and the review that gates their clips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validManifest, type AudioManifestV3 } from "../src/audio/manifest.ts";
import { AUDIO_MAX_BYTES } from "../src/audio/contract.ts";

const json = (path: string) =>
  JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));
const catalog: string[] = existsSync("data/audio/reading-catalog.json")
  ? json("data/audio/reading-catalog.json").readings
  : [];

test("Every catalogued playlist is valid, unique and uses published media", () => {
  assert.equal(new Set(catalog).size, catalog.length);
  const chapters = new Map<string, { src: string; duration: number }>(
    json("data/audio/chapter-catalog.json").chapters.map((key: string) => {
      const [, book, chapter] = key.split(":");
      return [key, json(`data/audio/chapters/${book}/${chapter}.json`)];
    }),
  );
  const flagged: Record<string, { flags: Record<string, unknown> }> = {
    ...json("data/audio/review/ot.json").flags,
    ...json("data/audio/review/nt.json").flags,
  };
  for (const key of catalog) {
    const [, testament, id] = key.split(":");
    const manifest: AudioManifestV3 = json(
      `data/audio/readings/${testament}/${id}.json`,
    );
    assert.ok(validManifest(manifest, key), key);
    for (const entry of manifest.entries) {
      const chapter = chapters.get(`bible:${entry.book}:${entry.chapter}`);
      assert.ok(chapter, `${key}: ${entry.book} ${entry.chapter}`);
      if (entry.src.startsWith("/audio/chapters/")) {
        assert.equal(entry.src, chapter.src, key);
        assert.equal(entry.duration, chapter.duration, key);
      } else {
        // A clip never rests on a boundary verse the review flagged.
        const review = flagged[`${entry.book}-${entry.chapter}`]?.flags ?? {};
        for (let verse = entry.from - 1; verse <= entry.to + 1; verse++)
          assert.ok(
            !(verse in review),
            `${key}: ${entry.book} ${entry.chapter}:${verse}`,
          );
        assert.equal(entry.alignment, "verse", key);
      }
    }
  }
});

test("Clip names are deduplicated across readings and stay under the cap", () => {
  const clips = new Map<string, number>();
  for (const key of catalog) {
    const [, testament, id] = key.split(":");
    const manifest: AudioManifestV3 = json(
      `data/audio/readings/${testament}/${id}.json`,
    );
    for (const entry of manifest.entries.filter((e) =>
      e.src.startsWith("/audio/clips/"),
    )) {
      // One name is one range of one chapter, whichever reading uses it.
      assert.ok(
        entry.src.includes(`-${entry.chapter}-${entry.from}-${entry.to}-`),
      );
      const seen = clips.get(entry.src);
      assert.ok(seen === undefined || seen === entry.duration, entry.src);
      clips.set(entry.src, entry.duration);
      // 48 kbps AAC: a clip longer than the largest chapter cannot fit 8 MiB.
      assert.ok(entry.duration * 6000 < AUDIO_MAX_BYTES, entry.src);
    }
  }
});
