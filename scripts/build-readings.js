import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Writes the plan index and one file per day into `out`; returns the summary line. */
export function buildReadings({ out, root = ROOT }) {
  const plan = JSON.parse(readFileSync(join(root, "data/plan.json"), "utf8"));
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "plan.json"),
    JSON.stringify(
      plan.map(({ passages, ...d }) => ({
        ...d,
        passages: passages.map(({ verses, ...p }) => p),
      })),
    ),
  );
  for (const day of plan)
    writeFileSync(join(out, day.day + ".json"), JSON.stringify(day));
  return `Generated ${plan.length} static daily readings.`;
}
