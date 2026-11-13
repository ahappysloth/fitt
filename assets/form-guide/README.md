# Form-guide body asset

The Knee Push-up prototype uses the **MakeHuman hm08 base mesh and default rig**, released by their owners under **CC0**. The downloaded OBJ header explicitly dedicates the asset to CC0; the skeleton and skin-weight JSON files each specify `"license": "CC0"`.

Sources:

- [Base mesh](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj)
- [Default skeleton](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default.mhskel)
- [Skin weights](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw)
- Shape targets, all from MakeHuman's `makehuman/data/targets/` directory (the generator reads them by these relative paths):
  - [`macrodetails/caucasian-male-young.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-male-young.target)
  - [`macrodetails/universal-male-young-averagemuscle-averageweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-averagemuscle-averageweight.target)
  - [`macrodetails/universal-male-young-averagemuscle-minweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-averagemuscle-minweight.target)
  - [`macrodetails/universal-male-young-maxmuscle-averageweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target)
  - [`macrodetails/universal-male-young-maxmuscle-minweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-minweight.target)
  - [`macrodetails/universal-female-young-averagemuscle-averageweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-female-young-averagemuscle-averageweight.target)
  - [`macrodetails/universal-female-young-maxmuscle-averageweight.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-female-young-maxmuscle-averageweight.target)
  - [`macrodetails/caucasian-female-young.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-female-young.target)
  - [`breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target)
  - [`breast/female-young-maxmuscle-averageweight-averagecup-maxfirmness.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-maxmuscle-averageweight-averagecup-maxfirmness.target)
  - [`breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target)
  - [`breast/female-young-maxmuscle-averageweight-maxcup-maxfirmness.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/female-young-maxmuscle-averageweight-maxcup-maxfirmness.target)
  - [`breast/breast-dist-incr.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/breast-dist-incr.target)
  - [`breast/breast-point-decr.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/breast-point-decr.target)
  - [`breast/breast-trans-up.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/breast-trans-up.target)
  - [`breast/nipple-point-incr.target`](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/breast/nipple-point-incr.target)
- [MakeHuman project](https://github.com/makehumancommunity/makehuman)

Original credit: Data Collection AB, Joel Palmius, Jonas Hauquier, and the MakeHuman contributors. Mesh/skeleton notices are dated 2020; the skin-weight notice is dated 2021. [CC0-1.0.txt](CC0-1.0.txt) contains the dedication's full legal text, obtained from the SPDX license-list-data project.

All shape targets' headers also explicitly dedicate them to CC0 (September 2020), with original credit to Manuel Bastioni (2014) and the same 2020 rights holders.

## Derived asset

`src/components/form-guide/body-data.json` contains the body and eye surfaces, 163 bones, and the strongest four normalized skin weights per vertex. Editor helpers are excluded. Positions use meters; vertex and skin buffers are encoded as base64 to bundle safely into Next chunks and the self-contained HTML preview. The output records SHA-256 checksums of all three input files.

There are 13,524 vertices and 27,036 triangles. The model is rendered as a satin-gray mannequin. Fitt supplies the materials, approximate muscle-region masks, exercise motion, camera system, lighting, and controls. Those surface masks are not separate anatomical muscle meshes.

`male-body-data.json` contains the default adult male surface. The generator combines the male shape target with a bilinear blend of MakeHuman's authored muscle/weight grid, as MakeHuman's own macro sliders do: maximum muscle, 15% of the way from average to minimum weight. This is a convex blend of the authored shapes, giving athletic shoulders, arms, pectorals, back and thighs. The head retains 55% of the male shape target, easing its heavy brow, broad jaw and low skull toward the shared base sculpt. A smooth transition between 0.54 and 0.66 m in source coordinates joins it to the full male body shape. This source blend includes eyeballs and joint helpers.

The generator derives joint locations from that blended source and fits the surface to the canonical bind pose with coherent anatomical frames:

- The skull, jaw, face, and eyeballs share one head transform. All 60 head and facial bones use this frame when generating the surface. Fitting every tiny expression helper independently previously scaled adjacent facial regions by 0.58–1.75, causing folded lips, distorted eyelids, and protruding eyeballs.
- The trunk uses one pelvis-to-shoulder-midpoint transform, preserving the authored male pectorals, abdomen, back, and collarbones. Independently fitting spine, breast, and clavicle helpers to the base anatomy previously introduced creases and false breast folds. The neck transitions smoothly from the trunk frame to the head frame.
- Limbs retain weighted bone-frame transforms and longitudinal scaling. A smooth contact envelope preserves the original palms and knee surfaces so switching appearance does not move support points.

`female-body-data.json` starts from the authored adult female macro shape at full strength (23% of the way from average to maximum muscle, average weight). Earlier revisions applied only 23% of a female target to the gender-neutral base mesh, and then built the chest procedurally. Its head retains 30% of the adult female shape target, with the same 0.54–0.66 m source transition and coherent head frame. The breasts are MakeHuman's own cup/firmness grid for that muscle blend, at three quarters of maximum cup and full firmness, plus three authored detail targets: `breast-dist-incr` (60%, sets them further apart), `breast-point-decr` (150%, rounder) and `breast-trans-up` (50%, higher).

After fitting, both surfaces receive a deterministic Fitt sculpt in meters. Smooth spatial fields strengthen the male shoulder caps and upper arms, taper the waist, and refine the thighs. The male has broader lats and shallow paired abdominal planes. The male waist keeps most of its width (a 2% taper), the lat taper runs from the armpit to the waist, and the hips and outer upper thighs come in 18 mm a side under it. The female has an 8% waist taper and fuller glutes; her arms and shoulders are the authored female shape. These are surface refinements on the source mesh, not medical anatomy or separate muscle meshes.

### Chest (`authored-chest-1`)

Neither chest is sculpted procedurally. Earlier procedural approaches (a Gaussian dome with a vertical shear, an ellipsoid cap, analytic pectoral plates and height-field breasts) were each rejected in review as not looking like a human chest. Both chests are now the surfaces authored by the MakeHuman artists, with two mesh-quality steps:

- **Apex fairing.** The source's nipple loops form a small cone that reads as a point on an untextured mannequin. The support of `breast/nipple-point-incr.target` (the target is used only to identify those vertices) is grown by three vertex rings and moved along its own normal onto the quadric fitted to the three rings around it, so the apex continues the curvature of the surrounding chest. Two neighbor-relaxation passes blend the patch border. Topology and weights are unchanged.
- **Local subdivision.** One round of Loop subdivision over the front of the thorax (|x| < 0.19 m, y 0.25–0.56 m, front-facing), faded to plain midpoints at the edge of the region and excluding the shoulder attachment (outside 0.10 m, above 0.42 m), whose shared triangles the motions are tuned to. Adjacent faces are split conformingly, so there are no T-junctions or open seams. Normals are angle-weighted; each added vertex fades from its parents' interpolated normal to its own, which avoids a visible line where the region ends.

The male asset has 14,898 vertices and 29,784 triangles; the female has 15,052 and 30,092. The largest forward chest depth is 13.8 cm for the male (unchanged) and 17.0 cm for the female (was 19.4 cm); the female prone fit was refitted to it.

The generator enforces a 50 mm male sculpt limit and a 90 mm female sculpt limit; the sculpts peak at 18 mm and 24 mm. `FITT_FORM_CONFIG` (JSON, for example `{"female": {"cup": 0.75}}`) overrides single values of the generator's `config` to render alternatives without editing it.

Three localized neighbor-relaxation passes polish the coarse skull, cheek, shoulder and chest surfaces (chest strength 60% male, 50% female, which keeps every adjacent pair of faces in the reviewed female chest patch within 60 degrees), with additional female hip and front-armpit fields. The armpit field relaxes the fold where the upper outer breast meets the arm, so it compresses evenly when the arms turn in under the chest (the diamond push-up). Fine features remain recognizable and the existing eye surfaces are recessed 1.2 mm into their lids. This baseline polish introduces no new bones or face-by-face rig transforms. The fully weighted skull, face and eyes still share one coherent fitting transform; surface polish is applied afterward.

The male feet are the canonical feet, blended in by foot and toe skin weight: the male target's toe frames point below the heel, which left its toes 10 mm under it, so a flat foot either lifted the heel or, on the shared placement, lifted the female soles. The motions' sole heights are fitted to this shared foot.

The palms and the inner 75 mm knee-contact envelope remain exactly canonical. Sculpt influence fades before those contacts. Below source Y = −0.35 m, the calves and feet retain their previous approved surfaces: the original female/canonical surface and the male surface fitted with 40% of the average-weight muscle target. A smooth transition to the new thighs finishes at −0.23 m. This preserves the reviewed calf and relaxed-foot anatomy as well as the movement's support points.

Both variants record their source checksums and are stored relative to the canonical mesh (asset `version` 2). `offsets` is base64 Int16 XYZ, in steps of `offsetScale` metres from each canonical vertex; a vertex the body shares with the canonical mesh is exactly zero, so palms, knees and the female lower legs stay bit-identical, and the rest rounds by at most 1.3 µm. Each asset additionally contains `normals` (base64 Int16 unit XYZ, ÷ 32767) and a `topology` record: `baseVertexCount`, `edgeParents` (base64 Uint16 sequential parent pairs), `removedTriangles` (base64 Uint16 positions of the shared triangles the refinement replaced) and `addedIndices` (base64 Uint16 indices of its new triangles). The original vertex prefix keeps the canonical indexing. The runtime derives each appended vertex's canonical coordinates (the midpoint its offset is measured from), four normalized skin weights and muscle-mask values from its two preceding parents, and caches each geometry separately. The skeleton, pose, material, highlights and contact anchors remain shared. Together the two variants are 554 KB of JSON, 335 KB gzipped.

Both bodies receive the same runtime shading polish after loading their generated or authored normals. Two edge-connected passes reduce coarse normal variation without changing any positions, triangles, skin weights or muscle masks. The filter fades across sharper features, never joins disconnected surfaces, and limits each result to 20 degrees from its original normal. Both variants continue to use the same satin material (`roughness: 0.46`, `metalness: 0.18`) in the inspector and workout guide. The polished normals are built once per cached surface.

To regenerate, download the three rig files and the listed targets, keeping the targets' relative paths under one directory. The three local filenames below preserve the existing checksum keys:

```sh
python -m pip install -r scripts/requirements-form-model.txt

python scripts/build-form-model.py \
  /path/to/fitt-human-base.obj \
  /path/to/fitt-human-rig.json \
  /path/to/fitt-human-weights.json \
  /path/to/targets

npx prettier --write \
  src/components/form-guide/male-body-data.json \
  src/components/form-guide/female-body-data.json
```

Compare source checksums with the existing generated asset before accepting an upstream change. The offline generator and `scripts/form_chest.py` use NumPy 2.3.5, pinned in `scripts/requirements-form-model.txt`; these are development dependencies and are not shipped to the browser. The final formatting step uses the repository's pinned Prettier 3.9.10 dependency. Generation and formatting are both required for byte-identical checked-in variants. No asset service, CDN, runtime download, or license credential is required by the application.

Review front, profile, and three-quarter views with muscle highlighting disabled after changing a surface or its normalization. The generator verifies that vertices fully weighted to the head retain exactly one coherent transform. The movement tests cover both model variants, exact shared palm/knee surfaces, facial edge distortion for both heads, bounded female silhouette displacement, continuous noncollapsed chest triangles, and the preserved female lower legs. Review full-body and close-up views as well as the exercised poses; the original low-resolution topology can still show mild faceting at very close zoom.
