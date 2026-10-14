import { Download, Upload, Users } from "lucide-react";
import { dateLabel } from "../../lib/format";
import { downloadBackup } from "../backup";
import { useToday } from "../../lib/useToday";
import { useProgress } from "../useProgress";
import RestoreButton from "./RestoreButton";
import type { Actions } from ".";

export default function Settings({
  chooseReader,
  ...actions
}: Actions & { chooseReader: (id: string | null) => void }) {
  const { member } = useProgress();
  const currentDate = useToday();
  const start = member?.startDate || currentDate;
  function backup() {
    if (!member) return;
    downloadBackup(member);
    actions.setNotice("تم تجهيز النسخة الاحتياطية للتنزيل.");
  }
  return (
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
        <RestoreButton {...actions}>
          <Upload size={18} aria-hidden="true" />
          استعادة نسخة احتياطية
        </RestoreButton>
        <p className="privacy-note">
          النسخة الاحتياطية تحتوي اسمك وتاريخ البداية والأيام المكتملة. احتفظ
          بها لنفسك. لا توجد مزامنة تلقائية بين الأجهزة.
        </p>
      </details>
      <button className="setting-row" onClick={() => chooseReader(null)}>
        <Users size={20} />
        تغيير القارئ على هذا الجهاز
      </button>
    </>
  );
}
