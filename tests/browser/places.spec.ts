import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { PROGRESS_KEY } from "../../src/plan/progress.ts";
import { LOCATION_KEY } from "../../src/reader/location.ts";
import {
  chooseFromMenu,
  nextDay,
  profile,
  ready,
  seed,
  stubConnection,
} from "./helpers";

// Reader one's scheduled day on 2026-10-01 is 10; reader two's is 5.
const second = {
  id: "reader-two",
  name: "مريم",
  startDate: "2026-09-27",
  completed: [1],
};
async function seedTwo(page: Page) {
  await page.clock.install({ time: new Date("2026-10-01T12:00:00Z") });
  // Only on the first visit, so later loads see what the app itself stored.
  await page.addInitScript(
    ({ key, profiles }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, activeId: profiles[0].id, profiles }),
        );
    },
    { key: PROGRESS_KEY, profiles: [profile, second] },
  );
}
const day = (page: Page) => page.getByRole("article");
const search = (page: Page) => new URL(page.url()).search;
const profiles = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).profiles,
    PROGRESS_KEY,
  );
async function switchReader(page: Page, id: string) {
  await chooseFromMenu(page, "إعدادات رحلتي");
  await page
    .getByRole("button", { name: "تغيير القارئ على هذا الجهاز" })
    .click();
  await page.getByLabel("متابعة قارئ محفوظ").selectOption(id);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await ready(page);
}

test("each reader's last plan day is remembered across launches; readers without one start on their scheduled day", async ({
  page,
}) => {
  await stubConnection(page, { saveData: true });
  await seedTwo(page);
  await page.goto("/");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "10");
  const before = await profiles(page);
  await nextDay(page).click();
  await nextDay(page).click();
  await expect(day(page)).toHaveAttribute("data-day", "12");
  expect(search(page)).toBe("");
  // A fresh launch and a reload both return to the last day read.
  await page.goto("/");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "12");
  await page.reload();
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "12");
  // Another reader has no place yet: their scheduled day, not reader one's.
  await switchReader(page, second.id);
  await expect(day(page)).toHaveAttribute("data-day", "5");
  await nextDay(page).click();
  await expect(day(page)).toHaveAttribute("data-day", "6");
  await switchReader(page, profile.id);
  await expect(day(page)).toHaveAttribute("data-day", "12");
  // The Bible place is shared, independent of the reader and the plan.
  await chooseFromMenu(page, "الكتاب المقدس");
  await ready(page);
  await page
    .getByRole("button", { name: "الإصحاح التالي", exact: true })
    .click();
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-reading", "bible:GEN:2");
  await switchReader(page, second.id);
  await expect(day(page)).toHaveAttribute("data-reading", "bible:GEN:2");
  await chooseFromMenu(page, "خطة القراءة");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "6");
  await page.goto("/");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "6");
  // Navigation never touches completion records.
  expect(await profiles(page)).toEqual(before);
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    LOCATION_KEY,
  );
  expect(stored.plans).toEqual({
    [profile.id]: { mode: "plan", day: 12 },
    [second.id]: { mode: "plan", day: 6 },
  });
  expect(stored.bible).toEqual({ mode: "bible", book: "GEN", chapter: 2 });
});

test("explicit day links are honoured and kept on reload; in-app days use the bare URL", async ({
  page,
}) => {
  await stubConnection(page, { saveData: true });
  await seed(page);
  await page.goto("/?day=7");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "7");
  expect(search(page)).toBe("?day=7");
  await page.reload();
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "7");
  expect(search(page)).toBe("?day=7");
  await nextDay(page).click();
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "8");
  expect(search(page)).toBe("");
  await page.reload();
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "8");
  await page.goBack();
  await expect(day(page)).toHaveAttribute("data-day", "7");
  expect(search(page)).toBe("?day=7");
  // An invalid link falls back to the remembered place and is not kept.
  await page.goto("/?day=151");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "7");
  expect(search(page)).toBe("");
  // A chapter link keeps its own address and leaves the plan place alone.
  await page.goto("/?mode=bible&book=PSA&chapter=23&verse=1");
  await ready(page);
  expect(search(page)).toBe("?mode=bible&book=PSA&chapter=23&verse=1");
  await chooseFromMenu(page, "خطة القراءة");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "7");
});

test("backups carry only progress; a restored reader starts on their scheduled day", async ({
  page,
}) => {
  await stubConnection(page, { saveData: true });
  await seed(page);
  await page.goto("/");
  await ready(page);
  await nextDay(page).click();
  await ready(page);
  await chooseFromMenu(page, "الكتاب المقدس");
  await ready(page);
  await chooseFromMenu(page, "إعدادات رحلتي");
  await page.getByText("النسخ الاحتياطي والاستعادة", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true })
    .click();
  const path = (await (await downloadPromise).path())!;
  const backup = JSON.parse(readFileSync(path, "utf8"));
  // The backup format is unchanged: no reading places or modes.
  expect(Object.keys(backup).sort()).toEqual(["reader", "version"]);
  expect(Object.keys(backup.reader).sort()).toEqual([
    "completed",
    "name",
    "startDate",
  ]);
  await page.getByLabel("ملف النسخة الاحتياطية").setInputFiles(path);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await ready(page);
  // Restoring selects a new reader; the mode and Bible place are unchanged.
  await expect(day(page)).toHaveAttribute("data-reading", "bible:GEN:1");
  await chooseFromMenu(page, "خطة القراءة");
  await ready(page);
  await expect(day(page)).toHaveAttribute("data-day", "10");
  await switchReader(page, profile.id);
  await expect(day(page)).toHaveAttribute("data-day", "11");
});
