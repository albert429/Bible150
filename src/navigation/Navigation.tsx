import { lazy, Suspense, useRef, useState, type RefObject } from "react";
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Share2,
} from "lucide-react";
import { catalog } from "../bible/catalog";
import { adjacentChapter, findBibleBook } from "../bible/navigation";
import type { BibleLocation, ReadingLocation } from "../bible/types";
import { ar } from "../lib/format";
import BiblePanel from "./BiblePanel";
import type { Day } from "../plan/readings";
import { shareApp } from "./share";
import { PLAN_DAYS } from "../plan/schedule";
import { dayLabel, readingLabel } from "../plan/labels";
import { ChunkBoundary, Loading } from "../components/Feedback";
import Sheet from "../components/Sheet";
import { passageElement } from "../reader/scriptureDom";
import MenuPanel from "./MenuPanel";
import DayPanel from "./DayPanel";
import AppearancePanel from "./AppearancePanel";
import logo from "../assets/favicon.svg";
import "./Navigation.css";
const About = lazy(() => import("./About"));

export type View = "read" | "calendar";
type Panel = "menu" | "day" | "appearance" | "about" | "bible";
type Props = {
  location: ReadingLocation;
  chooseMode: (mode: "plan" | "bible") => void;
  goChapter: (location: BibleLocation) => void;
  continuous: boolean;
  setContinuous: (enabled: boolean) => void;
  view: View;
  navigate: (view: View) => void;
  menuToggle: RefObject<HTMLButtonElement | null>;
  settings: () => void;
  invite: (text: string) => void;
  selected: number;
  reading?: Day;
  readingError?: string;
  retryReading: () => void;
  go: (day: number) => void;
};
export default function Navigation({
  location,
  chooseMode,
  goChapter,
  continuous,
  setContinuous,
  view,
  navigate,
  menuToggle,
  settings,
  invite,
  selected,
  reading,
  readingError,
  retryReading,
  go,
}: Props) {
  const bible = location.mode === "bible" ? location : undefined;
  const previous = bible && adjacentChapter(catalog, bible, -1);
  const next = bible && adjacentChapter(catalog, bible, 1);
  const chapterLabel = bible
    ? `${findBibleBook(catalog, bible.book)!.name} ${ar(bible.chapter)}`
    : "";
  const [panel, setPanel] = useState<Panel>("menu");
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const [sheetTrigger, setSheetTrigger] = useState<HTMLElement | null>(null);
  function show(next: Panel, trigger: HTMLElement) {
    afterClose.current = null;
    setSheetTrigger(trigger);
    setPanel(next);
    setOpen(true);
  }
  function close(action?: () => void) {
    if (!open) return;
    afterClose.current = action || null;
    setOpen(false);
  }
  async function share() {
    if (sharing) return;
    setSharing(true);
    let fallback;
    try {
      fallback = await shareApp();
    } finally {
      setSharing(false);
    }
    if (fallback) close(() => invite(fallback));
  }
  function jump(index: number) {
    close(() => {
      const target = passageElement(index);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  return (
    <>
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            ref={menuToggle}
            className="icon-button menu-toggle"
            aria-label="فتح القائمة"
            aria-haspopup="dialog"
            aria-expanded={open && panel === "menu"}
            onClick={(event) => show("menu", event.currentTarget)}
          >
            <img src={logo} width="28" height="28" alt="" />
            <Menu size={16} aria-hidden="true" />
          </button>
          {view === "read" ? (
            <>
              <button
                className="icon-button previous-day"
                disabled={bible ? !previous : selected === 1}
                onClick={() =>
                  bible ? previous && goChapter(previous) : go(selected - 1)
                }
                aria-label={bible ? "الإصحاح السابق" : "اليوم السابق"}
              >
                <ChevronRight size={20} />
              </button>
              <h1 className="toolbar-day">
                <button
                  className="day-trigger"
                  aria-label={
                    bible
                      ? `اختيار السفر والإصحاح: ${chapterLabel}`
                      : `تفاصيل ${dayLabel(selected)}`
                  }
                  aria-haspopup="dialog"
                  aria-expanded={open && panel === (bible ? "bible" : "day")}
                  onClick={(event) =>
                    show(bible ? "bible" : "day", event.currentTarget)
                  }
                >
                  <span>{bible ? chapterLabel : dayLabel(selected)}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </h1>
              <button
                className="icon-button next-day"
                disabled={bible ? !next : selected === PLAN_DAYS}
                onClick={() =>
                  bible ? next && goChapter(next) : go(selected + 1)
                }
                aria-label={bible ? "الإصحاح التالي" : "اليوم التالي"}
              >
                <ChevronLeft size={20} />
              </button>
            </>
          ) : (
            <div className="toolbar-title">خطة القراءة</div>
          )}
          <button
            className="icon-button appearance-toggle"
            aria-label="إعدادات القراءة"
            aria-haspopup="dialog"
            aria-expanded={open && panel === "appearance"}
            onClick={(event) => show("appearance", event.currentTarget)}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <Sheet
        open={open}
        returnFocusTo={sheetTrigger}
        title={
          panel === "menu"
            ? "القائمة"
            : panel === "bible"
              ? "الكتاب المقدس"
              : panel === "day"
                ? readingLabel(selected)
                : panel === "about"
                  ? "About the app"
                  : "إعدادات القراءة"
        }
        headerActions={
          panel === "menu" ? (
            <button
              type="button"
              className="icon-button"
              aria-label="مشاركة التطبيق"
              disabled={sharing}
              onClick={share}
            >
              <Share2 size={20} aria-hidden="true" />
            </button>
          ) : undefined
        }
        onClose={() => close()}
        onAfterClose={() => {
          const action = afterClose.current;
          afterClose.current = null;
          action?.();
        }}
      >
        {panel === "menu" ? (
          <MenuPanel
            mode={location.mode}
            chooseMode={chooseMode}
            view={view}
            navigate={navigate}
            settings={settings}
            close={close}
            about={() => {
              const trigger = sheetTrigger;
              close(() => {
                if (trigger) show("about", trigger);
              });
            }}
          />
        ) : panel === "bible" && bible ? (
          <BiblePanel location={bible} go={goChapter} close={close} />
        ) : panel === "day" ? (
          <DayPanel
            selected={selected}
            reading={reading}
            readingError={readingError}
            retryReading={retryReading}
            go={go}
            navigate={navigate}
            close={close}
            jump={jump}
          />
        ) : panel === "appearance" ? (
          <AppearancePanel
            continuous={continuous}
            setContinuous={setContinuous}
          />
        ) : (
          <ChunkBoundary>
            <Suspense fallback={<Loading label="جارٍ فتح معلومات التطبيق…" />}>
              <About />
            </Suspense>
          </ChunkBoundary>
        )}
      </Sheet>
    </>
  );
}
