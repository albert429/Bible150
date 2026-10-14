import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import {
  createReader,
  setCompletion,
  loadProgress,
  selectReader,
  exportBackup,
  importBackup,
  PROGRESS_KEY,
  type Reader as Profile,
} from "./plan/progress";
import { today } from "./lib/format";
import { dayIndex, dateFor, pageFor, scheduledDay } from "./plan/schedule";
import Reader from "./reader/Reader";
import Navigation, { type View } from "./navigation/Navigation";
import { ChunkBoundary, Loading } from "./components/Feedback";
import type { Modal } from "./plan/Dialogs";
import { useResource } from "./lib/useResource";
import { useAdjacentPrefetch } from "./reader/useAdjacentPrefetch";
import { days } from "./plan/readings";
import { useAppearance } from "./navigation/useAppearance";
import { appShareData } from "./navigation/share";
const Calendar = lazy(() => import("./plan/Calendar"));
const Dialogs = lazy(() => import("./plan/Dialogs"));

function initialReader() {
  try {
    const state = loadProgress(localStorage);
    const member =
      state.profiles.find((profile) => profile.id === state.activeId) || null;
    return {
      profiles: state.profiles,
      member,
      selected: member ? scheduledDay(member.startDate) : 1,
      error: "",
    };
  } catch (error) {
    return {
      profiles: [] as Profile[],
      member: null,
      selected: 1,
      error: (error as Error).message,
    };
  }
}
export default function App() {
  const [initial] = useState(initialReader);
  const [profiles, setProfiles] = useState(initial.profiles);
  const [member, setMember] = useState<Profile | null>(initial.member);
  const [selected, setSelected] = useState(initial.selected);
  const [page, setPage] = useState(pageFor(initial.selected));
  const [view, setView] = useState<View>("read");
  const [modal, setModal] = useState<Modal | null>(null);
  const { font, setFont, dark, setDark } = useAppearance();
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentDate, setCurrentDate] = useState(today);
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

  function applyReader(reader: Profile | null) {
    const nextProfiles = loadProgress(localStorage).profiles;
    setMember(reader);
    setProfiles(nextProfiles);
    const day = reader ? scheduledDay(reader.startDate) : 1;
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
    setError("");
    setModal(next);
  }
  function closeModal() {
    setModal(null);
  }
  function chooseReader(id: string | null) {
    try {
      applyReader(selectReader(localStorage, id));
      setError("");
      if (id === null) setModal("join");
      else closeModal();
      setView("read");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function backup() {
    if (!member) return;
    const url = URL.createObjectURL(
      new Blob([exportBackup(member)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nt-reading-backup-${today()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("تم تجهيز النسخة الاحتياطية للتنزيل.");
  }
  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536)
        throw Error("اختر ملف نسخة احتياطية صغيرًا بصيغة JSON.");
      applyReader(importBackup(localStorage, await file.text()));
      closeModal();
      navigate("read");
      setError("");
      setNotice("تمت الاستعادة كقارئ منفصل. لم تُحذف أي قراءة سابقة.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      event.target.value = "";
    }
  }
  function complete() {
    if (!member) {
      openModal("join");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setMember(setCompletion(localStorage, member.id, selected, !done));
      setProfiles(loadProgress(localStorage).profiles);
      setNotice(
        done
          ? "تم التراجع عن إتمام القراءة"
          : "تم حفظ قراءتك. خطوة جديدة في الرحلة!",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      applyReader(
        createReader(
          localStorage,
          String(data.get("name") || ""),
          String(data.get("start") || ""),
        ),
      );
      closeModal();
      navigate("read");
      setNotice("أهلًا بك! بدأت رحلتك، وحُفظت على هذا الجهاز.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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
    const sync = (event: StorageEvent) => {
      if (event.key !== PROGRESS_KEY && event.key !== null) return;
      try {
        const state = loadProgress(localStorage);
        const next =
          state.profiles.find((profile) => profile.id === state.activeId) ||
          null;
        if (next?.id !== member?.id) {
          const day = next ? scheduledDay(next.startDate) : 1;
          setSelected(day);
          setPage(pageFor(day));
        }
        setMember(next);
        setProfiles(state.profiles);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [member?.id]);
  useEffect(() => {
    const tick = () => setCurrentDate(today());
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
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
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
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
              onClick={() => setError("")}
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
            busy={busy}
            font={font}
            complete={complete}
          />
        ) : (
          <>
            <section className="page-heading">
              <div>
                <span className="eyebrow">١٥٠ يومًا · بالترتيب الزمني</span>
                <h1>رحلتك، يومًا بيوم</h1>
                <p>تابع الأيام المكتملة، وعُد إلى أي قراءة.</p>
              </div>
              {!member ? (
                <button className="primary" onClick={() => openModal("join")}>
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
                  busy={busy}
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
