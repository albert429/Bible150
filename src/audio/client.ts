import { createJsonClient } from "../lib/jsonClient.ts";
import { validManifest } from "./manifest.ts";

const createClient = () =>
  createJsonClient({
    url: (day) => `/audio/${day}.json`,
    validate: validManifest,
    message: () => "تعذر تحميل التسجيل. تحقق من الاتصال وحاول مرة أخرى.",
  });
export let audioManifests = createClient();
export function resetAudioManifestCache() {
  audioManifests = createClient();
}
