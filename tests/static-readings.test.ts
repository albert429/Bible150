import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "../scripts/build-readings.js";
import type { Day } from "../src/readings.ts";
test("All static readings exactly preserve the validated source, independent of the API", () => {
  const source: Day[] = JSON.parse(
    readFileSync(new URL("../data/plan.json", import.meta.url), "utf8"),
  );
  const index: Day[] = JSON.parse(
    readFileSync(
      new URL("../public/readings/plan.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(index.length, 150);
  for (const day of source) {
    const file = JSON.parse(
      readFileSync(
        new URL("../public/readings/" + day.day + ".json", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(file, day);
    assert.equal(index[day.day - 1].verseCount, day.verseCount);
    assert.ok(index[day.day - 1].passages.every((p) => !("verses" in p)));
  }
});
