import type { GreekToken } from "./types.ts";

export const verseId = (usfm: string, chapter: number, verse: number) =>
  `${usfm}.${chapter}.${verse}`;

export const tokens = (text: string) => text.split(" ");

/**
 * A Greek token without editorial marks or punctuation ("λόγος," → "λόγος"):
 * ASCII and Greek stops (U+0387 ano teleia, U+037E question mark), pilcrows,
 * brackets. Elision marks (U+1FBD, U+2019) belong to the word and stay.
 */
export const greekWord = (word: string) =>
  word
    .replace(/^[[\]]+/, "")
    .replace(/[\s,.;:\u00b7\u0387\u037e\u00b6\u00ac[\]]+$/u, "");
/** An English gloss without a trailing full stop. */
export const gloss = (value: string) => value.replace(/\.$/, "");

/** The Van Dyck words a0..a1, without trailing punctuation or quote marks. */
export function span(text: string, a0: number, a1: number) {
  return tokens(text)
    .slice(a0, a1 + 1)
    .join(" ")
    .replace(/^[«"]+/, "")
    .replace(/[،.:؛!؟,»"]+$/, "");
}

export type GreekGroup = {
  a0: number | null;
  a1: number | null;
  tokens: GreekToken[];
};

/** Consecutive tokens translated by the same Arabic words; unaligned tokens stay single. */
export function groupRows(g: GreekToken[]): GreekGroup[] {
  const groups: GreekGroup[] = [];
  for (const token of g) {
    const [, , , , , a0, a1] = token;
    const last = groups.at(-1);
    if (last && a0 !== null && last.a0 === a0 && last.a1 === a1)
      last.tokens.push(token);
    else groups.push({ a0, a1, tokens: [token] });
  }
  return groups;
}

// Nouns, verbs, adjectives and interjections carry a verse's meaning; articles,
// pronouns, prepositions, conjunctions, particles and adverbs are left out.
const KEY_MORPH = /^(?:N|V|A|INJ)\b/;

/** Key words only, each Greek word (by Strong's number) listed once per verse. */
export function keyGroups(g: GreekToken[]): GreekGroup[] {
  const seen = new Set<string>();
  const result: GreekGroup[] = [];
  for (const group of groupRows(g)) {
    const tokens = group.tokens.filter(([, , strong, morph]) => {
      const key = strong.slice(0, 5);
      if (!KEY_MORPH.test(morph) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (tokens.length) result.push({ ...group, tokens });
  }
  return result;
}
