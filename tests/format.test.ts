import { test } from "node:test";
import assert from "node:assert/strict";
import { ar, dateLabel, today } from "../src/lib/format.ts";

test("Numbers use Eastern Arabic digits without grouping", () => {
  assert.equal(ar(0), "٠");
  assert.equal(ar(150), "١٥٠");
  assert.equal(ar(12345), "١٢٣٤٥");
});

test("today() is the Cairo calendar date, not the UTC date", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-01-15T21:59:00Z"),
  });
  assert.equal(today(), "2026-01-15");
  t.mock.timers.setTime(Date.parse("2026-01-15T22:00:00Z"));
  assert.equal(today(), "2026-01-16");
  // Daylight saving (UTC+3) from late April until the end of October.
  t.mock.timers.setTime(Date.parse("2026-07-01T21:00:00Z"));
  assert.equal(today(), "2026-07-02");
});

test("Date labels are the Arabic weekday, day and month", () => {
  assert.equal(dateLabel("2026-10-01"), "الخميس، ١ أكتوبر");
  assert.equal(dateLabel("2027-02-27"), "السبت، ٢٧ فبراير");
  assert.equal(dateLabel("2028-02-29"), "الثلاثاء، ٢٩ فبراير");
});
