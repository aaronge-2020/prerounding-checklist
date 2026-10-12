#!/usr/bin/env python3
"""Inventory a local approved TIDE2 pack. Never uploads or copies model files."""
import argparse
import hashlib
import json
from pathlib import Path

REPOSITORY = 'stanford-med-hdr/tide2-sentry-clinical-ner'
REQUIRED = ('config.json', 'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_fp16.onnx')

def inventory(directory):
    root = Path(directory).resolve(strict=True)
    result = []
    for name in REQUIRED:
        path = root / name
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
            raise ValueError(f'Missing file or unsafe path: {name}')
        if not path.stat().st_size:
            raise ValueError(f'Empty file: {name}')
        digest = hashlib.sha256()
        with path.open('rb') as handle:
            first = handle.read(256)
            if first.startswith(b'version https://git-lfs.github.com/spec/v1'):
                raise ValueError(f'Git LFS pointer is not a model artifact: {name}')
            digest.update(first)
            for block in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(block)
        if name.endswith('.json'):
            json.loads(path.read_text())
        result.append({'path': name, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()})
    return {'repository': REPOSITORY, 'hosting': 'Stanford gated repository only',
            'status': 'inventory only; model provenance and inference parity require verification',
            'files': result}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    data = inventory(args.pack)
    # Exclusive creation protects an existing signed/reviewed manifest.
    with args.manifest.open('x') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
    print(f'Inventory written to {args.manifest}. No upload performed.')
