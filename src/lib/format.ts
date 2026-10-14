const numbers = new Intl.NumberFormat("ar-EG", { useGrouping: false });
const cairoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const labels = new Intl.DateTimeFormat("ar-EG", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
export const ar = (n: number) => numbers.format(n);
export const today = () => cairoDate.format(new Date());
export const dayIndex = (start: string, date: string) =>
  Math.floor(
    (Date.parse(date + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
      86400000,
  ) + 1;
export const scheduledDay = (start: string, date = today()) =>
  Math.max(1, Math.min(150, dayIndex(start, date)));
export function dateFor(start: string, day: number) {
  const date = new Date(start + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}
export const dateLabel = (date: string) =>
  labels.format(new Date(date + "T12:00:00Z"));
