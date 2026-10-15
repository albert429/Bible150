import type { ScriptureReading } from "../bible/types";
import { chapterVerse } from "../bible/reference";
import { dayLabel } from "../plan/labels";
import { ar } from "../lib/format";
import AudioControls from "./AudioControls";
import { activeCueIndex, announcementAt, stepCueIndex } from "./manifest";
import { nextRate } from "./speed.ts";
import { useAudioManifest } from "./useAudioManifest";
import { useMediaElement } from "./useMediaElement";
import { useMediaSession } from "./useMediaSession";
import { usePauseOnDialog } from "./usePauseOnDialog";
import { useVerseHighlight } from "./useVerseHighlight";

export default function AudioPlayer({
  reading,
  onClose,
  onEnded,
  initialTime = 0,
  onPosition,
}: {
  reading: ScriptureReading;
  onClose: () => void;
  /** Only the parent may opt into an ended handoff; manual navigation unmounts. */
  onEnded?: () => void;
  initialTime?: number;
  onPosition?: (seconds: number) => void;
}) {
  const { manifest, error: loadError, retry } = useAudioManifest(reading);
  const media = useMediaElement(manifest, { initialTime, onEnded, onPosition });
  const { playing, waiting, time, rate, play, pause, seek } = media;
  const index = manifest ? activeCueIndex(manifest, time) : -1;
  const cue = manifest?.cues[index];
  const announcement = manifest && announcementAt(manifest, time);
  const passage = reading.passages[announcement?.passage ?? cue?.passage ?? 0];
  const label =
    "day" in reading
      ? dayLabel(reading.day)
      : `${reading.book} ${ar(reading.chapter)}`;

  usePauseOnDialog(pause);
  useVerseHighlight(cue, playing);
  useMediaSession({
    manifest,
    title: label,
    audio: media.audio,
    playing,
    time,
    rate,
    play,
    pause,
    seek,
    onClose,
  });

  return (
    <AudioControls
      label={media.ended ? "انتهى التسجيل" : label}
      announcement={announcement?.reference}
      reference={
        passage && {
          book: passage.book,
          location: cue
            ? chapterVerse(passage.chapter, cue.verse)
            : ar(passage.chapter),
        }
      }
      ready={!!manifest}
      cueIndex={index}
      cueCount={manifest?.cues.length ?? 0}
      active={playing || waiting}
      rate={rate}
      time={time}
      duration={manifest?.duration ?? 0}
      error={media.error || loadError || ""}
      waiting={waiting}
      onPrevious={() => manifest && seek(stepCueIndex(manifest, time, -1))}
      onToggle={() => (playing || waiting ? pause() : void play())}
      onNext={() => manifest && seek(stepCueIndex(manifest, time, 1))}
      onRate={() => media.setRate(nextRate(rate))}
      onRetry={() => {
        if (manifest) void play();
        else {
          media.clearError();
          retry();
        }
      }}
      onClose={onClose}
    >
      <audio {...media.audioProps} />
    </AudioControls>
  );
}
