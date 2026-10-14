import { test, expect } from "@playwright/test";
import { APP_INFO } from "../../src/appInfo.ts";
import {
  closeSheet,
  expectAccessible,
  menuButton,
  menuDialog,
  noOverflow,
  openAppearance,
  ready,
  chooseFromMenu,
  profile,
  seed,
} from "./helpers";

test.describe("menu and About", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
  });

  test("subtle menu footer opens app credits and restores focus without changing reading", async ({
    page,
  }) => {
    const initialDay = await page.getByRole("article").getAttribute("data-day");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      if (width === 320) {
        const settings = await openAppearance(page);
        await settings.getByRole("button", { name: "الوضع الليلي" }).click();
        await closeSheet(page);
      }
      const trigger = menuButton(page);
      await trigger.click();
      const dialog = menuDialog(page);
      const aboutLink = dialog.getByRole("button", { name: "About the app" });
      await expect(dialog.locator(".menu-source")).toContainText(
        "النص: ترجمة فان دايك · ملكية عامة",
      );
      const sizes = await dialog.evaluate((element) => {
        const source = element.querySelector(".menu-source")!;
        const link = element.querySelector(".about-link")!;
        return {
          sourceFont: getComputedStyle(source).fontSize,
          linkFont: getComputedStyle(link).fontSize,
          sourceX: source.getBoundingClientRect().x,
          linkRight: link.getBoundingClientRect().right,
          targetHeight: link.getBoundingClientRect().height,
        };
      });
      expect(sizes.linkFont).toBe(sizes.sourceFont);
      expect(sizes.linkRight).toBeLessThan(sizes.sourceX);
      expect(sizes.targetHeight).toBeGreaterThanOrEqual(44);
      await aboutLink.click();
      const about = page.getByRole("dialog", {
        name: "About the app",
        exact: true,
      });
      await expect(about).toContainText("شباب كنيسة الإخوة بخلوصي");
      await expect(about).toContainText("لا يدّعي هذا التطبيق أي حقوق نشر");
      await expect(about).toContainText("توقيت تظليل الآيات تقريبي");
      await expect(
        about.getByRole("link", { name: "مصدر التسجيل" }),
      ).toHaveAttribute("href", "https://www.faithcomesbyhearing.com/");
      // The default build has no AI explanations, so no AI disclosure.
      await expect(about).not.toContainText("OpenRouter");
      await expect(
        about.getByRole("link", { name: "albertalfred429@gmail.com" }),
      ).toHaveAttribute("href", "mailto:albertalfred429@gmail.com");
      await expect(
        about.getByRole("link", { name: APP_INFO.githubName, exact: true }),
      ).toHaveAttribute("href", APP_INFO.githubUrl);
      await noOverflow(page);
      await expectAccessible(page);
      await page.keyboard.press("Escape");
      await expect(about).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("article")).toHaveAttribute(
        "data-day",
        initialDay!,
      );
    }
  });
});

test.describe("compact menu", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.goto("/");
    await ready(page);
  });

  test("compact menu keeps progress with the plan and backups in reader settings", async ({
    page,
  }) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await menuButton(page).click();
      const dialog = menuDialog(page);
      await expect(
        dialog.getByRole("navigation").getByRole("button"),
      ).toHaveCount(2);
      await expect(
        dialog.getByRole("button", {
          name: "رحلتي في ١٥٠ يومًا",
          exact: true,
        }),
      ).toContainText("٢ من ١٥٠ يومًا مكتملًا");
      await expect(
        dialog.getByRole("button", { name: /نسخة احتياطية/ }),
      ).toHaveCount(0);
      const share = await dialog
        .getByRole("button", { name: "مشاركة التطبيق" })
        .boundingBox();
      const close = await dialog
        .getByRole("button", { name: "إغلاق النافذة" })
        .boundingBox();
      expect(share!.y).toBe(close!.y);
      expect(share!.height).toBeGreaterThanOrEqual(44);
      await noOverflow(page);
      if (width === 390) {
        await expectAccessible(page);
        await page.screenshot({
          path: test.info().outputPath("menu-minimal.png"),
          scale: "css",
        });
      }
      await closeSheet(page);
    }
    await chooseFromMenu(page, "إعدادات رحلتي");
    await expect(
      page.getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true }),
    ).not.toBeVisible();
    await page.getByText("النسخ الاحتياطي والاستعادة", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuButton(page)).toBeFocused();
  });
});

test.describe("sharing", () => {
  test("share fallback contains a generic Arabic description and restores focus", async ({
    page,
  }) => {
    await seed(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copied = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/");
    await ready(page);
    await chooseFromMenu(page, "مشاركة التطبيق");
    const field = page.getByRole("textbox", { name: "نص المشاركة" });
    await expect(field).toHaveAttribute("dir", "auto");
    await expect(field).toHaveValue(/بالترتيب الزمني.*كتاب صوتي.*\nhttp/);
    expect(await field.inputValue()).not.toContain(profile.name);
    await page.getByRole("button", { name: "نسخ", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied",
      await field.inputValue(),
    );
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(menuButton(page)).toBeFocused();
  });

  for (const outcome of ["success", "cancel", "error"] as const) {
    test(`native sharing: ${outcome}`, async ({ page }) => {
      await page.addInitScript((outcome) => {
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (data: ShareData) => {
            document.documentElement.dataset.shared = JSON.stringify(data);
            if (outcome !== "success")
              throw new DOMException(
                "Test share result",
                outcome === "cancel" ? "AbortError" : "NotAllowedError",
              );
          },
        });
      }, outcome);
      await page.goto("/");
      await ready(page);
      await chooseFromMenu(page, "مشاركة التطبيق");
      const payload = JSON.parse(
        (await page.locator("html").getAttribute("data-shared"))!,
      );
      expect(payload.title).toBe(APP_INFO.title);
      expect(payload.text).toContain("كتاب صوتي");
      expect(payload.url).toMatch(/^http/);
      await expect(
        page.getByRole("textbox", { name: "نص المشاركة" }),
      ).toHaveCount(outcome === "error" ? 1 : 0);
      if (outcome !== "error") {
        await expect(menuDialog(page)).toBeVisible();
        await expect(
          page.getByRole("button", { name: "مشاركة التطبيق", exact: true }),
        ).toBeEnabled();
      }
    });
  }
});
