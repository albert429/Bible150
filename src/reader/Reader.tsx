import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { chapterHasAudio } from "../audio/availability";
import { catalog } from "../bible/catalog";
import { adjacentChapter, findBibleBook } from "../bible/navigation";
import {
  isBibleChapter,
  readingKey,
  type BibleLocation,
  type ReadingLocation,
  type ScriptureReading,
} from "../bible/types";
import { ar } from "../lib/format";
import { readingLabel } from "../plan/labels";
import { Loading, LoadError, ChunkBoundary } from "../components/Feedback";
import VerseStudy from "../study/VerseStudy";
import CompletionBar from "./CompletionBar";
import Scripture from "./Scripture";
import { useAdjacentPrefetch, useChapterPrefetch } from "./useAdjacentPrefetch";
import { useVerseTap } from "./useVerseTap";
import { verseElement, verseNumberButton } from "./scriptureDom";
import { playbackPosition, savePlaybackPosition } from "./location";
import "./Reader.css";
const AudioPlayer = lazy(() => import("../audio/AudioPlayer"));

type Props = {
  location: ReadingLocation;
  navigation: number;
  reading?: ScriptureReading;
  error?: string;
  retry: () => void;
  done: boolean;
  complete: () => void;
  continuous: boolean;
  onChapterEnd: (location: BibleLocation) => void;
};
type Listening = {
  continuing?: boolean;
  identity: string;
  navigation: number;
  reading: ScriptureReading;
};
export default function Reader({
  location,
  navigation,
  reading,
  error,
  retry,
  done,
  complete,
  continuous,
  onChapterEnd,
}: Props) {
  const identity = readingKey(location);
  const plan = location.mode === "plan";
  useAdjacentPrefetch(
    plan ? location.day : 0,
    reading && !isBibleChapter(reading) ? reading : undefined,
    error,
    plan,
  );
  useChapterPrefetch(location, reading, error);
  const [listening, setListening] = useState<Listening | null>(null);
  const playerSource = useRef<string | null>(null);
  const listenButton = useRef<HTMLButtonElement>(null);
  const toggleListen = useCallback(() => {
    setListening((active) =>
      active || !reading ? null : { identity, navigation, reading },
    );
  }, [reading, identity, navigation]);
  const tap = useVerseTap(reading);
  const [seenNavigation, setSeenNavigation] = useState(navigation);
  const [seenIdentity, setSeenIdentity] = useState(identity);
  // Reset against requested navigation, even while the new text is still cold.
  // Only native ended creates a listening intent for the next navigation.
  if (seenNavigation !== navigation || seenIdentity !== identity) {
    setSeenNavigation(navigation);
    setSeenIdentity(identity);
    if (listening?.navigation !== navigation || listening.identity !== identity)
      setListening(null);
    tap.reset();
  }
  useLayoutEffect(() => {
    if (!location.verse) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (!reading) return;
    const target = verseElement(0, location.verse);
    if (!target) return;
    verseNumberButton(target)?.focus({ preventScroll: true });
    // Below the sticky toolbar, which grows with large text and zoom.
    const toolbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const top =
      target.getBoundingClientRect().top +
      window.scrollY -
      (toolbar?.bottom ?? 0) -
      16;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, [reading, location.verse, navigation]);
  const audio = plan
    ? __AUDIO_DAYS__.includes(location.day)
    : chapterHasAudio(catalog, __AUDIO_CHAPTERS__, location);
  const playerReading = listening && (reading || listening.reading);
  function ended() {
    if (playerSource.current) savePlaybackPosition(playerSource.current, 0);
    if (!continuous || location.mode !== "bible" || !playerReading) return;
    const next = adjacentChapter(catalog, location, 1);
    if (!next) return;
    setListening({
      continuing: true,
      identity: readingKey(next),
      navigation: navigation + 1,
      reading: playerReading,
    });
    onChapterEnd(next);
  }
  const label = plan
    ? readingLabel(location.day)
    : `${findBibleBook(catalog, location.book)!.name} ${ar(location.chapter)}`;
  return (
    <div className="reading-layout">
      <article
        className="reader"
        aria-label={label}
        data-day={plan ? location.day : undefined}
        data-reading={identity}
        aria-busy={!reading && !error}
        onPointerDown={tap.onPointerDown}
        onClick={tap.onClick}
      >
        {error ? (
          <LoadError message={error} retry={retry} />
        ) : reading ? (
          <Scripture
            reading={reading}
            audio={audio}
            listening={!!listening}
            onToggleListen={toggleListen}
            listenButton={listenButton}
          />
        ) : (
          <Loading />
        )}
      </article>
      {listening && playerReading && (
        <div className="audio-launch">
          <ChunkBoundary>
            <Suspense fallback={<Loading label="جارٍ فتح المشغل…" />}>
              <AudioPlayer
                reading={playerReading}
                initialTime={(source) =>
                  listening.continuing ? 0 : playbackPosition(source)
                }
                onPosition={(seconds, source) => {
                  playerSource.current = source;
                  savePlaybackPosition(source, seconds);
                }}
                onEnded={ended}
                onClose={() => {
                  const trigger = listenButton.current;
                  setListening(null);
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
      {plan && (
        <CompletionBar done={done} disabled={!reading} onComplete={complete} />
      )}
    </div>
  );
}
