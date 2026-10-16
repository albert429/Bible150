/** Immutable media namespaces, served by the app proxy and Pages range handler. */
export const AUDIO_MEDIA_PREFIX = "/audio/days/";
export const AUDIO_CHAPTER_MEDIA_PREFIX = "/audio/chapters/assets/";
/** Partial-chapter clips cut from the original recordings at reviewed verse boundaries. */
export const AUDIO_CLIP_MEDIA_PREFIX = "/audio/clips/";
export const AUDIO_MEDIA_PREFIXES = [
  AUDIO_MEDIA_PREFIX,
  AUDIO_CHAPTER_MEDIA_PREFIX,
  AUDIO_CLIP_MEDIA_PREFIX,
];
export const AUDIO_MEDIA_PATTERN =
  /^\/audio\/(?:days\/\d{3}|chapters\/assets\/[A-Z0-9]{3}-[1-9]\d{0,2}|clips\/[A-Z0-9]{3}-[1-9]\d{0,2}-[1-9]\d{0,2}-[1-9]\d{0,2})-[a-f0-9]+\.m4a$/;
export const AUDIO_MAX_BYTES = 8 * 1024 * 1024;
/** Cloudflare Pages Free: at most 20,000 files in one deployment. */
export const AUDIO_MAX_FILES = 20000;
export const AUDIO_CONTENT_TYPE = "audio/mp4";
export const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const AUDIO_PAGES_PROJECT = "bible-reading-audio";
export const AUDIO_PAGES_ORIGIN = `https://${AUDIO_PAGES_PROJECT}.pages.dev`;
