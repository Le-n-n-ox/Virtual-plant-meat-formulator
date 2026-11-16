"""
Build the schematic 3D scene assets in Blender and export them as GLB.

Run headless from the frontend directory:

    "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --python scripts/blender/build_assets.py

Each asset lands in ``public/scene/assets/<name>/<name>.glb`` with a README.md
beside it. The models are deliberately schematic (primitives only) so they stay
small and match the procedural scene geometry they replace.

Local conventions (Blender Z-up, converted to glTF Y-up on export):
  * origin at the base centre of the object; the patty asset is centred on its
    own mid-height because the scene spins it around that point
  * +Z is up in Blender, which becomes +Y in the GLB
"""

import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "public", "scene", "assets")

BLENDER_VERSION = bpy.app.version_string


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_material(name, color, metallic=0.6, roughness=0.35, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return mat
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        for attr, value in (
            ("blend_method", "BLEND"),
            ("surface_render_method", "BLENDED"),
        ):
            try:
                setattr(mat, attr, value)
            except Exception:
                pass
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def cylinder(name, r1, r2, depth, loc, mat, vertices=48):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc
    )
    obj = bpy.context.active_object
    obj.name = name
    return assign(obj, mat)


def cube(name, size, loc, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 4
    return assign(obj, mat)


def torus(name, major, minor, loc, mat):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc
    )
    obj = bpy.context.active_object
    obj.name = name
    return assign(obj, mat)


def export(objects, folder_name, file_name):
    folder = os.path.join(ASSETS, folder_name)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    target = os.path.join(folder, f"{file_name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
    )
    print(f"wrote {target}")
    return folder


def write_readme(folder, asset_name, summary):
    path = os.path.join(folder, "README.md")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(
            f"# {asset_name}.glb\n\n"
            f"{summary}\n\n"
            f"- Blender source: `scripts/blender/build_assets.py` "
            f"(function `build_{asset_name.replace('-', '_')}`)\n"
            f"- Blender version: {BLENDER_VERSION}\n"
            f"- Export: glTF 2.0 binary (GLB), Y-up, applied modifiers\n"
            f"- Origin: base centre, +Y up in the exported file\n\n"
            "Regenerate with:\n\n"
            "```sh\n"
            '"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" '
            "-b --python scripts/blender/build_assets.py\n"
            "```\n"
        )
    print(f"wrote {path}")


# ---------------------------------------------------------------- ingredients bin

def build_ingredient_bin():
    metal = make_material("BinMetal", (0.62, 0.66, 0.70), 0.7, 0.28)
    glass = make_material("BinGlass", (0.86, 0.93, 0.96), 0.05, 0.08, 0.28)
    parts = [
        cylinder("BinBase", 0.62, 0.66, 0.06, (0, 0, 0.03), metal),
        torus("BinFoot", 0.62, 0.022, (0, 0, 0.07), metal),
        cylinder("BinGlass", 0.56, 0.50, 1.20, (0, 0, 0.68), glass),
        torus("BinRim", 0.56, 0.035, (0, 0, 1.28), metal),
    ]
    for index, y in enumerate((0.35, 0.65, 0.95)):
        parts.append(
            torus(f"BinTick{index}", 0.545, 0.006, (0, 0, 0.08 + y), metal)
        )
    return export(parts, "ingredient-bin", "ingredient-bin")


# ---------------------------------------------------------------- mixing vessel

def build_mixing_vessel():
    metal = make_material("VesselMetal", (0.62, 0.66, 0.70), 0.7, 0.28)
    glass = make_material("VesselGlass", (0.88, 0.94, 0.97), 0.05, 0.08, 0.24)
    parts = [
        cylinder("VesselBase", 1.16, 1.30, 0.32, (0, 0, 0.16), metal),
        torus("VesselBand", 1.20, 0.05, (0, 0, 0.33), metal),
        cylinder("VesselGlass", 1.02, 1.50, 1.28, (0, 0, 0.98), glass),
        torus("VesselRim", 1.50, 0.035, (0, 0, 1.62), metal),
    ]
    return export(parts, "mixing-vessel", "mixing-vessel")


# ---------------------------------------------------------------- processing line

def build_processing_line():
    metal = make_material("LineMetal", (0.58, 0.62, 0.66), 0.65, 0.35)
    dark = make_material("LineDark", (0.36, 0.40, 0.44), 0.4, 0.5)
    # Authored centred on its own origin; the scene places it at the line centre.
    parts = [
        cube("LineRail", (4.5, 1.05, 0.36), (0, 0, 0.24), metal),
        cube("LineLegA", (0.16, 0.8, 0.24), (-1.95, 0, 0.12), dark),
        cube("LineLegB", (0.16, 0.8, 0.24), (1.95, 0, 0.12), dark),
        cube("LineBed", (4.3, 0.92, 0.02), (0, 0, 0.43), dark),
    ]
    return export(parts, "processing-line", "processing-line")


# ---------------------------------------------------------------- candidate pedestal

def build_candidate_pedestal():
    metal = make_material("PedestalMetal", (0.62, 0.66, 0.70), 0.7, 0.3)
    return export(
        [cylinder("Pedestal", 1.05, 1.18, 0.44, (0, 0, 0.22), metal)],
        "candidate-pedestal",
        "pedestal",
    )


# ---------------------------------------------------------------- candidate patty

def build_candidate_patty():
    crust = make_material("PattyCrust", (0.55, 0.34, 0.20), 0.0, 0.85)
    # Blender cube size is (x, y, z) = (width, depth, height); the GLB converts
    # Z-up to Y-up, so height stays the third component. Origin at the centre
    # because the scene spins the patty around this point.
    return export(
        [cube("Patty", (1.5, 0.95, 0.52), (0, 0, 0), crust, bevel=0.18)],
        "candidate-patty",
        "patty",
    )


def main():
    reset_scene()
    write_readme(
        build_ingredient_bin(),
        "ingredient-bin",
        "Schematic ingredient hopper: base, foot ring, glass wall, rim and "
        "measurement ticks. The fill level is drawn procedurally on top.",
    )
    write_readme(
        build_mixing_vessel(),
        "mixing-vessel",
        "Schematic mixing vessel: metal base and band, glass body and rim. "
        "Contents, paddle and bubbles stay procedural.",
    )
    write_readme(
        build_processing_line(),
        "processing-line",
        "Schematic conveyor rail, legs and bed. Tread slats, station barrels "
        "and beacons stay procedural so status colours remain dynamic.",
    )
    write_readme(
        build_candidate_pedestal(),
        "pedestal",
        "Schematic pedestal for the candidate preview. Illustrative only; not "
        "derived from a prediction.",
    )
    write_readme(
        build_candidate_patty(),
        "patty",
        "Schematic beveled patty body for the candidate preview. Crust, fibre "
        "striations and the cut face stay procedural. Illustrative only.",
    )


if __name__ == "__main__":
    main()
