import { expect, type Page } from "@playwright/test";

export const key = "nt-reading-progress-v1";
export const profile = {
  id: "reader-one",
  name: "ميخائيل",
  startDate: "2026-09-22",
  completed: [2, 4],
};

export async function seed(
  page: Page,
  selected = true,
  time = "2026-10-01T12:00:00Z",
) {
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(
    ({ key, profile, selected }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            activeId: selected ? profile.id : null,
            profiles: [profile],
          }),
        );
    },
    { key, profile, selected },
  );
}
export async function ready(page: Page) {
  await expect(page.locator(".scripture")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
export async function closeSheet(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "إغلاق النافذة", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}
export async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

export const verse = (page: Page, index: number) =>
  page.locator(".verse").nth(index);
/** A point on the verse's own text: the centre of its widest line box. */
export async function textPoint(page: Page, index: number) {
  return verse(page, index).evaluate((el) => {
    const rects = [...el.getClientRects()].sort((a, b) => b.width - a.width);
    return {
      x: rects[0].x + rects[0].width / 2,
      y: rects[0].y + rects[0].height / 2,
    };
  });
}
export async function tap(page: Page, index: number) {
  const { x, y } = await textPoint(page, index);
  await page.mouse.click(x, y);
}
export const study = (page: Page) => page.getByRole("dialog");
/** A section's heading button; its name is the title and, if any, the count. */
export const section = (page: Page, title: string) =>
  study(page).getByRole("button", { name: new RegExp(`^${title}( [٠-٩]+)?$`) });
export async function openSection(page: Page, title: string) {
  await section(page, title).click();
}
