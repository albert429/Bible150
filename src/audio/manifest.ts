import type { Day } from "../plan/readings";
import { AUDIO_MEDIA_PATTERN } from "./contract.ts";

export type Cue = {
  passage: number;
  verse: number;
  start: number;
  end: number;
};
export type AudioManifest = {
  version: 1;
  day: number;
  readingHash: string;
  src: string;
  duration: number;
  cues: Cue[];
};

// This exact representation is also used by the offline audio builder.
export function readingTranscript(reading: Day) {
  return JSON.stringify(
    reading.passages.map((p) => [
      p.book,
      p.chapter,
      p.start,
      p.end,
      p.verses?.map((v) => [v.number, v.text]),
    ]),
  );
}

export async function readingHash(reading: Day) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(readingTranscript(reading)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function validManifest(
  data: unknown,
  day: string,
): data is AudioManifest {
  const m = data as AudioManifest | null;
  if (
    !m ||
    m.version !== 1 ||
    m.day !== Number(day) ||
    !/^[a-f0-9]{64}$/.test(m.readingHash) ||
    typeof m.src !== "string" ||
    !AUDIO_MEDIA_PATTERN.test(m.src) ||
    !Number.isFinite(m.duration) ||
    m.duration <= 0 ||
    !Array.isArray(m.cues) ||
    !m.cues.length
  )
    return false;
  return m.cues.every(
    (cue, index) =>
      !!cue &&
      typeof cue === "object" &&
      Number.isInteger(cue.passage) &&
      cue.passage >= 0 &&
      Number.isInteger(cue.verse) &&
      cue.verse >= 1 &&
      Number.isFinite(cue.start) &&
      Number.isFinite(cue.end) &&
      cue.start >= 0 &&
      cue.start < cue.end &&
      cue.end <= m.duration + 0.1 &&
      (index === 0 || cue.start >= m.cues[index - 1].end),
  );
}

export async function matchesReading(manifest: AudioManifest, reading: Day) {
  const expected = reading.passages.flatMap((p, passage) =>
    (p.verses || []).map((v) => ({ passage, verse: v.number })),
  );
  return (
    manifest.day === reading.day &&
    manifest.cues.length === expected.length &&
    expected.every(
      (v, i) =>
        v.passage === manifest.cues[i].passage &&
        v.verse === manifest.cues[i].verse,
    ) &&
    manifest.readingHash === (await readingHash(reading))
  );
}

// Keep the current verse selected during the brief silence before the next.
export function cueAt(cues: Cue[], time: number) {
  let low = 0,
    high = cues.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (cues[mid].start <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}
