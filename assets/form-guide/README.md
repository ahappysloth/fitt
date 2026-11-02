# Form-guide body asset

The Knee Push-up prototype uses the **MakeHuman hm08 base mesh and default rig**, released by their owners under **CC0**. The downloaded OBJ header explicitly dedicates the asset to CC0; the skeleton and skin-weight JSON files each specify `"license": "CC0"`.

Sources:

- [Base mesh](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj)
- [Default skeleton](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default.mhskel)
- [Skin weights](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw)
- [Male shape target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-male-young.target)
- [Adult male muscle target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target)
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

`male-body-data.json` contains the authored male surface, the default appearance. The generator applies the male shape target plus 40% of the authored adult, average-weight muscle target for moderate pectoral, shoulder, arm and trunk definition. The average-muscle counterpart is an empty target, so this is a direct interpolation from average toward maximum muscle. The head retains 55% of the male shape target, easing its heavy brow, broad jaw and low skull toward the shared base sculpt. A smooth transition between 0.54 and 0.66 m in source coordinates joins it to the full male body shape. This blend includes eyeballs and source joint helpers; it does not rescale individual facial features.

The generator derives joint locations from that blended source and fits the surface to the canonical bind pose with coherent anatomical frames:

- The skull, jaw, face, and eyeballs share one head transform. All 60 head and facial bones use this frame when generating the surface. Fitting every tiny expression helper independently previously scaled adjacent facial regions by 0.58–1.75, causing folded lips, distorted eyelids, and protruding eyeballs.
- The trunk uses one pelvis-to-shoulder-midpoint transform, preserving the authored male pectorals, abdomen, back, and collarbones. Independently fitting spine, breast, and clavicle helpers to the base anatomy previously introduced creases and false breast folds. The neck transitions smoothly from the trunk frame to the head frame.
- Limbs retain weighted bone-frame transforms and longitudinal scaling. A smooth contact envelope preserves the original palms and knee surfaces so switching appearance does not move support points.

`female-body-data.json` retains the original female surface with a rounder, athletic chest using authored adult morphs. The generator bilinearly blends the size/firmness target grid at 30% size and 95% firmness, then applies 50% of the upper-volume target. Three restrained surface-relaxation passes (32% strength, fading across the first 8 mm of authored displacement) soften the coarse mesh's angular lower contour. Relaxation follows the existing triangle neighbors in sorted order and is confined to the authored morph support. This combination rounds the upper curve and lower transition while limiting enlargement and downward elongation. It affects 455 visible chest and upper-torso vertices, with a maximum displacement of 20.50 mm from the canonical surface. The face, limbs, palms, and knees retain their original positions.

Both variants contain positions only and record their source checksums. They share the original topology, skin weights, and canonical skeleton in `body-data.json`. That canonical asset remains unchanged and continues to supply muscle-mask coordinates. No animation, contact anchor, or runtime skeleton changes are required for either appearance.

To regenerate, download the nine source files and run. The first four local filenames below preserve the existing checksum keys:

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
  /path/to/universal-male-young-maxmuscle-averageweight.target
```

Compare source checksums with the existing generated asset before accepting an upstream change. The generator uses only Python's standard library. No asset service, CDN, runtime download, or license credential is required by the application.

Review front, profile, and three-quarter views with muscle highlighting disabled after changing a surface or its normalization. The generator verifies that vertices fully weighted to the head retain exactly one coherent transform. The movement tests cover both model variants, shared contact surfaces, facial edge distortion, and the limited extent of the female chest adjustment.
