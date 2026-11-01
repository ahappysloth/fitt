# Form-guide body asset

The Knee Push-up prototype uses the **MakeHuman hm08 base mesh and default rig**, released by their owners under **CC0**. The downloaded OBJ header explicitly dedicates the asset to CC0; the skeleton and skin-weight JSON files each specify `"license": "CC0"`.

Sources:

- [Base mesh](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj)
- [Default skeleton](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default.mhskel)
- [Skin weights](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw)
- [Male shape target](https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/macrodetails/caucasian-male-young.target)
- [MakeHuman project](https://github.com/makehumancommunity/makehuman)

Original credit: Data Collection AB, Joel Palmius, Jonas Hauquier, and the MakeHuman contributors. Mesh/skeleton notices are dated 2020; the skin-weight notice is dated 2021. [CC0-1.0.txt](CC0-1.0.txt) contains the dedication's full legal text, obtained from the SPDX license-list-data project.

The male target's header also explicitly dedicates it to CC0 (September 2020), with original credit to Manuel Bastioni (2014) and the same 2020 rights holders.

## Derived asset

`src/components/form-guide/body-data.json` contains the body and eye surfaces, 163 bones, and the strongest four normalized skin weights per vertex. Editor helpers are excluded. Positions use meters; vertex and skin buffers are encoded as base64 to bundle safely into Next chunks and the self-contained HTML preview. The output records SHA-256 checksums of all three input files.

There are 13,524 vertices and 27,036 triangles. The model is rendered as a neutral graphite mannequin. Fitt supplies the materials, approximate muscle-region masks, exercise motion, camera system, lighting, and controls. Those surface masks are not separate anatomical muscle meshes.

`male-body-data.json` adds an authored male surface, now the default. The existing base surface remains the female option. Both share topology, weights, height, and the canonical skeleton. The generator applies the male target, derives its joint locations from the source helpers, then retargets the surface into the canonical bind pose using weighted bone-frame transforms and longitudinal scaling. A smooth contact envelope preserves the original palm and knee surfaces so switching appearance does not move support points. The added asset records all four source checksums; it contains positions only, rather than duplicating the rig or topology.

To regenerate, download the four source files and run:

```sh
python scripts/build-form-model.py /path/to/base.obj /path/to/default.mhskel /path/to/default_weights.mhw /path/to/caucasian-male-young.target
```

Compare source checksums with the existing generated asset before accepting an upstream change. The generator uses only Python's standard library. No asset service, CDN, runtime download, or license credential is required by the application.
