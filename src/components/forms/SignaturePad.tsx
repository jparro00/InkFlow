import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface SignaturePadHandle {
  /** Returns a PNG blob of the current signature. null when empty. */
  toBlob: () => Promise<Blob | null>;
  /** True if there's anything drawn / typed. */
  isEmpty: () => boolean;
  /** Reset the pad. */
  clear: () => void;
}

interface Props {
  /** Notifies the parent whenever the empty/non-empty state flips. */
  onChange?: (isEmpty: boolean) => void;
}

type Mode = 'draw' | 'type';

const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ onChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<Mode>('draw');
    // Typed signature starts empty regardless of any external name source.
    // Pre-filling from a license read would mean the user "adopts" a
    // signature without typing it, which weakens the deliberate-act
    // requirement of an electronic signature.
    const [typedName, setTypedName] = useState('');
    const [isEmpty, setIsEmpty] = useState(true);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasInkRef = useRef(false);

    // Re-fit the canvas to its display size and rescale for devicePixelRatio.
    // Done on mount and on resize so retina screens stay crisp.
    //
    // Ink is hard-coded BLACK on a hard-coded WHITE fill. The saved PNG is
    // theme-independent — when the artist views it later (in any theme) they
    // see the same legible black-on-white signature, and printed copies look
    // right too. Don't switch back to var(--color-text-p).
    const fitCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      // Paint the white background first; subsequent strokes layer on top.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#000000';
    }, []);

    useEffect(() => {
      fitCanvas();
      const onResize = () => {
        // Save current ink, refit, restore.
        const canvas = canvasRef.current;
        if (!canvas) return;
        const data = hasInkRef.current ? canvas.toDataURL() : null;
        fitCanvas();
        if (data) {
          const img = new Image();
          img.onload = () => {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const rect = canvas.getBoundingClientRect();
              ctx.drawImage(img, 0, 0, rect.width, rect.height);
            }
          };
          img.src = data;
        }
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [fitCanvas]);

    const setEmpty = useCallback((v: boolean) => {
      setIsEmpty((prev) => {
        if (prev === v) return prev;
        onChange?.(v);
        return v;
      });
    }, [onChange]);

    const getPoint = (e: PointerEvent | React.PointerEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'draw') return;
      e.preventDefault();
      drawingRef.current = true;
      const p = getPoint(e);
      if (!p) return;
      lastPointRef.current = p;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      // Single tap should still leave a dot.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle as string;
      ctx.fill();
      hasInkRef.current = true;
      setEmpty(false);
      canvasRef.current?.setPointerCapture(e.pointerId);
    };

    const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'draw' || !drawingRef.current) return;
      const p = getPoint(e);
      if (!p) return;
      const ctx = canvasRef.current?.getContext('2d');
      const last = lastPointRef.current;
      if (!ctx || !last) return;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPointRef.current = p;
    };

    const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'draw') return;
      drawingRef.current = false;
      lastPointRef.current = null;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const clearAll = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          // Re-fill with white instead of clearing; keeps the canvas in the
          // same "white sheet of paper" state regardless of how often the
          // user clears + redraws.
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
      }
      hasInkRef.current = false;
      setTypedName('');
      setEmpty(true);
    }, [setEmpty]);

    /** Paints typedName onto the canvas (or clears it if empty). Returns true if any ink was drawn. */
    const paintTypedToCanvas = useCallback((name: string): boolean => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const rect = canvas.getBoundingClientRect();
      // Re-paint the white sheet first.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const trimmed = name.trim();
      if (!trimmed) return false;
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const fontSize = Math.min(rect.height * 0.55, 56);
      ctx.font = `italic 600 ${fontSize}px 'DM Serif Display', serif`;
      ctx.fillText(trimmed, rect.width / 2, rect.height / 2);
      return true;
    }, []);

    const handleTypedChange = (next: string) => {
      const trimmed = next.slice(0, 60);
      setTypedName(trimmed);
      if (mode === 'type') {
        const hasInk = paintTypedToCanvas(trimmed);
        hasInkRef.current = hasInk;
        setEmpty(!hasInk);
      }
    };

    const switchToType = () => {
      setMode('type');
      const hasInk = paintTypedToCanvas(typedName);
      hasInkRef.current = hasInk;
      setEmpty(!hasInk);
    };

    const switchToDraw = () => {
      setMode('draw');
      clearAll();
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => isEmpty,
      clear: clearAll,
      toBlob: async () => {
        const canvas = canvasRef.current;
        if (!canvas || isEmpty) return null;
        return new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/png');
        });
      },
    }), [isEmpty, clearAll]);

    return (
      <div>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={switchToDraw}
            className={`px-3 py-2 rounded-md text-base cursor-pointer press-scale transition-all border ${
              mode === 'draw'
                ? 'bg-accent/15 border-accent/50 text-accent'
                : 'bg-input border-border/60 text-text-s'
            }`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={switchToType}
            className={`px-3 py-2 rounded-md text-base cursor-pointer press-scale transition-all border ${
              mode === 'type'
                ? 'bg-accent/15 border-accent/50 text-accent'
                : 'bg-input border-border/60 text-text-s'
            }`}
          >
            Adopt typed
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearAll}
            disabled={isEmpty}
            className="px-3 py-2 rounded-md text-base cursor-pointer press-scale transition-all border bg-input border-border/60 text-text-s disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {mode === 'type' && (
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypedChange(e.target.value)}
            placeholder="Type your full name"
            className="w-full bg-input border border-border/60 rounded-md px-4 py-3 text-md text-text-p placeholder:text-text-t focus:outline-none focus:border-accent/40 transition-colors min-h-[48px] mb-2"
          />
        )}

        <div className="rounded-md border border-border/60 bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            onPointerCancel={endDraw}
            className={`block w-full h-32 ${mode === 'type' ? 'pointer-events-none' : 'cursor-crosshair'}`}
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;
