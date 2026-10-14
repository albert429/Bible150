import { test } from "node:test";
import assert from "node:assert/strict";
import { allowsReadingPrefetch } from "../src/useAdjacentPrefetch.ts";

test("Neighbouring readings are prefetched unless the connection is slow or saving data", () => {
  assert.equal(allowsReadingPrefetch(undefined), true);
  assert.equal(allowsReadingPrefetch({}), true);
  assert.equal(allowsReadingPrefetch({ effectiveType: "4g" }), true);
  assert.equal(allowsReadingPrefetch({ saveData: false }), true);
  for (const effectiveType of ["slow-2g", "2g", "3g"])
    assert.equal(
      allowsReadingPrefetch({ effectiveType }),
      false,
      effectiveType,
    );
  assert.equal(allowsReadingPrefetch({ saveData: true }), false);
  assert.equal(
    allowsReadingPrefetch({ saveData: true, effectiveType: "4g" }),
    false,
  );
});
