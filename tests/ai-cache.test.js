import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerKey,
  CACHE_KEY,
  clearAiData,
  consentKey,
  giveConsent,
  hasConsent,
  MAX_ENTRIES,
  readAnswer,
  recordAnswer,
  recordAttempt,
  saveAnswer,
  usage,
  USAGE_KEY,
} from "../src/ai/cache.ts";

function memory(initial = {}) {
  const map = new Map(Object.entries(initial));
  const touched = new Set();
  return {
    map,
    touched,
    getItem: (k) => (touched.add(k), map.has(k) ? map.get(k) : null),
    setItem: (k, v) => (touched.add(k), map.set(k, String(v))),
    removeItem: (k) => (touched.add(k), map.delete(k)),
  };
}

test("Answers are cached per verse, chip and prompt version with LRU eviction", () => {
  const s = memory();
  for (let i = 0; i < MAX_ENTRIES + 5; i++)
    saveAnswer(
      s,
      answerKey(`MAT.1.${i}`, "explain", 1),
      { text: `a${i}`, model: "m" },
      1,
    );
  assert.equal(readAnswer(s, answerKey("MAT.1.0", "explain", 1)), undefined);
  assert.deepEqual(readAnswer(s, answerKey("MAT.1.5", "explain", 1)), {
    text: "a5",
    model: "m",
  });
  // Reading moved 1.5 to the end, so the next eviction removes 1.6 instead.
  saveAnswer(
    s,
    answerKey("MAT.2.1", "words", 1),
    { text: "w", model: "m", truncated: true },
    1,
  );
  assert.ok(readAnswer(s, answerKey("MAT.1.5", "explain", 1)));
  assert.equal(readAnswer(s, answerKey("MAT.1.6", "explain", 1)), undefined);
  assert.deepEqual(readAnswer(s, answerKey("MAT.2.1", "words", 1)), {
    text: "w",
    model: "m",
    truncated: true,
  });
});

test("A new prompt version drops older answers; total size is bounded", () => {
  const s = memory();
  saveAnswer(
    s,
    answerKey("MAT.1.1", "explain", 1),
    { text: "old", model: "m" },
    1,
  );
  saveAnswer(
    s,
    answerKey("MAT.1.1", "explain", 2),
    { text: "new", model: "m" },
    2,
  );
  assert.equal(readAnswer(s, answerKey("MAT.1.1", "explain", 1)), undefined);
  for (let i = 0; i < 40; i++)
    saveAnswer(
      s,
      answerKey(`JHN.1.${i}`, "explain", 2),
      { text: "x".repeat(6000), model: "m" },
      2,
    );
  const stored = JSON.parse(s.map.get(CACHE_KEY)).e;
  assert.ok(stored.reduce((n, e) => n + e[1].length, 0) <= 200000);
});

test("Malformed, tampered, blocked or full storage never throws", () => {
  for (const value of ["{", "null", '{"v":1,"e":[[1,2,3]]}', '{"v":2,"e":[]}'])
    assert.equal(readAnswer(memory({ [CACHE_KEY]: value }), "k"), undefined);
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
    removeItem: () => {},
  };
  saveAnswer(full, "k|explain|1", { text: "t", model: "m" }, 1);
  assert.equal(readAnswer(null, "k"), undefined);
  saveAnswer(null, "k", { text: "t", model: "m" }, 1);
  assert.deepEqual(usage(null, "2026-10-10"), {
    date: "2026-10-10",
    n: 0,
    a: 0,
  });
  assert.equal(hasConsent(null), false);
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readAnswer(throwing, "k"), undefined);
  assert.equal(hasConsent(throwing), false);
  giveConsent(throwing);
  clearAiData(throwing);
  assert.deepEqual(recordAttempt(throwing, "2026-10-10"), {
    date: "2026-10-10",
    n: 0,
    a: 1,
  });
});

test("Usage counts answers and attempts per Cairo date and resets on a new date", () => {
  const s = memory();
  recordAttempt(s, "2026-10-10");
  recordAttempt(s, "2026-10-10");
  recordAnswer(s, "2026-10-10");
  assert.deepEqual(usage(s, "2026-10-10"), { date: "2026-10-10", n: 1, a: 2 });
  assert.deepEqual(usage(s, "2026-10-11"), { date: "2026-10-11", n: 0, a: 0 });
  assert.deepEqual(
    usage(
      memory({ [USAGE_KEY]: '{"date":"2026-10-10","n":-5,"a":1}' }),
      "2026-10-10",
    ),
    { date: "2026-10-10", n: 0, a: 0 },
  );
});

test("Consent is versioned; clearing removes answers and consent but never progress", () => {
  const s = memory({ "nt-reading-progress-v1": "{}" });
  assert.equal(hasConsent(s), false);
  giveConsent(s);
  assert.equal(s.map.get(consentKey()), "1");
  assert.equal(hasConsent(s), true);
  saveAnswer(
    s,
    answerKey("MAT.1.1", "explain", 1),
    { text: "a", model: "m" },
    1,
  );
  recordAnswer(s, "2026-10-10");
  clearAiData(s);
  assert.equal(hasConsent(s), false);
  assert.equal(s.map.has(CACHE_KEY), false);
  assert.equal(s.map.has(USAGE_KEY), true);
  assert.equal(s.map.get("nt-reading-progress-v1"), "{}");
  assert.equal(s.touched.has("nt-reading-progress-v1"), false);
});

test("Without working storage, counts and consent still hold for the session", () => {
  const date = "2026-10-12";
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
    removeItem: () => {},
  };
  for (const storage of [null, full]) {
    recordAttempt(storage, date);
    recordAnswer(storage, date);
    assert.deepEqual(recordAnswer(storage, date), { date, n: 2, a: 1 });
    assert.deepEqual(usage(storage, date), { date, n: 2, a: 1 });
    assert.deepEqual(usage(storage, "2026-10-13"), {
      date: "2026-10-13",
      n: 0,
      a: 0,
    });
    assert.equal(hasConsent(storage), false);
    giveConsent(storage);
    assert.equal(hasConsent(storage), true);
    clearAiData(storage);
    assert.equal(hasConsent(storage), false);
  }
  // Each storage is separate; a working one keeps consent only in storage, so
  // revoking it elsewhere (another tab) takes effect.
  assert.deepEqual(usage(memory(), date), { date, n: 0, a: 0 });
  const s = memory();
  giveConsent(s);
  s.map.delete(consentKey());
  assert.equal(hasConsent(s), false);
});
