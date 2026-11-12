# Form-guide body asset

The Knee Push-up prototype uses the **MakeHuman hm08 base mesh and default rig**, released by their owners under **CC0**. The downloaded OBJ header explicitly dedicates the asset to CC0; the skeleton and skin-weight JSON files each specify `"license": "CC0"`.

Sources:

- [Base mesh](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj)
- [Default skeleton](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default.mhskel)
- [Skin weights](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw)
- [Male shape target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-male-young.target)
- [Adult male muscle target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target)
- [Adult male lean-muscle target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-minweight.target)
- [Adult female muscle target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-female-young-maxmuscle-averageweight.target)
- [Adult female lean-muscle target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-female-young-maxmuscle-minweight.target)
- [Adult female head-shape source](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-female-young.target)
- [Adult female chest-size target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target)
- [Adult female firmness target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target)
- [Adult female combined size/firmness target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target)
- [Upper chest-volume target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/breast-volume-vert-up.target)
- [MakeHuman project](https://github.com/makehumancommunity/makehuman)

Original credit: Data Collection AB, Joel Palmius, Jonas Hauquier, and the MakeHuman contributors. Mesh/skeleton notices are dated 2020; the skin-weight notice is dated 2021. [CC0-1.0.txt](CC0-1.0.txt) contains the dedication's full legal text, obtained from the SPDX license-list-data project.

All shape targets' headers also explicitly dedicate them to CC0 (September 2020), with original credit to Manuel Bastioni (2014) and the same 2020 rights holders.

## Derived asset

`src/components/form-guide/body-data.json` contains the body and eye surfaces, 163 bones, and the strongest four normalized skin weights per vertex. Editor helpers are excluded. Positions use meters; vertex and skin buffers are encoded as base64 to bundle safely into Next chunks and the self-contained HTML preview. The output records SHA-256 checksums of all three input files.

There are 13,524 vertices and 27,036 triangles. The model is rendered as a satin-gray mannequin. Fitt supplies the materials, approximate muscle-region masks, exercise motion, camera system, lighting, and controls. Those surface masks are not separate anatomical muscle meshes.

`male-body-data.json` contains the default adult male surface. The generator combines the male shape target with 85% of the authored maximum-muscle/average-weight target and 15% of its minimum-weight counterpart. These are a convex blend of two authored muscle shapes, giving stronger shoulders, arms, chest, back and thighs with a leaner trunk. The head retains 55% of the male shape target, easing its heavy brow, broad jaw and low skull toward the shared base sculpt. A smooth transition between 0.54 and 0.66 m in source coordinates joins it to the full male body shape. This source blend includes eyeballs and joint helpers.

The generator derives joint locations from that blended source and fits the surface to the canonical bind pose with coherent anatomical frames:

- The skull, jaw, face, and eyeballs share one head transform. All 60 head and facial bones use this frame when generating the surface. Fitting every tiny expression helper independently previously scaled adjacent facial regions by 0.58–1.75, causing folded lips, distorted eyelids, and protruding eyeballs.
- The trunk uses one pelvis-to-shoulder-midpoint transform, preserving the authored male pectorals, abdomen, back, and collarbones. Independently fitting spine, breast, and clavicle helpers to the base anatomy previously introduced creases and false breast folds. The neck transitions smoothly from the trunk frame to the head frame.
- Limbs retain weighted bone-frame transforms and longitudinal scaling. A smooth contact envelope preserves the original palms and knee surfaces so switching appearance does not move support points.

`female-body-data.json` uses 18% of the adult maximum-muscle/average-weight target and 5% of its minimum-weight counterpart. The softer source blend supports a slender adult mannequin silhouette with gently sloping shoulders, slimmer upper arms, a narrower waist, and rounded hips and glutes. Its head retains 30% of the adult female shape target, with the same 0.54–0.66 m source transition and coherent head frame. The chest starts from the authored size/firmness grid at 12% size and 95% firmness, with 30% upper volume. Three restrained source relaxation passes (32% strength, fading across the first 8 mm of chest-target displacement) prepare that surface before body fitting.

After fitting, both surfaces receive a deterministic Fitt sculpt in meters. Smooth spatial fields strengthen the male shoulder caps and upper arms, taper the waist, and refine the thighs. The male has broader lats, a flatter pectoral plane with a gradual rib transition, and shallow paired abdominal planes. The male `athletic-2` revision gives him a male frame on the shared skeleton: the waist keeps most of its width (a 2% taper instead of 10.5%), the lat taper runs from the armpit to the waist, the hips and outer upper thighs come in 18 mm a side under it, and the outer pectoral edge is lowered into the ribs and relaxed harder, so it no longer hangs as a rounded lobe. Half-widths are now 171 mm at the chest, 128 mm at the waist and 156 mm at the hips (before: 170, 119 and 174). The female has a smooth abdomen, softer shoulders and arms, fuller glutes, and a higher rounded chest. These are surface refinements on the source mesh, not medical anatomy or separate muscle meshes.

The female `reference-silhouette-2` revision replaces the earlier chest-only adjustment with a full silhouette pass. The source's dense nipple loops and folded under-pole first receive a harmonic front chart: 100 weighted neighbor iterations redistribute only local X/Y coordinates, with Z and the surrounding boundary fixed. This prevents the old folded coordinates from producing a pointed tip when the forward profile is reshaped. A smooth paired dome is then sampled on that chart, centered at absolute X = 0.078 m and Y = 0.425 m. Its upper vertical radius is 73 mm and lower radius 65 mm, with a smooth transition. The dome fades into a curved thorax surface before the lateral chest wall. The front chart retains every vertex, triangle, skin weight and bone.

After the dome is sculpted, a depth-dependent vertical shear raises the rib attachment while retaining the projecting lobe. This permits a naturally downward-facing lower surface rather than a long diagonal return. The shear has a 55 mm maximum lift field over input Y = 0.18–0.43 m, fading across the sidewall and to zero at the projecting front. It uses final sculpt coordinates and leaves X/Z unchanged. Its Jacobian determinant is bounded below by `1 − 0.055π / 0.25 = 0.30885`, so the continuous warp is invertible. The final mesh tests permit the natural underside while checking triangle area and normal continuity; every adjacent pair in the reviewed chest patch turns by less than 60 degrees.

The final female `round-lower-pole-1` refinement replaces only the breast disks after that baseline sculpt. Each disk receives an injective harmonic parameterization with a convex boundary. An analytical ellipsoid supplies the rounded lower pole, with radii 65 mm across, 58 mm vertically and 55 mm forward. A thin-plate collar joins it to the fixed surrounding surface. The result changes 384 original breast vertices and preserves every other original position exactly, including the face, shoulders, abdomen, limbs, hands and feet.

The curved cap is subdivided twice and reprojected onto that analytical surface. Adjacent faces are split conformingly, so there are no T-junctions or open seams. The female asset now has 17,940 vertices and 35,868 triangles; its 4,416 new vertices retain sequential midpoint ancestry. The fixed collar inherits its original smooth normal field, while the curved interior uses the ellipsoid gradient. This avoids introducing false planar shading when a formerly coarse triangle gains midpoint vertices. These are authored geometric normals, with the existing material, lighting and normal skinning unchanged.

The generator enforces a 50 mm male sculpt limit and a 90 mm female sculpt limit. The baseline female sculpt peaks at 87.32 mm; the final surface's maximum displacement from interpolated canonical coordinates is 89.428 mm, including the local refinement. The larger female budget permits the requested silhouette change while exact-contact and facial-integrity checks remain separate. Standing front, side, back, three-quarter and full-body views, plus top and bottom push-up poses, are reviewed with highlighting disabled. The male and canonical assets remain byte-identical.

Three localized neighbor-relaxation passes polish the coarse skull, cheek, shoulder and chest surfaces, with an additional female hip field. A female flank field (80% strength) relaxes the corner where the sculpted front chart meets the side wall, which otherwise shows as a hard ridge from the lower chest down the waist to the hip. It stops below the chest attachment (output Y 0.26-0.31 m) so the reviewed chest patch keeps every adjacent face within 60 degrees. Fine features remain recognizable and the existing eye surfaces are recessed 1.2 mm into their lids. This baseline polish introduces no new bones or face-by-face rig transforms; the female cap refinement adds only the local vertices described above. The fully weighted skull, face and eyes still share one coherent fitting transform; surface polish is applied afterward.

The male feet are the canonical feet, blended in by foot and toe skin weight: the male target's toe frames point below the heel, which left its toes 10 mm under it, so a flat foot either lifted the heel or, on the shared placement, lifted the female soles. The motions' sole heights are fitted to this shared foot.

The palms and the inner 75 mm knee-contact envelope remain exactly canonical. Sculpt influence fades before those contacts. Below source Y = −0.35 m, the calves and feet retain their previous approved surfaces: the original female/canonical surface and the male surface fitted with 40% of the average-weight muscle target. A smooth transition to the new thighs finishes at −0.23 m. This preserves the reviewed calf and relaxed-foot anatomy as well as the movement's support points.

Both variants record their source checksums. The male asset contains positions only and uses the canonical topology directly. The female asset additionally contains `normals` (base64 Float32 XYZ) and an optional `topology` record: `baseVertexCount`, `edgeParents` (base64 Uint16 sequential parent pairs) and `indices` (base64 Uint16 triangle indices). Its original vertex prefix keeps the canonical indexing. The runtime derives each appended vertex's canonical coordinates, four normalized skin weights and muscle-mask values from its two preceding parents, and caches the female geometry separately. The skeleton, pose, material, highlights and contact anchors remain shared. The canonical and male JSON assets remain byte-identical.

Both bodies receive the same runtime shading polish after loading their generated or authored normals. Two edge-connected passes reduce coarse normal variation without changing any positions, triangles, skin weights or muscle masks. The filter fades across sharper features, never joins disconnected surfaces, and limits each result to 20 degrees from its original normal. Both variants continue to use the same satin material (`roughness: 0.46`, `metalness: 0.18`) in the inspector and workout guide. The polished normals are built once per cached surface.

To regenerate, download the thirteen source files and run. The first four local filenames below preserve the existing checksum keys:

```sh
python -m pip install -r scripts/requirements-form-model.txt

python scripts/build-form-model.py \
  /path/to/fitt-human-base.obj \
  /path/to/fitt-human-rig.json \
  /path/to/fitt-human-weights.json \
  /path/to/fitt-caucasian-male-young.target \
  /path/to/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target \
  /path/to/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target \
  /path/to/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target \
  /path/to/breast-volume-vert-up.target \
  /path/to/universal-male-young-maxmuscle-averageweight.target \
  /path/to/universal-male-young-maxmuscle-minweight.target \
  /path/to/universal-female-young-maxmuscle-averageweight.target \
  /path/to/universal-female-young-maxmuscle-minweight.target \
  /path/to/caucasian-female-young.target

npx prettier --write \
  src/components/form-guide/male-body-data.json \
  src/components/form-guide/female-body-data.json
```

Compare source checksums with the existing generated asset before accepting an upstream change. The offline chest solver in `scripts/form_chest.py` uses NumPy 2.3.5 and SciPy 1.17.0, pinned in `scripts/requirements-form-model.txt`; these are development dependencies and are not shipped to the browser. The final formatting step uses the repository's pinned Prettier 3.9.10 dependency. Generation and formatting are both required for byte-identical checked-in variants. No asset service, CDN, runtime download, or license credential is required by the application.

Review front, profile, and three-quarter views with muscle highlighting disabled after changing a surface or its normalization. The generator verifies that vertices fully weighted to the head retain exactly one coherent transform. The movement tests cover both model variants, exact shared palm/knee surfaces, facial edge distortion for both heads, bounded female silhouette displacement, continuous noncollapsed chest triangles, and the preserved female lower legs. Review full-body and close-up views as well as the exercised poses; the original low-resolution topology can still show mild faceting at very close zoom.
