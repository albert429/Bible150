import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../hosting/cloudflare-audio/worker.js";

const bytes = new Uint8Array(256).map((_, i) => i);
function host(status = 200) {
  return {
    ASSETS: {
      fetch: async (request: Request) => {
        // Simulate Pages ignoring ranges. This is the failure found in deployment.
        return new Response(request.method === "HEAD" ? null : bytes, {
          status,
          headers: { "Content-Type": "audio/mp4", ETag: '"original"' },
        });
      },
    },
  };
}
function request(headers: Record<string, string> = {}, method = "GET") {
  return new Request("https://audio.example/audio/days/001-test.m4a", {
    headers,
    method,
  });
}

test("Audio host serves byte-exact cold ranges, Safari probes, suffixes and open ends", async () => {
  for (const [range, start, end] of [
    ["bytes=0-1", 0, 1],
    ["bytes=100-109", 100, 109],
    ["bytes=250-", 250, 255],
    ["bytes=-3", 253, 255],
    ["bytes=250-999", 250, 255],
    ["bytes=-999", 0, 255],
  ] as const) {
    const response = await worker.fetch(request({ Range: range }), host());
    assert.equal(response.status, 206);
    assert.equal(
      response.headers.get("Content-Range"),
      `bytes ${start}-${end}/256`,
    );
    assert.equal(
      response.headers.get("Content-Length"),
      String(end - start + 1),
    );
    assert.equal(response.headers.get("Accept-Ranges"), "bytes");
    assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), "no-store");
    assert.match(response.headers.get("Cache-Control"), /immutable/);
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      bytes.slice(start, end + 1),
    );
  }
});

test("Audio host handles unsatisfiable ranges, validators, HEAD and missing media", async () => {
  for (const Range of [
    "bytes=256-",
    "bytes=20-10",
    "bytes=-0",
    "bytes=99999999999999999999-",
  ]) {
    const response = await worker.fetch(request({ Range }), host());
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), "bytes */256");
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  for (const Range of ["garbage", "bytes=-", "bytes=0-1,5-8"]) {
    assert.equal((await worker.fetch(request({ Range }), host())).status, 200);
  }
  assert.equal(
    (
      await worker.fetch(
        request({ Range: "bytes=0-1", "If-Range": '"other"' }),
        host(),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await worker.fetch(
        request({ Range: "bytes=0-1", "If-Range": '"original"' }),
        host(),
      )
    ).status,
    206,
  );
  assert.equal(
    (await worker.fetch(request({ Range: "bytes=0-1" }, "HEAD"), host()))
      .status,
    200,
  );
  assert.equal(
    (await worker.fetch(request({ Range: "bytes=0-1" }), host(404))).status,
    404,
  );
  assert.equal((await worker.fetch(request(), host())).status, 200);
});
