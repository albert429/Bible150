// Pages assets return 200 for Range requests. Supply the single-range responses
// required by native audio seeking, including Safari's initial bytes=0-1 probe.
//
// Warm ranges come from the colo's Cache API: a complete 200 response (with its
// Content-Length) is stored once under a range-free key, and
// caches.default.match(request with Range) returns the 206 slice without
// reading the file in this handler. A cold miss reads the Pages asset once,
// bounded to AUDIO_MAX_BYTES, slices it, and fills the cache in the background.
// A 206 is never stored, and a cached entry is never served for another path.
//
// Deployed verbatim (it cannot import), so tests keep these values equal to
// src/audio/contract.ts. Only the default handler is exported: Pages treats
// other module exports as entrypoints.
const AUDIO_MEDIA_PATTERN =
  /^\/audio\/(?:days\/\d{3}|chapters\/assets\/[A-Z0-9]{3}-[1-9]\d{0,2}|clips\/[A-Z0-9]{3}-[1-9]\d{0,2}-[1-9]\d{0,2}-[1-9]\d{0,2})-[a-f0-9]+\.m4a$/;
const AUDIO_MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_CONTENT_TYPE = "audio/mp4";
const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** One satisfiable-or-not byte range, or null to answer with the whole file. */
function parseRange(header) {
  // Malformed and multipart ranges are ignored; a complete 200 is permitted.
  const range = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!range || (!range[1] && !range[2])) return null;
  return { first: range[1], last: range[2] };
}

function resolveRange({ first, last }, length) {
  const start = first ? Number(first) : Math.max(0, length - Number(last));
  const end = first && last ? Math.min(Number(last), length - 1) : length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    (!first && Number(last) === 0) ||
    start >= length ||
    start > end
  )
    return null;
  return { start, end };
}

/** If-Range: a strong ETag or the exact Last-Modified date of this file. */
function ifRangeMatches(validator, headers) {
  if (!validator) return true;
  if (validator.startsWith('"')) return validator === headers.get("ETag");
  if (validator.startsWith("W/")) return false;
  const modified = headers.get("Last-Modified");
  return !!modified && validator === modified;
}

const tags = (header) =>
  header
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
const opaque = (tag) => tag.replace(/^W\//, "");
const date = (value) => Date.parse(value || "");

/**
 * HTTP preconditions (RFC 9110 section 13.2.2), evaluated against the file's
 * own validators before any Range: 412 for a failed If-Match or
 * If-Unmodified-Since, 304 for a matching If-None-Match or an unchanged
 * If-Modified-Since, otherwise 0. Pages is always asked for the plain file,
 * so these are answered here, cold or warm.
 */
function precondition(request, headers) {
  const etag = headers.get("ETag");
  const modified = date(headers.get("Last-Modified"));
  const match = request.headers.get("If-Match");
  if (match !== null) {
    const strong = !!etag && !etag.startsWith("W/");
    if (match.trim() !== "*" && !(strong && tags(match).includes(etag)))
      return 412;
  } else {
    const since = date(request.headers.get("If-Unmodified-Since"));
    if (!Number.isNaN(since) && !Number.isNaN(modified) && modified > since)
      return 412;
  }
  const none = request.headers.get("If-None-Match");
  if (none !== null) {
    if (
      none.trim() === "*" ||
      (!!etag && tags(none).some((tag) => opaque(tag) === opaque(etag)))
    )
      return 304;
  } else {
    const since = date(request.headers.get("If-Modified-Since"));
    if (!Number.isNaN(since) && !Number.isNaN(modified) && modified <= since)
      return 304;
  }
  return 0;
}

const CONDITIONALS = [
  "If-Match",
  "If-None-Match",
  "If-Modified-Since",
  "If-Unmodified-Since",
];
const conditional = (request) =>
  CONDITIONALS.some((name) => request.headers.has(name));

/** 304 or 412: validators and caching only, never a body or range. */
function preconditionResponse(status, source, cache) {
  const headers = new Headers();
  for (const name of ["ETag", "Last-Modified"])
    if (source.has(name)) headers.set(name, source.get(name));
  headers.set(
    "Cache-Control",
    status === 304 ? AUDIO_CACHE_CONTROL : "no-store",
  );
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  if (cache) headers.set("X-Audio-Cache", cache);
  return new Response(null, { status, headers });
}

function mediaHeaders(source) {
  const headers = new Headers(source);
  headers.delete("Content-Encoding");
  headers.delete("Content-Range");
  headers.delete("Set-Cookie");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", AUDIO_CONTENT_TYPE);
  headers.set("Cache-Control", AUDIO_CACHE_CONTROL);
  // A downstream proxy must not reuse one partial response for another range.
  // Browser caching remains immutable; Cloudflare caches the complete asset.
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  return headers;
}

function unsatisfiable(source, length, cache) {
  const headers = mediaHeaders(source);
  headers.set("Content-Range", `bytes */${length}`);
  headers.set("Content-Length", "0");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Audio-Cache", cache);
  return new Response(null, { status: 416, headers });
}

function partial(source, body, start, end, length, cache) {
  const headers = mediaHeaders(source);
  headers.set("Content-Range", `bytes ${start}-${end}/${length}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("X-Audio-Cache", cache);
  return new Response(body, { status: 206, headers });
}

/** The range-free key under which one complete file is cached. */
function cacheKey(url) {
  return new Request(`${url.origin}${url.pathname}`, { method: "GET" });
}

function cacheStore() {
  try {
    // Cloudflare's CacheStorage adds `default`; absent elsewhere (tests, Node).
    return /** @type {any} */ (globalThis).caches?.default ?? null;
  } catch {
    return null;
  }
}

const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

/**
 * Serve a range from the colo cache, or undefined to fall back to the asset.
 * Only well-formed 206 and 416 answers for a complete cached file are used.
 */
async function fromCache(cache, key, request) {
  let hit;
  try {
    hit = await cache.match(
      new Request(key.url, {
        headers: { Range: request.headers.get("Range") },
      }),
    );
  } catch {
    return undefined;
  }
  if (!hit) return undefined;
  const failed = precondition(request, hit.headers);
  if (failed) {
    await hit.body?.cancel();
    return preconditionResponse(failed, hit.headers, "HIT");
  }
  if (!ifRangeMatches(request.headers.get("If-Range"), hit.headers)) {
    // A changed validator asks for the whole current file; immutable media
    // makes this rare, so the asset answers it.
    await hit.body?.cancel();
    return undefined;
  }
  if (hit.status === 206) {
    const match = CONTENT_RANGE.exec(hit.headers.get("Content-Range") || "");
    const declared = Number(hit.headers.get("Content-Length"));
    if (
      match &&
      Number(match[1]) <= Number(match[2]) &&
      Number(match[2]) < Number(match[3]) &&
      declared === Number(match[2]) - Number(match[1]) + 1
    )
      return partial(
        hit.headers,
        hit.body,
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        "HIT",
      );
  } else if (hit.status === 416) {
    const length = /^bytes \*\/(\d+)$/.exec(
      hit.headers.get("Content-Range") || "",
    );
    if (length) return unsatisfiable(hit.headers, Number(length[1]), "HIT");
  }
  await hit.body?.cancel();
  return undefined;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const media = AUDIO_MEDIA_PATTERN.test(url.pathname);
    const range =
      request.method === "GET"
        ? parseRange(request.headers.get("Range"))
        : null;
    if (!media || !range) {
      const response = await env.ASSETS.fetch(request);
      // Advertise range support on whole-file and HEAD answers too.
      if (!media || response.status !== 200) return response;
      const failed =
        conditional(request) && precondition(request, response.headers);
      if (failed) {
        await response.body?.cancel();
        return preconditionResponse(failed, response.headers);
      }
      return new Response(response.body, {
        status: 200,
        headers: mediaHeaders(response.headers),
      });
    }

    const validator = request.headers.get("If-Range");
    const cache = cacheStore();
    const key = cacheKey(url);
    if (cache) {
      const hit = await fromCache(cache, key, request);
      if (hit) return hit;
    }

    // Ask Pages for the complete file: no Range or conditional headers, so a
    // 304 or partial answer can never be cached or sliced as the whole file.
    // The client's preconditions are evaluated below against that file.
    const headers = new Headers(request.headers);
    for (const name of [
      "Range",
      "If-Range",
      "If-None-Match",
      "If-Modified-Since",
      "If-Match",
      "If-Unmodified-Since",
    ])
      headers.delete(name);
    const asset = await env.ASSETS.fetch(
      new Request(request.url, { method: "GET", headers }),
    );
    if (asset.status !== 200 || asset.headers.has("Content-Range"))
      return asset;
    const failed = precondition(request, asset.headers);
    if (failed) {
      await asset.body?.cancel();
      return preconditionResponse(failed, asset.headers, "MISS");
    }
    if (!ifRangeMatches(validator, asset.headers)) return asset;
    const declared = asset.headers.get("Content-Length");
    // Refuse to buffer more than the bundle cap; the whole file is valid HTTP.
    if (declared !== null && Number(declared) > AUDIO_MAX_BYTES) return asset;

    // The bundle builder caps files at 8 MiB. Read the Pages asset internally
    // once; the app never downloads a Blob.
    const body = await asset.arrayBuffer();
    const length = body.byteLength;
    if (
      length > AUDIO_MAX_BYTES ||
      (declared !== null && Number(declared) !== length)
    )
      return new Response("Audio file is unavailable.", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });

    if (cache && length > 0) {
      const complete = mediaHeaders(asset.headers);
      complete.set("Content-Length", String(length));
      const put = cache
        .put(
          key,
          new Response(body.slice(0), { status: 200, headers: complete }),
        )
        .catch(() => {});
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put);
      else await put;
    }

    const bounds = resolveRange(range, length);
    if (!bounds) return unsatisfiable(asset.headers, length, "MISS");
    return partial(
      asset.headers,
      body.slice(bounds.start, bounds.end + 1),
      bounds.start,
      bounds.end,
      length,
      "MISS",
    );
  },
};
