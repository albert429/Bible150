import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { BUDGETS, buildStudy } from "../scripts/build-study.js";
import { verseId } from "../src/bible/verse.ts";
import type { Day } from "../src/plan/readings.ts";
import { usfmByName } from "../scripts/lib/books.js";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));

test("Static study days match the study data for every plan verse", (t) => {
  const out = mkdtempSync(join(tmpdir(), "study-"));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  buildStudy({ out });
  const readOut = (name: string) =>
    JSON.parse(readFileSync(join(out, name), "utf8"));
  const plan: Day[] = read("data/plan.json");
  const greek = read("data/study/greek.json");
  const nav = read("data/study/nav.json");
  const kjv = read("data/study/kjv.json");
  const usfm = usfmByName();
  const seen = new Map();
  assert.equal(plan.length, 150);
  for (const day of plan) {
    const core = readOut(`${day.day}.json`);
    const lex = readOut(`${day.day}.lex.json`);
    const tr = readOut(`${day.day}.tr.json`);
    for (const file of [core, lex, tr]) {
      assert.equal(file.v, 1);
      assert.equal(file.day, day.day);
    }
    assert.deepEqual(
      core.p,
      day.passages.map((p) => usfm.get(p.book)),
    );
    for (const passage of day.passages) {
      for (const verse of passage.verses ?? []) {
        const id = verseId(
          usfm.get(passage.book)!,
          passage.chapter,
          verse.number,
        );
        const entry = core.verses[id];
        assert.ok(entry, id);
        assert.deepEqual(entry, { g: greek[id] || [] });
        assert.deepEqual(tr.verses[id], {
          ...(nav[id] !== undefined && { n: nav[id] }),
          ...(kjv[id] !== undefined && { e: kjv[id] }),
        });
        for (const token of entry.g)
          if (token[2] && token[5] !== null) assert.ok(token[5] <= token[6]);
        if (seen.has(id)) assert.deepEqual(entry, seen.get(id));
        seen.set(id, entry);
      }
    }
    for (const [kind, name] of [
      ["core", `${day.day}.json`],
      ["lex", `${day.day}.lex.json`],
      ["tr", `${day.day}.tr.json`],
    ] as const)
      assert.ok(
        gzipSync(readFileSync(join(out, name))).length <= BUDGETS[kind],
        `${name} within budget`,
      );
  }
});
