import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_INFO } from "../../src/appInfo";
import { closeSheet, key, noOverflow, profile, ready, seed } from "./helpers";

test.use({ reducedMotion: "reduce" });

async function menu(page: Page, target: string) {
  await page.getByRole("button", { name: "فتح القائمة", exact: true }).click();
  await page
    .getByRole("dialog", { name: "القائمة", exact: true })
    .getByRole("button", { name: target, exact: true })
    .click();
}
async function appearance(page: Page) {
  await page
    .getByRole("button", { name: "إعدادات القراءة", exact: true })
    .click();
  return page.getByRole("dialog", { name: "إعدادات القراءة", exact: true });
}
async function dayDetails(page: Page) {
  await page.getByRole("button", { name: /^تفاصيل اليوم / }).click();
  return page.getByRole("dialog", { name: /^قراءة اليوم / });
}
test("subtle menu footer opens app credits and restores focus without changing reading", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const initialDay = await page.getByRole("article").getAttribute("data-day");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 320) {
      const settings = await appearance(page);
      await settings.getByRole("button", { name: "الوضع الليلي" }).click();
      await closeSheet(page);
    }
    const trigger = page.getByRole("button", {
      name: "فتح القائمة",
      exact: true,
    });
    await trigger.click();
    const menuDialog = page.getByRole("dialog", {
      name: "القائمة",
      exact: true,
    });
    const aboutLink = menuDialog.getByRole("button", { name: "About the app" });
    await expect(menuDialog.locator(".menu-source")).toContainText(
      "النص: ترجمة فان دايك · ملكية عامة",
    );
    const sizes = await menuDialog.evaluate((element) => {
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
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(about).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("article")).toHaveAttribute(
      "data-day",
      initialDay!,
    );
  }
});
test("returning reader fetches their day first; revisits and calendar are cached", async ({
  page,
}) => {
  await seed(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/readings/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "اليوم ١٠",
  );
  expect(requests[0]).toBe("/readings/10.json");
  expect(
    requests.every((url) => /^\/readings\/(9|10|11)\.json$/.test(url)),
  ).toBe(true);
  await page.getByRole("button", { name: "اليوم التالي", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "اليوم السابق", exact: true }).click();
  await ready(page);
  expect(requests.filter((url) => url === "/readings/10.json")).toHaveLength(1);
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.locator(".calendar-day")).toHaveCount(30);
  await menu(page, "القراءة اليومية");
  await ready(page);
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.locator(".calendar-day")).toHaveCount(30);
  expect(requests.filter((url) => url.endsWith("plan.json"))).toHaveLength(1);
});
test("reading and calendar errors have working independent retry controls", async ({
  page,
}) => {
  let failDay = true;
  let failPlan = true;
  await page.route("**/readings/1.json", (route) =>
    failDay ? route.fulfill({ status: 503, body: "failed" }) : route.continue(),
  );
  await page.route("**/readings/plan.json", (route) =>
    failPlan
      ? route.fulfill({ status: 503, body: "failed" })
      : route.continue(),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("تعذر تحميل القراءة");
  await expect(
    page.getByRole("button", { name: "تمت القراءة", exact: true }),
  ).toBeDisabled();
  failDay = false;
  await page.getByRole("button", { name: "إعادة المحاولة" }).click();
  await ready(page);
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.getByRole("alert")).toContainText("تعذر تحميل خطة القراءة");
  failPlan = false;
  await page.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(page.locator(".calendar-day")).toHaveCount(30);
});
test("late responses cannot replace the selected day's Scripture", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/readings/2.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await ready(page);
  const requested = page.waitForRequest("**/readings/2.json");
  await page.getByRole("button", { name: "اليوم التالي", exact: true }).click();
  await requested;
  await page.getByRole("button", { name: "اليوم التالي", exact: true }).click();
  await ready(page);
  const response = page.waitForResponse("**/readings/2.json");
  release();
  await response;
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "3");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "اليوم ٣",
  );
});
test("completion, undo, backup, restore, and reader switching preserve profiles", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "تمت القراءة", exact: true }).click();
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
  await menu(page, "إعدادات رحلتي");
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
    key,
  );
  expect(restored.profiles).toHaveLength(2);
  expect(restored.activeId).not.toBe(profile.id);
  expect(restored.profiles[0]).toEqual(profile);
  expect(restored.profiles[1].completed).toEqual([2, 4]);
  await menu(page, "إعدادات رحلتي");
  await page
    .getByRole("button", { name: "تغيير القارئ على هذا الجهاز" })
    .click();
  await page.getByLabel("متابعة قارئ محفوظ").selectOption(profile.id);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).activeId,
      key,
    ),
  ).toBe(profile.id);
});
test("new readers can join; failed storage does not claim a successful save", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await menu(page, "ابدأ رحلتك");
  await page
    .getByRole("textbox", { name: "اسمك", exact: true })
    .fill("قارئ جديد");
  await page.getByRole("button", { name: "ابدأ القراءة", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("full", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, key);
  await page.getByRole("button", { name: "تمت القراءة", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("لم يتم الحفظ");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).profiles[0].completed,
      key,
    ),
  ).toEqual([]);
});
test("compact menu keeps progress with the plan and backups in reader settings", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await ready(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .click();
    const menuDialog = page.getByRole("dialog", {
      name: "القائمة",
      exact: true,
    });
    await expect(
      menuDialog.getByRole("navigation").getByRole("button"),
    ).toHaveCount(2);
    await expect(
      menuDialog.getByRole("button", {
        name: "رحلتي في ١٥٠ يومًا",
        exact: true,
      }),
    ).toContainText("٢ من ١٥٠ يومًا مكتملًا");
    await expect(
      menuDialog.getByRole("button", { name: /نسخة احتياطية/ }),
    ).toHaveCount(0);
    const share = await menuDialog
      .getByRole("button", { name: "مشاركة التطبيق" })
      .boundingBox();
    const close = await menuDialog
      .getByRole("button", { name: "إغلاق النافذة" })
      .boundingBox();
    expect(share!.y).toBe(close!.y);
    expect(share!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    if (width === 390) {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: test.info().outputPath("menu-minimal.png"),
        scale: "css",
      });
    }
    await closeSheet(page);
  }
  await menu(page, "إعدادات رحلتي");
  await expect(
    page.getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true }),
  ).not.toBeVisible();
  await page.getByText("النسخ الاحتياطي والاستعادة", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تنزيل نسخة احتياطية", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "فتح القائمة", exact: true }),
  ).toBeFocused();
});

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
  await menu(page, "مشاركة التطبيق");
  const field = page.getByRole("textbox", { name: "نص المشاركة" });
  await expect(field).toHaveAttribute("dir", "auto");
  await expect(field).toHaveValue(/بالترتيب الزمني.*كتاب صوتي.*\nhttp/);
  expect(await field.inputValue()).not.toContain(profile.name);
  await page.getByRole("button", { name: "نسخ", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied",
    await field.inputValue(),
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "فتح القائمة", exact: true }),
  ).toBeFocused();
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
    await menu(page, "مشاركة التطبيق");
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
      await expect(
        page.getByRole("dialog", { name: "القائمة", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "مشاركة التطبيق", exact: true }),
      ).toBeEnabled();
    }
  });
}
test("the first verse begins within 200px and the toolbar stays a single accessible row", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
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

test("day details jump to passages below the sticky toolbar and offer Today only away from today", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await ready(page);
  let details = await dayDetails(page);
  await expect(
    details.getByRole("button", { name: "قراءة اليوم", exact: true }),
  ).toHaveCount(0);
  await closeSheet(page);
  await page.getByRole("button", { name: "اليوم السابق", exact: true }).click();
  await ready(page);
  details = await dayDetails(page);
  const passageLink = details.locator('a[href^="#passage-"]').last();
  const target = await passageLink.getAttribute("href");
  await passageLink.click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const heading = page.locator(`${target} h2`);
  await expect(heading).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(60);
  details = await dayDetails(page);
  await details
    .getByRole("button", { name: "قراءة اليوم", exact: true })
    .click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "10");
});

test("reading sheets restore focus and preferences persist without changing the text", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const scripture = await page.locator(".scripture").textContent();
  for (const name of ["تفاصيل اليوم ١", "إعدادات القراءة"]) {
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  const settings = await appearance(page);
  await settings
    .getByRole("button", { name: "الوضع الليلي", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "الوضع الليلي", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (let i = 0; i < 5; i++)
    await settings
      .getByRole("button", { name: "تكبير الخط", exact: true })
      .click();
  await expect(
    settings.getByRole("button", { name: "تكبير الخط", exact: true }),
  ).toBeDisabled();
  await closeSheet(page);
  await page.reload();
  await ready(page);
  await expect(page.locator(".verse-text").first()).toHaveCSS(
    "font-size",
    "38px",
  );
  expect(await page.locator(".scripture").textContent()).toBe(scripture);
  const restored = await appearance(page);
  await expect(
    restored.getByRole("button", { name: "الوضع الليلي", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await closeSheet(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
  }
});

test("light and dark reading, day, appearance and menu sheets remain accessible", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  for (const dark of [false, true]) {
    if (dark) {
      const settings = await appearance(page);
      await settings
        .getByRole("button", { name: "الوضع الليلي", exact: true })
        .click();
      await closeSheet(page);
    }
    for (const sheet of ["reading", "day", "appearance", "menu"]) {
      if (sheet === "day") await dayDetails(page);
      if (sheet === "appearance") await appearance(page);
      if (sheet === "menu")
        await page
          .getByRole("button", { name: "فتح القائمة", exact: true })
          .click();
      await noOverflow(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      if (sheet !== "reading") await closeSheet(page);
    }
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.locator(".calendar-day")).toHaveCount(30);
  await noOverflow(page);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("the longest reading and plan boundaries keep navigation and Scripture intact", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "اليوم السابق", exact: true }),
  ).toBeDisabled();
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.locator(".calendar-day")).toHaveCount(30);
  for (let i = 0; i < 4; i++)
    await page
      .getByRole("button", { name: "الأيام التالية", exact: true })
      .click();
  await page.locator(".calendar-day").nth(22).click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "143");
  await expect(page.locator(".verse")).toHaveCount(60);
  await expect(page.locator(".passage h2 bdi").first()).toBeVisible();
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await page.locator(".calendar-day").last().click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "150");
  await expect(
    page.getByRole("button", { name: "اليوم التالي", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "اليوم السابق", exact: true }).click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "149");
});

test("200% phone reflow keeps day navigation accessible without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 195, height: 422 });
  await page.goto("/");
  await ready(page);
  await noOverflow(page);
  const details = await dayDetails(page);
  await expect(
    details.getByRole("button", { name: "اليوم السابق" }),
  ).toBeDisabled();
  await details.getByRole("button", { name: "اليوم التالي" }).click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "2");
  await noOverflow(page);
});

test("reduced motion suppresses sheet animation and standard motion uses a brief transition", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const settings = await appearance(page);
  const duration = await settings
    .locator(".sheet-surface")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animation: style.animationDuration,
        transition: style.transitionDuration,
      };
    });
  for (const value of [duration.animation, duration.transition])
    for (const seconds of value.split(","))
      expect(parseFloat(seconds)).toBeLessThanOrEqual(0.001);
  await closeSheet(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const animated = await appearance(page);
  const timings = await animated
    .locator(".sheet-surface")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        ...style.animationDuration.split(","),
        ...style.transitionDuration.split(","),
      ].map(parseFloat);
    });
  expect(Math.max(...timings)).toBeGreaterThan(0);
  expect(Math.max(...timings)).toBeLessThanOrEqual(0.2);
  await closeSheet(page);
});

test("fonts gate adjacent prefetch and a warmed reading opens without a loading flash", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );
  let releaseFonts!: () => void;
  const fonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await fonts;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".scripture")).toBeVisible();
  await page.waitForTimeout(650);
  expect(requests.filter((url) => url.includes("/readings/"))).toEqual([
    "/readings/1.json",
  ]);
  expect(requests.some((url) => url.includes("church-logo-192"))).toBe(false);
  const prefetched = page.waitForResponse("**/readings/2.json");
  releaseFonts();
  await ready(page);
  await (await prefetched).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const loadingFlash = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const article = document.querySelector("article")!;
        let loading = false;
        const observer = new MutationObserver(() => {
          loading ||= !!article.querySelector(".loading-state");
          if (
            article.getAttribute("data-day") === "2" &&
            article.querySelector(".scripture")
          ) {
            observer.disconnect();
            resolve(loading);
          }
        });
        observer.observe(article, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        document.querySelector<HTMLButtonElement>(".next-day")!.click();
      }),
  );
  expect(loadingFlash).toBe(false);
  expect(requests.filter((url) => url === "/readings/2.json")).toHaveLength(1);
  await expect(page.locator(".reader h2").first()).toContainText("لوقا");
});

test("speculative failures stay silent and foreground navigation retries", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/readings/2.json", (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 503, body: "failed" })
      : route.continue(),
  );
  const failed = page.waitForResponse("**/readings/2.json");
  await page.goto("/");
  await ready(page);
  await (await failed).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "اليوم التالي", exact: true }).click();
  await ready(page);
  await expect(page.getByRole("article")).toHaveAttribute("data-day", "2");
  expect(attempts).toBe(2);
});

test("data saving and slow connections suppress speculative reads", async ({
  page,
}) => {
  for (const connection of [
    { saveData: true, effectiveType: "4g" },
    { effectiveType: "2g" },
    { effectiveType: "3g" },
  ]) {
    await page.addInitScript(
      (connection) =>
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        }),
      connection,
    );
    const requests: string[] = [];
    const record = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/readings/"))
        requests.push(new URL(request.url()).pathname);
    };
    page.on("request", record);
    await page.goto("/");
    await ready(page);
    await page.waitForTimeout(700);
    expect(requests).toEqual(["/readings/1.json"]);
    await page
      .getByRole("button", { name: "اليوم التالي", exact: true })
      .click();
    await ready(page);
    await expect(page.getByRole("article")).toHaveAttribute("data-day", "2");
    page.off("request", record);
  }
});

test("leaving reading cancels queued prefetch", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/readings/"))
      requests.push(new URL(request.url()).pathname);
  });
  let releaseFonts!: () => void;
  const fonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await fonts;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".scripture")).toBeVisible();
  await menu(page, "رحلتي في ١٥٠ يومًا");
  await expect(page.locator(".calendar-day")).toHaveCount(30);
  releaseFonts();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  expect(requests).toEqual(["/readings/1.json", "/readings/plan.json"]);
});

test("sheet content survives exit, releases after closing, and rapid reopen stays usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await ready(page);
  await expect(page.locator(".menu-brand")).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: "فتح القائمة",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "القائمة", exact: true });
  await expect(dialog.locator(".menu-brand")).toBeVisible();
  await dialog.evaluate((element) =>
    element
      .querySelector<HTMLButtonElement>('[aria-label="إغلاق النافذة"]')!
      .click(),
  );
  await expect(dialog).toHaveAttribute("data-closing", "true");
  await expect(page.locator(".menu-brand")).toHaveCount(1);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>(".menu-toggle")!.click(),
  );
  await expect(dialog).not.toHaveAttribute("data-closing", "true");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".menu-brand")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.evaluate((element) => (element as HTMLDialogElement).close());
  await expect(page.locator(".menu-brand")).toHaveCount(0);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});
