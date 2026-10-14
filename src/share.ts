import { APP_INFO } from "./appInfo.ts";

export function appShareData(): ShareData {
  return {
    title: APP_INFO.title,
    text: "اقرأ واستمع إلى العهد الجديد بالترتيب الزمني في ١٥٠ يومًا. تطبيق لتنظيم قراءة الكتاب المقدس، مع تجربة كتاب صوتي حديثة وتظليل الآيات أثناء الاستماع.",
    url: location.origin + location.pathname,
  };
}
