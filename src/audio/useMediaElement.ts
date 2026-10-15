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
  const endedOnce = useRef(false);
  const source = useRef<string | undefined>(undefined);
  const lastReported = useRef(-1);
  const restored = useRef(false);
  const callbacks = useRef(options);
  useLayoutEffect(() => {
    callbacks.current = options;
  });
  const restorePosition = () => {
    const element = audio.current;
    if (!element || !manifest || restored.current) return;
    restored.current = true;
    const seconds = Math.max(
      0,
      Math.min(
        (typeof options.initialTime === "function"
          ? options.initialTime(manifest.src)
          : options.initialTime) || 0,
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

  const halt = useCallback((message?: string) => {
    token.current += 1;
    audio.current?.pause();
    if (audio.current)
      if (source.current)
        callbacks.current.onPosition?.(
          audio.current.currentTime,
          source.current,
        );
    dispatch({ type: "paused", message });
  }, []);
  const pause = useCallback(() => halt(), [halt]);

  const play = useCallback(async () => {
    const element = audio.current;
    if (!element || !manifest || document.querySelector("dialog[open]")) return;
    const current = ++token.current;
    dispatch({ type: "request" });
    if (element.error) element.load();
    if (element.ended) element.currentTime = 0;
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
    return () => {
      token.current += 1;
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, []);

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
    onPlaying: () => dispatch({ type: "playing" }),
    onPause: () => dispatch({ type: "paused" }),
    onWaiting: () => {
      if (!audio.current?.paused) dispatch({ type: "waiting" });
    },
    onTimeUpdate: () => {
      const seconds = audio.current?.currentTime || 0;
      setTime(seconds);
      if (Math.floor(seconds) !== lastReported.current) {
        lastReported.current = Math.floor(seconds);
        if (source.current)
          callbacks.current.onPosition?.(seconds, source.current);
      }
    },
    onEnded: () => {
      dispatch({ type: "ended" });
      if (audio.current)
        if (source.current)
          callbacks.current.onPosition?.(
            audio.current.currentTime,
            source.current,
          );
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
