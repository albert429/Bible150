import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Day } from "../plan/readings";
import type { View } from "./Navigation";
import { dateLabel } from "../lib/format";
import { Loading, LoadError } from "../components/Feedback";
import PassageReference from "../components/PassageReference";

type Props = {
  selected: number;
  current: number;
  date: string;
  done: boolean;
  reading?: Day;
  readingError?: string;
  retryReading: () => void;
  go: (day: number) => void;
  navigate: (view: View) => void;
  close: (action?: () => void) => void;
  jump: (index: number) => void;
};
export default function DayPanel({
  selected,
  current,
  date,
  done,
  reading,
  readingError,
  retryReading,
  go,
  navigate,
  close,
  jump,
}: Props) {
  const currentDay = Math.max(1, Math.min(150, current));
  return (
    <>
      <div className="day-sheet-meta">
        <p>{dateLabel(date)}</p>
        <span className={`tag ${done ? "complete" : ""}`}>
          {done
            ? "مكتمل"
            : selected === currentDay
              ? "قراءة اليوم"
              : selected > currentDay
                ? "قراءة مسبقة"
                : "للمتابعة"}
        </span>
      </div>
      {readingError ? (
        <LoadError message={readingError} retry={retryReading} />
      ) : !reading ? (
        <Loading />
      ) : (
        <ol className="passage-list" aria-label="مقاطع القراءة">
          {reading.passages.map((passage, index) => (
            <li key={index}>
              <a
                href={`#passage-${index}`}
                onClick={(event) => {
                  event.preventDefault();
                  jump(index);
                }}
              >
                <span>
                  {passage.book} <PassageReference passage={passage} />
                </span>
                <ChevronLeft size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      )}
      <div className="day-sheet-navigation" aria-label="التنقل بين الأيام">
        <button
          className="quiet-button"
          disabled={selected === 1}
          onClick={() => close(() => go(selected - 1))}
        >
          <ChevronRight size={18} aria-hidden="true" />
          اليوم السابق
        </button>
        <button
          className="quiet-button"
          disabled={selected === 150}
          onClick={() => close(() => go(selected + 1))}
        >
          اليوم التالي
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="sheet-actions">
        {selected !== currentDay && (
          <button
            className="primary"
            onClick={() => close(() => go(currentDay))}
          >
            <BookOpen size={18} aria-hidden="true" />
            قراءة اليوم
          </button>
        )}
        <button
          className="quiet-button"
          onClick={() => close(() => navigate("calendar"))}
        >
          <CalendarDays size={18} aria-hidden="true" />
          خطة الـ١٥٠ يومًا
        </button>
      </div>
    </>
  );
}
