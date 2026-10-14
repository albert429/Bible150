import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ChunkBoundary, Loading } from "../components/Feedback";
import { scheduledDay } from "./schedule";
import type { Reader } from "./progress";
const Calendar = lazy(() => import("./Calendar"));

type Props = {
  member: Reader | null;
  start: string;
  currentDate: string;
  current: number;
  page: number;
  setPage: (page: number) => void;
  go: (day: number) => void;
  join: () => void;
};
export default function PlanView({
  member,
  start,
  currentDate,
  current,
  page,
  setPage,
  go,
  join,
}: Props) {
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">١٥٠ يومًا · بالترتيب الزمني</span>
          <h1>رحلتك، يومًا بيوم</h1>
          <p>تابع الأيام المكتملة، وعُد إلى أي قراءة.</p>
        </div>
        {!member ? (
          <button className="primary" onClick={join}>
            ابدأ رحلتك
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button
            className="quiet-button"
            onClick={() => go(scheduledDay(start, currentDate))}
          >
            قراءة اليوم
            <ArrowLeft size={18} />
          </button>
        )}
      </section>
      <ChunkBoundary>
        <Suspense fallback={<Loading label="جارٍ فتح خطة القراءة…" />}>
          <Calendar
            member={member}
            start={start}
            current={current}
            page={page}
            setPage={setPage}
            go={go}
          />
        </Suspense>
      </ChunkBoundary>
    </>
  );
}
