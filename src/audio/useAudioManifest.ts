import { useEffect, useState } from "react";
import type { ScriptureReading } from "../bible/types";
import { useResource } from "../lib/useResource";
import { audioManifests } from "./client";
import {
  audioReadingKey,
  matchesReading,
  type AudioManifest,
} from "./manifest";

const mismatch = (reading: ScriptureReading) =>
  `يحتاج التسجيل إلى تحديث ليتطابق مع ${"day" in reading ? "قراءة هذا اليوم" : "نص هذا الإصحاح"}.`;

/** Load a reading's manifest and accept it only if it matches the text on screen. */
export function useAudioManifest(reading: ScriptureReading) {
  const key = audioReadingKey(reading);
  const { data, error, retry } = useResource(audioManifests, key);
  const [checked, setChecked] = useState<{
    data: AudioManifest;
    key: string;
    error?: string;
  }>();
  useEffect(() => {
    if (!data) return;
    let active = true;
    matchesReading(data, reading).then(
      (matches) => {
        if (!active) return;
        if (!matches) audioManifests.invalidate(key);
        setChecked({
          data,
          key,
          error: matches ? undefined : mismatch(reading),
        });
      },
      (err: Error) => {
        if (active) setChecked({ data, key, error: err.message });
      },
    );
    return () => {
      active = false;
    };
  }, [data, reading, key]);
  const current =
    checked?.data === data && checked?.key === key ? checked : undefined;
  return {
    manifest: current && !current.error ? data : undefined,
    error: error || current?.error,
    retry,
  };
}
