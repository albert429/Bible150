import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { audioUrl } from "./url";
import type { AudioManifest } from "./manifest";
import {
  initialMediaState,
  isPlaying,
  isWaiting,
  mediaReducer,
} from "./mediaStatus.ts";

const PLAY_ERROR = "تعذر تشغيل التسجيل. تحقق من الاتصال وحاول مرة أخرى.";
const STALL_ERROR = "تأخر تحميل التسجيل. تحقق من الاتصال وحاول مرة أخرى.";
const STALL_TIMEOUT = 20000;
/** Seconds of playback between saved resume positions while playing. */
const POSITION_INTERVAL = 5;

/** Own the <audio> element: playback state, errors, seeking and teardown. */
export function useMediaElement(
  manifest: AudioManifest | undefined,
  options: {
    initialTime?: number | ((source: string) => number);
    onEnded?: () => void;
    onPosition?: (seconds: number, source: string) => void;
  } = {},
) {
  const audio = useRef<HTMLAudioElement>(null);
  const token = useRef(0);
  // One natural end per playthrough: replaying or seeking re-arms it.
  const endedOnce = useRef(false);
  const source = useRef<string | undefined>(undefined);
  const lastReported = useRef(-1);
  // Until the saved position is applied, the element's 0 must not be reported.
  const restored = useRef(false);
  const callbacks = useRef(options);
  useLayoutEffect(() => {
    callbacks.current = options;
  });
  const report = useCallback((element = audio.current) => {
    if (!element || !source.current || !restored.current) return;
    lastReported.current = element.currentTime;
    callbacks.current.onPosition?.(element.currentTime, source.current);
  }, []);
  const restorePosition = () => {
    const element = audio.current;
    if (!element || !manifest || restored.current) return;
    restored.current = true;
    const { initialTime } = callbacks.current;
    const seconds = Math.max(
      0,
      Math.min(
        (typeof initialTime === "function"
          ? initialTime(manifest.src)
          : initialTime) || 0,
        Math.max(0, manifest.duration - 0.1),
      ),
    );
    if (seconds) {
      element.currentTime = seconds;
      setTime(seconds);
    }
  };
  const [{ status, error }, dispatch] = useReducer(
    mediaReducer,
    initialMediaState,
  );
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const playing = isPlaying(status);
  const waiting = isWaiting(status);

  const halt = useCallback(
    (message?: string) => {
      token.current += 1;
      audio.current?.pause();
      report();
      dispatch({ type: "paused", message });
    },
    [report],
  );
  const pause = useCallback(() => halt(), [halt]);

  const play = useCallback(async () => {
    const element = audio.current;
    if (!element || !manifest || document.querySelector("dialog[open]")) return;
    const current = ++token.current;
    dispatch({ type: "request" });
    if (element.error) element.load();
    if (element.ended) {
      endedOnce.current = false;
      element.currentTime = 0;
    }
    try {
      await element.play();
      if (current !== token.current) return;
      dispatch({ type: "started" });
    } catch (err) {
      if (current !== token.current) return;
      // iOS may require a second, direct tap after the manifest loads.
      dispatch({
        type: "paused",
        message:
          (err as Error).name !== "NotAllowedError" ? PLAY_ERROR : undefined,
      });
    }
  }, [manifest]);

  const seek = useCallback(
    (next: number) => {
      const element = audio.current;
      if (!element || !manifest || !manifest.cues.length) return;
      const target =
        manifest.cues[Math.max(0, Math.min(next, manifest.cues.length - 1))];
      endedOnce.current = false;
      // A chosen verse wins over a saved position that has not loaded yet.
      restored.current = true;
      element.currentTime = target.start;
      setTime(target.start);
      dispatch({ type: "seeked" });
    },
    [manifest],
  );

  const clearError = useCallback(() => dispatch({ type: "clearError" }), []);

  // Clear a previous source synchronously while the next identity is loading.
  useLayoutEffect(() => {
    token.current += 1;
    endedOnce.current = false;
    restored.current = false;
    lastReported.current = -1;
    setTime(0);
    source.current = manifest?.src;
    dispatch({ type: "paused" });
    const element = audio.current;
    element?.pause();
    if (!manifest) {
      element?.removeAttribute("src");
      element?.load();
    }
  }, [manifest]);

  useEffect(() => {
    if (manifest) void play();
  }, [manifest, play]);

  useEffect(() => {
    const element = audio.current;
    // A phone may discard a hidden page without another event.
    const hidden = () => {
      if (document.visibilityState === "hidden") report(element);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      // The ref is already detached here; the element keeps its position.
      report(element);
      token.current += 1;
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, [report]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, manifest]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => halt(STALL_ERROR), STALL_TIMEOUT);
    return () => clearTimeout(timer);
  }, [waiting, halt]);

  const audioProps = {
    ref: audio,
    src: manifest ? audioUrl(manifest.src, __AUDIO_BASE_URL__) : undefined,
    preload: "none" as const,
    onLoadedMetadata: () => restorePosition(),
    onSeeking: () => {
      if (audio.current && !audio.current.ended) endedOnce.current = false;
    },
    onPlaying: () => dispatch({ type: "playing" }),
    onPause: () => {
      report();
      dispatch({ type: "paused" });
    },
    onWaiting: () => {
      if (!audio.current?.paused) dispatch({ type: "waiting" });
    },
    onTimeUpdate: () => {
      const seconds = audio.current?.currentTime || 0;
      setTime(seconds);
      if (Math.abs(seconds - lastReported.current) >= POSITION_INTERVAL)
        report();
    },
    onEnded: () => {
      dispatch({ type: "ended" });
      report();
      if (!endedOnce.current) {
        endedOnce.current = true;
        callbacks.current.onEnded?.();
      }
    },
    onError: () => {
      if (!audio.current?.getAttribute("src")) return;
      halt(PLAY_ERROR);
    },
  };

  return {
    audio,
    audioProps,
    playing,
    waiting,
    ended: status === "ended",
    error,
    time,
    rate,
    setRate,
    play,
    pause,
    seek,
    clearError,
  };
}
