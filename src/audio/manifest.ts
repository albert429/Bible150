import { readingKey, type ScriptureReading } from "../bible/types.ts";
import { AUDIO_MEDIA_PATTERN } from "./contract.ts";

export type Cue = {
  passage: number;
  verse: number;
  start: number;
  end: number;
};
export type Announcement = {
  passage: number;
  start: number;
  end: number;
  reference: string;
  kind: "reference" | "source";
};
type MediaManifest = {
  readingHash: string;
  src: string;
  duration: number;
  cues: Cue[];
};
export type LegacyAudioManifest = MediaManifest & { version: 1; day: number };
export type AudioManifestV2 = MediaManifest & {
  version: 2;
  identity: string;
  day?: number;
  book?: string;
  chapter?: number;
  /** Chapter timing deliberately supplies no invented verse cues. */
  alignment: "verse" | "chapter";
  announcements: Announcement[];
};
export type AudioManifest = LegacyAudioManifest | AudioManifestV2;

// This exact representation is also used by the offline audio builder.
export function readingTranscript(reading: ScriptureReading) {
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
export async function readingHash(reading: ScriptureReading) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(readingTranscript(reading)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function audioReadingKey(reading: ScriptureReading) {
  return readingKey(reading);
}
export function manifestKey(key: string) {
  return /^\d+$/.test(key) ? `plan:${Number(key)}` : key;
}
export function audioManifestUrl(key: string) {
  const identity = manifestKey(key);
  const day = /^plan:(\d+)$/.exec(identity);
  if (day) return `/audio/${Number(day[1])}.json`;
  const chapter = /^bible:([A-Z0-9]{3}):([1-9]\d{0,2})$/.exec(identity);
  if (chapter) return `/audio/chapters/${chapter[1]}/${chapter[2]}.json`;
  throw new Error("Invalid audio reading identity.");
}
export function validManifest(
  data: unknown,
  key: string,
): data is AudioManifest {
  if (!data || typeof data !== "object") return false;
  const m = data as AudioManifest;
  const identity = manifestKey(key);
  const plan = /^plan:([1-9]\d{0,2})$/.exec(identity);
  const chapter = /^bible:([A-Z0-9]{3}):([1-9]\d{0,2})$/.exec(identity);
  if (
    (plan && Number(plan[1]) > 150) ||
    (!plan && !chapter) ||
    (m.version !== 1 && m.version !== 2) ||
    !/^[a-f0-9]{64}$/.test(m.readingHash) ||
    typeof m.src !== "string" ||
    !AUDIO_MEDIA_PATTERN.test(m.src) ||
    !Number.isFinite(m.duration) ||
    m.duration <= 0 ||
    !Array.isArray(m.cues)
  )
    return false;
  if (plan) {
    if (
      m.day !== Number(plan[1]) ||
      !m.src.startsWith(`/audio/days/${plan[1].padStart(3, "0")}-`)
    )
      return false;
  } else if (
    m.version !== 2 ||
    m.book !== chapter![1] ||
    m.chapter !== Number(chapter![2]) ||
    !m.src.startsWith(`/audio/chapters/assets/${chapter![1]}-${chapter![2]}-`)
  )
    return false;
  if (m.version === 1) {
    if (!m.cues.length) return false;
  } else if (
    m.identity !== identity ||
    !["verse", "chapter"].includes(m.alignment) ||
    (m.alignment === "verse" ? !m.cues.length : m.cues.length !== 0) ||
    !Array.isArray(m.announcements)
  )
    return false;
  if (
    !m.cues.every(
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
    )
  )
    return false;
  // Never interpret unvalidated extension fields on a version-one manifest.
  return (
    m.version === 1 ||
    m.announcements.every(
      (a, index) =>
        !!a &&
        typeof a === "object" &&
        Number.isInteger(a.passage) &&
        a.passage >= 0 &&
        Number.isFinite(a.start) &&
        Number.isFinite(a.end) &&
        a.start >= 0 &&
        a.start < a.end &&
        a.end <= m.duration + 0.1 &&
        typeof a.reference === "string" &&
        a.reference.trim().length > 0 &&
        a.reference.length <= 500 &&
        ["reference", "source"].includes(a.kind) &&
        (index === 0 || a.start >= m.announcements[index - 1].end) &&
        m.cues.every((cue) => a.end <= cue.start || a.start >= cue.end),
    )
  );
}
export async function matchesReading(
  manifest: AudioManifest,
  reading: ScriptureReading,
) {
  const expected = reading.passages.flatMap((p, passage) =>
    p.verses.map((v) => ({ passage, verse: v.number })),
  );
  return (
    validManifest(manifest, audioReadingKey(reading)) &&
    ((manifest.version === 2 && manifest.alignment === "chapter") ||
      (manifest.cues.length === expected.length &&
        expected.every(
          (v, i) =>
            v.passage === manifest.cues[i].passage &&
            v.verse === manifest.cues[i].verse,
        ))) &&
    (manifest.version === 1 ||
      manifest.announcements.every(
        (a) => a.passage < reading.passages.length,
      )) &&
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
export function announcementAt(manifest: AudioManifest, time: number) {
  return manifest.version === 2
    ? manifest.announcements.find((a) => time >= a.start && time < a.end)
    : undefined;
}
/**
 * The verse being read, or -1 with no verse timing or during an explicit
 * opening or spoken reference. As before references existed, a brief
 * unannounced lead-in already shows the first verse.
 */
export function activeCueIndex(manifest: AudioManifest, time: number) {
  return !manifest.cues.length || announcementAt(manifest, time)
    ? -1
    : cueAt(manifest.cues, time);
}
/** During an opening or passage reference, next verse goes to the upcoming verse. */
export function stepCueIndex(
  manifest: AudioManifest,
  time: number,
  step: number,
) {
  const active = activeCueIndex(manifest, time);
  if (active >= 0) return active + step;
  const upcoming = manifest.cues.findIndex((cue) => cue.start >= time);
  return step > 0
    ? upcoming < 0
      ? manifest.cues.length - 1
      : upcoming
    : upcoming < 0
      ? manifest.cues.length - 1
      : upcoming - 1;
}
