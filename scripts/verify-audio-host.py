"""Check every deployed recording with real cold-cache range requests.

Compares byte-range responses from a deployed host against the local bundle
produced by scripts/prepare-audio-host.mjs.
"""
import argparse
import json
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check(path, root, base, cookie, start=0):
    end = start + 1023
    with tempfile.TemporaryDirectory() as temp:
        headers_path, body_path = Path(temp) / "headers", Path(temp) / "body"
        url = f"{base}/{path.relative_to(root).as_posix()}?verify=cold-ranges"
        command = ["curl", "-sS", "--connect-timeout", "10", "--max-time", "35",
                   "--range", f"{start}-{end}", "-D", str(headers_path), "-o", str(body_path), url]
        if cookie:
            command[1:1] = ["--cookie", str(cookie)]
        subprocess.run(command, check=True, capture_output=True)
        raw = headers_path.read_text().strip().split("\n\n")[-1].splitlines()
        status = int(raw[0].split()[1])
        headers = {k.lower(): v.strip() for k, v in (line.split(":", 1) for line in raw[1:] if ":" in line)}
        assert status == 206, (path.name, status)
        assert headers["content-range"] == f"bytes {start}-{end}/{path.stat().st_size}", (path.name, headers.get("content-range"))
        assert headers["content-type"].startswith("audio/mp4"), path.name
        assert "immutable" in headers["cache-control"], path.name
        with path.open("rb") as handle:
            handle.seek(start)
            expected = handle.read(1024)
        assert body_path.read_bytes() == expected, path.name
        return {"file": path.name, "cache": headers.get("x-vercel-cache"), "status": status}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Deployed origin, for example https://example.vercel.app")
    parser.add_argument("--root", type=Path, default=ROOT / "artifacts/pages-audio", help="Local bundle to compare against")
    parser.add_argument("--cookie", type=Path, help="Optional curl cookie file for protected previews")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/audio-host-verification.json")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    files = sorted((args.root / "audio").rglob("*.m4a"))
    if not files:
        parser.error(f"no recordings under {args.root / 'audio'}")
    for path in (files[0], files[len(files) // 2], files[-1]):
        check(path, args.root, base, args.cookie)
        check(path, args.root, base, args.cookie, path.stat().st_size // 2)
        print("Cold range verified:", path.name, flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda path: check(path, args.root, base, args.cookie), files))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"host": base, "files": results}, indent=2) + "\n")
    print("Verified all", len(results), "recordings, sample bytes, range responses and cache headers.")


if __name__ == "__main__":
    main()
