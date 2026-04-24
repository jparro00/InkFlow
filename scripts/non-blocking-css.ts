import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Vite plugin: rewrite dist/index.html so the main CSS <link> doesn't block
// first paint. The boot splash has all-inline styles, so deferring the
// stylesheet lets the splash appear immediately while CSS loads in parallel.
//
// Standard preload/onload swap pattern:
//   <link rel="preload" as="style" href="..."
//         onload="this.onload=null;this.rel='stylesheet'">
//   <noscript><link rel="stylesheet" href="..."></noscript>
export function nonBlockingCssLink({ distDir = 'dist' }: { distDir?: string } = {}): Plugin {
  return {
    name: 'ink-bloop-non-blocking-css',
    apply: 'build',
    closeBundle() {
      const htmlPath = resolve(process.cwd(), distDir, 'index.html');
      const html = readFileSync(htmlPath, 'utf8');

      // Match Vite's emitted stylesheet link. Tolerant of attribute order.
      const cssLinkRegex = /<link rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*)>/;
      const match = html.match(cssLinkRegex);
      if (!match) {
        // eslint-disable-next-line no-console
        console.warn('[non-blocking-css] no stylesheet <link> found in', htmlPath);
        return;
      }

      const [original, attrsBefore, href, attrsAfter] = match;
      const otherAttrs = `${attrsBefore} ${attrsAfter}`.replace(/\s+/g, ' ').trim();
      const attrPrefix = otherAttrs ? ` ${otherAttrs}` : '';

      const replacement =
        `<link rel="preload" as="style"${attrPrefix} href="${href}" onload="this.onload=null;this.rel='stylesheet'">` +
        `\n    <noscript><link rel="stylesheet"${attrPrefix} href="${href}"></noscript>`;

      const next = html.replace(original, replacement);
      writeFileSync(htmlPath, next);
      // eslint-disable-next-line no-console
      console.log(`[non-blocking-css] rewrote ${htmlPath} → ${href} now non-blocking`);
    },
  };
}
