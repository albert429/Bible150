import type { Day } from "../plan/readings";
import { chapterVerse } from "../bible/reference";
import { dayLabel } from "../plan/labels";
import AudioControls from "./AudioControls";
import { cueAt } from "./manifest";
import { nextRate } from "./speed.ts";
import { useAudioManifest } from "./useAudioManifest";
import { useMediaElement } from "./useMediaElement";
import { useMediaSession } from "./useMediaSession";
import { usePauseOnDialog } from "./usePauseOnDialog";
import { useVerseHighlight } from "./useVerseHighlight";

export default function AudioPlayer({
  reading,
  onClose,
}: {
  reading: Day;
  onClose: () => void;
}) {
  const { manifest, error: loadError, retry } = useAudioManifest(reading);
  const media = useMediaElement(manifest);
  const { playing, waiting, time, rate, play, pause, seek } = media;
  const index = manifest ? cueAt(manifest.cues, time) : 0;
  const cue = manifest?.cues[index];
  const passage = cue ? reading.passages[cue.passage] : undefined;

  usePauseOnDialog(pause);
  useVerseHighlight(cue, playing);
  useMediaSession({
    manifest,
    day: reading.day,
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
      label={media.ended ? "انتهى التسجيل" : dayLabel(reading.day)}
      reference={
        passage &&
        cue && {
          book: passage.book,
          location: chapterVerse(passage.chapter, cue.verse),
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
      onPrevious={() => seek(index - 1)}
      onToggle={() => (playing || waiting ? pause() : void play())}
      onNext={() => seek(index + 1)}
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
