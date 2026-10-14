// The audio delivery contract (src/audio/contract.ts) against everything that
// restates it: committed manifests, the Pages bundle, vercel.json and the
// range worker, which is deployed verbatim and so cannot import the contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import worker from "../hosting/cloudflare-audio/worker.js";
import {
  AUDIO_CACHE_CONTROL,
  AUDIO_CONTENT_TYPE,
  AUDIO_MAX_BYTES,
  AUDIO_MEDIA_PATTERN,
  AUDIO_MEDIA_PREFIX,
  AUDIO_PAGES_ORIGIN,
  AUDIO_PAGES_PROJECT,
} from "../src/audio/contract.ts";
import { pagesConfig } from "../scripts/prepare-audio-host.mjs";

const json = (path: string) =>
  JSON.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));

test("The media pattern accepts day-numbered fingerprinted M4A paths only", () => {
  for (const ok of [
    "/audio/days/001-d6739befab9eaf45cff3.m4a",
    "/audio/days/150-0.m4a",
  ])
    assert.match(ok, AUDIO_MEDIA_PATTERN, ok);
  for (const bad of [
    "/audio/days/1-abc.m4a",
    "/audio/days/001-abc.mp3",
    "/audio/days/001-ABC.m4a",
    "/audio/days/001-abc.m4a?x=1",
    "/audio/days/001-abc.m4a/",
    "/audio/days/../001-abc.m4a",
    "/audio/days/001-.m4a",
    "audio/days/001-abc.m4a",
    "https://example.test/audio/days/001-abc.m4a",
  ])
    assert.doesNotMatch(bad, AUDIO_MEDIA_PATTERN, bad);
  assert.ok("/audio/days/001-abc.m4a".startsWith(AUDIO_MEDIA_PREFIX));
  assert.equal(AUDIO_MAX_BYTES, 8 * 1024 * 1024);
});

test("Every committed manifest matches the media contract", () => {
  const manifests = readdirSync(
    new URL("../data/audio/manifests/", import.meta.url),
  ).filter((name) => name.endsWith(".json"));
  assert.equal(manifests.length, json("data/audio/catalog.json").days.length);
  for (const name of manifests) {
    const { src, day } = json(`data/audio/manifests/${name}`);
    assert.match(src, AUDIO_MEDIA_PATTERN, name);
    assert.ok(
      src.startsWith(`${AUDIO_MEDIA_PREFIX}${String(day).padStart(3, "0")}-`),
      name,
    );
  }
});

test("vercel.json proxies and caches media as the contract says", () => {
  const { rewrites, headers } = json("vercel.json");
  assert.deepEqual(rewrites, [
    {
      source: `${AUDIO_MEDIA_PREFIX}:file`,
      destination: `${AUDIO_PAGES_ORIGIN}${AUDIO_MEDIA_PREFIX}:file`,
    },
  ]);
  const media = headers.find(
    (rule: { source: string }) => rule.source === `${AUDIO_MEDIA_PREFIX}(.*)`,
  );
  assert.equal(
    media.headers.find((h: { key: string }) => h.key === "Cache-Control").value,
    AUDIO_CACHE_CONTROL,
  );
});

test("The deploy script targets the contract's Pages project", () => {
  const { scripts } = json("package.json");
  assert.match(
    scripts["audio:host:deploy"],
    new RegExp(`--project-name ${AUDIO_PAGES_PROJECT}( |$)`),
  );
  assert.equal(AUDIO_PAGES_ORIGIN, `https://${AUDIO_PAGES_PROJECT}.pages.dev`);
});

test("The range worker's 206 headers equal the contract", async () => {
  const response = await worker.fetch(
    new Request(`${AUDIO_PAGES_ORIGIN}${AUDIO_MEDIA_PREFIX}001-abc.m4a`, {
      headers: { Range: "bytes=0-1" },
    }),
    { ASSETS: { fetch: async () => new Response(new Uint8Array(16)) } },
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Type"), AUDIO_CONTENT_TYPE);
  assert.equal(response.headers.get("Cache-Control"), AUDIO_CACHE_CONTROL);
});

test("pagesConfig routes only media paths through the worker, with the contract's headers", () => {
  const config = pagesConfig();
  assert.deepEqual(Object.keys(config).sort(), [
    "404.html",
    "_headers",
    "_routes.json",
    "index.html",
  ]);
  assert.deepEqual(JSON.parse(config["_routes.json"]), {
    version: 1,
    include: [`${AUDIO_MEDIA_PREFIX}*`],
    exclude: [],
  });
  assert.equal(
    config._headers,
    `${AUDIO_MEDIA_PREFIX}*\n  Content-Type: ${AUDIO_CONTENT_TYPE}\n  Cache-Control: ${AUDIO_CACHE_CONTROL}\n`,
  );
  for (const page of ["index.html", "404.html"] as const)
    assert.match(config[page], /^<!doctype html>.*\n$/);
});
