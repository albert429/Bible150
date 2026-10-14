// The study clients' URLs and validators, with fetch stubbed. Each test file
// runs in its own process, so the global set here stays local.
import { test } from "node:test";
import assert from "node:assert/strict";

const requests: string[] = [];
let body: unknown = {};
globalThis.fetch = async (url: RequestInfo | URL) => {
  requests.push(String(url));
  return Response.json(body);
};
const { studyCore, studyLex, studyTr } = await import("../src/study/client.ts");

const core = { v: 1, day: 1, p: ["MAT"], verses: {} };
const tr = { v: 1, day: 1, verses: {} };
const lex = { v: 1, day: 1, lex: {} };

test("Each study file is read from its own static path", async () => {
  for (const [client, path, file] of [
    [studyCore, "/study/1.json", core],
    [studyTr, "/study/1.tr.json", tr],
    [studyLex, "/study/1.lex.json", lex],
  ] as const) {
    requests.length = 0;
    body = file;
    assert.deepEqual(await client.load("1"), file);
    assert.deepEqual(requests, [path]);
  }
});

test("Study files must carry version 1, the requested day and the right payload", async () => {
  const bad = (client: { load(day: string): Promise<unknown> }, day: string) =>
    assert.rejects(client.load(day), /تعذر تحميل/);
  let day = 10;
  for (const [client, valid, payload] of [
    [studyCore, core, "p"],
    [studyTr, tr, "verses"],
    [studyLex, lex, "lex"],
  ] as const) {
    const key = String(++day);
    const file = { ...valid, day: Number(key) };
    for (const broken of [
      null,
      "text",
      [],
      { ...file, v: 2 },
      { ...file, v: undefined },
      { ...file, day: Number(key) + 1 },
      { ...file, day: key },
      { ...file, [payload]: undefined },
    ]) {
      body = broken;
      await bad(client, key);
    }
    body = file;
    assert.deepEqual(await client.load(key), file);
  }
});

test("The core file needs a passage list and a verse map; the others a plain object", async () => {
  const day = (n: number) => String(n);
  body = { ...core, day: 20, p: "MAT" };
  await assert.rejects(studyCore.load(day(20)), /تعذر تحميل دراسة الآية/);
  body = { ...core, day: 21, verses: [] };
  await assert.rejects(studyCore.load(day(21)), /تعذر تحميل دراسة الآية/);
  body = { ...tr, day: 22, verses: [] };
  await assert.rejects(studyTr.load(day(22)), /تعذر تحميل الترجمات/);
  body = { ...lex, day: 23, lex: [] };
  await assert.rejects(studyLex.load(day(23)), /تعذر تحميل دراسة الآية/);
});

test("Failures are not cached, successes are", async () => {
  body = { ...tr, day: 30, verses: null };
  await assert.rejects(studyTr.load("30"));
  assert.equal(studyTr.peek("30"), undefined);
  const file = { ...tr, day: 30 };
  body = file;
  assert.deepEqual(await studyTr.load("30"), file);
  requests.length = 0;
  assert.deepEqual(studyTr.peek("30"), file);
  assert.deepEqual(await studyTr.load("30"), file);
  assert.deepEqual(requests, []);
});
