import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ar, dateFor, dateLabel } from "../lib/format";
import type { Reader } from "./progress";
import type { Day } from "./readings";
import { useReading } from "../useReading";
import { Loading, LoadError } from "../components/Feedback";

export default function Calendar({
  member,
  start,
  current,
  page,
  setPage,
  go,
}: {
  member: Reader | null;
  start: string;
  current: number;
  page: number;
  setPage: (page: number) => void;
  go: (day: number) => void;
}) {
  const { data: plan, error, retry } = useReading<Day[]>("plan");
  const count = member?.completed.length || 0;
  return (
    <section className="calendar-panel" aria-label="أيام خطة القراءة">
      <div className="calendar-summary">
        <div>
          <span className="eyebrow">خطوة، كل يوم</span>
          <p className="progress-number">
            {ar(count)}
            <span> / ١٥٠ يومًا</span>
          </p>
        </div>
        <p>
          {member
            ? `بدأت رحلتك في ${dateLabel(start)}`
            : "اختر يومًا لتصفح قراءته، وابدأ رحلتك لحفظ تقدمك."}
        </p>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="تقدم القراءة"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={150}
      >
        <i style={{ width: `${(count / 150) * 100}%` }} />
      </div>
      <div className="calendar-header">
        <h2>أيام الرحلة</h2>
        <div className="stepper">
          <button
            className="icon-button"
            aria-label="الأيام السابقة"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronRight size={20} />
          </button>
          <span aria-live="polite">
            {ar(page * 30 + 1)} – {ar((page + 1) * 30)}
          </span>
          <button
            className="icon-button"
            aria-label="الأيام التالية"
            disabled={page === 4}
            onClick={() => setPage(page + 1)}
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </div>
      {error ? (
        <LoadError message={error} retry={retry} />
      ) : !plan ? (
        <Loading label="جارٍ تحميل خطة القراءة…" />
      ) : (
        <div className="calendar-grid">
          {plan.slice(page * 30, page * 30 + 30).map((day) => {
            const complete = member?.completed.includes(day.day);
            const status = complete
              ? "مكتمل"
              : day.day === current
                ? "اليوم"
                : day.day < current
                  ? "للمتابعة"
                  : "قادم";
            return (
              <button
                key={day.day}
                onClick={() => go(day.day)}
                aria-current={day.day === current ? "date" : undefined}
                className={`calendar-day ${complete ? "completed" : ""} ${day.day === current ? "today" : day.day < current ? "missed" : ""}`}
              >
                <span className="calendar-day-top">
                  اليوم {ar(day.day)}
                  {complete && <Check size={18} />}
                </span>
                <strong>
                  {[...new Set(day.passages.map((p) => p.book))].join("، ")}
                </strong>
                <small>{dateLabel(dateFor(start, day.day))}</small>
                <span className="calendar-day-meta">
                  <span>{ar(day.verseCount)} آية</span>
                  <span>{status}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="calendar-footer">
        لكل شخص جدوله الخاص. يمكنك تعويض أي يوم أو القراءة مسبقًا.
        <span>توقيت القاهرة</span>
      </p>
    </section>
  );
}
