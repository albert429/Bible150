import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Settings,
  Info,
} from "lucide-react";
import { useProgress } from "../plan/useProgress";
import type { View } from "./Navigation";
import { ar } from "../lib/format";
import { APP_INFO } from "../appInfo";
import logo from "../assets/favicon.svg";
import "./MenuPanel.css";

const links = [
  {
    view: "calendar" as const,
    label: "رحلتي في ١٥٠ يومًا",
    icon: CalendarDays,
  },
];
type Props = {
  mode: "plan" | "bible";
  chooseMode: (mode: "plan" | "bible") => void;
  view: View;
  navigate: (view: View) => void;
  settings: () => void;
  about: () => void;
  close: (action?: () => void) => void;
};
export default function MenuPanel({
  mode,
  chooseMode,
  view,
  navigate,
  settings,
  about,
  close,
}: Props) {
  const { member } = useProgress();
  const count = member?.completed.length || 0;
  return (
    <>
      <div className="menu-brand">
        <img src={logo} width="64" height="64" alt="" />
        <span>{APP_INFO.title}</span>
      </div>
      <nav className="menu-links" aria-label="قائمة التنقل">
        <div className="reading-modes" role="group" aria-label="طريقة القراءة">
          {(
            [
              ["plan", "خطة القراءة"],
              ["bible", "الكتاب المقدس"],
            ] as const
          ).map(([target, label]) => (
            <button
              className="nav-item"
              key={target}
              aria-label={label}
              aria-current={
                view === "read" && mode === target ? "page" : undefined
              }
              onClick={() =>
                close(() => {
                  chooseMode(target);
                  navigate("read");
                })
              }
            >
              <BookOpen size={20} aria-hidden="true" />
              <span className="menu-link-label">{label}</span>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        {links.map(({ view: target, label, icon: Icon }) => (
          <button
            className="nav-item"
            key={target}
            aria-label={label}
            aria-current={view === target ? "page" : undefined}
            onClick={() => close(() => navigate(target))}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="menu-link-label">
              {label}
              {target === "calendar" && member && (
                <small>{ar(count)} من ١٥٠ يومًا مكتملًا</small>
              )}
            </span>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        ))}
      </nav>
      <button
        className="profile"
        onClick={() => close(settings)}
        aria-label={member ? "إعدادات رحلتي" : "ابدأ رحلتك"}
      >
        <span className="avatar">
          {member ? member.name.charAt(0) : <BookOpen size={20} />}
        </span>
        <span>
          {member?.name || "ابدأ رحلتك"}
          <small>
            {member ? "محفوظة على هذا الجهاز" : "اسمك فقط، دون تسجيل دخول"}
          </small>
        </span>
        <Settings size={19} aria-hidden="true" />
      </button>
      <footer className="menu-footer">
        <div className="menu-source">
          <p>النص: ترجمة فان دايك · ملكية عامة</p>
          <p>
            بيانات النص من{" "}
            <a href={APP_INFO.scriptureSource} target="_blank" rel="noreferrer">
              eBible.org
            </a>
          </p>
        </div>
        <button className="about-link" lang="en" dir="ltr" onClick={about}>
          <Info size={13} aria-hidden="true" />
          <span>About the app</span>
        </button>
      </footer>
    </>
  );
}
