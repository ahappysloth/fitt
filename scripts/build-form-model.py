"""Create Fitt's compact, offline skinned body from the CC0 MakeHuman sources.

Usage: python scripts/build-form-model.py base.obj default.mhskel default_weights.mhw male.target female-size.target female-firmness.target female-size-firmness.target female-upper-volume.target male-muscle.target male-lean-muscle.target female-muscle.target female-lean-muscle.target female-shape.target
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
lean_muscle_target_path = pathlib.Path(sys.argv[10])
female_muscle_target_path = pathlib.Path(sys.argv[11])
female_lean_muscle_target_path = pathlib.Path(sys.argv[12])
female_shape_target_path = pathlib.Path(sys.argv[13])
rig = json.loads(rig_path.read_text())
weights = json.loads(weights_path.read_text())
assert rig['license'] == weights['license'] == 'CC0'
vertices, faces = [], []
eye_vertices = set()
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
        if group.startswith('helper-'):
            eye_vertices.update(face)
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
male_muscle_strength = .85
male_lean_muscle_strength = .15
male_vertices = apply_target(target_path)
for index, point in enumerate(male_vertices):
    strength = 1-(1-male_head_strength)*smoothstep(.54, .66, vertices[index][1])
    male_vertices[index] = [base+(value-base)*strength
                            for base, value in zip(vertices[index], point)]
male_base_vertices = [point[:] for point in male_vertices]
male_vertices = apply_target(muscle_target_path, male_muscle_strength, male_vertices)
male_vertices = apply_target(lean_muscle_target_path, male_lean_muscle_strength, male_vertices)

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

def frame_mapping(origin, source_end, destination, destination_end):
    source_axis = sub(source_end, origin)
    dest_axis = sub(destination_end, destination)
    source_dir, dest_dir = normalized(source_axis), normalized(dest_axis)
    turn = cross(source_dir, dest_dir)
    cosine = dot(source_dir, dest_dir)
    assert cosine > -.99
    return (origin, destination, source_dir, turn, cosine, length(dest_axis)/length(source_axis))

def fit_surface(source_vertices):
    def source_joint(name):
        ids = rig['joints'][name]
        return [sum(source_vertices[v][a] for v in ids)/len(ids) for a in range(3)]
    mappings = []
    for bone in bones:
        info = rig['bones'][bone['name']]
        mappings.append(frame_mapping(source_joint(info['head']), source_joint(info['tail']),
                                      bone['head'], bone['tail']))

    # Spine subdivisions, clavicles and breast helpers do not move independently in
    # the exercise rig. Preserve the authored thorax as one anatomical region instead of
    # fitting its internal landmarks to the female helper positions. The frame runs
    # from the pelvis to the shoulder midpoint, so the limb attachment height stays
    # aligned without introducing folds at the ribs or collarbones.
    def shoulder_center(source):
        return [(source('upperarm01.L')[axis] + source('upperarm01.R')[axis]) / 2
                for axis in range(3)]
    source_head = lambda name: source_joint(rig['bones'][name]['head'])
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

    surface_positions = []
    for index, old in enumerate(used):
        point = [0., 0., 0.]
        for slot in range(4):
            bone_index = retarget_indices[skin_indices[index*4+slot]]
            weight = skin_weights[index*4+slot] / 65535
            if not weight:
                continue
            mapped = mapped_point(source_vertices[old], bone_index)
            for axis in range(3):
                point[axis] += weight * mapped[axis]
        if all(retarget_indices[skin_indices[index*4+s]] == indices['head']
               for s in range(4) if skin_weights[index*4+s]):
            expected = mapped_point(source_vertices[old], indices['head'])
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
        surface_positions.extend(point[a]*(1-contact) + vertices[old][a]*contact for a in range(3))

    return surface_positions

# Bounded surface sculpt in canonical space. Broad Gaussian fields describe
# volumes, not separate muscle meshes: they keep the source topology and weights
# intact, fade continuously, and do not move the anatomical rig. Both models use
# the same vocabulary of shoulder caps, trunk taper and athletic limb volumes.
def gaussian(value, center, width):
    return math.exp(-((value-center)/width)**2)

sculpt_maximum_offsets = {}
def sculpt_surface(surface, model):
    largest_offset = 0.
    male = model == 'male'
    sculpted = []
    for index, old in enumerate(used):
        x, y, z = surface[index*3:index*3+3]
        ox, oy, oz = x, y, z
        ax = abs(ox)
        side = 1 if ox >= 0 else -1
        dx = dy = dz = 0.
        # The trunk field excludes arms, and fades before the pelvis and neck.
        trunk = 1-smoothstep(.16, .23, ax)
        waist = gaussian(oy, .225, .105)*trunk
        dx -= x*(.105 if male else .075)*waist
        dz -= (z-.005)*(.10 if male else .065)*waist
        # Lats widen the upper trunk while the waist narrows below them.
        lat = gaussian(oy, .40, .095)*smoothstep(.07, .135, ax)*trunk
        dx += side*(.014*(1-.45*smoothstep(.025, .075, oz)) if male else .004)*lat
        front = smoothstep(.025, .075, oz)
        if male:
            # A broad pectoral plate with a higher, flatter lower edge. The
            # source's rounded lower lobes otherwise read as breasts as volume
            # rises; blend their forward depth toward an anatomical chest plane.
            pec = (smoothstep(.015, .045, ax)*(1-smoothstep(.105, .155, ax))
                   *gaussian(oy, .425, .085)*front)
            chest_plane = (.115+.025*gaussian(oy, .455, .080)
                           -.012*smoothstep(.12, .18, ax))
            dz += .78*pec*(chest_plane-z)
            # Shallow paired abdominal planes and tendinous valleys. Broad
            # quartic fields keep them planar rather than isolated round bumps.
            abdominal = math.exp(-((ax-.039)/.032)**4)*front
            for level in (.335, .278, .218):
                dz += .004*abdominal*math.exp(-((oy-level)/.023)**4)
            for level in (.306, .248):
                dz -= .0015*abdominal*gaussian(oy, level, .011)

        else:
            # Raise the visual center of the chest volume and round the upper
            # curve without adding size or stretching a long conical lower tip.
            chest = (smoothstep(.018, .045, ax)*(1-smoothstep(.13, .17, ax))
                     *smoothstep(.30, .34, oy)*(1-smoothstep(.45, .50, oy))*front)
            chest_curve = .106+.059*math.exp(-((ax-.078)/.070)**2-((oy-.395)/.068)**2)
            dz += .65*chest*(chest_curve-z)
            # Athletic midline and oblique definition stay softer than the male.
            dz += .0035*gaussian(ax, .042, .03)*gaussian(oy, .285, .095)*front
            dz -= .0018*gaussian(ox, 0., .012)*gaussian(oy, .29, .10)*front
            # Glute volume and lateral hip transition, without shifting the pelvis.
            glute = gaussian(oy, .015, .10)*gaussian(ax, .105, .075)
            dz -= .014*glute*(1-smoothstep(-.035, .015, oz))
            dx += side*.006*glute*smoothstep(.07, .15, ax)
        # Upper arm volumes follow the fixed shoulder/elbow line rather than
        # axis-aligned lobes, so the deltoid and triceps remain coherent in motion.
        arm_side = 'L' if ox >= 0 else 'R'
        shoulder = bones[indices['upperarm01.'+arm_side]]['head']
        elbow = bones[indices['lowerarm01.'+arm_side]]['head']
        axis = sub(elbow, shoulder)
        offset = sub(vertices[old], shoulder)
        t = dot(offset, axis)/dot(axis, axis)
        arm_weight = sum(skin_weights[index*4+k]/65535 for k in range(4)
                         if names[skin_indices[index*4+k]].startswith('upperarm'))
        if arm_weight:
            center = [shoulder[a]+t*axis[a] for a in range(3)]
            volume = ((.25 if male else .12)*gaussian(t, .15, .35)
                      +(.20 if male else .08)*gaussian(t, .62, .28))*arm_weight
            dx += (x-center[0])*volume
            dy += (y-center[1])*volume
            dz += (z-center[2])*volume
        # Thigh definition follows the authored contour; no change below the
        # knee envelope, preserving the reviewed calf and relaxed-foot anatomy.
        thigh = gaussian(oy, -.155, .13)*gaussian(ax, .13, .065)
        dz += (.007 if male else .005)*thigh*smoothstep(.015, .06, oz)
        # One smooth jaw/cheek field, applied equally to head and eye surfaces.
        # The authored adult face carries the features; this only polishes the
        # outer jaw taper and cheek contour by at most a few millimetres.
        if not male:
            face_front = smoothstep(-.02, .045, oz)
            dx -= ox*.075*gaussian(oy, .65, .035)*face_front
            dy += .0035*gaussian(oy, .645, .03)*face_front
            dx += side*.0018*gaussian(ax, .058, .025)*gaussian(oy, .725, .025)*face_front
        # Preserve exact palms/knees and fade the sculpt before wrists/lower legs.
        contact = 0.
        for joint_side in ('L', 'R'):
            knee = bones[indices['lowerleg01.'+joint_side]]['head']
            contact = max(contact, 1-smoothstep(.075, .16, length(sub(vertices[old], knee))))
        hand_weight = sum(skin_weights[index*4+k]/65535 for k in range(4)
                          if names[skin_indices[index*4+k]].startswith(('wrist', 'metacarpal', 'finger')))
        contact = max(contact, hand_weight)
        fade = (1-contact)*smoothstep(-.35, -.24, oy)
        # Recess the existing eye surfaces slightly into the authored lids; the
        # eye and face still use the single coherent head fitting transform.
        if old in eye_vertices:
            dz -= .0012
        largest_offset = max(largest_offset, length([dx*fade, dy*fade, dz*fade]))
        assert length([dx*fade, dy*fade, dz*fade]) < .050, f'Sculpt exceeds the 50 mm refinement envelope: {old}, {x,y,z}, {dx,dy,dz}'
        sculpted.extend((x+dx*fade, y+dy*fade, z+dz*fade))
    sculpt_maximum_offsets[model] = largest_offset
    return sculpted

# Remove coarse triangulation ripples only on broad anatomical surfaces. Fine
# eyelid, nose, lip and ear borders retain their authored topology and shape.
source_neighbors = defaultdict(set)
for face in faces:
    for offset, old in enumerate(face):
        source_neighbors[old].update((face[(offset+1)%3], face[(offset+2)%3]))
neighbors = {lookup[old]: sorted(lookup[other] for other in adjacent)
             for old, adjacent in source_neighbors.items()}

def polish_surface(surface, model):
    strengths = []
    for index in range(len(used)):
        x, y, z = surface[index*3:index*3+3]
        ax = abs(x)
        skull = .52*smoothstep(.765, .81, y)
        cheek = .32*gaussian(ax, .065, .028)*gaussian(y, .695, .027)*smoothstep(.02, .06, z)
        shoulder = .50*gaussian(ax, .185, .07)*gaussian(y, .53, .055)
        chest = (.28 if model == 'male' else .18)*gaussian(ax, .085, .075)*gaussian(y, .40, .075)*smoothstep(.03, .08, z)
        strengths.append(max(skull, cheek, shoulder, chest))
    for _ in range(3):
        relaxed = surface[:]
        for index, strength in enumerate(strengths):
            if strength < 1e-6:
                continue
            adjacent = neighbors[index]
            for axis in range(3):
                average = sum(surface[other*3+axis] for other in adjacent)/len(adjacent)
                relaxed[index*3+axis] += strength*(average-surface[index*3+axis])
        surface = relaxed
    return surface

def preserve_lower_legs(surface, original):
    for index, old in enumerate(used):
        blend = smoothstep(-.35, -.23, vertices[old][1])
        for axis in range(3):
            offset = index*3+axis
            surface[offset] = original[offset]*(1-blend)+surface[offset]*blend
    return surface

male_positions = polish_surface(sculpt_surface(fit_surface(male_vertices), 'male'), 'male')
male_previous = fit_surface(apply_target(muscle_target_path, .40, male_base_vertices))
male_positions = preserve_lower_legs(male_positions, male_previous)

variant = {
    'version': 1,
    'source': 'MakeHuman hm08 adult male muscle/lean shape / CC0, with Fitt athletic surface sculpt',
    'surfaceSculpt': {'revision': 'athletic-1', 'maximumOffsetMeters': round(sculpt_maximum_offsets['male'], 6), 'eyeInsetMeters': .0012, 'polishIterations': 3},
    'lowerLegPreservation': {'blendSourceY': [-.35, -.23], 'maleMuscleTargetStrength': .40},
    'retargeting': 'Coherent pelvis-to-shoulder trunk frame and head frame, smoothly blended neck; weighted limb frames',
    'maleHeadTargetStrength': male_head_strength,
    'maleMuscleTargetStrength': male_muscle_strength,
    'maleLeanMuscleTargetStrength': male_lean_muscle_strength,
    'sourcesSha256': {**result['sourcesSha256'], **{
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (target_path, muscle_target_path, lean_muscle_target_path)}},
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
upper_volume_strength = .18
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
# this preparation precedes the full-body athletic and adult head targets.
chest_support = {old for old in used if length(sub(female_vertices[old], vertices[old])) > 1e-10}
chest_neighbors = {old: sorted(adjacent) for old, adjacent in source_neighbors.items()}
relaxation = {old: .32*min(1., length(sub(female_vertices[old], vertices[old]))/.008)
              for old in chest_support}
for _ in range(3):
    relaxed = [point[:] for point in female_vertices]
    for old, strength in relaxation.items():
        adjacent = chest_neighbors[old]
        for axis in range(3):
            average = sum(female_vertices[other][axis] for other in adjacent)/len(adjacent)
            relaxed[old][axis] += strength*(average-female_vertices[old][axis])
    female_vertices = relaxed
female_muscle_strength = .65
female_lean_muscle_strength = .10
female_shape_strength = .30
female_vertices = apply_target(female_muscle_target_path, female_muscle_strength, female_vertices)
female_vertices = apply_target(female_lean_muscle_target_path, female_lean_muscle_strength, female_vertices)
female_shape = apply_target(female_shape_target_path, female_shape_strength)
for index, point in enumerate(female_vertices):
    blend = smoothstep(.54, .66, vertices[index][1])
    female_vertices[index] = [value+(female_shape[index][axis]-vertices[index][axis])*blend
                              for axis, value in enumerate(point)]
female_positions = polish_surface(sculpt_surface(fit_surface(female_vertices), 'female'), 'female')
female_positions = preserve_lower_legs(female_positions, positions)
female_variant = {
    'version': 1,
    'source': 'MakeHuman hm08 adult female muscle/lean and head shape / CC0, with Fitt athletic surface sculpt',
    'retargeting': variant['retargeting'],
    'surfaceSculpt': {**variant['surfaceSculpt'], 'maximumOffsetMeters': round(sculpt_maximum_offsets['female'], 6)},
    'lowerLegPreservation': {'blendSourceY': [-.35, -.23], 'surface': 'canonical'},
    'sourcesSha256': {**result['sourcesSha256'], **{
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [p for p, _ in chest_targets] + [female_muscle_target_path, female_lean_muscle_target_path, female_shape_target_path]}},
    'femaleMuscleTargetStrength': female_muscle_strength,
    'femaleLeanMuscleTargetStrength': female_lean_muscle_strength,
    'femaleHeadTargetStrength': female_shape_strength,
    'chestTargetStrength': chest_strength,
    'chestFirmnessStrength': firmness_strength,
    'chestUpperVolumeStrength': upper_volume_strength,
    'chestSurfaceRelaxation': {'iterations': 3, 'strength': .32, 'boundaryFadeMeters': .008},
    'positions': encode('f', female_positions),
}
female_output = root / 'src/components/form-guide/female-body-data.json'
female_output.write_text(json.dumps(female_variant, indent=2) + '\n')
print(f'Female surface: {female_output.stat().st_size // 1024} KiB; size {chest_strength:.0%}, firmness {firmness_strength:.0%}, upper volume {upper_volume_strength:.0%}')
