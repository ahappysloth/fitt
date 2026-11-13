"""Deterministic local chest refinement for the offline mannequin generator.

The original mesh remains the canonical rig. The front of the thorax gains
Loop-subdivided vertices so the authored chest shades as a smooth surface;
midpoint ancestry lets the runtime derive weights and muscle masks.
"""
import base64
from collections import Counter

import numpy as np


def _encode(values, dtype):
    return base64.b64encode(np.asarray(values, dtype=dtype).tobytes()).decode()


def _smoothstep(start, end, value):
    t = np.clip((value - start) / (end - start), 0., 1.)
    return t * t * (3 - 2 * t)


def chest_weight(points):
    """1 on the front of the thorax, fading to 0 before the arms, neck and abdomen."""
    x, y, z = np.abs(points[:, 0]), points[:, 1], points[:, 2]
    # The shoulder attachment (outside 10 cm, above 42 cm) keeps the shared
    # triangles: its motions are tuned to them.
    return ((1 - _smoothstep(.15, .19, x)) * _smoothstep(.25, .31, y)
            * (1 - _smoothstep(.50, .56, y)) * _smoothstep(-.01, .03, z)
            * (1 - _smoothstep(.085, .105, x) * _smoothstep(.39, .42, y)))


def _split_face(face, midpoints):
    a, b, c = face
    ab, bc, ca = [midpoints.get(tuple(sorted(edge)))
                  for edge in ((a, b), (b, c), (c, a))]
    count = sum(i is not None for i in (ab, bc, ca))
    if count == 0:
        return [face]
    if count == 3:
        return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]
    if count == 1:
        if ab is not None:
            return [[a, ab, c], [ab, b, c]]
        if bc is not None:
            return [[b, bc, a], [bc, c, a]]
        return [[c, ca, b], [ca, a, b]]
    if ca is None:
        return [[b, bc, ab], [ab, bc, c], [a, ab, c]]
    if ab is None:
        return [[c, ca, bc], [bc, ca, a], [b, bc, a]]
    return [[a, ab, ca], [ca, ab, b], [c, ca, b]]


def refine_chest(surface, source_triangles, rounds=1):
    points = np.asarray(surface, dtype=float).reshape(-1, 3)
    base_count = len(points)
    original = [list(map(int, face)) for face in source_triangles]
    faces = [face[:] for face in original]
    weight = chest_weight(points)
    parents = []
    for _ in range(rounds):
        selected = [all(weight[i] > 1e-4 for i in face) for face in faces]
        opposite, adjacent = {}, [set() for _ in points]
        for a, b, c in faces:
            for u, v, w in ((a, b, c), (b, c, a), (c, a, b)):
                opposite.setdefault((min(u, v), max(u, v)), []).append(w)
                adjacent[u].update((v, w))
        edges = sorted({(min(f[k], f[(k + 1) % 3]), max(f[k], f[(k + 1) % 3]))
                        for f, active in zip(faces, selected) if active for k in range(3)})
        # Loop's rules, faded to plain midpoints (and unmoved vertices) at the
        # edge of the region. Adjacent faces split conformingly: no T-junctions.
        moved = points.copy()
        for i in {i for edge in edges for i in edge}:
            ring = sorted(adjacent[i])
            beta = 3 / 16 if len(ring) == 3 else 3 / (8 * len(ring))
            smooth = (1 - len(ring) * beta) * points[i] + beta * points[ring].sum(axis=0)
            moved[i] += weight[i] * (smooth - points[i])
        midpoints, added, added_weight = {}, [], []
        for a, b in edges:
            wings = opposite[a, b]
            assert len(wings) == 2, 'Chest region must be a closed manifold'
            middle = (points[a] + points[b]) / 2
            smooth = .375 * (points[a] + points[b]) + .125 * (points[wings[0]] + points[wings[1]])
            blend = (weight[a] + weight[b]) / 2
            midpoints[a, b] = len(points) + len(added)
            parents.append((a, b))
            added.append(middle + blend * (smooth - middle))
            added_weight.append(blend)
        points = np.vstack((moved, added))
        weight = np.r_[weight, added_weight]
        faces = [child for face in faces for child in _split_face(face, midpoints)]
    assert len(points) < 65536 and np.isfinite(points).all()
    # Angle-weighted normals do not depend on how a flat face is triangulated.
    # A midpoint added on an unrefined edge would still take the mean of its two
    # faces, which shows as a line where the region ends, so each added vertex
    # fades from its parents' interpolated normal to its own geometric one.
    triangles = np.asarray(faces)
    corners = points[triangles]
    face_normals = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    face_normals /= np.linalg.norm(face_normals, axis=1)[:, None]
    normals = np.zeros_like(points)
    for corner in range(3):
        u = corners[:, (corner + 1) % 3] - corners[:, corner]
        v = corners[:, (corner + 2) % 3] - corners[:, corner]
        cosine = (u * v).sum(axis=1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(v, axis=1))
        np.add.at(normals, triangles[:, corner],
                  face_normals * np.arccos(np.clip(cosine, -1, 1))[:, None])
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    for index, (a, b) in enumerate(parents, base_count):
        inherited = normals[a] + normals[b]
        blend = _smoothstep(0., .5, weight[index])
        normal = (1 - blend) * inherited / np.linalg.norm(inherited) + blend * normals[index]
        normals[index] = normal / np.linalg.norm(normal)
    assert np.isfinite(normals).all()
    edge_counts = Counter((min(f[k], f[(k + 1) % 3]), max(f[k], f[(k + 1) % 3]))
                          for f in faces for k in range(3))
    assert all(count == 2 for count in edge_counts.values()), 'Refined mesh must remain closed'
    shared = {tuple(face): index for index, face in enumerate(original)}
    refined = {tuple(face) for face in faces}
    removed = [index for face, index in shared.items() if face not in refined]
    added = [face for face in faces if tuple(face) not in shared]
    assert max(removed, default=0) < 65536
    return points.ravel().tolist(), {
        'topology': {'baseVertexCount': base_count, 'edgeParents': _encode(parents, '<u2'),
                     'removedTriangles': _encode(removed, '<u2'),
                     'addedIndices': _encode(added, '<u2')},
        'normals': _encode(np.round(normals * 32767), '<i2'),
        'chestRefinement': {'revision': 'loop-front-thorax-1', 'subdivisionRounds': rounds,
                            'vertices': len(points), 'triangles': len(faces)},
    }
