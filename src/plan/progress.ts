export type Reader = {
  id: string;
  name: string;
  startDate: string;
  completed: number[];
};
type State = { version: 1; activeId: string | null; profiles: Reader[] };
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const PROGRESS_KEY = "nt-reading-progress-v1";
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "2000-01-01" &&
    value <= "2100-12-31" &&
    !isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function validateReader(value: unknown): Omit<Reader, "id"> {
  const r = value as Partial<Reader> | null;
  if (
    !r ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.trim().length > 60 ||
    !validDate(r.startDate) ||
    !Array.isArray(r.completed) ||
    r.completed.length > 150 ||
    r.completed.some((n) => !Number.isInteger(n) || n < 1 || n > 150)
  )
    throw Error("بيانات القراءة غير صالحة. اختر نسخة احتياطية صحيحة.");
  return {
    name: r.name.trim(),
    startDate: r.startDate,
    completed: [...new Set(r.completed)].sort((a, b) => a - b),
  };
}
export function loadProgress(storage: StorageLike): State {
  let raw;
  try {
    raw = storage.getItem(PROGRESS_KEY);
  } catch {
    throw Error(
      "لا يسمح المتصفح بحفظ التقدم. اسمح بتخزين بيانات الموقع أولًا.",
    );
  }
  if (!raw) return { version: 1, activeId: null, profiles: [] };
  try {
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.profiles) ||
      data.profiles.length > 100
    )
      throw Error();
    const profiles = data.profiles.map((p: Reader) => {
      if (typeof p.id !== "string" || !p.id || p.id.length > 100) throw Error();
      return { id: p.id, ...validateReader(p) };
    });
    if (new Set(profiles.map((p: Reader) => p.id)).size !== profiles.length)
      throw Error();
    if (
      data.activeId !== null &&
      !profiles.some((p: Reader) => p.id === data.activeId)
    )
      throw Error();
    return { version: 1, activeId: data.activeId, profiles };
  } catch {
    throw Error(
      "تعذر قراءة التقدم المحفوظ. لم نغيّر بياناتك. جرّب استعادة نسخة احتياطية على متصفح آخر.",
    );
  }
}
function persist(storage: StorageLike, state: State) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(state));
  } catch {
    throw Error(
      "لم يتم الحفظ. مساحة المتصفح ممتلئة أو التخزين محظور. احتفظ بنسخة احتياطية وحاول مجددًا.",
    );
  }
}
export function currentReader(storage: StorageLike) {
  const s = loadProgress(storage);
  return s.profiles.find((p) => p.id === s.activeId) || null;
}
export function createReader(
  storage: StorageLike,
  name: string,
  startDate: string,
  completed: number[] = [],
): Reader {
  const s = loadProgress(storage);
  if (s.profiles.length >= 100)
    throw Error("وصلت إلى الحد الأقصى للقراء على هذا الجهاز.");
  const reader = {
    id: crypto.randomUUID(),
    ...validateReader({ name, startDate, completed }),
  };
  persist(storage, {
    ...s,
    activeId: reader.id,
    profiles: [...s.profiles, reader],
  });
  return reader;
}
export function setCompletion(
  storage: StorageLike,
  id: string,
  day: number,
  completed: boolean,
): Reader {
  if (!Number.isInteger(day) || day < 1 || day > 150)
    throw Error("اليوم غير صالح.");
  const s = loadProgress(storage);
  const reader = s.profiles.find((p) => p.id === id);
  if (!reader) throw Error("اختر القارئ أولًا.");
  const days = new Set(reader.completed);
  if (completed) days.add(day);
  else days.delete(day);
  const updated = { ...reader, completed: [...days].sort((a, b) => a - b) };
  persist(storage, {
    ...s,
    profiles: s.profiles.map((p) => (p.id === id ? updated : p)),
  });
  return updated;
}
export function selectReader(storage: StorageLike, id: string | null) {
  const s = loadProgress(storage);
  if (id !== null && !s.profiles.some((p) => p.id === id))
    throw Error("القارئ غير موجود.");
  persist(storage, { ...s, activeId: id });
  return s.profiles.find((p) => p.id === id) || null;
}
export function exportBackup(reader: Reader) {
  return JSON.stringify(
    { version: 1, reader: validateReader(reader) },
    null,
    2,
  );
}
export function importBackup(storage: StorageLike, text: string) {
  if (text.length > 65536) throw Error("ملف النسخة الاحتياطية كبير جدًا.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("اختر ملف نسخة احتياطية بصيغة JSON.");
  }
  if (!data || data.version !== 1) throw Error("نسخة احتياطية غير مدعومة.");
  const r = validateReader(data.reader);
  // Import as a separate reader so no existing progress is overwritten.
  return createReader(storage, r.name, r.startDate, r.completed);
}
