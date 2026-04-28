// Helpers for the per-studio branding feature: SVG sanitization (so artist-
// uploaded logos can't carry scripts or external refs into the public consent
// route), color derivation from a single hex (so the artist only picks one
// accent and we expand it into all the glow/dim/rgb tokens the existing CSS
// references), and a plain-CSS-properties object that callers spread onto a
// wrapper to override the theme just for the consent subtree.

import DOMPurify from 'dompurify';

/**
 * Sanitize raw SVG text with DOMPurify's strict SVG profile. Strips scripts,
 * `on*` event handlers, foreignObject, animation-injection vectors, and
 * external href references. Defense-in-depth on top of the consent page
 * always rendering the logo via `<img>` (which sandboxes scripts already).
 *
 * Returns the cleaned string. Throws if the result is empty (i.e. the input
 * wasn't valid SVG markup).
 */
export function sanitizeSvg(raw: string): string {
  const cleaned = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Don't return a DOM node — we want the serialized string for storage.
    RETURN_TRUSTED_TYPE: false,
  });
  const trimmed = (typeof cleaned === 'string' ? cleaned : String(cleaned)).trim();
  if (!trimmed || !trimmed.toLowerCase().includes('<svg')) {
    throw new Error('That file did not contain valid SVG markup.');
  }
  return trimmed;
}

/** Convert sanitized SVG text into a `data:` URL safe to drop into `<img src>`. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Parse `#RRGGBB` (case-insensitive, with or without leading #) into [r,g,b]. */
function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, '');
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16);
    const g = parseInt(m[1] + m[1], 16);
    const b = parseInt(m[2] + m[2], 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
    return null;
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
    return null;
  }
  return null;
}

/** Mix a color with black at the given ratio (0 = unchanged, 1 = pure black). */
function darken(rgb: [number, number, number], ratio: number): [number, number, number] {
  return [
    Math.round(rgb[0] * (1 - ratio)),
    Math.round(rgb[1] * (1 - ratio)),
    Math.round(rgb[2] * (1 - ratio)),
  ];
}

/**
 * Build the CSS variable overrides the consent route applies to its wrapper.
 * Takes the artist's two pickers (accent + bg) and expands them into the full
 * set of tokens the existing components reference (glow, dim, rgb tuple,
 * focus shadow). Any unset value falls through to the default theme.
 */
export function studioBrandingStyle(opts: {
  accent?: string | null;
  bg?: string | null;
}): React.CSSProperties {
  const style: Record<string, string> = {};
  if (opts.bg) {
    style['--color-bg'] = opts.bg;
  }
  if (opts.accent) {
    const rgb = parseHex(opts.accent);
    if (rgb) {
      const [r, g, b] = rgb;
      const dim = darken(rgb, 0.25);
      style['--color-accent'] = opts.accent;
      style['--color-accent-dim'] = `rgb(${dim[0]}, ${dim[1]}, ${dim[2]})`;
      style['--color-accent-glow'] = `rgba(${r}, ${g}, ${b}, 0.12)`;
      style['--accent-rgb'] = `${r}, ${g}, ${b}`;
      style['--shadow-glow'] = `0 0 14px rgba(${r}, ${g}, ${b}, 0.20)`;
      style['--shadow-glow-strong'] = `0 0 22px rgba(${r}, ${g}, ${b}, 0.32)`;
    }
  }
  return style as React.CSSProperties;
}
