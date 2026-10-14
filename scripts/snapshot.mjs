import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const GROWTH_LIMIT = 512;
const root = new URL("..", import.meta.url).pathname;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @param {string} dir @param {(name: string) => boolean} [keep] */
const files = (dir, keep = () => true) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir), { withFileTypes: true })
        .filter((entry) => entry.isFile() && keep(entry.name))
        .map((entry) => `${dir}/${entry.name}`)
    : [];

const publicFiles = () =>
  ["public/readings", "public/study"]
    .flatMap((dir) => files(dir))
    .concat(files("public/audio", (name) => name.endsWith(".json")))
    .sort();

const initialAssets = () => {
  const html = readFileSync(join(root, "dist/index.html"), "utf8");
  const tags = html.match(/<(script|link)\b[^>]*>/g) ?? [];
  const initial = new Set();
  for (const tag of tags) {
    const isStyle = /rel="stylesheet"/.test(tag);
    const isPreload = /rel="modulepreload"/.test(tag);
    const isModule = /^<script\b/.test(tag) && /type="module"/.test(tag);
    if (!isStyle && !isPreload && !isModule) continue;
    const ref = tag.match(/(?:src|href)="\/?(assets\/[^"]+)"/)?.[1];
    if (ref) initial.add(ref.slice("assets/".length));
  }
  return initial;
};

const capture = () => {
  const data = Object.fromEntries(
    publicFiles().map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
  const initial = existsSync(join(root, "dist/index.html"))
    ? initialAssets()
    : new Set();
  const assets = Object.fromEntries(
    files("dist/assets").map((path) => {
      const bytes = readFileSync(join(root, path));
      const name = path.slice("dist/assets/".length);
      return [
        name,
        {
          sha256: sha256(bytes),
          bytes: bytes.length,
          gzip: gzipSync(bytes).length,
          initial: initial.has(name),
        },
      ];
    }),
  );
  return { data, assets };
};

const initialTotals = ({ assets }) => {
  const totals = { js: 0, css: 0 };
  for (const [name, asset] of Object.entries(assets)) {
    if (!asset.initial) continue;
    if (name.endsWith(".js")) totals.js += asset.gzip;
    if (name.endsWith(".css")) totals.css += asset.gzip;
  }
  return totals;
};

const [command, directory] = process.argv.slice(2);
if (!["save", "compare"].includes(command) || !directory) {
  console.error("Usage: snapshot.mjs save|compare <dir>");
  process.exit(2);
}
const file = join(directory, "snapshot.json");

if (command === "save") {
  const snapshot = capture();
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  const totals = initialTotals(snapshot);
  console.log(
    `Saved ${Object.keys(snapshot.data).length} data files and ${Object.keys(snapshot.assets).length} assets to ${file}`,
  );
  console.log(`Initial gzip: js ${totals.js} B, css ${totals.css} B`);
} else {
  const before = JSON.parse(readFileSync(file, "utf8"));
  const after = capture();
  const failures = [];

  const paths = new Set([
    ...Object.keys(before.data),
    ...Object.keys(after.data),
  ]);
  for (const path of [...paths].sort()) {
    if (!(path in after.data)) failures.push(`removed: ${path}`);
    else if (!(path in before.data)) failures.push(`added: ${path}`);
    else if (before.data[path] !== after.data[path])
      failures.push(`changed: ${path}`);
  }

  const oldTotals = initialTotals(before);
  const newTotals = initialTotals(after);
  const delta = (kind) => newTotals[kind] - oldTotals[kind];
  for (const kind of ["js", "css"])
    if (delta(kind) > GROWTH_LIMIT)
      failures.push(
        `initial ${kind} gzip grew by ${delta(kind)} B (limit ${GROWTH_LIMIT} B)`,
      );

  const hashes = (snapshot) =>
    JSON.stringify(
      Object.entries(snapshot.assets).map(([name, a]) => [name, a.sha256]),
    );
  console.log(
    `Public data: ${paths.size} files, ${failures.filter((f) => !f.startsWith("initial")).length} differences`,
  );
  for (const kind of ["js", "css"])
    console.log(
      `Initial ${kind} gzip: ${oldTotals[kind]} -> ${newTotals[kind]} B (${delta(kind) >= 0 ? "+" : ""}${delta(kind)})`,
    );
  console.log(
    `dist/assets: ${hashes(before) === hashes(after) ? "identical" : "changed"} (informational)`,
  );
  if (failures.length) {
    console.error(`\nFAILED:\n${failures.map((f) => `  ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("OK");
}
