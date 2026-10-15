import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AUDIO_CACHE_CONTROL,
  AUDIO_CONTENT_TYPE,
  AUDIO_MAX_BYTES,
  AUDIO_MEDIA_PATTERN,
  AUDIO_MEDIA_PREFIXES,
} from "../src/audio/contract.ts";

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

export function copyMedia(manifestPaths, output) {
  for (const manifestPath of manifestPaths) {
    const { src } = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!AUDIO_MEDIA_PATTERN.test(src))
      throw new Error(`Unexpected media path for ${manifestPath}`);
    const source = resolve("public", "." + src);
    const size = statSync(source).size;
    if (!size || size > AUDIO_MAX_BYTES)
      throw new Error(`Invalid media size for ${manifestPath}`);
    mkdirSync(resolve(output + src, ".."), { recursive: true });
    copyFileSync(source, output + src);
  }
}

// Kept separate from the Vercel build: recordings never enter Git or its bundle.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = resolve("artifacts/pages-audio");
  const { days } = JSON.parse(readFileSync("data/audio/catalog.json", "utf8"));
  const { chapters = [] } = existsSync("data/audio/chapter-catalog.json")
    ? JSON.parse(readFileSync("data/audio/chapter-catalog.json", "utf8"))
    : {};
  const manifestPaths = [
    ...days.map((day) => `data/audio/manifests/${day}.json`),
    ...chapters.map((key) => {
      const [, book, chapter] = key.split(":");
      return `data/audio/chapters/${book}/${chapter}.json`;
    }),
  ];
  mkdirSync(output, { recursive: true });
  copyMedia(manifestPaths, output);
  copyFileSync("hosting/cloudflare-audio/worker.js", `${output}/_worker.js`);
  for (const [name, content] of Object.entries(pagesConfig()))
    writeFileSync(`${output}/${name}`, content);
  console.log(
    `Prepared ${manifestPaths.length} recordings and byte-range handler in ${output}`,
  );
}
