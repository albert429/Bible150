import { useEffect, useState } from "react";

export const FONT_MIN = 22;
export const FONT_MAX = 38;
const FONT_DEFAULT = 28;

function readStored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function saveStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Appearance is optional; progress storage failures are reported by App.
  }
}

/** Preserve the existing preference keys when changing the reading layout. */
export function useAppearance() {
  const [font, setFont] = useState(() =>
    Math.max(
      FONT_MIN,
      Math.min(
        FONT_MAX,
        Number(readStored("word-font", String(FONT_DEFAULT))) || FONT_DEFAULT,
      ),
    ),
  );
  const [dark, setDark] = useState(
    () => readStored("word-dark", "false") === "true",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#181e1a" : "#f7f5ef");
    saveStored("word-dark", String(dark));
  }, [dark]);
  useEffect(() => saveStored("word-font", String(font)), [font]);

  return { font, setFont, dark, setDark };
}
