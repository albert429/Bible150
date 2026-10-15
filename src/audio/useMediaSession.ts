import { useEffect, useEffectEvent, type RefObject } from "react";
import { stepCueIndex, type AudioManifest } from "./manifest";
import appIcon from "../assets/favicon.svg";

type MediaSessionOptions = {
  manifest: AudioManifest | undefined;
  title: string;
  audio: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  time: number;
  rate: number;
  play: () => Promise<void>;
  pause: () => void;
  seek: (index: number) => void;
  onClose: () => void;
};

/** Lock-screen metadata, transport controls and position for the audio. */
export function useMediaSession({
  manifest,
  title,
  audio,
  playing,
  time,
  rate,
  play,
  pause,
  seek,
  onClose,
}: MediaSessionOptions) {
  const stepCue = useEffectEvent((manifest: AudioManifest, step: number) =>
    seek(stepCueIndex(manifest, audio.current?.currentTime || 0, step)),
  );
  const seekTo = useEffectEvent((manifest: AudioManifest, seconds: number) => {
    if (audio.current)
      audio.current.currentTime = Math.max(
        0,
        Math.min(seconds, manifest.duration),
      );
  });
  const resume = useEffectEvent(() => void play());
  const stop = useEffectEvent(() => {
    pause();
    onClose();
  });
  const halt = useEffectEvent(pause);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !manifest) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title,
      artist: "ترجمة فان دايك · Faith Comes By Hearing",
      album: "الكتاب المقدس · ترجمة فان دايك",
      artwork: [{ src: appIcon, sizes: "any", type: "image/svg+xml" }],
    });
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => resume(),
      pause: () => halt(),
      previoustrack: () => stepCue(manifest, -1),
      nexttrack: () => stepCue(manifest, 1),
      seekto: (details) => {
        if (details.seekTime !== undefined) seekTo(manifest, details.seekTime);
      },
      stop: () => stop(),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        /* Browser support varies. */
      }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          session.setActionHandler(action as MediaSessionAction, null);
        } catch {
          /* Unsupported action. */
        }
      }
      session.metadata = null;
      session.playbackState = "none";
    };
  }, [manifest, title]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !manifest) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    try {
      navigator.mediaSession.setPositionState({
        duration: manifest.duration,
        playbackRate: rate,
        position: Math.min(time, manifest.duration),
      });
    } catch {
      /* Older browsers omit position-state support. */
    }
  }, [playing, time, rate, manifest]);
}
