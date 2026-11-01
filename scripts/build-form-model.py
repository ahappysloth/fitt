"""Create Fitt's compact, offline skinned body from the CC0 MakeHuman sources.

Usage: python scripts/build-form-model.py base.obj default.mhskel default_weights.mhw
Source URLs, licensing, and the asset contract are in assets/form-guide/README.md.
"""
import base64
import hashlib
import json
import pathlib
import struct
import sys
from collections import defaultdict

root = pathlib.Path(__file__).resolve().parents[1]
obj_path, rig_path, weights_path = map(pathlib.Path, sys.argv[1:4])
rig = json.loads(rig_path.read_text())
weights = json.loads(weights_path.read_text())
assert rig['license'] == weights['license'] == 'CC0'
vertices, faces = [], []
group = ''
for line in obj_path.read_text().splitlines():
    parts = line.split()
    if not parts:
        continue
    if parts[0] == 'v':
        vertices.append([float(v) * .1 for v in parts[1:4]])
    elif parts[0] == 'g':
        group = parts[1]
    elif parts[0] == 'f' and group in ('body', 'helper-l-eye', 'helper-r-eye'):
        face = [int(v.split('/')[0]) - 1 for v in parts[1:]]
        for index in range(1, len(face) - 1):
            faces.append([face[0], face[index], face[index + 1]])

# Parent-first order matters when converting posed world matrices to local bones.
names = []
def add_bone(name):
    if name in names:
        return
    parent = rig['bones'][name]['parent']
    if parent:
        add_bone(parent)
    names.append(name)
for name in rig['bones']:
    add_bone(name)
assert len(names) < 256
indices = {name: index for index, name in enumerate(names)}
def joint(name):
    source = rig['joints'][name]
    return [round(sum(vertices[v][axis] for v in source) / len(source), 6) for axis in range(3)]
bones = [{
    'name': name,
    'parent': indices.get(rig['bones'][name]['parent'], -1),
    'head': joint(rig['bones'][name]['head']),
    'tail': joint(rig['bones'][name]['tail']),
} for name in names]

influences = defaultdict(list)
for name, entries in weights['weights'].items():
    for vertex, weight in entries:
        if weight > 0:
            influences[vertex].append((indices[name], weight))
used = sorted({v for face in faces for v in face})
lookup = {old: new for new, old in enumerate(used)}
positions, skin_indices, skin_weights = [], [], []
for old in used:
    positions.extend(vertices[old])
    strongest = sorted(influences[old], key=lambda item: item[1], reverse=True)[:4]
    if not strongest:
        strongest = [(indices['head'], 1)]
    total = sum(weight for _, weight in strongest)
    normalized = [round(weight / total * 65535) for _, weight in strongest]
    normalized[0] += 65535 - sum(normalized)
    skin_indices.extend([index for index, _ in strongest] + [0] * (4-len(strongest)))
    skin_weights.extend(normalized + [0] * (4-len(strongest)))

def encode(fmt, values):
    return base64.b64encode(struct.pack('<' + fmt * len(values), *values)).decode()
result = {
    'version': 1,
    'source': 'MakeHuman hm08, default rig110 / CC0',
    'sourcesSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (obj_path, rig_path, weights_path)},
    'vertices': len(used),
    'triangles': len(faces),
    'bones': bones,
    'positions': encode('f', positions),
    'indices': encode('H', [lookup[v] for face in faces for v in face]),
    'skinIndices': encode('B', skin_indices),
    'skinWeights': encode('H', skin_weights),
}
output = root / 'src/components/form-guide/body-data.json'
output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'{len(used)} vertices, {len(faces)} triangles, {len(bones)} bones; {output.stat().st_size // 1024} KiB')
