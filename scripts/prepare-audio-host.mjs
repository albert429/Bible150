import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

// Kept separate from the Vercel build: recordings never enter Git or its bundle.
const output = resolve("artifacts/pages-audio");
const { days } = JSON.parse(readFileSync("data/audio/catalog.json", "utf8"));
mkdirSync(`${output}/audio/days`, { recursive: true });
for (const day of days) {
  const { src } = JSON.parse(
    readFileSync(`data/audio/manifests/${day}.json`, "utf8"),
  );
  if (!/^\/audio\/days\/\d{3}-[a-f0-9]+\.m4a$/.test(src))
    throw new Error(`Unexpected media path for day ${day}`);
  const source = resolve("public", "." + src);
  const size = statSync(source).size;
  if (!size || size > 8 * 1024 * 1024)
    throw new Error(`Invalid media size for day ${day}`);
  copyFileSync(source, output + src);
}
copyFileSync("hosting/cloudflare-audio/worker.js", `${output}/_worker.js`);
writeFileSync(
  `${output}/_routes.json`,
  JSON.stringify({ version: 1, include: ["/audio/days/*"], exclude: [] }) +
    "\n",
);
writeFileSync(
  `${output}/_headers`,
  "/audio/days/*\n  Content-Type: audio/mp4\n  Cache-Control: public, max-age=31536000, immutable\n",
);
writeFileSync(
  `${output}/index.html`,
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Bible reading audio</title><p>Audio assets for the chronological New Testament reader.</p></html>\n',
);
writeFileSync(
  `${output}/404.html`,
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found</title><p>Audio file not found.</p></html>\n',
);
console.log(
  `Prepared ${days.length} recordings and byte-range handler in ${output}`,
);
