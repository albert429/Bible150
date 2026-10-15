import type { ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import "./audio.css";

type AudioControlsProps = {
  /** The audio element, rendered inside the player section. */
  children: ReactNode;
  label: string;
  reference?: { book: string; location: string };
  announcement?: string;
  /** False until the manifest has loaded. */
  ready: boolean;
  cueIndex: number;
  cueCount: number;
  active: boolean;
  rate: number;
  time: number;
  duration: number;
  error: string;
  waiting: boolean;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onRate: () => void;
  onRetry: () => void;
  onClose: () => void;
};

export default function AudioControls({
  children,
  label,
  reference,
  announcement,
  ready,
  cueIndex,
  cueCount,
  active,
  rate,
  time,
  duration,
  error,
  waiting,
  onPrevious,
  onToggle,
  onNext,
  onRate,
  onRetry,
  onClose,
}: AudioControlsProps) {
  return (
    <section className="audio-player" aria-label="مشغل القراءة الصوتية">
      {children}
      <div className="audio-player-inner">
        <div className="audio-current">
          <span>{label}</span>
          {announcement ? (
            <span className="audio-reference">{announcement}</span>
          ) : (
            reference && (
              <span className="audio-reference">
                {reference.book} <bdi dir="ltr">{reference.location}</bdi>
              </span>
            )
          )}
        </div>
        {/* The skip icons are mirrored on purpose: the player reads right to left. */}
        <button
          className="icon-button"
          aria-label="الآية السابقة"
          disabled={!ready || cueCount === 0 || cueIndex <= 0}
          onClick={onPrevious}
        >
          <SkipForward size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button audio-play"
          aria-label={active ? "إيقاف مؤقت" : "تشغيل التسجيل"}
          disabled={!ready}
          onClick={onToggle}
        >
          {active ? (
            <Pause size={21} aria-hidden="true" />
          ) : (
            <Play size={21} aria-hidden="true" />
          )}
        </button>
        <button
          className="icon-button"
          aria-label="الآية التالية"
          disabled={!ready || cueCount === 0 || cueIndex === cueCount - 1}
          onClick={onNext}
        >
          <SkipBack size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button audio-speed"
          aria-label={`سرعة القراءة: ${rate}×`}
          title="تغيير سرعة القراءة"
          dir="ltr"
          onClick={onRate}
        >
          {rate}×
        </button>
      </div>
      {(error || !ready || waiting) && (
        <div className="audio-status" role={error ? "alert" : "status"}>
          <span>{error || "جارٍ تحميل التسجيل…"}</span>
          {error && (
            <button className="text-button" onClick={onRetry}>
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
        max={duration || 1}
        aria-label="تقدم التسجيل"
      />
    </section>
  );
}
