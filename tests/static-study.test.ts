import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { BUDGETS } from "../scripts/build-study.js";
import type { Day } from "../src/plan/readings.ts";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));
const raw = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url));

test("Static study days match the study data for every plan verse", () => {
  const plan: Day[] = read("data/plan.json");
  const books: string[][] = read("data/books.json");
  const greek = read("data/study/greek.json");
  const nav = read("data/study/nav.json");
  const kjv = read("data/study/kjv.json");
  const usfm = new Map(books.map((row) => [row[3], row[0]]));
  const seen = new Map();
  assert.equal(plan.length, 150);
  for (const day of plan) {
    const core = read(`public/study/${day.day}.json`);
    const lex = read(`public/study/${day.day}.lex.json`);
    const tr = read(`public/study/${day.day}.tr.json`);
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
        const id = `${usfm.get(passage.book)}.${passage.chapter}.${verse.number}`;
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
        gzipSync(raw("public/study/" + name)).length <= BUDGETS[kind],
        `${name} within budget`,
      );
  }
});
