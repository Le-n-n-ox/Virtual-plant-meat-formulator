import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONTAINER_NODE,
  GENERIC_TOPPER,
  TOPPER_NAMES,
  containerForForm,
  hasOwnTopper,
  seedCropModels,
  topperForCrop,
} from "@/scene/cropModels";
import { BENCH_SOCKET, PANTRY_SOCKETS } from "@/scene/objects/benchSockets";
import type { IngredientFacets } from "@/types";

/**
 * Node names declared inside a `.glb`, read from its JSON chunk. The scene
 * finds parts by name, so these assertions check the code against the real
 * asset rather than against a list copied by hand.
 */
function glbNodeNames(path: string): string[] {
  const file = readFileSync(path);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(file.subarray(20, 20 + jsonLength)),
  ) as { nodes?: { name?: string }[] };
  return (json.nodes ?? []).map((node) => node.name ?? "");
}

const facets: IngredientFacets = {
  crops: [
    { value: "Cowpea", count: 41 },
    { value: "Sorghum", count: 33 },
    { value: "Maize", count: 28 },
    { value: "Mung bean", count: 12 },
    { value: "Something unusual", count: 3 },
  ],
  forms: [],
  sources: [],
};

describe("containerForForm", () => {
  it("picks a container from the ingredient's form", () => {
    expect(containerForForm("flour")).toBe("sack");
    expect(containerForForm("protein isolate")).toBe("sack");
    expect(containerForForm("oil")).toBe("bottle");
    expect(containerForForm("juice")).toBe("bottle");
    expect(containerForForm("raw")).toBe("crate");
    expect(containerForForm("whole")).toBe("crate");
    expect(containerForForm("granule")).toBe("jar");
    expect(containerForForm(null)).toBe("crate");
    expect(containerForForm("something else")).toBe("crate");
  });

  it("maps every container kind to a node in crops.glb", () => {
    const nodes = glbNodeNames("public/scene/assets/crops/crops.glb");
    for (const node of Object.values(CONTAINER_NODE)) {
      expect(nodes).toContain(node);
    }
  });
});

describe("crops.glb contract", () => {
  it("contains every topper the mapping can return", () => {
    const nodes = glbNodeNames("public/scene/assets/crops/crops.glb");
    for (const topper of TOPPER_NAMES) {
      expect(nodes).toContain(topper);
    }
  });
});

describe("bench.glb contract", () => {
  it("contains every socket the scene places objects on", () => {
    const nodes = glbNodeNames("public/scene/assets/bench/bench.glb");
    for (const socket of Object.values(BENCH_SOCKET)) {
      expect(nodes).toContain(socket);
    }
    for (const socket of PANTRY_SOCKETS) {
      expect(nodes).toContain(socket);
    }
  });
});

describe("topperForCrop", () => {
  it("binds a crop to its modelled topper", () => {
    expect(topperForCrop("Sorghum")).toBe("Crop_Sorghum");
    expect(topperForCrop("sorghum")).toBe("Crop_Sorghum");
    expect(topperForCrop("Cowpea")).toBe("Crop_Cowpea");
    expect(topperForCrop("Green gram")).toBe("Crop_GreenGram");
  });

  it("falls back to the generic topper", () => {
    expect(topperForCrop("Something unusual")).toBe(GENERIC_TOPPER);
    expect(topperForCrop(null)).toBe(GENERIC_TOPPER);
    expect(topperForCrop("")).toBe(GENERIC_TOPPER);
  });

  it("knows which crops have their own topper", () => {
    expect(hasOwnTopper("Maize")).toBe(true);
    expect(hasOwnTopper("Something unusual")).toBe(false);
  });
});

describe("seedCropModels", () => {
  it("orders the catalogue crops most common first", () => {
    const seed = seedCropModels(facets);
    expect(seed.crops.map((c) => c.name)).toEqual([
      "Cowpea",
      "Sorghum",
      "Maize",
      "Mung bean",
      "Something unusual",
    ]);
  });

  it("binds the crops the kit models and generics the rest", () => {
    const seed = seedCropModels(facets);
    expect(seed.byCrop.cowpea).toBe("Crop_Cowpea");
    expect(seed.byCrop.sorghum).toBe("Crop_Sorghum");
    expect(seed.byCrop.maize).toBe("Crop_Maize");
    // "Mung bean" normalises to mungbean, which the kit does model.
    expect(seed.byCrop.mungbean).toBe("Crop_MungBean");
    expect(seed.byCrop["somethingunusual"]).toBe(GENERIC_TOPPER);
  });

  it("the seeded mapping wins over the built-in fallback", () => {
    const seed = seedCropModels(facets);
    expect(topperForCrop("Something unusual", seed.byCrop)).toBe(
      GENERIC_TOPPER,
    );
    expect(topperForCrop("Mung bean", seed.byCrop)).toBe("Crop_MungBean");
  });
});
