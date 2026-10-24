/**
 * Chart color helpers shared by every lightweight-charts instance.
 *
 * lightweight-charts v4 needs concrete hex colors, while the design system
 * exposes Tailwind-style CSS variables ("0 0% 52%" or "hsl(...)") — this
 * module converts between the two. Extracted because the conversion logic
 * was previously duplicated verbatim in CryptoChart and StockChart
 * (docs/AUDIT-REPORT.md M2).
 */

/** Reads a CSS variable and converts it to a hex color lightweight-charts accepts. */
export function getCSSColor(variableName: string): string {
  if (typeof document === 'undefined') return '#888888';
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  if (value.startsWith('hsl(') || value.startsWith('hsla(')) {
    return hslToHex(value);
  }

  // Tailwind CSS variable format like "0 0% 52%" — wrap and convert.
  if (/^\d/.test(value)) {
    return hslToHex(`hsl(${value})`);
  }

  return value || '#888888';
}

/** Convert HSL/HSLA to hex color. */
export function hslToHex(hsl: string): string {
  const inner = hsl.replace(/hsla?\(/, '').replace(/\)/, '');
  const parts = inner.split(/[,\s]+/).filter(Boolean);
  const h = parseInt(parts[0]) / 360;
  const s = parseInt(parts[1]) / 100;
  const l = parseInt(parts[2]) / 100;
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  if (a < 1) {
    const alpha = Math.round(a * 255).toString(16).padStart(2, '0');
    return `${hex}${alpha}`;
  }

  return hex;
}
