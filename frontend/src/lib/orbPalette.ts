// Colours for the floating orb, picked from whatever it is sitting on.
//
// The orb is dragged anywhere and settles on the page canvas, the orange rail,
// a dark panel — one fixed sunset palette clashes on some of those. So after
// it settles we read the surface under it and hand SiriOrb a palette in that
// surface's family: on a strong colour (the rail) a lighter, pearlier set of
// the same hue with a white ring to lift it off; on a neutral or dark surface
// the sunset default, which is what the app's orb looks like everywhere else.

export type OrbColors = { bg: string; c1: string; c2: string; c3: string };
export type OrbPalette = { colors: OrbColors | undefined; ring: boolean };

export const ORB_DEFAULT_PALETTE: OrbPalette = { colors: undefined, ring: false };

// sRGB → OKLCH (lightness 0..1, chroma, hue in degrees). Enough precision for
// picking a palette; not a colour-management library.
export function oklchFromRgb(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const l_ = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m_ = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s_ = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

// Parses "rgb(r, g, b)" / "rgba(r, g, b, a)" as browsers report computed
// colours. Anything else (transparent, a colour space we do not read) is null.
export function parseCssRgb(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value.trim());
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

// The palette for a surface of the given colour.
export function orbPaletteForSurface(rgb: { r: number; g: number; b: number }): OrbPalette {
  const { l, c, h } = oklchFromRgb(rgb.r, rgb.g, rgb.b);
  // Neutral (grey, cream, white) or dark: the sunset orb reads fine as it is.
  if (c < 0.06 || l < 0.35) return ORB_DEFAULT_PALETTE;
  // A strong colour: stay in its family, but lighter and softer so the orb is
  // a pearl of that colour rather than a second lump of it.
  const hue = Math.round(h);
  const spread = (delta: number) => (hue + delta + 360) % 360;
  return {
    colors: {
      bg: `oklch(96% 0.03 ${hue})`,
      c1: `oklch(86% 0.12 ${hue})`,
      c2: `oklch(90% 0.10 ${spread(35)})`,
      c3: `oklch(80% 0.15 ${spread(-25)})`,
    },
    ring: true,
  };
}
