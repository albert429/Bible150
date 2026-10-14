// Our own book table (USFM, OSIS, STEPBible, Arabic name) from data/books.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Maps an Arabic book name, as written in the reading plan, to its USFM code. */
export function usfmByName(root = ROOT) {
  const books = JSON.parse(readFileSync(join(root, "data/books.json"), "utf8"));
  return new Map(books.map(([usfm, , , name]) => [name, usfm]));
}
