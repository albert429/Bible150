import {
  copyFileSync,
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
  AUDIO_MEDIA_PREFIX,
} from "../src/audio/contract.ts";

/** The Pages bundle's static files, keyed by their path in the bundle. */
export function pagesConfig() {
  return {
    "_routes.json":
      JSON.stringify({
        version: 1,
        include: [`${AUDIO_MEDIA_PREFIX}*`],
        exclude: [],
      }) + "\n",
    _headers: `${AUDIO_MEDIA_PREFIX}*\n  Content-Type: ${AUDIO_CONTENT_TYPE}\n  Cache-Control: ${AUDIO_CACHE_CONTROL}\n`,
    "index.html":
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Bible reading audio</title><p>Audio assets for the chronological New Testament reader.</p></html>\n',
    "404.html":
      '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><p>Audio file not found.</p></html>\n',
  };
}

function copyMedia(days, output) {
  for (const day of days) {
    const { src } = JSON.parse(
      readFileSync(`data/audio/manifests/${day}.json`, "utf8"),
    );
    if (!AUDIO_MEDIA_PATTERN.test(src))
      throw new Error(`Unexpected media path for day ${day}`);
    const source = resolve("public", "." + src);
    const size = statSync(source).size;
    if (!size || size > AUDIO_MAX_BYTES)
      throw new Error(`Invalid media size for day ${day}`);
    copyFileSync(source, output + src);
  }
}

// Kept separate from the Vercel build: recordings never enter Git or its bundle.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = resolve("artifacts/pages-audio");
  const { days } = JSON.parse(readFileSync("data/audio/catalog.json", "utf8"));
  mkdirSync(output + AUDIO_MEDIA_PREFIX, { recursive: true });
  copyMedia(days, output);
  copyFileSync("hosting/cloudflare-audio/worker.js", `${output}/_worker.js`);
  for (const [name, content] of Object.entries(pagesConfig()))
    writeFileSync(`${output}/${name}`, content);
  console.log(
    `Prepared ${days.length} recordings and byte-range handler in ${output}`,
  );
}
