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

import math
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


def socket(name, loc):
    """A drop point or label anchor. Exports as a named node."""
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.empty_display_size = 0.12
    return obj


def sphere(name, radius, loc, mat, segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=8, radius=radius, location=loc
    )
    obj = bpy.context.active_object
    obj.name = name
    return assign(obj, mat)


# ---------------------------------------------------------------- bench (12.8)

# Bench layout matches the scene in 12.2: the vessel sits at the origin, the
# bins arc to its left, the product board at +X and the pantry to the far left.
BENCH_HALF_X = 8.2
BENCH_HALF_Y = 4.4


def build_bench():
    bench = make_material("MAT_Bench", (0.62, 0.64, 0.66), 0.0, 0.72)
    surface = make_material("MAT_Surface", (0.74, 0.75, 0.76), 0.0, 0.6)
    metal = make_material("MAT_Metal", (0.58, 0.62, 0.66), 1.0, 0.35)
    dark = make_material("MAT_Dark", (0.30, 0.33, 0.36), 0.2, 0.55)
    accent = make_material("MAT_Accent", (0.10, 0.55, 0.50), 0.0, 0.5)

    parts = [
        # Bench top, bevelled so the edges catch the key light.
        cube(
            "Bench_Top",
            (BENCH_HALF_X * 2, BENCH_HALF_Y * 2, 0.42),
            (0.8, 0, -0.21),
            bench,
            bevel=0.09,
        ),
        cube(
            "Bench_Apron",
            (BENCH_HALF_X * 2 - 0.6, BENCH_HALF_Y * 2 - 0.6, 0.34),
            (0.8, 0, -0.55),
            surface,
            bevel=0.05,
        ),
        # Pantry shelf on the left, two rows of four slots.
        cube("Pantry_Shelf", (2.6, 3.4, 0.16), (-4.9, 0, 0.86), surface, bevel=0.04),
        cube("Pantry_Back", (2.6, 0.12, 1.7), (-4.9, -1.64, 1.7), bench, bevel=0.03),
    ]
    for side in (-1, 1):
        parts.append(
            cube(
                f"Pantry_Leg{side}",
                (0.14, 3.2, 0.86),
                (-4.9 + side * 1.24, 0, 0.43),
                dark,
            )
        )
    for column in range(4):
        for row in range(2):
            x = -4.9 - 0.9 + column * 0.6
            y = -0.72 + row * 1.44
            parts.append(
                cube(
                    f"Pantry_Slot_{column}_{row}",
                    (0.5, 1.2, 0.05),
                    (x, y, 0.96),
                    accent,
                )
            )
            parts.append(socket(f"Socket_Pantry_{column * 2 + row + 1:02d}", (x, y, 1.0)))

    # Return tray, just in front of the vessel.
    parts.append(cube("Return_Tray", (1.5, 1.1, 0.14), (2.0, 2.5, 0.07), dark, bevel=0.04))
    for index, offset in enumerate(((-0.62, 0), (0.62, 0))):
        parts.append(
            cube(f"Return_Wall{index}", (0.08, 1.0, 0.26), (2.0 + offset[0], 2.5, 0.2), metal)
        )
    parts.append(socket("Socket_Return", (2.0, 2.5, 0.3)))

    # Product board at the end of the line.
    parts.append(
        cube("Product_Board", (2.4, 2.4, 0.18), (6.9, 0, 0.09), surface, bevel=0.05)
    )
    parts.append(socket("Socket_Product", (6.9, 0, 0.4)))

    # Two compare plinths beside the board.
    for label, y in (("A", 2.0), ("B", -2.0)):
        parts.append(
            cylinder(f"Plinth_{label}", 0.85, 0.95, 0.5, (6.9, y, 0.25), metal)
        )
        parts.append(socket(f"Socket_Compare_{label}", (6.9, y, 0.75)))

    return export(parts, "bench", "bench")


# ---------------------------------------------------------------- crops (12.8)

CONTAINERS = {
    "crate": {"size": (0.62, 0.62, 0.5), "z": 0.25, "bevel": 0.05},
    "sack": {"size": (0.56, 0.5, 0.72), "z": 0.36, "bevel": 0.1},
    "jar": {"size": (0.44, 0.44, 0.6), "z": 0.3, "bevel": 0.06},
    "bottle": {"size": (0.34, 0.34, 0.82), "z": 0.41, "bevel": 0.06},
}

# Toppers the kit models, keyed by the crop names the catalogue uses. Anything
# not listed falls back to Crop_Generic.
CROPS = [
    ("Sorghum", "sorghum", (0.42, 0.20, 0.12)),
    ("Millet", "millet", (0.78, 0.68, 0.34)),
    ("Maize", "maize", (0.92, 0.74, 0.24)),
    ("Cowpea", "cowpea", (0.86, 0.80, 0.62)),
    ("PigeonPea", "pigeonpea", (0.72, 0.52, 0.26)),
    ("GreenGram", "greengram", (0.36, 0.58, 0.24)),
    ("Beans", "beans", (0.55, 0.22, 0.20)),
    ("MungBean", "mungbean", (0.40, 0.62, 0.28)),
    ("Sesame", "sesame", (0.88, 0.82, 0.66)),
    ("Sunflower", "sunflower", (0.48, 0.48, 0.50)),
    ("Groundnut", "groundnut", (0.80, 0.68, 0.48)),
    ("Cassava", "cassava", (0.84, 0.78, 0.68)),
]


def build_crops():
    """Four containers and the crop toppers. Each group is offset along X so the
    whole kit can be inspected at once; the scene picks one container and one
    topper by name."""
    natural = make_material("MAT_Natural", (0.72, 0.68, 0.58), 0.0, 0.7)
    neutral = make_material("MAT_Surface", (0.74, 0.75, 0.76), 0.0, 0.6)
    parts = []

    for index, (name, spec) in enumerate(CONTAINERS.items()):
        x = index * 1.4
        parts.append(
            cube(
                f"Container_{name}",
                spec["size"],
                (x, 0, spec["z"]),
                neutral,
                bevel=spec["bevel"],
            )
        )

    def heap(prefix, origin_x, count, radius, spread):
        """A small heap of grains sharing the one MAT_Natural material, parented
        to an empty named after the crop so the code can place the whole topper
        as one node."""
        parent = socket(prefix, (origin_x, 0, 0))
        grains = []
        for index in range(count):
            angle = index * 2.399963  # golden angle, an even pile
            distance = spread * (0.35 + 0.65 * (index / max(1, count - 1)))
            x = origin_x + math.cos(angle) * distance
            y = math.sin(angle) * distance
            z = 0.52 + radius * (0.4 + 0.6 * ((index * 7) % 5) / 5)
            grains.append(
                sphere(
                    f"{prefix}_Grain{index}",
                    radius * (0.8 + 0.35 * ((index * 3) % 4) / 4),
                    (x, y, z),
                    natural,
                    segments=10,
                )
            )
        bpy.ops.object.select_all(action="DESELECT")
        for grain in grains:
            grain.select_set(True)
        parent.select_set(True)
        bpy.context.view_layer.objects.active = parent
        bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)
        parts.append(parent)
        parts.extend(grains)

    for index, (name, _key, _color) in enumerate(CROPS):
        heap(f"Crop_{name}", index * 1.1, 9, 0.085, 0.2)

    heap("Crop_Generic", len(CROPS) * 1.1, 9, 0.09, 0.22)
    return export(parts, "crops", "crops")


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
    write_readme(
        build_bench(),
        "bench",
        "Bench top with the pantry shelf (eight sockets), the return tray, the "
        "product board and two compare plinths. Drop points are Empty objects "
        "named Socket_*, which export as named nodes. Materials use the MAT_* "
        "names from guide 12.9 so the code can tint them from the theme tokens.",
    )
    write_readme(
        build_crops(),
        "crops",
        "Four ingredient containers and twelve crop toppers plus Crop_Generic. "
        "An ingredient is shown as a container chosen by its form with a topper "
        "chosen by its crop; MAT_Natural is shared by every topper so the crops "
        "keep their own colours and stay cheap.",
    )


if __name__ == "__main__":
    main()
