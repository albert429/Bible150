import { useEffect, useState } from "react";
import type { Day } from "../plan/readings";
import { useResource } from "../lib/useResource";
import { audioManifests } from "./client";
import { matchesReading, type AudioManifest } from "./manifest";

const mismatch = "يحتاج التسجيل إلى تحديث ليتطابق مع قراءة هذا اليوم.";

/** Load a day's manifest and accept it only if it matches the reading on screen. */
export function useAudioManifest(reading: Day) {
  const key = String(reading.day);
  const { data, error, retry } = useResource(audioManifests, key);
  const [checked, setChecked] = useState<{
    data: AudioManifest;
    error?: string;
  }>();
  useEffect(() => {
    if (!data) return;
    let active = true;
    matchesReading(data, reading).then(
      (matches) => {
        if (!active) return;
        if (!matches) audioManifests.invalidate(key);
        setChecked({ data, error: matches ? undefined : mismatch });
      },
      (err: Error) => {
        if (active) setChecked({ data, error: err.message });
      },
    );
    return () => {
      active = false;
    };
  }, [data, reading, key]);
  const current = checked?.data === data ? checked : undefined;
  return {
    manifest: current && !current.error ? data : undefined,
    error: error || current?.error,
    retry,
  };
}
