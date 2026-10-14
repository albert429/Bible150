// The request path in src/ai/run.ts, with fetch stubbed. Each test file runs
// in its own process, so the globals set here stay local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";

const requests = [];
const pending = [];
const study = {
  "10.tr.json": {
    v: 1,
    day: 10,
    verses: { "MAT.8.15": { e: "And he touched her hand" } },
  },
  "10.lex.json": {
    v: 1,
    day: 10,
    lex: { G0681: { l: "ἅπτω", g: "to touch", d: "" } },
  },
  "11.tr.json": { v: 1, day: 11, verses: {} },
  "11.lex.json": { v: 1, day: 11, lex: {} },
};
globalThis.fetch = async (url, init = {}) => {
  const path = String(url);
  requests.push(path);
  if (path.endsWith("/chat/completions")) {
    const body = JSON.parse(init.body);
    requests.push(body.messages[1].content);
    return new Response(
      'data: {"model":"m:free","choices":[{"delta":{"content":"جواب"}}]}\n\n' +
        'data: {"model":"m:free","choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }
  const name = path.split("/study/")[1];
  if (name?.startsWith("12.")) {
    // A study file that never arrives (until the test releases it).
    return new Promise((resolve) =>
      pending.push(() => resolve(new Response("{}", { status: 404 }))),
    );
  }
  return study[name]
    ? Response.json(study[name])
    : new Response("{}", { status: 404 });
};
globalThis.location = { origin: "https://app.test" };
globalThis.__AI_CONFIG__ = {
  providers: [
    {
      id: "openrouter",
      apiKey: "sk-or-v1-test",
      models: ["openrouter/free"],
      baseUrl: "https://openrouter.test/api/v1",
    },
  ],
  dailyCap: 10,
  attemptCap: 20,
};

const { ask } = await import("../src/ai/run.ts");
const { abortable } = await import("../src/ai/types.ts");

const verse = { number: 15, text: "فلمس يدها" };
const input = (chip, day = 10) => ({
  chip,
  day,
  id: "MAT.8.15",
  material: {
    book: "متى",
    passage: { book: "متى", chapter: 8, start: 15, end: 15, verses: [verse] },
    verse,
    g: [["ἥψατο", "hēpsato", "G0681", "V-AMI-3S", "to kindle", 0, 0]],
  },
  question: chip === "ask" ? "ما معنى لمس؟" : "",
});
const quiet = { onText() {} };

test("A typed question loads the lexicon, so the Greek meaning is the lexicon's", async () => {
  requests.length = 0;
  let sent = 0;
  await ask(input("ask"), new AbortController().signal, quiet, () => sent++);
  assert.ok(requests.some((r) => r.endsWith("/study/10.lex.json")));
  const prompt = requests.find((r) => r.startsWith("المرجع"));
  assert.match(prompt, /G0681: to touch/);
  assert.doesNotMatch(prompt, /to kindle/);
  assert.match(prompt, /الترجمة الإنجليزية \(KJV\):\nAnd he touched/);
  assert.equal(sent, 1);
});

test("«اشرح الآية» needs no lexicon", async () => {
  requests.length = 0;
  await ask(input("explain", 11), new AbortController().signal, quiet);
  assert.ok(requests.some((r) => r.endsWith("/study/11.tr.json")));
  assert.ok(!requests.some((r) => r.endsWith("/study/11.lex.json")));
});

test("Stopping while the study files load ends the request at once and sends nothing", async () => {
  requests.length = 0;
  const controller = new AbortController();
  let sent = 0;
  const run = ask(input("explain", 12), controller.signal, quiet, () => sent++);
  setTimeout(() => controller.abort("stop"), 10);
  const result = await Promise.race([
    run.then(
      () => "resolved",
      (error) => error.kind,
    ),
    new Promise((resolve) => setTimeout(() => resolve("still waiting"), 500)),
  ]);
  assert.equal(result, "aborted");
  assert.equal(sent, 0);
  assert.ok(!requests.some((r) => r.endsWith("/chat/completions")));
  for (const release of pending.splice(0)) release();
});

test("An already-stopped request fetches nothing; abortable cleans up", async () => {
  requests.length = 0;
  await assert.rejects(ask(input("words"), AbortSignal.abort(), quiet), {
    kind: "aborted",
  });
  assert.ok(!requests.some((r) => r.endsWith("/chat/completions")));
  const controller = new AbortController();
  assert.equal(await abortable(Promise.resolve(1), controller.signal), 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
