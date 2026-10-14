import { test, expect, type Page } from "@playwright/test";
import { PROGRESS_KEY } from "../../src/plan/progress.ts";
import { chooseFromMenu, profile, ready, seed } from "./helpers";

const day = (page: Page) => page.getByRole("article");

test.describe("progress and backup", () => {
  test("completion, undo, backup, restore, and reader switching preserve profiles", async ({
    page,
  }) => {
    await seed(page);
    await page.goto("/");
    await ready(page);
    await page
      .getByRole("button", { name: "تمت القراءة", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "تراجع", exact: true }),
    ).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(
      page.getByRole("button", { name: "تراجع", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "تمت القراءة", exact: true }),
    ).toBeVisible();
    await chooseFromMenu(page, "إعدادات رحلتي");
    await page.getByText("النسخ الاحتياطي والاستعادة", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true })
      .click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();
    await page.getByLabel("ملف النسخة الاحتياطية").setInputFiles(backupPath!);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const restored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      PROGRESS_KEY,
    );
    expect(restored.profiles).toHaveLength(2);
    expect(restored.activeId).not.toBe(profile.id);
    expect(restored.profiles[0]).toEqual(profile);
    expect(restored.profiles[1].completed).toEqual([2, 4]);
    await chooseFromMenu(page, "إعدادات رحلتي");
    await page
      .getByRole("button", { name: "تغيير القارئ على هذا الجهاز" })
      .click();
    await page.getByLabel("متابعة قارئ محفوظ").selectOption(profile.id);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).activeId,
        PROGRESS_KEY,
      ),
    ).toBe(profile.id);
  });

  test("new readers can join; failed storage does not claim a successful save", async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    await chooseFromMenu(page, "ابدأ رحلتك");
    await page
      .getByRole("textbox", { name: "اسمك", exact: true })
      .fill("قارئ جديد");
    await page
      .getByRole("button", { name: "ابدأ القراءة", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException("full", "QuotaExceededError");
        original.call(this, name, value);
      };
    }, PROGRESS_KEY);
    await page
      .getByRole("button", { name: "تمت القراءة", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("لم يتم الحفظ");
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).profiles[0].completed,
        PROGRESS_KEY,
      ),
    ).toEqual([]);
  });

  test("progress written in another tab updates this one and only a reader change resets the day", async ({
    page,
  }) => {
    await seed(page);
    await page.goto("/");
    await ready(page);
    const other = await page.context().newPage();
    await seed(other);
    await other.goto("/");
    await ready(other);
    const write = (patch: object) =>
      other.evaluate(
        ({ key, patch }) => {
          const state = JSON.parse(localStorage.getItem(key)!);
          localStorage.setItem(key, JSON.stringify({ ...state, ...patch }));
        },
        { key: PROGRESS_KEY, patch },
      );
    await chooseFromMenu(page, "رحلتي في ١٥٠ يومًا");
    await page.locator(".calendar-day").nth(2).click();
    await ready(page);
    await expect(day(page)).toHaveAttribute("data-day", "3");
    await expect(
      page.getByRole("button", { name: "تمت القراءة", exact: true }),
    ).toBeVisible();
    await write({ profiles: [{ ...profile, completed: [2, 3, 4] }] });
    await expect(
      page.getByRole("button", { name: "تراجع", exact: true }),
    ).toBeVisible();
    await expect(day(page)).toHaveAttribute("data-day", "3");
    await write({ activeId: null });
    await expect(day(page)).toHaveAttribute("data-day", "1");
    await write({ activeId: profile.id });
    await expect(day(page)).toHaveAttribute("data-day", "10");
  });
});
