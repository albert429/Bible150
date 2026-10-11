// Pages assets return 200 for Range requests. Supply the single-range responses
// required by native audio seeking, including Safari's initial bytes=0-1 probe.
export default {
  async fetch(request, env) {
    if (request.method !== "GET" || !request.headers.has("Range"))
      return env.ASSETS.fetch(request);

    const headers = new Headers(request.headers);
    headers.delete("Range");
    headers.delete("If-Range");
    headers.delete("If-None-Match");
    headers.delete("If-Modified-Since");
    const asset = await env.ASSETS.fetch(new Request(request, { headers }));
    if (asset.status !== 200) return asset;

    const validator = request.headers.get("If-Range");
    if (validator && validator !== asset.headers.get("ETag")) return asset;

    // Ignore malformed or multipart ranges; a complete 200 is permitted by HTTP.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range"));
    if (!range || (!range[1] && !range[2])) return asset;

    // The bundle builder caps files at 8 MiB; current recordings are under 5 MB.
    // Read the cached Pages asset internally, never download a Blob in the app.
    const body = await asset.arrayBuffer();
    const length = body.byteLength;
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, length - Number(range[2]));
    const end =
      range[1] && range[2]
        ? Math.min(Number(range[2]), length - 1)
        : length - 1;
    const responseHeaders = new Headers(asset.headers);
    responseHeaders.delete("Content-Encoding");
    responseHeaders.set("Accept-Ranges", "bytes");
    // A downstream proxy must not reuse one partial response for another range.
    // Browser caching remains immutable; Pages already caches the full asset.
    responseHeaders.set("Vercel-CDN-Cache-Control", "no-store");
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= length ||
      start > end
    ) {
      responseHeaders.set("Content-Range", `bytes */${length}`);
      responseHeaders.set("Content-Length", "0");
      responseHeaders.set("Cache-Control", "no-store");
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    responseHeaders.set("Content-Type", "audio/mp4");
    responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    responseHeaders.set("Content-Range", `bytes ${start}-${end}/${length}`);
    responseHeaders.set("Content-Length", String(end - start + 1));
    return new Response(body.slice(start, end + 1), {
      status: 206,
      headers: responseHeaders,
    });
  },
};
