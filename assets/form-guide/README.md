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

There are 13,524 vertices and 27,036 triangles. The model is rendered as a neutral graphite mannequin. Fitt supplies the materials, approximate muscle-region masks, exercise motion, camera system, lighting, and controls. Those surface masks are not separate anatomical muscle meshes.

`male-body-data.json` contains the default adult male surface. The generator combines the male shape target with 85% of the authored maximum-muscle/average-weight target and 15% of its minimum-weight counterpart. These are a convex blend of two authored muscle shapes, giving stronger shoulders, arms, chest, back and thighs with a leaner trunk. The head retains 55% of the male shape target, easing its heavy brow, broad jaw and low skull toward the shared base sculpt. A smooth transition between 0.54 and 0.66 m in source coordinates joins it to the full male body shape. This source blend includes eyeballs and joint helpers.

The generator derives joint locations from that blended source and fits the surface to the canonical bind pose with coherent anatomical frames:

- The skull, jaw, face, and eyeballs share one head transform. All 60 head and facial bones use this frame when generating the surface. Fitting every tiny expression helper independently previously scaled adjacent facial regions by 0.58–1.75, causing folded lips, distorted eyelids, and protruding eyeballs.
- The trunk uses one pelvis-to-shoulder-midpoint transform, preserving the authored male pectorals, abdomen, back, and collarbones. Independently fitting spine, breast, and clavicle helpers to the base anatomy previously introduced creases and false breast folds. The neck transitions smoothly from the trunk frame to the head frame.
- Limbs retain weighted bone-frame transforms and longitudinal scaling. A smooth contact envelope preserves the original palms and knee surfaces so switching appearance does not move support points.

`female-body-data.json` combines 65% of the adult maximum-muscle/average-weight target and 10% of its minimum-weight counterpart for athletic shoulders, arms, legs and trunk. Its head uses 30% of the adult female shape target, with the same 0.54–0.66 m source transition and coherent head frame. The chest blends the authored size/firmness grid at 30% size and 95% firmness, then adds 18% upper volume. Three restrained relaxation passes (32% strength, fading across the first 8 mm of chest-target displacement) soften the coarse lower contour before body fitting.

After fitting, both surfaces receive a deterministic Fitt sculpt in meters. Smooth spatial fields strengthen the shoulder caps and upper arms, taper the waist, and refine the thighs. The male has broader lats, a flatter pectoral plane with a gradual rib transition, and shallow paired abdominal planes. The female has softer abdominal definition, fuller glutes, a rounder supported chest curve, and a gently tapered jaw and cheek contour. These are surface refinements on the source mesh, not medical anatomy or separate muscle meshes. The generator enforces a 50 mm maximum sculpt offset and records the measured maximum in each variant.

Three localized neighbor-relaxation passes polish the coarse skull, cheek, shoulder and chest surfaces. Fine features remain recognizable and the existing eye surfaces are recessed 1.2 mm into their lids. No new geometry, bones or face-by-face rig transforms are introduced. The fully weighted skull, face and eyes still share one coherent fitting transform; surface polish is applied afterward.

The palms and the inner 75 mm knee-contact envelope remain exactly canonical. Sculpt influence fades before those contacts. Below source Y = −0.35 m, the calves and feet retain their previous approved surfaces: the original female/canonical surface and the male surface fitted with 40% of the average-weight muscle target. A smooth transition to the new thighs finishes at −0.23 m. This preserves the reviewed calf and relaxed-foot anatomy as well as the movement's support points.

Both variants contain positions only and record their source checksums. They share the original topology, skin weights, and canonical skeleton in `body-data.json`. That canonical asset remains unchanged and continues to supply muscle-mask coordinates. No animation, contact anchor, or runtime skeleton changes are required for either appearance.

To regenerate, download the thirteen source files and run. The first four local filenames below preserve the existing checksum keys:

```sh
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

Compare source checksums with the existing generated asset before accepting an upstream change. The generator uses only Python's standard library; the final formatting step uses the repository's pinned Prettier 3.9.10 dependency. Both steps are required for byte-identical checked-in variants. No asset service, CDN, runtime download, or license credential is required by the application.

Review front, profile, and three-quarter views with muscle highlighting disabled after changing a surface or its normalization. The generator verifies that vertices fully weighted to the head retain exactly one coherent transform. The movement tests cover both model variants, exact shared palm/knee surfaces, facial edge distortion for both heads, bounded female displacement, and the preserved female lower legs. Review full-body and close-up views as well as the exercised poses; the original low-resolution topology can still show mild faceting at very close zoom.
