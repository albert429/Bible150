import { APP_INFO } from "../appInfo.ts";

export function appShareData(): ShareData {
  return {
    title: APP_INFO.title,
    text: "اقرأ واستمع إلى العهد الجديد بالترتيب الزمني في ١٥٠ يومًا. تطبيق لتنظيم قراءة الكتاب المقدس، مع تجربة كتاب صوتي حديثة وتظليل الآيات أثناء الاستماع.",
    url: location.origin + location.pathname,
  };
}

/** Shares through the system sheet; resolves to the text to show instead when that is unavailable. */
export async function shareApp() {
  const data = appShareData();
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }
  return `${data.text}\n${data.url}`;
}
