"""Materialize the reviewed, checksum-locked source delta on a review branch."""
from pathlib import Path
import base64
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {
    'README.md', 'company-actions.js', 'company-play.js', 'company-world.js',
    'company.css', 'docs/interaction-review.md', 'engine.js', 'index.html',
    'logistics.js', 'network-ui.js', 'sw.js', 'tests/browser_e2e.py',
    'tests/company-capacity.test.cjs', 'tests/company.test.cjs',
    'tests/interactivity.test.cjs', 'tests/offline.test.cjs', 'ui.js',
}
parts = sorted((ROOT / '.review').glob('part*.b64'))
assert len(parts) == 4, 'Missing review payload part'
raw = gzip.decompress(base64.b64decode(''.join(p.read_text().strip() for p in parts), validate=True))
assert hashlib.sha256(raw).hexdigest() == '213898c3bdbf2f6d5d4bd79f110122a087b5f9a75dc30b08120ff26f15d87854', 'Payload checksum differs'
data = json.loads(raw)['files']
assert set(data) == ALLOWED, 'Unexpected file set'
prepared = []
for name, change in data.items():
    target = ROOT / name
    assert target.resolve().is_relative_to(ROOT), 'Invalid target'
    if change['before'] is None:
        assert not target.exists(), f'{name} already exists'
        text = change['create']
    else:
        old = target.read_bytes()
        assert hashlib.sha256(old).hexdigest() == change['before'], f'{name}: baseline changed'
        text = old.decode('utf-8')
        for offset, length, replacement in reversed(change['edits']):
            assert 0 <= offset <= len(text) and 0 <= length <= len(text) - offset
            text = text[:offset] + replacement + text[offset + length:]
    content = text.encode('utf-8')
    assert hashlib.sha256(content).hexdigest() == change['after'], f'{name}: output checksum differs'
    prepared.append((target, content))
# Validate the entire payload before touching any source file.
for target, content in prepared:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    print(f'{target.relative_to(ROOT)} {hashlib.sha256(content).hexdigest()}')
