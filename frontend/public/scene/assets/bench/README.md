# bench.glb

Bench top with the pantry shelf (eight sockets), the return tray, the product board and two compare plinths. Drop points are Empty objects named Socket__, which export as named nodes. Materials use the MAT__ names from guide 12.9 so the code can tint them from the theme tokens.

- Blender source: `scripts/blender/build_assets.py` (function `build_bench`)
- Blender version: 5.3.0
- Export: glTF 2.0 binary (GLB), Y-up, applied modifiers
- Origin: base centre, +Y up in the exported file

Regenerate with:

```sh
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --python scripts/blender/build_assets.py
```
