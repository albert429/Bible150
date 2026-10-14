import { useCallback, useRef, useState, lazy, Suspense } from "react";
import type { Day } from "../plan/readings";
import { readingLabel } from "../plan/labels";
import { Loading, LoadError, ChunkBoundary } from "../components/Feedback";
import VerseStudy from "../study/VerseStudy";
import CompletionBar from "./CompletionBar";
import Scripture from "./Scripture";
import { useAdjacentPrefetch } from "./useAdjacentPrefetch";
import { useVerseTap } from "./useVerseTap";
import "./Reader.css";
const AudioPlayer = lazy(() => import("../audio/AudioPlayer"));

type Props = {
  selected: number;
  reading?: Day;
  error?: string;
  retry: () => void;
  done: boolean;
  complete: () => void;
};

export default function Reader({
  selected,
  reading,
  error,
  retry,
  done,
  complete,
}: Props) {
  useAdjacentPrefetch(selected, reading, error, true);
  const [listening, setListening] = useState(false);
  const listenButton = useRef<HTMLButtonElement>(null);
  const toggleListen = useCallback(() => setListening((on) => !on), []);
  const tap = useVerseTap(reading);

  // The sheet and player belong to one day's verse elements. Resetting during
  // render means no render pairs a new day with the previous day's state.
  const day = reading?.day;
  const [seenDay, setSeenDay] = useState(day);
  if (seenDay !== day) {
    setSeenDay(day);
    setListening(false);
    tap.reset();
  }

  return (
    <div className="reading-layout">
      <article
        className="reader"
        aria-label={readingLabel(selected)}
        data-day={selected}
        aria-busy={!reading && !error}
        onPointerDown={tap.onPointerDown}
        onClick={tap.onClick}
      >
        {error ? (
          <LoadError message={error} retry={retry} />
        ) : reading ? (
          <Scripture
            reading={reading}
            audio={__AUDIO_DAYS__.includes(selected)}
            listening={listening}
            onToggleListen={toggleListen}
            listenButton={listenButton}
          />
        ) : (
          <Loading />
        )}
      </article>
      {listening && reading && (
        <div className="audio-launch">
          <ChunkBoundary>
            <Suspense fallback={<Loading label="جارٍ فتح المشغل…" />}>
              <AudioPlayer
                reading={reading}
                onClose={() => {
                  const trigger = listenButton.current;
                  setListening(false);
                  requestAnimationFrame(() => {
                    if (trigger?.isConnected)
                      trigger.focus({ preventScroll: true });
                  });
                }}
              />
            </Suspense>
          </ChunkBoundary>
        </div>
      )}
      {tap.target && reading && (
        <VerseStudy
          open={tap.open}
          reading={reading}
          target={tap.target}
          onClose={tap.close}
          onAfterClose={tap.afterClose}
        />
      )}
      <CompletionBar done={done} disabled={!reading} onComplete={complete} />
    </div>
  );
}
