"""Create Fitt's compact, offline skinned body from the CC0 MakeHuman sources.

Usage: python scripts/build-form-model.py base.obj default.mhskel default_weights.mhw male.target female-size.target female-firmness.target female-size-firmness.target female-upper-volume.target male-muscle.target
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
chest_target_path = pathlib.Path(sys.argv[5])
firmness_target_path = pathlib.Path(sys.argv[6])
full_firmness_target_path = pathlib.Path(sys.argv[7])
upper_volume_target_path = pathlib.Path(sys.argv[8])
muscle_target_path = pathlib.Path(sys.argv[9])
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
# motion. Scale along coherent anatomical frames and preserve their cross-sections.
def apply_target(path, strength=1., source=None):
    points = [point[:] for point in (vertices if source is None else source)]
    target = path.read_text()
    assert 'explicitly released as CC0' in target
    for line in target.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        index, *delta = line.split()
        for axis in range(3):
            points[int(index)][axis] += float(delta[axis]) * .1 * strength
    return points

def smoothstep(start, end, value):
    t = max(0., min(1., (value-start)/(end-start)))
    return t*t*(3-2*t)

# Keep masculine facial proportions, but bring their exaggerated brow/jaw and
# low skull back toward the same base sculpt used by the female. Apply the blend
# to the entire source head (including eyes and joint helpers) before retargeting.
# This preserves local features and the single coherent anatomical head frame.
male_head_strength = .55
male_muscle_strength = .40
male_vertices = apply_target(target_path)
for index, point in enumerate(male_vertices):
    strength = 1-(1-male_head_strength)*smoothstep(.54, .66, vertices[index][1])
    male_vertices[index] = [base+(value-base)*strength
                            for base, value in zip(vertices[index], point)]
male_vertices = apply_target(muscle_target_path, male_muscle_strength, male_vertices)

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

def frame_mapping(origin, source_end, destination, destination_end):
    source_axis = sub(source_end, origin)
    dest_axis = sub(destination_end, destination)
    source_dir, dest_dir = normalized(source_axis), normalized(dest_axis)
    turn = cross(source_dir, dest_dir)
    cosine = dot(source_dir, dest_dir)
    assert cosine > -.99
    return (origin, destination, source_dir, turn, cosine, length(dest_axis)/length(source_axis))

mappings = []
for bone in bones:
    info = rig['bones'][bone['name']]
    mappings.append(frame_mapping(male_joint(info['head']), male_joint(info['tail']),
                                  bone['head'], bone['tail']))

# Spine subdivisions, clavicles and breast helpers do not move independently in
# the exercise rig. Preserve the male thorax as one anatomical region instead of
# fitting its internal landmarks to the female helper positions. The frame runs
# from the pelvis to the shoulder midpoint, so the limb attachment height stays
# aligned without introducing folds at the ribs or collarbones.
def shoulder_center(source):
    return [(source('upperarm01.L')[axis] + source('upperarm01.R')[axis]) / 2
            for axis in range(3)]
source_head = lambda name: male_joint(rig['bones'][name]['head'])
canonical_head = lambda name: bones[indices[name]]['head']
trunk_index = len(mappings)
mappings.append(frame_mapping(source_head('spine05'), shoulder_center(source_head),
                              canonical_head('spine05'), shoulder_center(canonical_head)))
neck_start = source_head('neck01')[1]
neck_end = source_head('head')[1]

# Facial helper bones describe expressions, not independent anatomical segments.
# Normalizing them separately scales adjacent parts of the male face by 0.58–1.75
# and folds eyelids, lips and the nose into the canonical female landmarks. Move
# the authored skull, jaw, face and eyeballs together in the head frame instead.
# A continuous neck transition blends that frame smoothly into the torso.
retarget_indices = []
for index, bone in enumerate(bones):
    ancestor = index
    while ancestor >= 0 and names[ancestor] != 'head':
        ancestor = bones[ancestor]['parent']
    if ancestor >= 0:
        retarget_indices.append(indices['head'])
    elif bone['name'].startswith(('spine', 'neck', 'breast.', 'clavicle.')):
        retarget_indices.append(trunk_index)
    else:
        retarget_indices.append(index)

def mapped_point(point, bone_index):
    origin, destination, direction, turn, cosine, ratio = mappings[bone_index]
    offset = sub(point, origin)
    along = dot(offset, direction)
    offset = [offset[a] + direction[a]*along*(ratio-1) for a in range(3)]
    first = cross(turn, offset)
    second = cross(turn, first)
    mapped = [destination[a] + offset[a] + first[a] + second[a]/(1+cosine)
              for a in range(3)]
    if bone_index == trunk_index:
        t = max(0., min(1., (point[1]-neck_start)/(neck_end-neck_start)))
        blend = t*t*(3-2*t)
        if blend:
            head = mapped_point(point, indices['head'])
            mapped = [mapped[a]*(1-blend) + head[a]*blend for a in range(3)]
    return mapped

male_positions = []
for index, old in enumerate(used):
    point = [0., 0., 0.]
    for slot in range(4):
        bone_index = retarget_indices[skin_indices[index*4+slot]]
        weight = skin_weights[index*4+slot] / 65535
        if not weight:
            continue
        mapped = mapped_point(male_vertices[old], bone_index)
        for axis in range(3):
            point[axis] += weight * mapped[axis]
    if all(retarget_indices[skin_indices[index*4+s]] == indices['head']
           for s in range(4) if skin_weights[index*4+s]):
        expected = mapped_point(male_vertices[old], indices['head'])
        assert length(sub(point, expected)) < 1e-12, 'Head surface must retain one coherent frame'
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
    'retargeting': 'Coherent pelvis-to-shoulder trunk frame and head frame, smoothly blended neck; weighted limb frames',
    'maleHeadTargetStrength': male_head_strength,
    'maleMuscleTargetStrength': male_muscle_strength,
    'sourcesSha256': {**result['sourcesSha256'], **{
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (target_path, muscle_target_path)}},
    'positions': encode('f', male_positions),
}
variant_output = root / 'src/components/form-guide/male-body-data.json'
variant_output.write_text(json.dumps(variant, indent=2) + '\n')
print(f'Male surface: {variant_output.stat().st_size // 1024} KiB; shares canonical rig and topology')

# Blend the authored adult size/firmness target grid bilinearly. Firmness rounds
# and lifts the added volume; increasing size alone would produce a longer,
# lower silhouette. The missing average-size/average-firmness corner is the base.
# A restrained upper-volume target fills out the upper curve of the chest.
# This separate surface keeps the canonical rig, contact envelope and masks intact.
chest_strength = .30
firmness_strength = .95
upper_volume_strength = .50
chest_targets = [
    (chest_target_path, chest_strength * (1-firmness_strength)),
    (firmness_target_path, (1-chest_strength) * firmness_strength),
    (full_firmness_target_path, chest_strength * firmness_strength),
    (upper_volume_target_path, upper_volume_strength),
]
female_vertices = vertices
for path, strength in chest_targets:
    female_vertices = apply_target(path, strength, female_vertices)

# The low-resolution chest's lower contour can read as a hard, scalloped shelf.
# Relax only the authored morph's support, fading to zero at its boundary. This
# follows the existing surface topology and keeps the chest's anatomical shape;
# the unmodified face, limbs and contact surfaces remain byte-identical.
chest_support = {old for old in used if length(sub(female_vertices[old], vertices[old])) > 1e-10}
neighbors = defaultdict(set)
for face in faces:
    for offset, old in enumerate(face):
        neighbors[old].update((face[(offset+1)%3], face[(offset+2)%3]))
neighbors = {old: sorted(adjacent) for old, adjacent in neighbors.items()}
relaxation = {old: .32*min(1., length(sub(female_vertices[old], vertices[old]))/.008)
              for old in chest_support}
for _ in range(3):
    relaxed = [point[:] for point in female_vertices]
    for old, strength in relaxation.items():
        adjacent = neighbors[old]
        for axis in range(3):
            average = sum(female_vertices[other][axis] for other in adjacent)/len(adjacent)
            relaxed[old][axis] += strength*(average-female_vertices[old][axis])
    female_vertices = relaxed
female_positions = [coordinate for old in used for coordinate in female_vertices[old]]
female_variant = {
    'version': 1,
    'source': 'MakeHuman hm08 female surface with authored adult chest size, firmness and upper volume / CC0',
    'sourcesSha256': {**result['sourcesSha256'], **{
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path, _ in chest_targets}},
    'chestTargetStrength': chest_strength,
    'chestFirmnessStrength': firmness_strength,
    'chestUpperVolumeStrength': upper_volume_strength,
    'chestSurfaceRelaxation': {'iterations': 3, 'strength': .32, 'boundaryFadeMeters': .008},
    'positions': encode('f', female_positions),
}
female_output = root / 'src/components/form-guide/female-body-data.json'
female_output.write_text(json.dumps(female_variant, indent=2) + '\n')
print(f'Female surface: {female_output.stat().st_size // 1024} KiB; size {chest_strength:.0%}, firmness {firmness_strength:.0%}, upper volume {upper_volume_strength:.0%}')
