// Inline PDF preview that fits-to-container on iOS Safari.
//
// iOS WebKit's PDF iframe renderer ignores the standard PDF Open Parameters
// (#view=Fit, &zoom=…) so a normal letter-size PDF inside a small iframe ends
// up zoomed in with the user panning around. Workaround: set the iframe
// element to the PDF's natural pixel size (612×792 for letter), then CSS
// transform scales the WHOLE iframe element down to fit the container. The
// PDF renders at 100% inside its own iframe (no internal pan needed) and
// the visible viewport is the scaled-down iframe. Works on iOS, desktop
// Chrome/Firefox/Safari, Android Chrome.
//
// Source: empirically the only reliable way to render a fit-to-width PDF
// preview inline across mobile WebKit + desktop browsers without dragging in
// pdf.js. Trade-off: pinch-to-zoom inside the iframe is disabled (the
// transform freezes the visible scale). For the public client wizard that's
// what we want — the PDF is read-only at this stage, the user signs below
// the preview. For the artist drawer the click-to-fullscreen path uses a
// regular iframe so they can still pinch-zoom to inspect detail.

import { useEffect, useRef, useState } from 'react';

const PDF_W = 612; // letter @ 72 DPI
const PDF_H = 792;

interface Props {
  /** Blob URL or remote URL pointing at a single-page letter-size PDF. */
  src: string;
  /** Accessibility title for the iframe. */
  title: string;
  className?: string;
}

export default function PdfPreviewFrame({ src, title, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / PDF_W);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-white ${className}`}
      style={{ aspectRatio: `${PDF_W} / ${PDF_H}` }}
    >
      <iframe
        src={`${src}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=Fit`}
        title={title}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${PDF_W}px`,
          height: `${PDF_H}px`,
          border: 0,
          transformOrigin: '0 0',
          transform: `scale(${scale})`,
          // Disable pointer events on the inner iframe so the parent (which
          // may have a click-to-fullscreen handler) captures the tap.
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
