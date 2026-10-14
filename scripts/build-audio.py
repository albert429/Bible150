#!/usr/bin/env python3
"""Assemble exact daily passages from reviewed chapter alignment JSON.

Requires ffmpeg/ffprobe, but no Python ML dependencies. Sources stay in the
user's folder; generated audio stays out of Git. Re-run after timing corrections.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(value).hexdigest()


def assemble(day, books, chapter_hashes, source, aligned, output):
    transcript = [[p["book"], p["chapter"], p["start"], p["end"],
                   [[v["number"], v["text"]] for v in p["verses"]]] for p in day["passages"]]
    reading_hash = sha(compact(transcript).encode())
    clips, cues, offset = [], [], 0
    for index, passage in enumerate(day["passages"]):
        path = aligned / f"{books[passage['book']]}-{passage['chapter']}.json"
        if not path.exists():
            raise ValueError(f"Day {day['day']}: missing alignment {path.name}")
        chapter = json.loads(path.read_text())
        if chapter["textHash"] != chapter_hashes[(passage["book"], passage["chapter"])]:
            raise ValueError(f"Transcript changed: realign {path.name} before rebuilding")
        file = source / chapter["file"]
        if sha(file.read_bytes()) != chapter["audioHash"]:
            raise ValueError(f"Source changed: {file.name}")
        verses = chapter["verses"]
        selected = [v for v in verses if passage["start"] <= v["verse"] <= passage["end"]]
        if [v["verse"] for v in selected] != [v["number"] for v in passage["verses"]]:
            raise ValueError(f"Incomplete verse coverage: day {day['day']}, passage {index}")
        # Keep short breaths at the edges, without including adjacent speech.
        previous = next((v for v in verses if v["verse"] == passage["start"] - 1), None)
        following = next((v for v in verses if v["verse"] == passage["end"] + 1), None)
        begin = max(selected[0]["start"] - .12, previous["end"] if previous else 0)
        end = min(selected[-1]["end"] + .20, following["start"] if following else chapter["duration"])
        if end <= begin or any(v["end"] <= v["start"] for v in selected):
            raise ValueError(f"Invalid timestamps: {path.name}")
        # Quantize to the output sample grid so concatenation never drifts.
        begin, end = round(begin * 24000) / 24000, round(end * 24000) / 24000
        clips.append({"file": str(file), "start": begin, "end": end, "audioHash": chapter["audioHash"]})
        for verse in selected:
            cues.append({"passage": index, "verse": verse["verse"],
                         "start": round(offset + verse["start"] - begin, 3),
                         "end": round(offset + verse["end"] - begin, 3)})
        offset += end - begin
    settings = {"codec": "aac", "bitrate": "48k", "rate": 24000, "channels": 1}
    portable_clips = [{**clip, "file": Path(clip["file"]).name} for clip in clips]
    identity = sha(compact([reading_hash, portable_clips, cues, settings]).encode())[:20]
    name = f"{day['day']:03d}-{identity}.m4a"
    target = output / "days" / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with tempfile.TemporaryDirectory(prefix="bible-audio-") as tmp:
            pcm = Path(tmp) / "day.pcm"
            with pcm.open("wb") as dest:
                for clip in clips:
                    subprocess.run(["ffmpeg", "-v", "error", "-i", clip["file"],
                                    "-ss", str(clip["start"]), "-t", str(clip["end"]-clip["start"]),
                                    "-f", "s16le", "-ar", "24000", "-ac", "1", "pipe:1"], stdout=dest, check=True)
            temp = Path(tmp) / "day.m4a"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "s16le", "-ar", "24000", "-ac", "1",
                            "-i", str(pcm), "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart",
                            "-metadata", f"title=قراءة اليوم {day['day']}",
                            "-metadata", "artist=Faith Comes By Hearing / Hosanna",
                            "-metadata", "copyright=Audio ℗ 2008 Hosanna; text © 1996 Bible Society of Egypt",
                            str(temp)], check=True)
            target.write_bytes(temp.read_bytes())
    duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                              "-of", "default=noprint_wrappers=1:nokey=1", str(target)]))
    for cue in cues:
        if cue["start"] < 0 or cue["end"] > duration + .1:
            raise ValueError(f"Cue exceeds encoded duration: day {day['day']}")
    return {"version": 1, "day": day["day"], "readingHash": reading_hash,
            "src": f"/audio/days/{name}", "duration": duration, "cues": cues}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--aligned", type=Path, default=ROOT / "data/audio/alignments")
    parser.add_argument("--output", type=Path, default=ROOT / "public/audio")
    parser.add_argument("--days", help="Comma-separated days for a pilot; default all 150")
    args = parser.parse_args()
    books = {row[3]: row[0] for row in json.loads((ROOT / "data/books.json").read_text())}
    plan = json.loads((ROOT / "data/plan.json").read_text())
    chapters = {}
    for day in plan:
        for passage in day["passages"]:
            verses = chapters.setdefault((passage["book"], passage["chapter"]), {})
            for verse in passage["verses"]:
                verses[verse["number"]] = verse["text"]
    chapter_hashes = {key: sha(json.dumps(sorted(verses.items()), ensure_ascii=False).encode())
                      for key, verses in chapters.items()}
    manifests = ROOT / "data/audio/manifests"
    manifests.mkdir(parents=True, exist_ok=True)
    for day in plan:
        if args.days and str(day["day"]) not in args.days.split(","):
            continue
        manifest = assemble(day, books, chapter_hashes, args.source, args.aligned, args.output)
        content = compact(manifest) + "\n"
        (manifests / f"{day['day']}.json").write_text(content)
        (args.output / f"{day['day']}.json").write_text(content)
        print(f"Built day {day['day']}: {manifest['duration']:.1f}s", flush=True)
    days = sorted(int(p.stem) for p in manifests.glob("*.json"))
    (ROOT / "data/audio/catalog.json").write_text(json.dumps({"days": days}, indent=2) + "\n")


if __name__ == "__main__":
    main()
