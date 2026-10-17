#!/usr/bin/env python3
"""Build version-3 playlists for the chronological readings, with clips.

For every reading definition (public/chronology/<OT|NT>/<id>.json, from the
chronology build) each passage becomes one playlist entry:

- a passage covering a whole chapter reuses that chapter's published
  recording and manifest (src, duration, timing) unchanged;
- a partial chapter becomes a clip cut from the ORIGINAL recording at the
  reviewed verse boundaries (never re-cut from the canonical AAC), encoded
  with the canonical settings. Identical ranges share one deduplicated file.

A clip needs verse alignment whose cut verses (first, last and their
neighbours, which fix the cut points) pass the machine review: complete
hashes, score >= --min-score and no flag in the review summaries
(scripts/review-audio-alignments.py). Anything else blocks the whole reading,
which is then listed with its reason and not published: no timing is
invented. Machine review is not listening review; see docs/audio.md.

Outputs (resume-safe, identical inputs reproduce identical bytes/names):
  data/audio/readings/<OT|NT>/<id>.json   v3 playlist manifests
  data/audio/reading-catalog.json         readings with a complete playlist
  <output>/audio/clips/*.m4a              clips (outside Git; a media root)
  artifacts/audio-work/reading-audio-report.json  blocked readings and counts
Stale manifests of readings no longer built are removed. Needs ffmpeg/ffprobe
only when a clip is missing.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from audio_sources import bible_chapters, file_hash, source_files
from audio_text import compact, digest, reading_hash

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = {'codec': 'aac', 'bitrate': '48k', 'rate': 24000, 'channels': 1, 'faststart': True}
TAG = 'chapter-clip-v1'
PAD = 0.25
MAX_BYTES = 8 * 1024 * 1024


def flagged_verses(summaries):
    """{'GEN-5': {6, ...}} from review summaries; chapters with notes only are fine."""
    flagged = {}
    for summary in summaries:
        for key, item in summary.get('flags', {}).items():
            flagged.setdefault(key, set()).update(int(v) for v in item.get('flags', {}))
    return flagged


def clip_bounds(verses, first, last, duration):
    """(start, end) for verses first..last of an aligned chapter, in source seconds.

    The cut sits PAD seconds outside the verses, but never past the midpoint of the
    silence shared with the neighbouring verse, so neither neighbour is audible.
    """
    by_number = {v['verse']: v for v in verses}
    a, b = by_number[first], by_number[last]
    start = max(0.0, a['start'] - PAD)
    if first - 1 in by_number:
        start = max(start, (by_number[first - 1]['end'] + a['start']) / 2)
    end = min(duration, b['end'] + PAD)
    if last + 1 in by_number:
        end = min(end, (b['end'] + by_number[last + 1]['start']) / 2)
    if not 0 <= start < a['start'] + 1e-9 or end <= b['end'] - 1e-9 or end <= start:
        raise ValueError('degenerate clip bounds')
    return round(start, 3), round(end, 3)


def clip_blocker(alignment, flagged, key, first, last, min_score):
    """Why a clip of verses first..last cannot be trusted, or None."""
    if alignment is None:
        return f'{key}: no verse alignment'
    scores = {v['verse']: v['score'] for v in alignment['verses']}
    for number in range(first - 1, last + 2):
        if number not in scores:
            continue
        if scores[number] < min_score:
            return f'{key}:{number} score {scores[number]:.3f} < {min_score}'
        if number in flagged.get(key, ()):
            return f'{key}:{number} flagged by review'
    return None


def clip_name(code, chapter, first, last, source_hash, text_hash, start, end):
    fingerprint = digest(compact([source_hash, text_hash, SETTINGS, start, end, TAG]).encode())[:20]
    return f'{code}-{chapter}-{first}-{last}-{fingerprint}.m4a'


def clip_entry(passage, alignment, bounds, name, duration):
    start, end = bounds
    cues = []
    for verse in alignment['verses']:
        if passage['from'] <= verse['verse'] <= passage['to']:
            cues.append({'verse': verse['verse'], 'start': round(max(0.0, verse['start'] - start), 3),
                         'end': round(min(duration, verse['end'] - start), 3)})
    return cues


def encode_clip(source, start, end, target):
    if target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='bible-clip-') as tmp:
        temp = Path(tmp) / target.name
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-ss', f'{start:.3f}', '-to', f'{end:.3f}',
                        '-i', str(source), '-map', '0:a:0', '-c:a', 'aac', '-b:a', SETTINGS['bitrate'],
                        '-ac', '1', '-ar', str(SETTINGS['rate']), '-movflags', '+faststart', '-map_metadata', '-1',
                        str(temp)], check=True)
        target.write_bytes(temp.read_bytes())
    if target.stat().st_size > MAX_BYTES:
        target.unlink()
        raise ValueError(f'{target.name} exceeds {MAX_BYTES} bytes')


def probe_duration(path):
    return round(float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
         str(path)])), 3)


def build_reading(testament, definition, readings, chapter_manifests, alignments, flagged, originals,
                  records, output, min_score, encode=encode_clip, measure=probe_duration):
    """(playlist manifest | None, blocker reason | None)."""
    entries, passages = [], []
    for index, passage in enumerate(definition['passages']):
        code, chapter, first, last = passage['usfm'], passage['chapter'], passage['from'], passage['to']
        identity = f'bible:{code}:{chapter}'
        reading = readings.get(identity)
        if reading is None or identity not in chapter_manifests:
            return None, f'{identity}: not a published canonical chapter'
        verses = reading['passages'][0]['verses']
        if not 1 <= first <= last <= len(verses):
            return None, f'{identity}:{first}-{last} outside the chapter'
        passages.append({'book': reading['book'], 'chapter': chapter, 'start': first, 'end': last,
                         'verses': verses[first - 1:last]})
        manifest = chapter_manifests[identity]
        if first == 1 and last == len(verses):
            entries.append({
                'passage': index, 'book': code, 'chapter': chapter, 'from': first, 'to': last,
                'src': manifest['src'], 'duration': manifest['duration'], 'alignment': manifest['alignment'],
                'cues': [{'verse': c['verse'], 'start': c['start'], 'end': c['end']} for c in manifest['cues']],
                'announcements': [{'start': a['start'], 'end': a['end'], 'reference': a['reference'],
                                   'kind': 'source'} for a in manifest['announcements']]})
            continue
        key = f'{code}-{chapter}'
        alignment = alignments.get(key)
        reason = clip_blocker(alignment, flagged, key, first, last, min_score)
        if reason:
            return None, reason
        try:
            start, end = clip_bounds(alignment['verses'], first, last, alignment['duration'])
        except ValueError as error:
            return None, f'{key}:{first}-{last}: {error}'
        record = records[identity]
        name = clip_name(code, chapter, first, last, record['sourceHash'], digest(compact(verses).encode()),
                         start, end)
        target = output / 'audio/clips' / name
        encode(originals[(code, chapter)], start, end, target)
        duration = measure(target)
        entries.append({
            'passage': index, 'book': code, 'chapter': chapter, 'from': first, 'to': last,
            'src': f'/audio/clips/{name}', 'duration': duration, 'alignment': 'verse',
            'cues': clip_entry(passage, alignment, (start, end), name, duration), 'announcements': []})
    transcript = {'passages': passages}
    return {'version': 3, 'identity': f"chrono:{testament}:{definition['id']}",
            'readingHash': reading_hash(transcript),
            'duration': round(sum(e['duration'] for e in entries), 3), 'entries': entries}, None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--chronology', type=Path, required=True, help='Folder with OT.json, NT.json, OT/, NT/')
    parser.add_argument('--ot', type=Path, required=True, help='Original Old Testament MP3 folder')
    parser.add_argument('--nt', type=Path, required=True, help='Original New Testament MP3 folder')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/audio-work/reading-media',
                        help='Media root receiving audio/clips/ (use with AUDIO_MEDIA_ROOT)')
    parser.add_argument('--bible', type=Path, default=ROOT / 'data/bible/source.json.gz')
    parser.add_argument('--alignments', type=Path, nargs='+',
                        default=[ROOT / 'data/audio/alignments', ROOT / 'data/audio/alignments/ot'])
    parser.add_argument('--review', type=Path, nargs='*',
                        default=[ROOT / 'data/audio/review/ot.json', ROOT / 'data/audio/review/nt.json'])
    parser.add_argument('--min-score', type=float, default=0.30)
    parser.add_argument('--limit', type=int, help='Build only the first N readings per testament (pilot)')
    args = parser.parse_args(argv)
    chapters = list(bible_chapters(args.bible))
    readings = {f"bible:{r['usfm']}:{r['chapter']}": r for _, r in chapters}
    originals = source_files(args.ot, args.nt, chapters)
    sources = json.loads((ROOT / 'data/audio/canonical-sources.json').read_text())
    records = {r['identity']: r for r in sources['chapters']}
    chapter_manifests = {}
    for identity in json.loads((ROOT / 'data/audio/chapter-catalog.json').read_text())['chapters']:
        _, code, number = identity.split(':')
        chapter_manifests[identity] = json.loads((ROOT / f'data/audio/chapters/{code}/{number}.json').read_text())
    alignments = {}
    for folder in args.alignments:
        for path in sorted(folder.glob('*.json')):
            data = json.loads(path.read_text())
            identity = f"bible:{data['book']}:{data['chapter']}"
            record = records.get(identity)
            if record and data.get('audioHash') == record['sourceHash'] and path.stem == f"{data['book']}-{data['chapter']}":
                alignments[path.stem] = data
    flagged = flagged_verses([json.loads(p.read_text()) for p in args.review if p.exists()])
    published, blocked, built = [], {}, {'OT': 0, 'NT': 0}
    manifests_out = ROOT / 'data/audio/readings'
    keep = set()
    for testament in ('OT', 'NT'):
        catalog = json.loads((args.chronology / f'{testament}.json').read_text())
        for summary in catalog['readings'][:args.limit]:
            definition = json.loads((args.chronology / testament / f"{summary['id']}.json").read_text())
            manifest, reason = build_reading(testament, definition, readings, chapter_manifests, alignments,
                                             flagged, originals, records, args.output, args.min_score)
            key = f"chrono:{testament}:{summary['id']}"
            if manifest is None:
                blocked[key] = reason
                continue
            path = manifests_out / testament / f"{summary['id']}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(compact(manifest) + '\n')
            keep.add(path)
            published.append(key)
            built[testament] += 1
    if not args.limit:
        for path in manifests_out.rglob('*.json'):
            if path not in keep:
                path.unlink()
    (ROOT / 'data/audio/reading-catalog.json').write_text(
        json.dumps({'version': 1, 'readings': published}, indent=2) + '\n')
    clips = sorted((args.output / 'audio/clips').glob('*.m4a')) if (args.output / 'audio/clips').exists() else []
    report = ROOT / 'artifacts/audio-work/reading-audio-report.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({'built': built, 'blocked': blocked, 'clips': len(clips),
                                  'clipBytes': sum(p.stat().st_size for p in clips)}, ensure_ascii=False, indent=1) + '\n')
    print(f'Built {built} playlists; {len(blocked)} blocked on review/alignment; {len(clips)} clips.')


if __name__ == '__main__':
    sys.exit(main())
