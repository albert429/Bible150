import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "../hosting/cloudflare-audio/worker.js";

const bytes = new Uint8Array(256).map((_, i) => i);
const PATH = "/audio/days/001-abc.m4a";
const LAST_MODIFIED = "Wed, 14 Oct 2026 10:00:00 GMT";

type Host = ReturnType<typeof host>;
function host(
  status = 200,
  body: Uint8Array<ArrayBuffer> | null = bytes,
  extra: Record<string, string> = {},
) {
  const calls: Request[] = [];
  let reads = 0;
  return {
    calls,
    get reads() {
      return reads;
    },
    ASSETS: {
      fetch: async (request: Request) => {
        calls.push(request);
        // Simulate Pages ignoring ranges. This is the failure found in deployment.
        const response = new Response(request.method === "HEAD" ? null : body, {
          status,
          headers: {
            "Content-Type": "audio/mp4",
            ETag: '"original"',
            "Last-Modified": LAST_MODIFIED,
            ...(body ? { "Content-Length": String(body.byteLength) } : {}),
            ...extra,
          },
        });
        const read = response.arrayBuffer.bind(response);
        response.arrayBuffer = () => {
          reads += 1;
          return read();
        };
        return response;
      },
    },
  };
}

/**
 * Cloudflare's Cache API as documented: put() refuses 206, match() with a
 * Range answers 206/416 from a complete response that has a Content-Length.
 */
class FakeCache {
  store = new Map<
    string,
    { headers: Headers; body: Uint8Array<ArrayBuffer> }
  >();
  puts: { url: string; status: number; length: number; range: boolean }[] = [];
  matches = 0;
  failMatch = false;
  failPut = false;
  async match(request: Request) {
    this.matches += 1;
    if (this.failMatch) throw new Error("cache unavailable");
    const entry = this.store.get(request.url);
    if (!entry) return undefined;
    const headers = new Headers(entry.headers);
    const range = /^bytes=(\d*)-(\d*)$/.exec(
      request.headers.get("Range") || "",
    );
    const length = entry.body.byteLength;
    if (!range || !headers.has("Content-Length"))
      return new Response(entry.body, { status: 200, headers });
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, length - Number(range[2]));
    const end =
      range[1] && range[2]
        ? Math.min(Number(range[2]), length - 1)
        : length - 1;
    if (start >= length || start > end || (!range[1] && range[2] === "0")) {
      headers.set("Content-Range", `bytes */${length}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${length}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(entry.body.slice(start, end + 1), {
      status: 206,
      headers,
    });
  }
  async put(request: Request, response: Response) {
    this.puts.push({
      url: request.url,
      status: response.status,
      length: Number(response.headers.get("Content-Length")),
      range: request.headers.has("Range"),
    });
    if (this.failPut) throw new Error("quota");
    if (response.status === 206)
      throw new TypeError("Cannot cache response to a range request (206)");
    this.store.set(request.url, {
      headers: new Headers(response.headers),
      body: new Uint8Array(await response.arrayBuffer()),
    });
  }
}

function useCache() {
  const cache = new FakeCache();
  (globalThis as { caches?: unknown }).caches = { default: cache };
  return cache;
}
afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
});

function context() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
  };
}
function request(
  headers: Record<string, string> = {},
  method = "GET",
  path = PATH,
) {
  return new Request(`https://audio.example${path}`, { headers, method });
}
async function serve(
  headers: Record<string, string>,
  env: Host,
  ctx = context(),
  path = PATH,
) {
  const response = await worker.fetch(request(headers, "GET", path), env, ctx);
  await Promise.all(ctx.pending);
  return response;
}
async function assertRange(response: Response, start: number, end: number) {
  assert.equal(response.status, 206);
  assert.equal(
    response.headers.get("Content-Range"),
    `bytes ${start}-${end}/256`,
  );
  assert.equal(response.headers.get("Content-Length"), String(end - start + 1));
  assert.equal(response.headers.get("Content-Type"), "audio/mp4");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), "no-store");
  assert.match(response.headers.get("Cache-Control")!, /immutable/);
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    bytes.slice(start, end + 1),
  );
}

const RANGES = [
  ["bytes=0-1", 0, 1],
  ["bytes=100-109", 100, 109],
  ["bytes=250-", 250, 255],
  ["bytes=-3", 253, 255],
  ["bytes=250-999", 250, 255],
  ["bytes=-999", 0, 255],
] as const;

test("Audio host serves byte-exact cold ranges, Safari probes, suffixes and open ends", async () => {
  for (const [range, start, end] of RANGES) {
    const response = await serve({ Range: range }, host());
    await assertRange(response, start, end);
  }
});

test("A cold miss reads the complete asset once and caches it as a 200, never a 206", async () => {
  const cache = useCache();
  const env = host();
  const response = await serve(
    { Range: "bytes=10-19", "If-None-Match": '"x"' },
    env,
  );
  await assertRange(response, 10, 19);
  assert.equal(response.headers.get("X-Audio-Cache"), "MISS");
  assert.equal(env.calls.length, 1);
  assert.equal(env.reads, 1);
  // Pages is asked for the whole file: no range or conditional headers.
  for (const name of ["Range", "If-Range", "If-None-Match"])
    assert.equal(env.calls[0].headers.get(name), null, name);
  assert.deepEqual(cache.puts, [
    {
      url: `https://audio.example${PATH}`,
      status: 200,
      length: 256,
      range: false,
    },
  ]);
  const stored = cache.store.get(`https://audio.example${PATH}`)!;
  assert.deepEqual(stored.body, bytes);
  assert.match(stored.headers.get("Cache-Control")!, /immutable/);
  assert.equal(stored.headers.get("Content-Range"), null);
  assert.equal(stored.headers.get("ETag"), '"original"');
});

test("Warm ranges come from the cache without refetching or buffering the asset", async () => {
  const cache = useCache();
  const env = host();
  await serve({ Range: "bytes=0-1" }, env);
  assert.equal(env.calls.length, 1);
  for (const [range, start, end] of RANGES) {
    const response = await serve({ Range: range }, env);
    await assertRange(response, start, end);
    assert.equal(response.headers.get("X-Audio-Cache"), "HIT");
  }
  // A cache-busting query string shares the complete file's cache key.
  await assertRange(
    await serve({ Range: "bytes=5-6" }, env, context(), `${PATH}?verify=1`),
    5,
    6,
  );
  assert.equal(env.calls.length, 1, "asset fetched only on the cold miss");
  assert.equal(env.reads, 1, "asset body read only on the cold miss");
  assert.equal(cache.puts.length, 1);
  // Unsatisfiable ranges are answered from the cached length, uncached.
  const past = await serve({ Range: "bytes=256-" }, env);
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("Content-Range"), "bytes */256");
  assert.equal(past.headers.get("Cache-Control"), "no-store");
  assert.equal(past.headers.get("X-Audio-Cache"), "HIT");
  assert.equal(env.calls.length, 1);
});

test("A cached file never answers a different path", async () => {
  const cache = useCache();
  const env = host();
  await serve({ Range: "bytes=0-1" }, env);
  await serve(
    { Range: "bytes=0-1" },
    env,
    context(),
    "/audio/days/002-abc.m4a",
  );
  assert.equal(env.calls.length, 2);
  assert.equal(cache.store.size, 2);
});

test("If-Range: matching validators keep the range; changed or weak ones get the whole file", async () => {
  for (const warm of [false, true]) {
    const cache = useCache();
    const env = host();
    if (warm) await serve({ Range: "bytes=0-1" }, env);
    const calls = env.calls.length;
    await assertRange(
      await serve({ Range: "bytes=4-7", "If-Range": '"original"' }, env),
      4,
      7,
    );
    await assertRange(
      await serve({ Range: "bytes=4-7", "If-Range": LAST_MODIFIED }, env),
      4,
      7,
    );
    if (warm) assert.equal(env.calls.length, calls, "validated from cache");
    for (const validator of [
      '"other"',
      'W/"original"',
      "Thu, 01 Jan 2026 00:00:00 GMT",
    ]) {
      const response = await serve(
        { Range: "bytes=4-7", "If-Range": validator },
        env,
      );
      assert.equal(response.status, 200, validator);
      assert.equal(response.headers.get("Content-Range"), null);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    }
    assert.ok(
      cache.puts.every((put) => put.status === 200 && put.length === 256),
    );
  }
});

test("Partial or inconsistent upstream answers are passed through and never cached", async () => {
  const cache = useCache();
  // Pages (or a proxy) answering with a partial body must not become the file.
  const partial = host(206, bytes.slice(0, 2), {
    "Content-Range": "bytes 0-1/256",
  });
  const first = await serve({ Range: "bytes=0-1" }, partial);
  assert.equal(first.status, 206);
  assert.equal(partial.reads, 0);
  const labelled = host(200, bytes.slice(0, 2), {
    "Content-Range": "bytes 0-1/256",
  });
  assert.equal((await serve({ Range: "bytes=0-1" }, labelled)).status, 200);
  assert.equal(cache.puts.length, 0);
  // A body shorter than its declared length is an error, not a cached file.
  const short = host(200, bytes, { "Content-Length": "300" });
  const response = await serve({ Range: "bytes=0-1" }, short);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(cache.puts.length, 0);
  // A stored 200 without a length cannot be ranged by the cache: refetch.
  cache.store.set(`https://audio.example${PATH}`, {
    headers: new Headers({ "Content-Type": "audio/mp4" }),
    body: bytes.slice(0, 2),
  });
  const env = host();
  await assertRange(await serve({ Range: "bytes=100-109" }, env), 100, 109);
  assert.equal(env.calls.length, 1);
});

test("Errors: missing media, cache failures and files over the cap stay correct", async () => {
  const cache = useCache();
  for (const status of [404, 500]) {
    const env = host(status, new TextEncoder().encode("missing"));
    assert.equal((await serve({ Range: "bytes=0-1" }, env)).status, status);
  }
  assert.equal(cache.puts.length, 0);

  cache.failMatch = true;
  cache.failPut = true;
  await assertRange(await serve({ Range: "bytes=1-2" }, host()), 1, 2);
  cache.failMatch = false;
  cache.failPut = false;

  // Over the 8 MiB cap: the complete file streams through, never buffered.
  const big = host(200, bytes, {
    "Content-Length": String(8 * 1024 * 1024 + 1),
  });
  const response = await serve({ Range: "bytes=0-1" }, big);
  assert.equal(response.status, 200);
  assert.equal(big.reads, 0);
  assert.equal(cache.puts.length, 1, "only the earlier successful fill");
  await response.body?.cancel();
});

test("Audio host handles unsatisfiable ranges, malformed ranges, HEAD and non-media paths", async () => {
  for (const cached of [false, true]) {
    if (cached) useCache();
    for (const Range of [
      "bytes=256-",
      "bytes=20-10",
      "bytes=-0",
      "bytes=99999999999999999999-",
    ]) {
      const response = await serve({ Range }, host());
      assert.equal(response.status, 416, Range);
      assert.equal(response.headers.get("Content-Range"), "bytes */256");
      assert.equal(response.headers.get("Content-Length"), "0");
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
  }
  for (const Range of ["garbage", "bytes=-", "bytes=0-1,5-8"]) {
    const response = await serve({ Range }, host());
    assert.equal(response.status, 200, Range);
    assert.equal(response.headers.get("Accept-Ranges"), "bytes");
    assert.equal(response.headers.get("Content-Length"), "256");
  }
  const head = await worker.fetch(
    request({ Range: "bytes=0-1" }, "HEAD"),
    host(),
    context(),
  );
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Accept-Ranges"), "bytes");
  assert.match(head.headers.get("Cache-Control")!, /immutable/);
  const whole = await serve({}, host());
  assert.equal(whole.status, 200);
  assert.deepEqual(new Uint8Array(await whole.arrayBuffer()), bytes);
  // Anything outside the immutable media pattern is passed through untouched.
  const env = host();
  const other = await serve(
    { Range: "bytes=0-1" },
    env,
    context(),
    "/index.html",
  );
  assert.equal(other.status, 200);
  assert.equal(other.headers.get("Accept-Ranges"), null);
  assert.equal(env.calls[0].headers.get("Range"), "bytes=0-1");
});
