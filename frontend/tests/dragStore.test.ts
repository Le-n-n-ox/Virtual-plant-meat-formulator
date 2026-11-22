import { beforeEach, describe, expect, it } from "vitest";
import { useDragStore } from "@/stores/dragStore";

/**
 * The drag store is the single source of truth shared by the HTML picker, the 3D
 * canvas and the 2D schematic (guide §12.3), so its transitions are unit-tested
 * directly rather than through a canvas.
 */

function begin(id = "ing_a", label = "Cowpea flour") {
  useDragStore.getState().begin({
    kind: "ingredient",
    id,
    source: "pantry",
    origin: { x: 10, y: 10 },
    pointerId: 1,
    label,
  });
}

beforeEach(() => {
  useDragStore.getState().reset();
});

describe("dragStore", () => {
  it("starts in the grab phase with an announcement", () => {
    begin();
    const state = useDragStore.getState();
    expect(state.phase).toBe("grab");
    expect(state.kind).toBe("ingredient");
    expect(state.id).toBe("ing_a");
    expect(state.active).toBe(false);
    expect(state.label).toBe("Cowpea flour");
    expect(state.announcement).toContain("Cowpea flour pressed");
  });

  it("ignores movement until the grab threshold is passed", () => {
    begin();
    useDragStore.getState().move({ x: 20, y: 20 });
    expect(useDragStore.getState().phase).toBe("grab");
    expect(useDragStore.getState().active).toBe(false);
  });

  it("grabs and announces the pick-up", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    const state = useDragStore.getState();
    expect(state.phase).toBe("carry");
    expect(state.active).toBe(true);
    expect(state.announcement).toContain("picked up");
  });

  it("does not grab twice", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().grab("Cowpea flour");
    expect(useDragStore.getState().phase).toBe("carry");
  });

  it("tracks the pointer before the threshold but does not carry yet", () => {
    begin();
    useDragStore.getState().move({ x: 40, y: 40 });
    const state = useDragStore.getState();
    expect(state.pointer).toEqual({ x: 40, y: 40 });
    expect(state.phase).toBe("grab");
    expect(state.active).toBe(false);
  });

  it("enters the over-target phase and announces the target", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("vessel", "Cowpea flour");
    const state = useDragStore.getState();
    expect(state.phase).toBe("over-target");
    expect(state.target).toBe("vessel");
    expect(state.announcement).toContain("over vessel");
    expect(state.announcement).toContain("add");
  });

  it("announces removal for the tray", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("tray", "Cowpea flour");
    expect(useDragStore.getState().announcement).toContain("remove");
  });

  it("returns to carry when the target clears", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("vessel", "Cowpea flour");
    useDragStore.getState().setTarget(null, "Cowpea flour");
    expect(useDragStore.getState().phase).toBe("carry");
    expect(useDragStore.getState().target).toBeNull();
  });

  it("does not repeat the same target", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("vessel", "Cowpea flour");
    const first = useDragStore.getState().announcement;
    useDragStore.getState().setTarget("vessel", "Cowpea flour");
    expect(useDragStore.getState().announcement).toBe(first);
  });

  it("records the world position and the canvas handoff", () => {
    begin();
    useDragStore.getState().setWorld({ x: 1.5, z: -0.5 });
    useDragStore.getState().setInCanvas(true);
    const state = useDragStore.getState();
    expect(state.world).toEqual({ x: 1.5, z: -0.5 });
    expect(state.inCanvas).toBe(true);
  });

  it("announces a drop and clears the carry", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("vessel", "Cowpea flour");
    useDragStore.getState().finish("drop", "Cowpea flour");
    const state = useDragStore.getState();
    expect(state.phase).toBe("drop");
    expect(state.active).toBe(false);
    expect(state.announcement).toContain("added to the formulation");
    expect(state.announcement).toContain("validation");
  });

  it("announces a cancel and changes nothing", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().finish("cancel", "Cowpea flour");
    const state = useDragStore.getState();
    expect(state.phase).toBe("cancel");
    expect(state.announcement).toContain("Nothing changed");
  });

  it("records a rejection with its reason", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().setTarget("tray", "Cowpea flour");
    useDragStore
      .getState()
      .finish("reject", "Cowpea flour", "not in the draft");
    const state = useDragStore.getState();
    expect(state.phase).toBe("reject");
    expect(state.rejection).toBe("not in the draft");
    expect(state.announcement).toContain("not in the draft");
  });

  it("reset clears every field", () => {
    begin();
    useDragStore.getState().grab("Cowpea flour");
    useDragStore.getState().reset();
    const state = useDragStore.getState();
    expect(state.phase).toBe("hover");
    expect(state.id).toBe("");
    expect(state.target).toBeNull();
    expect(state.world).toBeNull();
    expect(state.pointerId).toBeNull();
    expect(state.announcement).toBe("");
  });
});
