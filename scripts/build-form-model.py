"""Create Fitt's compact, offline skinned body from the CC0 MakeHuman sources.

Usage: python scripts/build-form-model.py base.obj default.mhskel default_weights.mhw male.target
Source URLs, licensing, and the asset contract are in assets/form-guide/README.md.
"""
import base64
import hashlib
import json
import math
import pathlib
import struct
import sys
from collections import defaultdict

root = pathlib.Path(__file__).resolve().parents[1]
obj_path, rig_path, weights_path = map(pathlib.Path, sys.argv[1:4])
target_path = pathlib.Path(sys.argv[4])
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

# The authored male shape is normalized onto the canonical rig at build time.
# Shared joints, topology and weights let both silhouettes use the same contact-aware
# motion. Scale only along each bone; preserve the authored surface's cross-section.
male_vertices = [point[:] for point in vertices]
target = target_path.read_text()
assert 'explicitly released as CC0' in target
for line in target.splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    index, *delta = line.split()
    for axis in range(3):
        male_vertices[int(index)][axis] += float(delta[axis]) * .1

def sub(a, b):
    return [x-y for x, y in zip(a, b)]
def dot(a, b):
    return sum(x*y for x, y in zip(a, b))
def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def length(a):
    return math.sqrt(dot(a, a))
def normalized(a):
    size = length(a)
    assert size > 1e-8
    return [x/size for x in a]
def male_joint(name):
    source = rig['joints'][name]
    return [sum(male_vertices[v][axis] for v in source) / len(source) for axis in range(3)]

mappings = []
for bone in bones:
    info = rig['bones'][bone['name']]
    origin = male_joint(info['head'])
    source_axis = sub(male_joint(info['tail']), origin)
    dest_axis = sub(bone['tail'], bone['head'])
    source_dir, dest_dir = normalized(source_axis), normalized(dest_axis)
    turn = cross(source_dir, dest_dir)
    cosine = dot(source_dir, dest_dir)
    assert cosine > -.99
    mappings.append((origin, source_dir, turn, cosine, length(dest_axis)/length(source_axis)))

male_positions = []
for index, old in enumerate(used):
    point = [0., 0., 0.]
    for slot in range(4):
        bone_index = skin_indices[index*4+slot]
        weight = skin_weights[index*4+slot] / 65535
        if not weight:
            continue
        origin, direction, turn, cosine, ratio = mappings[bone_index]
        offset = sub(male_vertices[old], origin)
        along = dot(offset, direction)
        offset = [offset[a] + direction[a]*along*(ratio-1) for a in range(3)]
        first = cross(turn, offset)
        second = cross(turn, first)
        for axis in range(3):
            point[axis] += weight * (bones[bone_index]['head'][axis] + offset[axis]
                                    + first[axis] + second[axis]/(1+cosine))
    # Preserve a smoothly blended contact envelope at the palms and knees. Body
    # selection changes the silhouette, not hand placement or mat clearance.
    contact = 0.
    for side in ('L', 'R'):
        knee = bones[indices[f'lowerleg01.{side}']]['head']
        distance = length(sub(vertices[old], knee))
        t = max(0., min(1., (distance-.075)/.085))
        contact = max(contact, 1-t*t*(3-2*t))
    hand_weight = sum(skin_weights[index*4+s]/65535 for s in range(4)
                      if names[skin_indices[index*4+s]].startswith(('wrist', 'metacarpal', 'finger')))
    contact = max(contact, hand_weight)
    male_positions.extend(point[a]*(1-contact) + vertices[old][a]*contact for a in range(3))

variant = {
    'version': 1,
    'source': 'MakeHuman hm08 male shape / CC0, retargeted to Fitt canonical rig',
    'sourcesSha256': {**result['sourcesSha256'], target_path.name: hashlib.sha256(target_path.read_bytes()).hexdigest()},
    'positions': encode('f', male_positions),
}
variant_output = root / 'src/components/form-guide/male-body-data.json'
variant_output.write_text(json.dumps(variant, separators=(',', ':')) + '\n')
print(f'Male surface: {variant_output.stat().st_size // 1024} KiB; shares canonical rig and topology')
