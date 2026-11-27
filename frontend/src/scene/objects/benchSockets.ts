/**
 * Socket lookup for `bench.glb` (guide §12.8, §12.9).
 *
 * Sockets are Empty objects in Blender. They export as named nodes and the code
 * reads their positions for drop points and label anchors, so no drop point is
 * hard-coded in a component. The bench registers its sockets here once it has
 * loaded; until then (and if the GLB fails to load, which falls back to
 * procedural geometry) the asset's own authored values below are used, so the
 * drop targets never move between the two cases.
 */

export type Vec3Tuple = [number, number, number];

/** Named sockets the scene places single objects on. */
export const BENCH_SOCKET = {
  return: "Socket_Return",
  product: "Socket_Product",
  compareA: "Socket_Compare_A",
  compareB: "Socket_Compare_B",
} as const;

export type BenchSocketName = (typeof BENCH_SOCKET)[keyof typeof BENCH_SOCKET];

/** The eight pantry slots, in the order crops fill them. */
export const PANTRY_SOCKETS = [
  "Socket_Pantry_01",
  "Socket_Pantry_02",
  "Socket_Pantry_03",
  "Socket_Pantry_04",
  "Socket_Pantry_05",
  "Socket_Pantry_06",
  "Socket_Pantry_07",
  "Socket_Pantry_08",
] as const;

/** How many crops the pantry shelf can show at once. */
export const PANTRY_CAPACITY = PANTRY_SOCKETS.length;

/**
 * The positions authored in `bench.glb`. Kept as the fallback so a failed or
 * pending asset load still puts the drop targets where the bench will draw
 * them. `tests/cropModels.test.ts` asserts every name exists in the asset.
 */
const AUTHORED: Record<string, Vec3Tuple> = {
  Socket_Return: [2, 0.3, -2.5],
  Socket_Product: [6.9, 0.4, 0],
  Socket_Compare_A: [6.9, 0.75, -2],
  Socket_Compare_B: [6.9, 0.75, 2],
  Socket_Pantry_01: [-5.8, 1, 0.72],
  Socket_Pantry_02: [-5.8, 1, -0.72],
  Socket_Pantry_03: [-5.2, 1, 0.72],
  Socket_Pantry_04: [-5.2, 1, -0.72],
  Socket_Pantry_05: [-4.6, 1, 0.72],
  Socket_Pantry_06: [-4.6, 1, -0.72],
  Socket_Pantry_07: [-4, 1, 0.72],
  Socket_Pantry_08: [-4, 1, -0.72],
};

/** Positions read from the loaded asset, which win over the authored values. */
let loaded: Record<string, Vec3Tuple> = {};

/** Records the socket positions found in a loaded bench. */
export function setBenchSockets(sockets: Record<string, Vec3Tuple>): void {
  loaded = sockets;
}

/** The position of one socket: from the loaded asset, else as authored. */
export function benchSocket(name: string): Vec3Tuple {
  return loaded[name] ?? AUTHORED[name] ?? [0, 0, 0];
}

/** True once a loaded bench has registered its sockets. */
export function benchSocketsLoaded(): boolean {
  return Object.keys(loaded).length > 0;
}

/** Forgets the loaded sockets. Used by tests. */
export function resetBenchSockets(): void {
  loaded = {};
}
