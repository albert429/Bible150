import { test, expect } from "@playwright/test";
import { PROGRESS_KEY } from "../../src/plan/progress.ts";
import { chooseFromMenu, profile, ready, seed } from "./helpers";

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
});
