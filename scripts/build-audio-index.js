import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readingTranscript, validManifest } from "../src/audio/manifest.ts";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Publishes every catalogued manifest into `out`; returns the summary line. */
export function buildAudioIndex({ out, root = ROOT }) {
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const { days } = read("data/audio/catalog.json");
  const plan = read("data/plan.json");
  mkdirSync(out, { recursive: true });
  for (const day of days) {
    const reading = plan.find((entry) => entry.day === day);
    if (!reading) throw new Error(`Invalid audio day ${day}`);
    const manifest = read(`data/audio/manifests/${day}.json`);
    if (!validManifest(manifest, String(day)))
      throw new Error(`Audio manifest for day ${day} is malformed.`);
    const hash = createHash("sha256")
      .update(readingTranscript(reading))
      .digest("hex");
    if (manifest.readingHash !== hash)
      throw new Error(
        `Audio for day ${day} is stale. Rebuild it from the updated Scripture.`,
      );
    writeFileSync(join(out, `${day}.json`), JSON.stringify(manifest));
  }
  return `Prepared ${days.length} audio manifests (recordings are hosted separately).`;
}
