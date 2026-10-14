// Which audio days vite.config.ts advertises as __AUDIO_DAYS__. The config reads
// data/ and public/ relative to the working directory, so it runs here inside a
// scratch repository, with the build's VITE_* variables cleared.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigEnv, UserConfigFn } from "vite";
import config from "../vite.config.ts";

assert.equal(typeof config, "function");
const makeConfig = config as UserConfigFn;
const env: ConfigEnv = {
  command: "build",
  mode: "production",
  isSsrBuild: false,
  isPreview: false,
};

const original = process.cwd();
const root = mkdtempSync(join(tmpdir(), "vite-config-"));
mkdirSync(join(root, "data/audio/manifests"), { recursive: true });
mkdirSync(join(root, "public/audio/days"), { recursive: true });
writeFileSync(
  join(root, "data/audio/catalog.json"),
  JSON.stringify({ days: [1, 2, 3] }),
);
for (const day of [1, 2, 3])
  writeFileSync(
    join(root, `data/audio/manifests/${day}.json`),
    JSON.stringify({ src: `/audio/days/00${day}-abc.m4a` }),
  );
// Only days 1 and 3 have their recording in this checkout.
for (const file of ["001-abc.m4a", "003-abc.m4a"])
  writeFileSync(join(root, "public/audio/days", file), "");
process.chdir(root);
for (const name of Object.keys(process.env))
  if (name.startsWith("VITE_")) delete process.env[name];
after(() => {
  process.chdir(original);
  rmSync(root, { recursive: true, force: true });
});

async function audioDays(base?: string) {
  if (base === undefined) delete process.env.VITE_AUDIO_BASE_URL;
  else process.env.VITE_AUDIO_BASE_URL = base;
  const resolved = await makeConfig(env);
  return JSON.parse(String(resolved.define?.__AUDIO_DAYS__));
}

test("Without an audio host, only days whose recording is bundled are advertised", async () => {
  assert.deepEqual(await audioDays(), [1, 3]);
  assert.deepEqual(await audioDays(""), [1, 3]);
});

test('A same-origin "/" base or an https host advertises every cataloged day', async () => {
  assert.deepEqual(await audioDays("/"), [1, 2, 3]);
  assert.deepEqual(await audioDays("https://audio.example.test"), [1, 2, 3]);
});

test("An unsafe audio host fails the build", async () => {
  for (const base of [
    "http://audio.example.test",
    "//audio.example.test",
    "/audio",
    "https://audio.example.test/private",
  ])
    await assert.rejects(audioDays(base), Error, base);
});

test("AI constants are off unless a provider is configured", async () => {
  delete process.env.VITE_AUDIO_BASE_URL;
  const resolved = await makeConfig(env);
  assert.equal(resolved.define?.__AI_ENABLED__, "false");
  assert.equal(resolved.define?.__AI_CONFIG__, "null");
});
