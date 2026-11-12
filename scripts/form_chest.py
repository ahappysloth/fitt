"""Deterministic local breast refinement for the offline mannequin generator.

The original mesh remains the canonical rig. Only the female breast disks gain
vertices; midpoint ancestry lets the runtime derive weights and muscle masks.
"""
import base64
import math
from collections import Counter, defaultdict

import numpy as np
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve


RADII = np.array([.065, .058, .055])
CAP_RADIUS = .64


def _encode(values, dtype):
    return base64.b64encode(np.asarray(values, dtype=dtype).tobytes()).decode()


def _neighbors(triangles, count):
    adjacent = [set() for _ in range(count)]
    for a, b, c in triangles:
        adjacent[a].update((int(b), int(c)))
        adjacent[b].update((int(a), int(c)))
        adjacent[c].update((int(a), int(b)))
    return adjacent


def _normals(points, triangles):
    normals = np.zeros_like(points)
    face_normals = np.cross(points[triangles[:, 1]] - points[triangles[:, 0]],
                            points[triangles[:, 2]] - points[triangles[:, 0]])
    for corner in range(3):
        np.add.at(normals, triangles[:, corner], face_normals)
    return normals / np.linalg.norm(normals, axis=1)[:, None]


def _smoothstep(start, end, value):
    t = max(0., min(1., (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def _disk(side, source_chart, baseline, triangles, adjacent):
    # Membership is determined before the new sculpt. The fixed rim excludes the
    # sternum, arms, abdomen and shoulders; no current-position mask can leak.
    patch = {i for i, (x, y, z) in enumerate(source_chart)
             if .004 < side * x < .17 and .28 < y < .535 and z > .045}
    local_faces = [face for face in triangles if all(int(i) in patch for i in face)]
    edge_counts = Counter(tuple(sorted((int(face[k]), int(face[(k + 1) % 3]))))
                          for face in local_faces for k in range(3))
    boundary_neighbors = defaultdict(list)
    for (a, b), count in edge_counts.items():
        if count == 1:
            boundary_neighbors[a].append(b)
            boundary_neighbors[b].append(a)
    assert all(len(values) == 2 for values in boundary_neighbors.values())
    boundary, previous = [min(boundary_neighbors)], None
    while True:
        following = next(i for i in boundary_neighbors[boundary[-1]] if i != previous)
        if following == boundary[0]:
            break
        previous = boundary[-1]
        boundary.append(following)
        assert len(boundary) <= len(boundary_neighbors)
    assert len(boundary) == len(boundary_neighbors), 'Breast patch must be one disk'

    center = np.array([side * .078, .425, .139])
    rim = baseline[boundary]
    angles = np.unwrap(np.arctan2((rim[:, 1] - center[1]) / .09,
                                  (rim[:, 0] - center[0]) / .075))
    if angles[-1] < angles[0]:
        boundary.reverse()
        rim = baseline[boundary]
    lengths = np.linalg.norm(np.diff(np.vstack((rim, rim[0])), axis=0), axis=1)
    angles = np.r_[0, np.cumsum(lengths[:-1])] / sum(lengths) * 2 * np.pi
    projected_angles = np.arctan2((rim[:, 1] - center[1]) / .09,
                                  (rim[:, 0] - center[0]) / .075)
    angles += np.angle(np.mean(np.exp(1j * (projected_angles - angles))))
    uv = {i: np.array([math.cos(angle), math.sin(angle)])
          for i, angle in zip(boundary, angles)}
    interior = sorted(patch - set(boundary))
    lookup = {i: k for k, i in enumerate(interior)}
    matrix = lil_matrix((len(interior), len(interior)))
    rhs = np.zeros((len(interior), 2))
    for i, row in lookup.items():
        neighbors = adjacent[i] & patch
        matrix[row, row] = len(neighbors)
        for j in neighbors:
            if j in lookup:
                matrix[row, lookup[j]] = -1
            else:
                rhs[row] += uv[j]
    coordinates = spsolve(matrix.tocsr(), rhs)
    uv.update(zip(interior, coordinates))
    # A convex boundary and positive harmonic weights give an injective chart.
    for a, b, c in local_faces:
        u, v = uv[b] - uv[a], uv[c] - uv[a]
        assert u[0] * v[1] - u[1] * v[0] > 0, 'Chest chart triangle inverted'
    return patch, set(boundary), uv, center


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


def refine_female_chest(surface, source_chart, source_triangles, canonical):
    baseline = np.asarray(surface, dtype='<f4').reshape(-1, 3).astype(float)
    chart = np.asarray(source_chart).reshape(-1, 3)
    triangles = np.asarray(source_triangles, dtype=int)
    original_triangles = triangles.copy()
    base_count = len(baseline)
    adjacent = _neighbors(triangles, base_count)
    sculpt = baseline.copy()
    uv, patch, rim, free = {}, set(), set(), set()
    for side in (-1, 1):
        local_patch, local_rim, local_uv, center = _disk(
            side, chart, baseline, triangles, adjacent)
        uv.update(local_uv)
        patch.update(local_patch)
        rim.update(local_rim)
        for i in local_patch - local_rim:
            u, v = uv[i]
            radius, angle = math.hypot(u, v), math.atan2(v, u)
            if radius > CAP_RADIUS:
                free.add(i)
                continue
            cosine, sine = math.cos(angle), math.sin(angle)
            # Upper attachment is shallower than the hemisphere's lower return.
            polar = math.radians(75 - 15 * sine) * radius / CAP_RADIUS
            sculpt[i] = center + RADII * np.array([
                math.sin(polar) * cosine, math.sin(polar) * sine, math.cos(polar)])

    # A thin-plate collar matches the rounded interior to the fixed original
    # surface. Including neighboring rows also constrains its boundary tangent.
    free = sorted(free)
    lookup = {i: k for k, i in enumerate(free)}
    rows = set(free)
    for i in free:
        rows.update(adjacent[i])
    laplacian = lil_matrix((len(rows), len(free)))
    rhs = np.zeros((len(rows), 3))
    for row, i in enumerate(sorted(rows)):
        weights = [(i, 1.)] + [(j, -1 / len(adjacent[i])) for j in adjacent[i]]
        for j, weight in weights:
            if j in lookup:
                laplacian[row, lookup[j]] += weight
            else:
                rhs[row] -= weight * sculpt[j]
    laplacian = laplacian.tocsr()
    sculpt[free] = spsolve(laplacian.T @ laplacian, laplacian.T @ rhs)
    coarse_normals = _normals(sculpt, original_triangles)
    untouched = sorted(set(range(base_count)) - (patch - rim))
    assert np.array_equal(sculpt[untouched], baseline[untouched])

    points = list(sculpt)
    canonical_points = list(np.asarray(canonical, dtype='<f4').reshape(-1, 3))
    parents = []
    faces = triangles.tolist()
    for _ in range(2):
        # Refine the cap, retaining the broad, already smooth attachment. Split
        # neighboring triangles conformingly so no T-junctions are introduced.
        selected = [all(i in patch and np.linalg.norm(uv[i]) < .76 for i in face)
                    for face in faces]
        edge_counts = Counter(tuple(sorted((face[k], face[(k + 1) % 3])))
                              for face, active in zip(faces, selected) if active
                              for k in range(3))
        midpoints = {}
        for a, b in sorted(edge_counts):
            i = len(points)
            midpoints[a, b] = i
            parents.append((a, b))
            points.append((points[a] + points[b]) / 2)
            canonical_points.append((canonical_points[a] + canonical_points[b]) / 2)
            uv[i] = (uv[a] + uv[b]) / 2
            patch.add(i)
            if edge_counts[a, b] == 1:
                rim.add(i)
        faces = [child for face in faces for child in _split_face(face, midpoints)]
    points = np.asarray(points)
    triangles = np.asarray(faces, dtype=int)
    assert len(points) < 65536

    # Reproject only the curved interior. Boundary midpoints remain linear, so
    # all surrounding surfaces retain their exact original geometry.
    for i in patch - rim:
        radius = np.linalg.norm(uv[i])
        weight = 1 - _smoothstep(.50, .64, radius)
        if not weight:
            continue
        center = np.array([.078 if points[i, 0] > 0 else -.078, .425, .139])
        direction = (points[i] - center) / RADII
        target = center + RADII * direction / np.linalg.norm(direction)
        points[i] += weight * (target - points[i])

    # New vertices on an unchanged planar triangle inherit its smooth normal
    # field; recomputing their normals would reveal artificial triangulation.
    # The curved cap uses the ellipsoid gradient, blended into that inherited
    # field at the attachment. Three's normal skinning uses the same rig.
    normals = list(coarse_normals)
    for a, b in parents:
        normal = normals[a] + normals[b]
        normals.append(normal / np.linalg.norm(normal))
    normals = np.asarray(normals)
    for i in patch - rim:
        weight = 1 - _smoothstep(.48, .68, np.linalg.norm(uv[i]))
        if not weight:
            continue
        center = np.array([.078 if points[i, 0] > 0 else -.078, .425, .139])
        normal = (points[i] - center) / RADII ** 2
        normal /= np.linalg.norm(normal)
        normals[i] = normals[i] * (1 - weight) + normal * weight
        normals[i] /= np.linalg.norm(normals[i])
    assert np.isfinite(points).all() and np.isfinite(normals).all()
    assert np.array_equal(points[untouched], baseline[untouched])
    edge_counts = Counter(tuple(sorted((int(face[k]), int(face[(k + 1) % 3]))))
                          for face in triangles for k in range(3))
    assert all(count == 2 for count in edge_counts.values()), 'Refined mesh must remain closed'
    maximum_offset = float(np.linalg.norm(points - np.asarray(canonical_points), axis=1).max())
    assert maximum_offset < .09, 'Refined female surface exceeds its 90 mm envelope'
    # Most of the surface keeps the shared triangles: store only those the
    # refinement replaced and the ones it added, and unit normals as int16.
    shared = {tuple(face): index for index, face in enumerate(original_triangles.tolist())}
    refined = {tuple(face) for face in triangles.tolist()}
    removed = [index for face, index in shared.items() if face not in refined]
    added = [face for face in triangles.tolist() if tuple(face) not in shared]
    assert len(original_triangles) - len(removed) + len(added) == len(triangles)
    return points.ravel().tolist(), {
        'topology': {'baseVertexCount': base_count, 'edgeParents': _encode(parents, '<u2'),
                     'removedTriangles': _encode(removed, '<u2'),
                     'addedIndices': _encode(added, '<u2')},
        'normals': _encode(np.round(normals * 32767), '<i2'),
        'chestRefinement': {'revision': 'round-lower-pole-1', 'subdivisionRounds': 2,
                            'vertices': len(points), 'triangles': len(triangles),
                            'changedOriginalVertices': len(patch - rim - set(range(base_count, len(points)))),
                            'capRadiiMeters': RADII.tolist(),
                            'normals': 'Analytical cap gradient with inherited smooth collar normals'},
        'maximumCanonicalDisplacementMeters': round(maximum_offset, 6),
    }
