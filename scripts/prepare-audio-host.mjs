import {
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, delimiter, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  AUDIO_CACHE_CONTROL,
  AUDIO_CONTENT_TYPE,
  AUDIO_MAX_BYTES,
  AUDIO_MAX_FILES,
  AUDIO_MEDIA_PATTERN,
  AUDIO_MEDIA_PREFIXES,
} from "../src/audio/contract.ts";
import { manifestMedia, publishedMedia } from "../src/audio/publication.ts";

/** The Pages bundle's static files, keyed by their path in the bundle. */
export function pagesConfig() {
  return {
    "_routes.json":
      JSON.stringify({
        version: 1,
        include: AUDIO_MEDIA_PREFIXES.map((prefix) => `${prefix}*`),
        exclude: [],
      }) + "\n",
    _headers: AUDIO_MEDIA_PREFIXES.map(
      (prefix) =>
        `${prefix}*\n  Content-Type: ${AUDIO_CONTENT_TYPE}\n  Cache-Control: ${AUDIO_CACHE_CONTROL}\n`,
    ).join(""),
    "index.html":
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Bible reading audio</title><p>Audio assets for the chronological New Testament reader.</p></html>\n',
    "404.html":
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><p>Audio file not found.</p></html>\n',
  };
}

/** The first media root holding `src`, or undefined. */
export function findMedia(src, roots) {
  if (!AUDIO_MEDIA_PATTERN.test(src))
    throw new Error(`Unexpected media path ${JSON.stringify(src)}`);
  for (const root of [roots].flat()) {
    const path = resolve(root, "." + src);
    if (existsSync(path)) return path;
  }
  return undefined;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Place each recording in the bundle: a hard link when the bundle shares the
 * media's file system (no 2.7GB copy), else a copy-on-write clone or copy.
 * Refuses, never truncates, files over the range handler's limit.
 */
export function placeMedia(srcs, output, roots, { link = true } = {}) {
  /** @type {Record<string, { bytes: number; sha256: string }>} */
  const files = {};
  for (const src of srcs) {
    const source = findMedia(src, roots);
    if (!source) throw new Error(`Missing media ${src} in ${[roots].flat()}`);
    const size = statSync(source).size;
    if (!size || size > AUDIO_MAX_BYTES)
      throw new Error(`Invalid media size ${size} for ${src}`);
    const target = output + src;
    mkdirSync(resolve(target, ".."), { recursive: true });
    rmSync(target, { force: true });
    let linked = false;
    if (link)
      try {
        linkSync(source, target);
        linked = true;
      } catch {
        /* Another file system: fall back to a clone or copy. */
      }
    if (!linked) copyFileSync(source, target, constants.COPYFILE_FICLONE);
    files[src] = { bytes: size, sha256: sha256File(target) };
  }
  return files;
}

/** Compatibility: copy each manifest's recording from `root` into the bundle. */
export function copyMedia(manifestPaths, output, root = "public") {
  const srcs = manifestPaths.flatMap((path) => {
    const media = manifestMedia(JSON.parse(readFileSync(path, "utf8")));
    if (!media.length || !media.every((src) => AUDIO_MEDIA_PATTERN.test(src)))
      throw new Error(`Unexpected media path for ${path}`);
    return media;
  });
  return placeMedia(srcs, output, root, { link: false });
}

/**
 * Media the current catalogs need, and media kept for rollback: every file
 * already in the verified upload inventory plus any extra `retain` lists.
 */
export function bundleSources(root = ".", retainFiles = []) {
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const optional = (path) =>
    existsSync(resolve(root, path)) ? read(path) : undefined;
  const { days } = read("data/audio/catalog.json");
  const chapters = optional("data/audio/chapter-catalog.json")?.chapters ?? [];
  const readings = optional("data/audio/reading-catalog.json")?.readings ?? [];
  const manifests = [
    ...days.map((day) => `data/audio/manifests/${day}.json`),
    ...chapters.map((key) => {
      const [, book, chapter] = key.split(":");
      return `data/audio/chapters/${book}/${chapter}.json`;
    }),
    ...readings.map((key) => {
      const [, testament, id] = key.split(":");
      return `data/audio/readings/${testament}/${id}.json`;
    }),
  ];
  const required = new Set();
  for (const path of manifests) {
    const media = manifestMedia(read(path));
    if (!media.length) throw new Error(`No media in ${path}`);
    for (const src of media) required.add(src);
  }
  const retained = new Set(
    publishedMedia(optional("data/audio/publication.json")),
  );
  for (const file of retainFiles) {
    const value = JSON.parse(readFileSync(file, "utf8"));
    for (const src of Object.keys(value.files ?? {})) retained.add(src);
  }
  for (const src of required) retained.delete(src);
  return { manifests: manifests.length, required, retained };
}

/**
 * @param {{ output: string; roots: string | string[]; retain?: string[];
 *   release?: string; link?: boolean; root?: string }} options
 */
export function prepareBundle({
  output,
  roots,
  retain = [],
  release,
  link = true,
  root = ".",
}) {
  const { manifests, required, retained } = bundleSources(root, retain);
  const srcs = [...required, ...retained].sort();
  const config = pagesConfig();
  const count = srcs.length + Object.keys(config).length + 1;
  if (count > AUDIO_MAX_FILES)
    throw new Error(`${count} files exceed the ${AUDIO_MAX_FILES}-file limit`);
  if (!basename(output).startsWith("pages-audio"))
    throw new Error(`Refusing to clean ${output}: not a pages-audio bundle`);
  for (const media of [roots].flat())
    if ((resolve(media) + "/").startsWith(resolve(output) + "/"))
      throw new Error(`Media root ${media} lies inside the bundle ${output}`);
  // Rebuilt from scratch so a removed file can never linger by accident.
  rmSync(resolve(output, "audio"), { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const files = placeMedia(srcs, output, roots, { link });
  copyFileSync(
    resolve(root, "hosting/cloudflare-audio/worker.js"),
    resolve(output, "_worker.js"),
  );
  for (const [name, content] of Object.entries(config))
    writeFileSync(resolve(output, name), content);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(srcs.map((src) => [src, files[src].sha256])))
    .digest("hex")
    .slice(0, 12);
  const bytes = srcs.reduce((sum, src) => sum + files[src].bytes, 0);
  const largest = srcs.reduce(
    (max, src) => (files[src].bytes > (files[max]?.bytes ?? 0) ? src : max),
    srcs[0],
  );
  return {
    version: 1,
    kind: "prepared",
    release:
      release ?? `${new Date().toISOString().slice(0, 10)}-${fingerprint}`,
    prepared: new Date().toISOString(),
    output,
    manifests,
    required: required.size,
    retained: retained.size,
    bytes,
    largest: largest && { src: largest, bytes: files[largest].bytes },
    files,
  };
}

// Kept separate from the Vercel build: recordings never enter Git or its bundle.
// Media roots (AUDIO_MEDIA_ROOT, a path-delimited list, or repeated --media)
// may lie outside public/, so local builds do not copy recordings into dist/.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      media: { type: "string", multiple: true },
      output: { type: "string", default: "artifacts/pages-audio" },
      inventory: {
        type: "string",
        default: "artifacts/pages-audio-inventory.json",
      },
      retain: { type: "string", multiple: true, default: [] },
      release: { type: "string" },
      copy: { type: "boolean", default: false },
    },
  });
  const roots = values.media?.length
    ? values.media
    : (process.env.AUDIO_MEDIA_ROOT || "public").split(delimiter);
  const inventory = prepareBundle({
    output: resolve(values.output),
    roots,
    retain: values.retain,
    release: values.release,
    link: !values.copy,
  });
  writeFileSync(values.inventory, JSON.stringify(inventory, null, 1) + "\n");
  const count = Object.keys(inventory.files).length;
  console.log(
    `Prepared release ${inventory.release}: ${count} recordings ` +
      `(${inventory.required} required, ${inventory.retained} kept for rollback), ` +
      `${(inventory.bytes / 1e9).toFixed(2)} GB, largest ${inventory.largest?.bytes} bytes, ` +
      `in ${inventory.output}; local inventory ${values.inventory}. ` +
      `Prepared is not published: run scripts/verify-audio-host.py after deploying.`,
  );
}
