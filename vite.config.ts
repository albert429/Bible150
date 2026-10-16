import { defineConfig, loadEnv } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { audioUrl } from "./src/audio/url.ts";
import { aiBuildConfig } from "./src/ai/config.ts";
import { chapterAvailability } from "./src/audio/availability.ts";
import { catalog } from "./src/bible/catalog.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const { VITE_AUDIO_BASE_URL = "", VITE_AUDIO_CHAPTERS_ENABLED = "" } = env;
  if (VITE_AUDIO_BASE_URL)
    audioUrl("/audio/days/check.m4a", VITE_AUDIO_BASE_URL);
  if (!["", "true", "false"].includes(VITE_AUDIO_CHAPTERS_ENABLED))
    throw new Error('VITE_AUDIO_CHAPTERS_ENABLED must be "true" or "false".');
  // The audio host can serve the daily files before the chapter recordings are
  // uploaded, so hosted chapters need their own explicit opt-in.
  const hostedChapters =
    VITE_AUDIO_BASE_URL !== "" && VITE_AUDIO_CHAPTERS_ENABLED === "true";
  const { days } = JSON.parse(
    readFileSync("data/audio/catalog.json", "utf8"),
  ) as { days: number[] };
  // A Git-only deployment remains a working text reader until its public
  // audio host is configured. Never advertise files absent from that build.
  const available = days.filter((day) => {
    if (VITE_AUDIO_BASE_URL) return true;
    const manifest = JSON.parse(
      readFileSync(`data/audio/manifests/${day}.json`, "utf8"),
    );
    return existsSync(resolve("public", "." + manifest.src));
  });
  const canonicalCatalog = "data/audio/chapter-catalog.json";
  const chapters: string[] = existsSync(canonicalCatalog)
    ? JSON.parse(readFileSync(canonicalCatalog, "utf8")).chapters
    : [];
  const availableChapters = chapters.filter((key) => {
    if (hostedChapters) return true;
    const [, book, chapter] = key.split(":");
    const manifest = JSON.parse(
      readFileSync(`data/audio/chapters/${book}/${chapter}.json`, "utf8"),
    );
    return existsSync(resolve("public", "." + manifest.src));
  });
  // Optional AI explanations: off unless VITE_AI_PROVIDERS is set. Values are
  // inlined as constants so a disabled build drops every AI module.
  const ai = aiBuildConfig(env);
  return {
    plugins: [react()],
    define: {
      __AUDIO_BASE_URL__: JSON.stringify(VITE_AUDIO_BASE_URL),
      __AUDIO_DAYS__: JSON.stringify(available),
      __AUDIO_CHAPTERS__: JSON.stringify(
        chapterAvailability(catalog, availableChapters),
      ),
      __AI_ENABLED__: JSON.stringify(ai !== null),
      __AI_DAILY_CAP__: JSON.stringify(ai?.dailyCap ?? 0),
      __AI_ATTEMPT_CAP__: JSON.stringify(ai?.attemptCap ?? 0),
      __AI_CONFIG__: JSON.stringify(ai),
    },
  };
});
