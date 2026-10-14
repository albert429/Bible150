import { createJsonClient } from "../lib/jsonClient.ts";
import { validManifest } from "./manifest.ts";

export const audioManifests = createJsonClient({
  url: (day) => `/audio/${day}.json`,
  validate: validManifest,
  message: () => "تعذر تحميل التسجيل. تحقق من الاتصال وحاول مرة أخرى.",
});
