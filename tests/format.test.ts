import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ar,
  dateFor,
  dateLabel,
  dayIndex,
  scheduledDay,
  today,
} from "../src/format.ts";

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

test("Day numbers count from the start date, inclusive", () => {
  assert.equal(dayIndex("2026-10-01", "2026-10-01"), 1);
  assert.equal(dayIndex("2026-10-01", "2026-10-02"), 2);
  assert.equal(dayIndex("2026-10-01", "2027-02-27"), 150);
  assert.equal(dayIndex("2026-10-01", "2026-09-30"), 0);
  assert.equal(dayIndex("2026-10-01", "2026-09-01"), -29);
  // Across a year boundary and a leap day.
  assert.equal(dayIndex("2027-12-31", "2028-01-01"), 2);
  assert.equal(dayIndex("2028-02-28", "2028-03-01"), 3);
});

test("The scheduled day is clamped to the plan, and defaults to today", (t) => {
  assert.equal(scheduledDay("2026-10-01", "2026-09-15"), 1);
  assert.equal(scheduledDay("2026-10-01", "2026-10-01"), 1);
  assert.equal(scheduledDay("2026-10-01", "2026-10-10"), 10);
  assert.equal(scheduledDay("2026-10-01", "2027-02-27"), 150);
  assert.equal(scheduledDay("2026-10-01", "2030-01-01"), 150);
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-05T10:00:00Z"),
  });
  assert.equal(scheduledDay("2026-10-01"), 5);
});

test("dateFor is the inverse of dayIndex", () => {
  assert.equal(dateFor("2026-10-01", 1), "2026-10-01");
  assert.equal(dateFor("2026-10-01", 3), "2026-10-03");
  assert.equal(dateFor("2026-10-01", 150), "2027-02-27");
  assert.equal(dateFor("2028-02-28", 3), "2028-03-01");
  for (const day of [1, 2, 31, 100, 150])
    assert.equal(dayIndex("2026-10-01", dateFor("2026-10-01", day)), day);
});

test("Date labels are the Arabic weekday, day and month", () => {
  assert.equal(dateLabel("2026-10-01"), "الخميس، ١ أكتوبر");
  assert.equal(dateLabel("2027-02-27"), "السبت، ٢٧ فبراير");
  assert.equal(dateLabel("2028-02-29"), "الثلاثاء، ٢٩ فبراير");
});
