import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { Day } from "../plan/readings";
import { chapterVerse } from "../bible/reference";
import {
  clearListening,
  markListening,
  verseElement,
} from "../reader/scriptureDom";
import { dayLabel, readingLabel } from "../plan/labels";
import { cueAt } from "./manifest";
import { useAudioManifest } from "./useAudioManifest";
import "./audio.css";
import { audioUrl } from "./url";
import appIcon from "../assets/favicon.svg";

export default function AudioPlayer({
  reading,
  onClose,
}: {
  reading: Day;
  onClose: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const operation = useRef(0);
  const { manifest, error: loadError, retry } = useAudioManifest(reading);
  const [playError, setError] = useState("");
  const error = playError || loadError;
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const index = manifest ? cueAt(manifest.cues, time) : 0;
  const cue = manifest?.cues[index];
  const passage = cue ? reading.passages[cue.passage] : undefined;

  function pause() {
    operation.current += 1;
    audio.current?.pause();
    setPlaying(false);
    setWaiting(false);
  }

  async function play() {
    const element = audio.current;
    if (!element || !manifest || document.querySelector("dialog[open]")) return;
    const token = ++operation.current;
    setError("");
    setEnded(false);
    setWaiting(true);
    if (element.error) element.load();
    if (element.ended) element.currentTime = 0;
    try {
      await element.play();
      if (token !== operation.current) return;
      setWaiting(false);
    } catch (err) {
      if (token !== operation.current) return;
      setWaiting(false);
      setPlaying(false);
      // iOS may require a second, direct tap after the manifest loads.
      if ((err as Error).name !== "NotAllowedError")
        setError("تعذر تشغيل التسجيل. تحقق من الاتصال وحاول مرة أخرى.");
    }
  }

  function seek(next: number) {
    const element = audio.current;
    if (!element || !manifest) return;
    const target =
      manifest.cues[Math.max(0, Math.min(next, manifest.cues.length - 1))];
    element.currentTime = target.start;
    setTime(target.start);
    setEnded(false);
  }

  useEffect(() => {
    if (manifest) void play();
  }, [manifest]);

  useEffect(() => {
    const element = audio.current;
    return () => {
      operation.current += 1;
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
      if (highlighted.current) clearListening(highlighted.current);
    };
  }, []);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, manifest]);

  useEffect(() => {
    const checkDialogs = () => {
      if (document.querySelector("dialog[open]")) pause();
    };
    const observer = new MutationObserver(checkDialogs);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    checkDialogs();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (highlighted.current) clearListening(highlighted.current);
    const element = cue ? verseElement(cue.passage, cue.verse) : null;
    highlighted.current = element;
    if (!element) return;
    markListening(element);
    if (playing) {
      const rect = element.getBoundingClientRect();
      const top =
        (document.querySelector(".topbar")?.getBoundingClientRect().bottom ||
          60) + 16;
      const bottom =
        document.querySelector(".audio-player")?.getBoundingClientRect().top ||
        innerHeight;
      if (rect.top < top || rect.bottom > bottom - 24)
        window.scrollBy({ top: rect.top - top, behavior: "instant" });
    }
  }, [cue, playing]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      pause();
      setError("تأخر تحميل التسجيل. تحقق من الاتصال وحاول مرة أخرى.");
    }, 20000);
    return () => clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !manifest) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: readingLabel(reading.day),
      artist: "ترجمة فان دايك · Faith Comes By Hearing",
      album: "العهد الجديد بالترتيب الزمني",
      artwork: [{ src: appIcon, sizes: "any", type: "image/svg+xml" }],
    });
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        void play();
      },
      pause,
      previoustrack: () =>
        seek(cueAt(manifest.cues, audio.current?.currentTime || 0) - 1),
      nexttrack: () =>
        seek(cueAt(manifest.cues, audio.current?.currentTime || 0) + 1),
      seekto: (details) => {
        if (audio.current && details.seekTime !== undefined)
          audio.current.currentTime = Math.max(
            0,
            Math.min(details.seekTime, manifest.duration),
          );
      },
      stop: () => {
        pause();
        onClose();
      },
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
  }, [manifest]);

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

  return (
    <>
      <section className="audio-player" aria-label="مشغل القراءة الصوتية">
        <audio
          ref={audio}
          src={
            manifest ? audioUrl(manifest.src, __AUDIO_BASE_URL__) : undefined
          }
          preload="none"
          onPlaying={() => {
            setPlaying(true);
            setWaiting(false);
          }}
          onPause={() => {
            setPlaying(false);
            setWaiting(false);
          }}
          onWaiting={() => {
            if (!audio.current?.paused) setWaiting(true);
          }}
          onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
          onEnded={() => {
            setPlaying(false);
            setWaiting(false);
            setEnded(true);
          }}
          onError={() => {
            if (!audio.current?.getAttribute("src")) return;
            pause();
            setError("تعذر تشغيل التسجيل. تحقق من الاتصال وحاول مرة أخرى.");
          }}
        />
        <div className="audio-player-inner">
          <div className="audio-current">
            <span>{ended ? "انتهى التسجيل" : dayLabel(reading.day)}</span>
            {passage && cue && (
              <span className="audio-reference">
                {passage.book}{" "}
                <bdi dir="ltr">{chapterVerse(passage.chapter, cue.verse)}</bdi>
              </span>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="الآية السابقة"
            disabled={!manifest || index === 0}
            onClick={() => seek(index - 1)}
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button audio-play"
            aria-label={playing || waiting ? "إيقاف مؤقت" : "تشغيل التسجيل"}
            disabled={!manifest}
            onClick={() => (playing || waiting ? pause() : void play())}
          >
            {playing || waiting ? (
              <Pause size={21} aria-hidden="true" />
            ) : (
              <Play size={21} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="الآية التالية"
            disabled={!manifest || index === manifest.cues.length - 1}
            onClick={() => seek(index + 1)}
          >
            <SkipBack size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button audio-speed"
            aria-label={`سرعة القراءة: ${rate}×`}
            title="تغيير سرعة القراءة"
            dir="ltr"
            onClick={() => {
              const speeds = [0.75, 1, 1.25, 1.5];
              setRate(speeds[(speeds.indexOf(rate) + 1) % speeds.length]);
            }}
          >
            {rate}×
          </button>
        </div>
        {(error || !manifest || waiting) && (
          <div className="audio-status" role={error ? "alert" : "status"}>
            <span>{error || "جارٍ تحميل التسجيل…"}</span>
            {error && (
              <button
                className="text-button"
                onClick={() => {
                  if (manifest) void play();
                  else {
                    setError("");
                    retry();
                  }
                }}
              >
                حاول مرة أخرى
              </button>
            )}
            {error && (
              <button className="text-button" onClick={onClose}>
                إغلاق
              </button>
            )}
          </div>
        )}
        <progress
          className="audio-progress"
          value={time}
          max={manifest?.duration || 1}
          aria-label="تقدم التسجيل"
        />
      </section>
    </>
  );
}
