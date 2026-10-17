"""Playlist and clip planning for chronological readings (no ffmpeg, no audio)."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("build_reading_audio", ROOT / "scripts/build-reading-audio.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

VERSES = [{"number": n, "text": f"v{n}"} for n in range(1, 6)]
READING = {"usfm": "GEN", "book": "التكوين", "chapter": 2, "passages": [{"verses": VERSES}]}
FULL = {"src": "/audio/chapters/assets/GEN-2-aa.m4a", "duration": 60.0, "alignment": "chapter",
        "cues": [], "announcements": []}


def alignment(scores=(0.9,) * 5):
    return {"duration": 60.0, "verses": [
        {"verse": n, "start": 10.0 * n, "end": 10.0 * n + 8, "score": scores[n - 1]} for n in range(1, 6)]}


class Planning(unittest.TestCase):
    def test_bounds_stay_between_neighbours(self):
        start, end = build.clip_bounds(alignment()["verses"], 2, 3, 60.0)
        self.assertEqual((start, end), (19.75, 38.25))  # PAD inside the 2 s gaps' midpoints
        start, end = build.clip_bounds(alignment()["verses"], 1, 5, 60.0)
        self.assertEqual((start, end), (9.75, 58.25))
        tight = [{"verse": 1, "start": 1.0, "end": 2.0, "score": 1}, {"verse": 2, "start": 2.1, "end": 3, "score": 1}]
        self.assertEqual(build.clip_bounds(tight, 1, 1, 9.0), (0.75, 2.05))

    def test_review_blocks_untrusted_cuts(self):
        ok = alignment()
        self.assertIsNone(build.clip_blocker(ok, {}, "GEN-2", 2, 3, 0.3))
        self.assertIn("no verse alignment", build.clip_blocker(None, {}, "GEN-2", 2, 3, 0.3))
        # A neighbour with a bad score fixes the cut point, so it blocks too.
        low = alignment((0.9, 0.1, 0.9, 0.9, 0.9))
        self.assertIn("GEN-2:2", build.clip_blocker(low, {}, "GEN-2", 3, 4, 0.3))
        self.assertIsNone(build.clip_blocker(low, {}, "GEN-2", 4, 5, 0.3))
        self.assertIn("flagged", build.clip_blocker(ok, {"GEN-2": {5}}, "GEN-2", 3, 4, 0.3))
        self.assertIsNone(build.clip_blocker(ok, {"GEN-2": {1}}, "GEN-2", 3, 4, 0.3))

    def test_flags_from_summaries(self):
        flags = build.flagged_verses([{"flags": {"GEN-2": {"flags": {"3": ["low-score"]}}}}, {}])
        self.assertEqual(flags, {"GEN-2": {3}})

    def test_names_are_deterministic_and_input_sensitive(self):
        a = build.clip_name("GEN", 2, 2, 3, "s", "t", 1.0, 2.0)
        self.assertEqual(a, build.clip_name("GEN", 2, 2, 3, "s", "t", 1.0, 2.0))
        self.assertRegex(a, r"^GEN-2-2-3-[0-9a-f]{20}\.m4a$")
        for other in [("s2", "t", 1.0, 2.0), ("s", "t2", 1.0, 2.0), ("s", "t", 1.5, 2.0), ("s", "t", 1.0, 2.5)]:
            self.assertNotEqual(a, build.clip_name("GEN", 2, 2, 3, *other))

    def make(self, passages, **over):
        encoded = []
        args = dict(
            readings={"bible:GEN:2": READING}, chapter_manifests={"bible:GEN:2": FULL},
            alignments={"GEN-2": alignment()}, flagged={}, originals={("GEN", 2): Path("src.mp3")},
            records={"bible:GEN:2": {"sourceHash": "h"}}, output=Path(tempfile.gettempdir()) / "clips-test",
            min_score=0.3, encode=lambda source, start, end, target: encoded.append((target.name, start, end)),
            measure=lambda target: 20.0)
        args.update(over)
        definition = {"id": "x", "passages": passages}
        return build.build_reading("OT", definition, args.pop("readings"), args.pop("chapter_manifests"),
                                   args.pop("alignments"), args.pop("flagged"), args.pop("originals"),
                                   args.pop("records"), args.pop("output"), args.pop("min_score"),
                                   args.pop("encode"), args.pop("measure")), encoded

    def test_whole_chapter_reuses_the_published_recording(self):
        (manifest, reason), encoded = self.make([{"usfm": "GEN", "chapter": 2, "from": 1, "to": 5}])
        self.assertIsNone(reason)
        self.assertEqual(encoded, [])
        self.assertEqual(manifest["entries"][0]["src"], FULL["src"])
        self.assertEqual(manifest["duration"], 60.0)
        self.assertEqual(manifest["identity"], "chrono:OT:x")

    def test_partial_chapter_is_a_verse_timed_clip_from_the_original(self):
        (manifest, reason), encoded = self.make([{"usfm": "GEN", "chapter": 2, "from": 2, "to": 3}])
        self.assertIsNone(reason)
        self.assertEqual(len(encoded), 1)
        self.assertEqual(encoded[0][1:], (19.75, 38.25))
        entry = manifest["entries"][0]
        self.assertRegex(entry["src"], r"^/audio/clips/GEN-2-2-3-[0-9a-f]{20}\.m4a$")
        self.assertEqual(entry["alignment"], "verse")
        self.assertEqual([c["verse"] for c in entry["cues"]], [2, 3])
        self.assertEqual(entry["cues"][0]["start"], 0.25)

    def test_repeated_ranges_share_one_file(self):
        passage = {"usfm": "GEN", "chapter": 2, "from": 2, "to": 3}
        (manifest, _), encoded = self.make([passage, passage])
        self.assertEqual({e["src"] for e in manifest["entries"]}, {manifest["entries"][0]["src"]})
        self.assertEqual({name for name, *_ in encoded}, {Path(manifest["entries"][0]["src"]).name})

    def test_unreviewed_boundary_blocks_the_reading_and_encodes_nothing_for_it(self):
        flagged = {"GEN-2": {3}}
        (manifest, reason), _ = self.make([{"usfm": "GEN", "chapter": 2, "from": 2, "to": 3}], flagged=flagged)
        self.assertIsNone(manifest)
        self.assertIn("flagged", reason)
        (manifest, reason), _ = self.make([{"usfm": "GEN", "chapter": 2, "from": 2, "to": 3}], alignments={})
        self.assertIn("no verse alignment", reason)
        (manifest, reason), _ = self.make([{"usfm": "GEN", "chapter": 2, "from": 2, "to": 9}])
        self.assertIn("outside", reason)
        (manifest, reason), _ = self.make([{"usfm": "EXO", "chapter": 1, "from": 1, "to": 2}])
        self.assertIn("not a published", reason)


if __name__ == "__main__":
    unittest.main()
