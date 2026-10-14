import { test, expect } from "@playwright/test";
import {
  chooseFromMenu,
  closeSheet,
  expectAccessible,
  menuButton,
  noOverflow,
  openAppearance,
  openDayDetails,
  ready,
} from "./helpers";

test.describe("layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
  });

  test("the first verse begins within 200px and the toolbar stays a single accessible row", async ({
    page,
  }) => {
    const verse = await page.locator(".verse").first().boundingBox();
    expect(verse).not.toBeNull();
    expect(verse!.y).toBeLessThanOrEqual(200);
    await expect(page.locator(".verse-text").first()).toHaveCSS(
      "font-size",
      "28px",
    );
    await expect(page.locator(".verse-text").first()).toHaveCSS(
      "line-height",
      "56px",
    );
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await noOverflow(page);
      const header = await page.locator(".topbar").boundingBox();
      expect(header!.height).toBe(60);
      const buttons = await page
        .locator(".topbar button")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      expect(buttons).toHaveLength(5);
      for (const button of buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.y).toBeGreaterThanOrEqual(header!.y);
        expect(button.y + button.height).toBeLessThanOrEqual(
          header!.y + header!.height,
        );
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.x + button.width).toBeLessThanOrEqual(viewport.width);
      }
    }
    await page.locator(".passage").last().scrollIntoViewIfNeeded();
    expect((await page.locator(".topbar").boundingBox())!.y).toBe(0);
  });
});

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
  });

  test("light and dark reading, day, appearance and menu sheets remain accessible", async ({
    page,
  }) => {
    for (const dark of [false, true]) {
      if (dark) {
        const settings = await openAppearance(page);
        await settings
          .getByRole("button", { name: "الوضع الليلي", exact: true })
          .click();
        await closeSheet(page);
      }
      for (const sheet of ["reading", "day", "appearance", "menu"]) {
        if (sheet === "day") await openDayDetails(page);
        if (sheet === "appearance") await openAppearance(page);
        if (sheet === "menu") await menuButton(page).click();
        await noOverflow(page);
        await expectAccessible(page, { wcag: true });
        if (sheet !== "reading") await closeSheet(page);
      }
    }
    await page.setViewportSize({ width: 320, height: 720 });
    await chooseFromMenu(page, "رحلتي في ١٥٠ يومًا");
    await expect(page.locator(".calendar-day")).toHaveCount(30);
    await noOverflow(page);
    await expectAccessible(page, { wcag: true });
  });
});

test.describe("200% reflow", () => {
  test("200% phone reflow keeps day navigation accessible without horizontal scrolling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 195, height: 422 });
    await page.goto("/");
    await ready(page);
    await noOverflow(page);
    const details = await openDayDetails(page);
    await expect(
      details.getByRole("button", { name: "اليوم السابق" }),
    ).toBeDisabled();
    await details.getByRole("button", { name: "اليوم التالي" }).click();
    await ready(page);
    await expect(page.getByRole("article")).toHaveAttribute("data-day", "2");
    await noOverflow(page);
  });
});
