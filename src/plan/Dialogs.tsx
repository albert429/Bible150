import {
  BookOpen,
  Copy,
  Download,
  Upload,
  ArrowLeft,
  Link,
  Users,
} from "lucide-react";
import type { FormEvent } from "react";
import { ar, dateLabel } from "../lib/format";
import type { Reader } from "./progress";

export type Modal = "join" | "settings" | "invite";
type Props = {
  modal: Modal;
  member: Reader | null;
  profiles: Reader[];
  currentDate: string;
  start: string;
  busy: boolean;
  error: string;
  linkText: string;
  join: (event: FormEvent<HTMLFormElement>) => void;
  chooseReader: (id: string | null) => void;
  backup: () => void;
  restore: () => void;
  copy: () => void;
};
export default function Dialogs({
  modal,
  member,
  profiles,
  currentDate,
  start,
  busy,
  error,
  linkText,
  join,
  chooseReader,
  backup,
  restore,
  copy,
}: Props) {
  return (
    <>
      <span className="large-icon" aria-hidden="true">
        {modal === "join" ? (
          <BookOpen size={26} />
        ) : modal === "settings" ? (
          <Users size={26} />
        ) : (
          <Link size={26} />
        )}
      </span>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {modal === "join" ? (
        <>
          <h2 id="dialog-title">لنبدأ الرحلة</h2>
          <p className="dialog-description">
            اسمك وتاريخ البداية فقط. يُحفظ تقدمك في هذا المتصفح.
          </p>
          {profiles.length > 0 && (
            <label className="reader-picker">
              متابعة قارئ محفوظ
              <select
                defaultValue=""
                onChange={(event) => chooseReader(event.target.value)}
              >
                <option value="" disabled>
                  اختر قارئًا
                </option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · {ar(profile.completed.length)} يومًا ·{" "}
                    {profile.startDate}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form onSubmit={join}>
            <label>
              اسمك
              <input
                name="name"
                autoComplete="given-name"
                required
                maxLength={60}
                placeholder="بماذا نناديك؟"
                autoFocus
              />
            </label>
            <label>
              تاريخ بداية رحلتك
              <input
                name="start"
                type="date"
                defaultValue={currentDate}
                min="2000-01-01"
                max="2100-12-31"
                required
              />
            </label>
            <p className="form-hint">يمكنك تعويض أي يوم أو القراءة مسبقًا.</p>
            <button className="primary full" disabled={busy}>
              {busy ? "جارٍ البدء…" : "ابدأ القراءة"}
              <ArrowLeft size={18} />
            </button>
          </form>
          <button className="setting-row" onClick={restore}>
            <Upload size={19} />
            استعادة نسخة احتياطية
          </button>
          <p className="privacy-note">
            نزّل نسخة احتياطية من الإعدادات قبل تغيير جهازك أو مسح بيانات
            المتصفح.
          </p>
        </>
      ) : modal === "settings" ? (
        <>
          <h2 id="dialog-title">رحلتك يا {member?.name}</h2>
          <p className="dialog-description">
            بدأت في {dateLabel(start)}. تقدمك محفوظ في هذا المتصفح فقط.
          </p>
          <details className="profile-backup">
            <summary>النسخ الاحتياطي والاستعادة</summary>
            <button className="setting-row" onClick={backup}>
              <Download size={18} aria-hidden="true" />
              تنزيل نسخة احتياطية
            </button>
            <button className="setting-row" onClick={restore}>
              <Upload size={18} aria-hidden="true" />
              استعادة نسخة احتياطية
            </button>
            <p className="privacy-note">
              النسخة الاحتياطية تحتوي اسمك وتاريخ البداية والأيام المكتملة.
              احتفظ بها لنفسك. لا توجد مزامنة تلقائية بين الأجهزة.
            </p>
          </details>
          <button className="setting-row" onClick={() => chooseReader(null)}>
            <Users size={20} />
            تغيير القارئ على هذا الجهاز
          </button>
        </>
      ) : (
        <>
          <h2 id="dialog-title">مشاركة التطبيق</h2>
          <p className="dialog-description">
            شارك التطبيق مع أصدقائك. لا يتضمن النص اسمك أو تقدمك.
          </p>
          <textarea
            className="link-field"
            aria-label="نص المشاركة"
            dir="auto"
            rows={5}
            readOnly
            value={linkText}
            onFocus={(event) => event.target.select()}
          />
          <button className="primary full" onClick={copy}>
            <Copy size={18} />
            نسخ
          </button>
        </>
      )}
    </>
  );
}
