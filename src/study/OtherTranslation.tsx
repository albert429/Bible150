import { BookOpen } from "lucide-react";
import { Loading, LoadError } from "../components/Feedback";
import { studyTr } from "./client";
import type { VerseText } from "./types";
import { useResource } from "../lib/useResource";
import Section from "./Section";

const textOf = (value: VerseText) =>
  typeof value === "string" ? value : value.t;

function Translations({ day, id }: { day: number; id: string }) {
  const tr = useResource(studyTr, String(day));
  if (tr.error) return <LoadError message={tr.error} retry={tr.retry} />;
  if (!tr.data) return <Loading label="جارٍ تحميل الترجمات…" />;
  const { n, e } = tr.data.verses[id] ?? {};
  if (!n && !e)
    return <p className="study-empty">لا تتوفر ترجمات أخرى لهذه الآية.</p>;
  return (
    <>
      {n && (
        <div className="study-translation">
          <p className="study-tag">
            كتاب الحياة
            {typeof n === "object" && (
              <>
                {" "}
                (الآيات <bdi dir="ltr">{n.b}</bdi>)
              </>
            )}
          </p>
          <p className="study-translation-text">{textOf(n)}</p>
        </div>
      )}
      {e && (
        <div className="study-translation">
          <p className="study-tag">الإنجليزية (KJV)</p>
          <p className="study-english" lang="en" dir="ltr">
            {textOf(e)}
          </p>
        </div>
      )}
    </>
  );
}

export default function OtherTranslation({
  day,
  id,
}: {
  day: number;
  id: string;
}) {
  return (
    <Section
      title="ترجمات أخرى"
      hint="كتاب الحياة والإنجليزية (KJV)"
      icon={<BookOpen size={18} />}
    >
      <Translations day={day} id={id} />
    </Section>
  );
}
