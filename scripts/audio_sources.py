"""Full-Bible source inventory and honest verse alignment validation (no ML import)."""
import gzip
import json
import re
from pathlib import Path

from audio_text import chapter_text_hash, digest


def file_hash(path):
    import hashlib
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def bible_chapters(path):
    """Normalized source from build-bible; yields the exact client transcript shape."""
    source = json.loads(gzip.decompress(Path(path).read_bytes()))
    if source.get('version') != 1 or len(source.get('books', [])) != 66:
        raise ValueError('Expected normalized 66-book Bible source version 1')
    for index, book in enumerate(source['books']):
        for chapter in book['chapters']:
            verses = chapter['verses']
            if [v['number'] for v in verses] != list(range(1, len(verses) + 1)):
                raise ValueError(f"Incomplete transcript: {book['usfm']} {chapter['chapter']}")
            reading = {'mode': 'bible', 'usfm': book['usfm'], 'book': book['name'],
                       'chapter': chapter['chapter'], 'verseCount': len(verses),
                       'passages': [{'book': book['name'], 'chapter': chapter['chapter'],
                                     'start': 1, 'end': len(verses), 'verses': verses}],
                       'structure': chapter['structure']}
            yield index, reading


def source_files(ot, nt, chapters):
    expected = {}
    for index, reading in chapters:
        key = ('A', index + 1, reading['chapter']) if index < 39 else ('B', index - 38, reading['chapter'])
        if key in expected:
            raise ValueError(f'Duplicate canonical source key {key}')
        expected[key] = (reading['usfm'], reading['chapter'])
    actual = {}
    for folder, prefix in ((ot, 'A'), (nt, 'B')):
        for path in Path(folder).rglob('*.mp3'):
            match = re.match(r'([AB])(\d{2})_{2,3}(\d{2,3})_.+\.mp3$', path.name)
            if not match or match[1] != prefix:
                raise ValueError(f'Unexpected source filename: {path.name}')
            key = (match[1], int(match[2]), int(match[3]))
            if key in actual:
                raise ValueError(f'Duplicate source: {path.name}')
            actual[key] = path
    if set(actual) != set(expected):
        raise ValueError(f'Source coverage mismatch: missing {set(expected)-set(actual)}, extra {set(actual)-set(expected)}')
    return {expected[key]: path for key, path in actual.items()}


def verified_alignment(path, reading, source_hash):
    """Return existing exact cues or None; missing timing never implies verse timing."""
    if not Path(path).exists():
        return None
    value = json.loads(Path(path).read_text())
    verses = reading['passages'][0]['verses']
    expected_hash = chapter_text_hash({v['number']: v['text'] for v in verses})
    if value.get('audioHash') != source_hash or value.get('textHash') != expected_hash:
        raise ValueError(f'Stale audio/transcript alignment: {path}')
    if value.get('book') != reading['usfm'] or value.get('chapter') != reading['chapter']:
        raise ValueError(f'Wrong chapter alignment: {path}')
    aligned = value['verses']
    if [v['verse'] for v in aligned] != [v['number'] for v in verses]:
        raise ValueError(f'Incomplete verse alignment: {path}')
    previous = 0
    for verse in aligned:
        if not (previous <= verse['start'] < verse['end'] <= value['duration'] + .1):
            raise ValueError(f'Invalid alignment timestamps: {path}')
        if not (0 <= verse['score'] <= 1):
            raise ValueError(f'Invalid alignment confidence: {path}')
        previous = verse['end']
    return value
