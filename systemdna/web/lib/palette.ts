// SystemDNA brand palette: charcoal + acid. Shared by the app, the 2D map and the 3D model.
// Acid is the one brand colour. Layer accents are used only as thin marks (strips, dots,
// bands), never as fills, so screens stay calm. State colours mean state, nothing else.

export const BRAND = {
  acid: "#D8F53F",
  /** Acid as text on light surfaces (acid itself fails contrast on white). */
  acidInk: "#6B7F00",
  charcoal: "#0E0F0C",
  graphite: "#181A16",
  bone: "#F6F5F1",
} as const;

export const STATE = {
  impact: "#FF5A36",
  fixed: "#3DDC97",
  pii: "#E8B04A",
  blocked: "#FF5A36",
} as const;

/** Layer accents, assigned in the order the graph lists its layers. */
export const LAYER_ACCENTS = [
  "#7AA2FF", // cobalt
  "#B18CFF", // violet
  "#4FD1C5", // teal
  "#D8F53F", // acid
  "#FF9F6B", // apricot
  "#FF7A9A", // rose
  "#FFD166", // amber
  "#9A9B94", // stone (tests and docs usually land last)
] as const;

export function layerAccent(index: number) {
  return LAYER_ACCENTS[((index % LAYER_ACCENTS.length) + LAYER_ACCENTS.length) % LAYER_ACCENTS.length];
}

/** Accent for a layer id, given the graph's layer list. Unknown layers get stone. */
export function accentForLayer(layers: { id: string }[], id: string) {
  const i = layers.findIndex((l) => l.id === id);
  return i < 0 ? LAYER_ACCENTS[7] : layerAccent(i);
}
