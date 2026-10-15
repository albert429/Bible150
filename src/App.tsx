import { Suspense, lazy, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useProgress } from "./plan/useProgress";
import { dayIndex, pageFor, scheduledDay } from "./plan/schedule";
import Reader from "./reader/Reader";
import Navigation, { type View } from "./navigation/Navigation";
import PlanView from "./plan/PlanView";
import { ChunkBoundary, Loading } from "./components/Feedback";
import type { Modal } from "./plan/dialogs";
import { useResource } from "./lib/useResource";
import { useToday } from "./lib/useToday";
import { useNotice } from "./lib/useNotice";
import { useModalDialog } from "./components/useModalDialog";
import { chapters } from "./bible/client";
import { readingKey, type BibleLocation } from "./bible/types";
import { useReadingLocation } from "./reader/useReadingLocation";
import { days } from "./plan/readings";
const Dialogs = lazy(() => import("./plan/dialogs"));

export default function App() {
  const progress = useProgress();
  const { member, error } = progress;
  const locationState = useReadingLocation(
    member ? scheduledDay(member.startDate) : 1,
  );
  const location = locationState.current;
  const selected = locationState.preferences.plan.day;
  const [page, setPage] = useState(() => pageFor(selected));
  const [seenSwitches, setSeenSwitches] = useState(progress.switches);
  const [view, setView] = useState<View>("read");
  const [seenNavigation, setSeenNavigation] = useState(
    locationState.navigation,
  );
  if (seenNavigation !== locationState.navigation) {
    setSeenNavigation(locationState.navigation);
    setView("read");
  }
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useNotice();
  const currentDate = useToday();
  const menuToggle = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const start = member?.startDate || currentDate;
  const current = dayIndex(start, currentDate);
  const done = member?.completed.includes(selected) || false;
  const planReading = useResource(
    days,
    String(selected),
    location.mode === "plan",
  );
  const chapterReading = useResource(
    chapters,
    readingKey(location),
    location.mode === "bible",
  );
  const reading = location.mode === "plan" ? planReading : chapterReading;

  if (seenSwitches !== progress.switches) {
    const day = member ? scheduledDay(member.startDate) : 1;
    setSeenSwitches(progress.switches);
    locationState.resetPlan(day);
    setPage(pageFor(day));
  }
  function navigate(next: View) {
    setView(next);
    requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0 });
  }
  function go(day: number) {
    locationState.go({ mode: "plan", day });
    navigate("read");
  }
  function goChapter(next: BibleLocation) {
    locationState.go(next);
    navigate("read");
  }
  function openModal(next: Modal) {
    progress.clearError();
    setModal(next);
  }
  function closeModal() {
    setModal(null);
  }
  function chooseReader(id: string | null) {
    if (!progress.select(id)) return;
    if (id === null) setModal({ kind: "join" });
    else closeModal();
    setView("read");
  }
  function complete() {
    if (!member) {
      openModal({ kind: "join" });
      return;
    }
    if (progress.complete(member.id, selected, !done))
      setNotice(
        done
          ? "تم التراجع عن إتمام القراءة"
          : "تم حفظ قراءتك. خطوة جديدة في الرحلة!",
      );
  }
  const { dialog, dialogProps } = useModalDialog({
    open: modal !== null,
    onClose: closeModal,
    cancel: "native",
    syncNativeClose: false,
    fallbackFocus: menuToggle,
  });
  return (
    <div className="app">
      <Navigation
        location={location}
        chooseMode={locationState.chooseMode}
        goChapter={goChapter}
        continuous={locationState.preferences.continuous}
        setContinuous={locationState.setContinuous}
        view={view}
        navigate={navigate}
        settings={() => openModal({ kind: member ? "settings" : "join" })}
        invite={(text) => openModal({ kind: "invite", text })}
        menuToggle={menuToggle}
        selected={selected}
        reading={planReading.data}
        readingError={reading.error}
        retryReading={reading.retry}
        go={go}
      />
      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className={view === "read" ? "reading-main" : undefined}
      >
        {error && !modal && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              onClick={progress.clearError}
              aria-label="إغلاق التنبيه"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {view === "read" ? (
          <Reader
            key={member?.id || "guest"}
            location={location}
            navigation={locationState.navigation}
            continuous={locationState.preferences.continuous}
            onChapterEnd={goChapter}
            reading={reading.data}
            error={reading.error}
            retry={reading.retry}
            done={done}
            complete={complete}
          />
        ) : (
          <PlanView
            member={member}
            start={start}
            currentDate={currentDate}
            current={current}
            page={page}
            setPage={setPage}
            go={go}
            join={() => openModal({ kind: "join" })}
          />
        )}
      </main>
      <dialog
        className="app-dialog"
        aria-label="إدارة الرحلة"
        ref={dialog}
        {...dialogProps}
      >
        <div className="dialog-content">
          <button
            className="icon-button dialog-close"
            aria-label="إغلاق"
            onClick={closeModal}
          >
            <X size={22} />
          </button>
          {modal && (
            <ChunkBoundary key={modal.kind}>
              <Suspense fallback={<Loading label="جارٍ فتح النافذة…" />}>
                <Dialogs
                  modal={modal}
                  close={closeModal}
                  navigate={navigate}
                  setNotice={setNotice}
                  chooseReader={chooseReader}
                />
              </Suspense>
            </ChunkBoundary>
          )}
        </div>
        {notice && modal && (
          <div className="dialog-notice" role="status">
            <Check size={19} />
            <span>{notice}</span>
          </div>
        )}
      </dialog>
      {notice && !modal && (
        <div className="toast" role="status">
          <Check size={19} />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}
