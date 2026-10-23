// Verified publication: prepared media is not published media. Builds
// advertise hosted chapters and playlists only from the verified inventory,
// and the Pages bundle keeps every previously published file for rollback.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigEnv, Plugin, UserConfigFn } from "vite";
import {
  advertisedAudio,
  manifestMedia,
  manifestOutputPath,
  publicationErrors,
  publishedMedia,
} from "../src/audio/publication.ts";
import {
  bundleSources,
  prepareBundle,
} from "../scripts/prepare-audio-host.mjs";

const DAY = "/audio/days/001-aa.m4a";
const GEN = "/audio/chapters/assets/GEN-1-aa.m4a";
const REV = "/audio/chapters/assets/REV-22-bb.m4a";
const CLIP = "/audio/clips/GEN-2-4-25-cc.m4a";

function inventory(files: string[], release = "r1") {
  return {
    version: 1,
    releases: [
      {
        id: release,
        verified: "2026-10-16T12:00:00Z",
        host: "https://app.example",
        method: "ranges",
        files: Math.max(1, files.length),
      },
    ],
    files: Object.fromEntries(
      files.map((src) => [src, { bytes: 10, sha256: "a".repeat(64), release }]),
    ),
  };
}
const playlist = (...srcs: string[]) => ({
  version: 3,
  entries: srcs.map((src) => ({ src })),
});
const options = (
  over: Partial<Parameters<typeof advertisedAudio>[0]> = {},
) => ({
  base: "/",
  chaptersEnabled: false,
  days: [{ key: 1, manifest: { src: DAY } }],
  chapters: [
    { key: "bible:GEN:1", manifest: { src: GEN } },
    { key: "bible:REV:22", manifest: { src: REV } },
  ],
  readings: [
    { key: "chrono:OT:creation", manifest: playlist(GEN, CLIP) },
    { key: "chrono:NT:end", manifest: playlist(REV) },
  ],
  local: () => false,
  inventory: undefined,
  ...over,
});

test("The inventory format is strict", () => {
  assert.deepEqual(publicationErrors(inventory([GEN])), []);
  assert.equal(publishedMedia(undefined).size, 0);
  assert.deepEqual([...publishedMedia(inventory([GEN, CLIP]))], [GEN, CLIP]);
  const bad = inventory([GEN]);
  bad.files[GEN].release = "unknown";
  assert.ok(publicationErrors(bad).length);
  assert.throws(() => publishedMedia(bad), /inventory/);
  const unsafe = inventory(["/audio/../secret.m4a"]);
  assert.ok(publicationErrors(unsafe).length);
  const big = inventory([GEN]);
  big.files[GEN].bytes = 8 * 1024 * 1024 + 1;
  assert.ok(publicationErrors(big).length);
  assert.deepEqual(manifestMedia({ src: GEN }), [GEN]);
  assert.deepEqual(manifestMedia(playlist(GEN, CLIP)), [GEN, CLIP]);
});

test("Without verified uploads only bundled media is advertised", () => {
  const none = advertisedAudio(options({ base: "" }));
  assert.deepEqual(none, { days: [], chapters: [], readings: [] });
  const local = advertisedAudio(
    options({ base: "", local: (src) => src === DAY || src === GEN }),
  );
  assert.deepEqual(local.days, [1]);
  assert.deepEqual(local.chapters, ["bible:GEN:1"]);
  // A playlist with one unbundled clip is not playable.
  assert.deepEqual(local.readings, []);
});

test("A host advertises days as before but chapters only when enabled and every one is verified", () => {
  const hosted = advertisedAudio(options());
  assert.deepEqual(hosted.days, [1]);
  assert.deepEqual(hosted.chapters, []);
  assert.throws(
    () => advertisedAudio(options({ chaptersEnabled: true })),
    /2 of 2 chapter recordings are not in the verified upload inventory/,
  );
  assert.throws(
    () =>
      advertisedAudio(
        options({ chaptersEnabled: true, inventory: inventory([GEN]) }),
      ),
    /1 of 2.*REV:22/,
  );
  const all = advertisedAudio(
    options({ chaptersEnabled: true, inventory: inventory([GEN, REV]) }),
  );
  assert.deepEqual(all.chapters, ["bible:GEN:1", "bible:REV:22"]);
});

test("Chronological playlists need every entry verified, clips included", () => {
  assert.deepEqual(
    advertisedAudio(options({ inventory: inventory([GEN, REV]) })).readings,
    ["chrono:NT:end"],
  );
  assert.deepEqual(
    advertisedAudio(options({ inventory: inventory([GEN, REV, CLIP]) }))
      .readings,
    ["chrono:OT:creation", "chrono:NT:end"],
  );
  // No host configured: verified uploads are unreachable from this build.
  assert.deepEqual(
    advertisedAudio(
      options({ base: "", inventory: inventory([GEN, REV, CLIP]) }),
    ).readings,
    [],
  );
  // An empty playlist is never playable.
  assert.deepEqual(
    advertisedAudio(
      options({
        readings: [{ key: "chrono:OT:x", manifest: playlist() }],
        inventory: inventory([GEN]),
      }),
    ).readings,
    [],
  );
});

test("Synthetic .test fixture hosts bypass the inventory; real hosts never do", () => {
  const fixture = advertisedAudio(
    options({ base: "https://audio.example.test", chaptersEnabled: true }),
  );
  assert.equal(fixture.chapters.length, 2);
  assert.equal(fixture.readings.length, 2);
  assert.throws(() =>
    advertisedAudio(
      options({ base: "https://audio.example.com", chaptersEnabled: true }),
    ),
  );
});

test("Manifest output paths follow the routes", () => {
  assert.equal(manifestOutputPath(7), "audio/7.json");
  assert.equal(
    manifestOutputPath("bible:PSA:119"),
    "audio/chapters/PSA/119.json",
  );
  assert.equal(
    manifestOutputPath("chrono:OT:gen-1"),
    "audio/chrono/OT/gen-1.json",
  );
  assert.throws(() => manifestOutputPath("chrono:XX:a"));
});

const scratch = mkdtempSync(join(tmpdir(), "audio-publication-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function repository(name: string) {
  const root = join(scratch, name);
  const write = (path: string, value: unknown) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  write("data/audio/catalog.json", { days: [1] });
  write("data/audio/manifests/1.json", { src: DAY });
  write("data/audio/chapter-catalog.json", { chapters: ["bible:GEN:1"] });
  write("data/audio/chapters/GEN/1.json", { src: GEN });
  write("data/audio/reading-catalog.json", { readings: ["chrono:OT:a"] });
  write("data/audio/readings/OT/a.json", playlist(GEN, CLIP));
  write("hosting/cloudflare-audio/worker.js", "export default {};\n");
  const media = join(root, "media");
  for (const src of [DAY, GEN, CLIP, REV]) write(`media${src}`, src);
  return { root, write, media };
}

test("The bundle holds required media plus every published file, hard-linked", () => {
  const { root, write, media } = repository("bundle");
  // REV 22 was published by an earlier release and is no longer referenced.
  write("data/audio/publication.json", inventory([REV, GEN]));
  const sources = bundleSources(root);
  assert.deepEqual([...sources.required].sort(), [GEN, DAY, CLIP].sort());
  assert.deepEqual([...sources.retained], [REV]);
  const output = join(root, "artifacts/pages-audio");
  // A stale file from an earlier preparation must not survive.
  write("artifacts/pages-audio/audio/days/999-ff.m4a", "stale");
  const prepared = prepareBundle({ output, roots: [media], root });
  assert.equal(prepared.kind, "prepared");
  assert.deepEqual(
    Object.keys(prepared.files).sort(),
    [GEN, DAY, CLIP, REV].sort(),
  );
  assert.equal(prepared.retained, 1);
  assert.ok(!existsSync(join(output, "audio/days/999-ff.m4a")));
  for (const src of [GEN, REV]) {
    assert.equal(readFileSync(output + src, "utf8"), src);
    assert.equal(statSync(output + src).ino, statSync(media + src).ino);
  }
  assert.ok(existsSync(join(output, "_worker.js")));
  assert.match(
    readFileSync(join(output, "_routes.json"), "utf8"),
    /\/audio\/clips\/\*/,
  );
  // Copy mode for file systems without hard links.
  const copied = prepareBundle({
    output: join(root, "artifacts/pages-audio-copy"),
    roots: [media],
    root,
    link: false,
  });
  assert.notEqual(
    statSync(join(root, "artifacts/pages-audio-copy") + GEN).ino,
    statSync(media + GEN).ino,
  );
  assert.equal(copied.files[GEN].sha256, prepared.files[GEN].sha256);
});

test("Missing, oversized or misplaced media is refused, never dropped", () => {
  const { root, media } = repository("refuse");
  rmSync(media + CLIP);
  assert.throws(
    () =>
      prepareBundle({
        output: join(root, "artifacts/pages-audio"),
        roots: [media],
        root,
      }),
    /Missing media .*GEN-2-4-25/,
  );
  // Later roots are searched too (daily media and chapters live apart).
  const other = join(root, "other");
  mkdirSync(join(other, "audio/clips"), { recursive: true });
  writeFileSync(other + CLIP, "clip");
  prepareBundle({
    output: join(root, "artifacts/pages-audio"),
    roots: [media, other],
    root,
  });
  writeFileSync(media + GEN, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.throws(
    () =>
      prepareBundle({
        output: join(root, "artifacts/pages-audio"),
        roots: [media, other],
        root,
      }),
    /Invalid media size/,
  );
  assert.throws(
    () =>
      prepareBundle({
        output: join(root, "artifacts/other"),
        roots: [media],
        root,
      }),
    /Refusing to clean/,
  );
  assert.throws(
    () =>
      prepareBundle({
        output: join(root, "pages-audio"),
        roots: [join(root, "pages-audio/media")],
        root,
      }),
    /inside the bundle/,
  );
});

test("The build removes manifests it does not advertise", async () => {
  const { root, write } = repository("vite");
  write("public/audio/chapters/assets/GEN-1-aa.m4a", "");
  const original = process.cwd();
  const saved = { ...process.env };
  for (const name of Object.keys(process.env))
    if (name.startsWith("VITE_")) delete process.env[name];
  process.chdir(root);
  try {
    const { default: config } = await import("../vite.config.ts");
    const env: ConfigEnv = {
      command: "build",
      mode: "production",
      isSsrBuild: false,
      isPreview: false,
    };
    const resolved = await (config as UserConfigFn)(env);
    assert.equal(resolved.define?.__AUDIO_READINGS__, "[]");
    const plugin = (resolved.plugins as Plugin[]).find(
      (p) => p?.name === "audio-unpublished-manifests",
    )!;
    for (const path of [
      "dist/audio/1.json",
      "dist/audio/chapters/GEN/1.json",
      "dist/audio/chrono/OT/a.json",
    ])
      write(path, "{}");
    (plugin.configResolved as (c: unknown) => void)({
      root,
      build: { outDir: "dist" },
    });
    (plugin.closeBundle as () => void)();
    // Day 1's media is not bundled and no host is set; GEN 1 is bundled.
    assert.ok(!existsSync(join(root, "dist/audio/1.json")));
    assert.ok(existsSync(join(root, "dist/audio/chapters/GEN/1.json")));
    assert.ok(!existsSync(join(root, "dist/audio/chrono/OT/a.json")));
  } finally {
    process.chdir(original);
    process.env = saved;
  }
});
