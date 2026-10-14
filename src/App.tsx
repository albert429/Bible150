import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useProgress } from "./plan/useProgress";
import { downloadBackup, readBackupFile } from "./plan/backup";
import { dayIndex, dateFor, pageFor, scheduledDay } from "./plan/schedule";
import Reader from "./reader/Reader";
import Navigation, { type View } from "./navigation/Navigation";
import PlanView from "./plan/PlanView";
import { ChunkBoundary, Loading } from "./components/Feedback";
import type { Modal } from "./plan/Dialogs";
import { useResource } from "./lib/useResource";
import { useToday } from "./lib/useToday";
import { useNotice } from "./lib/useNotice";
import { useAdjacentPrefetch } from "./reader/useAdjacentPrefetch";
import { days } from "./plan/readings";
import { useAppearance } from "./navigation/useAppearance";
import { appShareData } from "./navigation/share";
const Dialogs = lazy(() => import("./plan/Dialogs"));

export default function App() {
  const progress = useProgress();
  const { profiles, member, error } = progress;
  const [selected, setSelected] = useState(() =>
    member ? scheduledDay(member.startDate) : 1,
  );
  const [page, setPage] = useState(() => pageFor(selected));
  const [seenSwitches, setSeenSwitches] = useState(progress.switches);
  const [view, setView] = useState<View>("read");
  const [modal, setModal] = useState<Modal | null>(null);
  const { font, setFont, dark, setDark } = useAppearance();
  const [notice, setNotice] = useNotice();
  const currentDate = useToday();
  const [linkText, setLinkText] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLElement>(null);
  const start = member?.startDate || currentDate;
  const current = dayIndex(start, currentDate);
  const done = member?.completed.includes(selected) || false;
  const reading = useResource(days, String(selected));
  useAdjacentPrefetch(selected, reading.data, reading.error, view === "read");

  if (seenSwitches !== progress.switches) {
    const day = member ? scheduledDay(member.startDate) : 1;
    setSeenSwitches(progress.switches);
    setSelected(day);
    setPage(pageFor(day));
  }
  function navigate(next: View) {
    setView(next);
    requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0 });
  }
  function go(day: number) {
    setSelected(day);
    navigate("read");
  }
  function openModal(next: Modal) {
    if (!modal) dialogTrigger.current = document.activeElement as HTMLElement;
    progress.clearError();
    setModal(next);
  }
  function closeModal() {
    setModal(null);
  }
  function chooseReader(id: string | null) {
    if (!progress.select(id)) return;
    if (id === null) setModal("join");
    else closeModal();
    setView("read");
  }
  function backup() {
    if (!member) return;
    downloadBackup(member);
    setNotice("تم تجهيز النسخة الاحتياطية للتنزيل.");
  }
  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (progress.restore(await readBackupFile(file))) {
        closeModal();
        navigate("read");
        setNotice("تمت الاستعادة كقارئ منفصل. لم تُحذف أي قراءة سابقة.");
      }
    } catch (err) {
      progress.fail(err);
    } finally {
      event.target.value = "";
    }
  }
  function complete() {
    if (!member) {
      openModal("join");
      return;
    }
    if (progress.complete(member.id, selected, !done))
      setNotice(
        done
          ? "تم التراجع عن إتمام القراءة"
          : "تم حفظ قراءتك. خطوة جديدة في الرحلة!",
      );
  }
  function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (
      progress.create(
        String(data.get("name") || ""),
        String(data.get("start") || ""),
      )
    ) {
      closeModal();
      navigate("read");
      setNotice("أهلًا بك! بدأت رحلتك، وحُفظت على هذا الجهاز.");
    }
  }
  function showLink() {
    const data = appShareData();
    setLinkText(`${data.text}\n${data.url}`);
    openModal("invite");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(linkText);
      setNotice("تم النسخ");
    } catch {
      setNotice("يمكنك تحديد النص ونسخه من الحقل.");
    }
  }
  useEffect(() => {
    if (modal) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      const trigger = dialogTrigger.current;
      if (trigger?.isConnected && !trigger.closest("dialog:not([open])"))
        trigger.focus();
      else document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
    }
  }, [modal]);
  return (
    <div className="app">
      <Navigation
        view={view}
        navigate={navigate}
        member={member}
        settings={() => openModal(member ? "settings" : "join")}
        shareFallback={showLink}
        dark={dark}
        setDark={setDark}
        font={font}
        setFont={setFont}
        selected={selected}
        current={current}
        date={dateFor(start, selected)}
        done={done}
        reading={reading.data}
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
            selected={selected}
            reading={reading.data}
            error={reading.error}
            retry={reading.retry}
            done={done}
            font={font}
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
            join={() => openModal("join")}
          />
        )}
      </main>
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={restore}
        aria-label="ملف النسخة الاحتياطية"
      />
      <dialog
        className="app-dialog"
        aria-label="إدارة الرحلة"
        ref={dialog}
        onCancel={closeModal}
        onClick={(event) => {
          if (event.target === dialog.current) closeModal();
        }}
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
            <ChunkBoundary key={modal}>
              <Suspense fallback={<Loading label="جارٍ فتح النافذة…" />}>
                <Dialogs
                  modal={modal}
                  member={member}
                  profiles={profiles}
                  currentDate={currentDate}
                  start={start}
                  error={error}
                  linkText={linkText}
                  join={join}
                  chooseReader={chooseReader}
                  backup={backup}
                  restore={() => importInput.current?.click()}
                  copy={copy}
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
