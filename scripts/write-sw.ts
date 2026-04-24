import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, posix, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// Vite plugin: after build, rewrite dist/sw.js with a hashed CACHE_NAME and a
// list of URLs to precache on install. Runs post-bundle so the manifest and
// hashed asset filenames are available.
export function writeServiceWorker({ distDir = 'dist' }: { distDir?: string } = {}): Plugin {
  return {
    name: 'ink-bloop-write-sw',
    apply: 'build',
    closeBundle() {
      const root = resolve(process.cwd(), distDir);
      const swPath = resolve(root, 'sw.js');

      // Walk dist/ and collect URLs worth precaching.
      const urls = new Set(['/', '/index.html']);
      walk(root, root, urls);

      // Shell-only precache. On install the SW used to fetch every hashed
      // asset in dist/ (~600KB), which blocked PWA readiness for 20-30s on
      // slow connections after every deploy. Route chunks and vendor chunks
      // are large and only needed when the user navigates to them, so we
      // let the fetch handler cache them on first request instead.
      const SHELL_PATTERNS: RegExp[] = [
        /^\/$/,
        /^\/index\.html$/,
        /^\/manifest\.json$/,
        /^\/assets\/index-[^/]+\.(js|css)$/, // main entry bundle + CSS
        /^\/inkbloop_logo\.png$/,
        /^\/apple-touch-icon(?:-\d+x\d+)?\.png$/,
      ];
      const filtered = [...urls].filter((u) => {
        if (u.startsWith('/simulator/')) return false;
        if (u === '/palette-preview.html') return false;
        return SHELL_PATTERNS.some((re) => re.test(u));
      });

      // Stable cache name derived from the content of the precache list so
      // CACHE_NAME changes iff any precached URL (hashed filenames) changes.
      const hash = createHash('sha256')
        .update(filtered.sort().join('\n'))
        .digest('hex')
        .slice(0, 10);
      const cacheName = `inkbloop-${hash}`;

      const template = readFileSync(swPath, 'utf8');
      const replaced = template
        .replace(
          /const CACHE_NAME = .*?;/,
          `const CACHE_NAME = ${JSON.stringify(cacheName)};`
        )
        .replace(
          /const PRECACHE_URLS = .*?;/,
          `const PRECACHE_URLS = ${JSON.stringify(filtered.sort())};`
        );

      writeFileSync(swPath, replaced);
      // eslint-disable-next-line no-console
      console.log(
        `[write-sw] ${swPath} → ${filtered.length} URLs, cache=${cacheName}`
      );
    },
  };
}

function walk(root: string, dir: string, out: Set<string>) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(root, full, out);
      continue;
    }
    // Skip the SW itself and the HTML we pre-cache via '/index.html'.
    if (full === resolve(root, 'sw.js')) continue;
    if (full === resolve(root, 'index.html')) continue;
    // 404.html isn't useful offline either.
    if (full === resolve(root, '404.html')) continue;

    const rel = relative(root, full).split(sep).join(posix.sep);
    const url = '/' + rel;

    // Only precache small-ish text/binary assets. Skip giant PNGs.
    if (/\.(png|jpe?g)$/i.test(url) && st.size > 150 * 1024) continue;

    out.add(url);
  }
}
