# Scene assets

Blender-authored GLB models for the 3D workspace, one folder per asset with its
own `README.md`.

| Asset              | File                                  | Used by                                             |
| ------------------ | ------------------------------------- | --------------------------------------------------- |
| Ingredient bin     | `ingredient-bin/ingredient-bin.glb`   | `IngredientBin` (one instance per formulation line) |
| Mixing vessel      | `mixing-vessel/mixing-vessel.glb`     | `MixingVessel`                                      |
| Processing line    | `processing-line/processing-line.glb` | `ProcessLine`                                       |
| Candidate pedestal | `candidate-pedestal/pedestal.glb`     | `CandidateProduct`                                  |
| Candidate patty    | `candidate-patty/patty.glb`           | `CandidateProduct`                                  |

## Regenerating

The models are schematic primitives authored by a script, not hand-modelled, so
they can be rebuilt at any time:

```sh
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --python scripts/blender/build_assets.py
```

The script exports each object with `export_yup=True`, so Blender's Z-up becomes
glTF's Y-up, and applies modifiers (the patty's bevel). It also rewrites the
per-asset README.

## Runtime behaviour

`SceneModel` (`src/scene/objects/SceneModel.tsx`) loads these files:

- a low-poly procedural **placeholder** renders while the GLB downloads;
- if the GLB fails to load, the **procedural geometry** that used to stand in
  for it renders instead, so a missing asset never removes an object;
- a `tints` map re-colours named Blender materials from the theme tokens, so an
  asset follows light/dark themes like the procedural scene.

The whole scene still falls back to the 2D view if WebGL itself fails.

## Notes

- These models are schematic illustrations of the workflow. They are not
  engineering drawings, and their proportions are not derived from any
  validated model.
- Keep them small: primitives only, no textures, no animation. Dynamic parts
  (fill levels, station status colours, the paddle, the spinning patty) stay
  procedural.
