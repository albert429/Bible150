import { today } from "../lib/format";
import { exportBackup, type Reader } from "./progress";

export function downloadBackup(reader: Reader) {
  const url = URL.createObjectURL(
    new Blob([exportBackup(reader)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nt-reading-backup-${today()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackupFile(file: File) {
  if (file.size > 65536)
    throw Error("اختر ملف نسخة احتياطية صغيرًا بصيغة JSON.");
  return file.text();
}
