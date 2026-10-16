import "./study.css";
import { lazy, Suspense } from "react";
import { ChunkBoundary, Loading, LoadError } from "../components/Feedback";
import type { Passage, Verse } from "../plan/readings";
import { studyCore } from "./client";
import GreekWords from "./GreekWords";
import AiSpark from "./AiSpark";
import OtherTranslation from "./OtherTranslation";
import Section from "./Section";
import { useResource } from "../lib/useResource";
import { verseId } from "../bible/verse";

// Optional AI explanations: without the build flag this branch, the lazy
// import and every AI module are left out of the bundle.
const AiPanel = __AI_ENABLED__ ? lazy(() => import("./AiPanel")) : null;

export default function StudyPanel({
  day,
  passageIndex,
  passage,
  verse,
}: {
  day: number;
  passageIndex: number;
  passage: Passage;
  verse: Verse;
}) {
  // The core file gives each section's contents and counts; sections start
  // collapsed; the translations section loads its own file when first opened.
  const core = useResource(studyCore, String(day));
  const usfm = core.data?.p[passageIndex] ?? "";
  const id = verseId(usfm, passage.chapter, verse.number);

  const entry = core.data?.verses[id];
  return (
    <div className="study">
      {core.error ? (
        <LoadError message={core.error} retry={core.retry} />
      ) : !core.data ? (
        <Loading label="جارٍ تحميل دراسة الآية…" />
      ) : !entry ? (
        <p className="study-empty">لا تتوفر دراسة لهذه الآية.</p>
      ) : (
        <div className="study-sections">
          <OtherTranslation day={day} id={id} />
          {AiPanel && (
            <Section
              key={id}
              title="اسأل الذكاء الاصطناعي"
              hint="شرح الآية وخلفيتها ومعاني كلماتها، أو سؤالك"
              icon={<AiSpark />}
            >
              <ChunkBoundary>
                <Suspense fallback={<Loading label="جارٍ التحميل…" />}>
                  <AiPanel
                    day={day}
                    id={id}
                    passage={passage}
                    verse={verse}
                    g={entry.g}
                  />
                </Suspense>
              </ChunkBoundary>
            </Section>
          )}
          <GreekWords text={verse.text} g={entry.g} />
        </div>
      )}
    </div>
  );
}
