// In-page camera capture used by the consent-form license step. Replaces
// `<input type="file" capture="environment">`, which on iOS hands off to the
// fullscreen native camera UI and dumps the user out of our flow. With
// getUserMedia we keep the live video preview inside our own square (the
// "little square" the artist asked for) and snap a frame on shutter tap.
//
// Auto-capture: while streaming, a 5 Hz analyzer samples downsampled grayscale
// frames and computes three metrics — edge density at the framing-bracket
// boundaries (proxy for "ID is filling the frame"), Laplacian variance over
// the center area (sharpness), and frame-to-frame difference (stability).
// When all three pass for ~600 ms the brackets turn green and the shutter
// auto-fires. Manual shutter is always available as a fallback.
//
// Trade-off: getUserMedia requires HTTPS (Vercel ✓) and triggers the
// browser's camera permission prompt on first use. On denial / unavailable
// camera (desktop, locked perm) we fall back to a plain file input.

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Loader2, ImageIcon } from 'lucide-react';

// Display + saved aspect ratio. Roughly the ID-1 license format (8.56 × 5.4 cm).
const TARGET_ASPECT = 1.586;
// Output sizing: width in pixels of the saved JPEG. 600 px on a well-framed
// ID-1 card works out to ~178 DPI — above Textract's 150 DPI floor and well
// above the 15 px text-height floor (~24 px at this size). Final JPEG lands
// around 50 KB, ~70% smaller than 1200 px.
//
// This is only safe because we show framing brackets in the live preview
// that nudge users to fill the rectangle. Reduce again only if those guides
// stay; raise it if AnalyzeID confidence ever drops on real captures.
const OUTPUT_WIDTH = 600;
const OUTPUT_QUALITY = 0.85;

// Detection canvas — kept tiny so the per-frame analysis runs in single-digit
// milliseconds even on older phones. 200×126 still preserves enough detail
// for edge density along the framing borders.
const DETECT_W = 200;
const DETECT_H = Math.round(DETECT_W / TARGET_ASPECT); // 126
// Sample every 200 ms. Faster eats battery without changing the experience —
// auto-capture wants a confident lock, not a rapid lock.
const DETECT_INTERVAL_MS = 200;
// How long all three metrics must stay green before we auto-fire. Short
// enough to feel snappy, long enough that brief jitter doesn't trigger a
// premature shot. 300 ms means the user holds for ~1-2 detection ticks
// after the brackets turn green — fast without firing on a momentary lock.
const READY_HOLD_MS = 300;

// Thresholds — tuned by eye against typical phone cameras at our display
// size. They're heuristic; the real validator is Textract on the back end.
//
// EDGE_THRESHOLD: mean Sobel magnitude in each of the four bracket strips.
//   Below this means the strip looks like empty space (no card edge).
// SHARPNESS_THRESHOLD: Laplacian variance over the center area. Below this
//   is blurry / out of focus.
// STABILITY_THRESHOLD: mean abs frame-to-frame pixel diff. Above this means
//   the camera is moving.
const EDGE_THRESHOLD = 18;
const SHARPNESS_THRESHOLD = 80;
const STABILITY_THRESHOLD = 10;

type DetectState = 'searching' | 'almost' | 'ready';

interface Props {
  /** Currently-displayed preview (data URL or blob URL). null = no capture yet. */
  previewUrl: string | null;
  /** Called with a fresh File when the user captures or picks one. */
  onCapture: (file: File) => void;
}

type State =
  | { kind: 'idle' }            // no capture yet, no stream
  | { kind: 'starting' }        // permission prompt / stream warming up
  | { kind: 'streaming' }       // live preview in the box
  | { kind: 'fallback' };       // getUserMedia unavailable → file input

export default function CameraCapture({ previewUrl, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [detectState, setDetectState] = useState<DetectState>('searching');

  // Detector state, kept in refs so the rAF/interval doesn't trigger React
  // re-renders on every frame.
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevGrayRef = useRef<Uint8ClampedArray | null>(null);
  const readySinceRef = useRef<number | null>(null);
  const detectIntervalRef = useRef<number | null>(null);
  // Latch so we don't double-fire the shutter while the capture is in flight.
  const firedRef = useRef(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (detectIntervalRef.current !== null) {
      window.clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    prevGrayRef.current = null;
    readySinceRef.current = null;
    firedRef.current = false;
    setDetectState('searching');
  };

  // Tear down the stream on unmount so we don't leave the camera light on.
  // Reading the ref directly inside the cleanup avoids a stale-closure issue
  // and keeps the dep list empty.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (detectIntervalRef.current !== null) {
        window.clearInterval(detectIntervalRef.current);
        detectIntervalRef.current = null;
      }
    };
  }, []);

  const startStream = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: 'fallback' });
      return;
    }
    setState({ kind: 'starting' });
    try {
      // Pin the aspect ratio + resolution so the browser doesn't renegotiate
      // mid-stream. Without the aspectRatio constraint, iOS Safari may start
      // at 4:3 and upgrade to 16:9 a couple seconds in, which causes
      // object-cover to re-crop and looks like a vertical jump. 1280×720 is a
      // stable native rear-camera resolution on every modern phone.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        // Some iOS Safari builds need playsInline + a manual play() call.
        await v.play().catch(() => undefined);
      }
      // Stay in 'starting' state for ~600 ms after play() resolves so the
      // opaque "Starting camera…" overlay covers any iOS Safari resolution
      // renegotiation (4:3 → 16:9 upgrade in the first frames). Without
      // this hold the user sees a visible jump when the crop snaps. We
      // reveal the video AND start the detector simultaneously after the
      // hold so the brackets only appear over a stable preview.
      window.setTimeout(() => {
        setState({ kind: 'streaming' });
        startDetector();
      }, 600);
    } catch (e) {
      console.warn('getUserMedia failed', e);
      stopStream();
      const msg = e instanceof Error ? e.message : 'Camera unavailable';
      setError(msg);
      setState({ kind: 'fallback' });
    }
  };

  const startDetector = () => {
    if (detectIntervalRef.current !== null) return;
    if (!detectCanvasRef.current) {
      detectCanvasRef.current = document.createElement('canvas');
      detectCanvasRef.current.width = DETECT_W;
      detectCanvasRef.current.height = DETECT_H;
    }
    detectIntervalRef.current = window.setInterval(detectTick, DETECT_INTERVAL_MS);
  };

  const detectTick = () => {
    const v = videoRef.current;
    const canvas = detectCanvasRef.current;
    if (!v || !canvas || !v.videoWidth || firedRef.current) return;

    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const sourceAspect = vw / vh;
    let cropW: number;
    let cropH: number;
    if (sourceAspect > TARGET_ASPECT) {
      cropH = vh;
      cropW = vh * TARGET_ASPECT;
    } else {
      cropW = vw;
      cropH = vw / TARGET_ASPECT;
    }
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, DETECT_W, DETECT_H);
    const img = ctx.getImageData(0, 0, DETECT_W, DETECT_H);
    const gray = toGrayscale(img.data, DETECT_W, DETECT_H);

    const edge = edgeDensityAtBrackets(gray, DETECT_W, DETECT_H);
    const sharp = sharpnessCenter(gray, DETECT_W, DETECT_H);
    const stable = prevGrayRef.current
      ? frameDifference(gray, prevGrayRef.current)
      : Number.POSITIVE_INFINITY;
    prevGrayRef.current = gray;

    const edgesGood = edge >= EDGE_THRESHOLD;
    const sharpGood = sharp >= SHARPNESS_THRESHOLD;
    const stableGood = stable <= STABILITY_THRESHOLD;
    const goodCount = (edgesGood ? 1 : 0) + (sharpGood ? 1 : 0) + (stableGood ? 1 : 0);

    if (goodCount === 3) {
      const now = performance.now();
      if (readySinceRef.current === null) readySinceRef.current = now;
      if (now - readySinceRef.current >= READY_HOLD_MS) {
        // Lock so a slow capture doesn't double-fire on the next tick.
        firedRef.current = true;
        setDetectState('ready');
        captureFrame();
        return;
      }
      setDetectState('ready');
    } else {
      readySinceRef.current = null;
      setDetectState(goodCount >= 2 ? 'almost' : 'searching');
    }
  };

  const captureFrame = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;

    const vw = v.videoWidth;
    const vh = v.videoHeight;

    // Mirror the on-screen `object-cover` crop on the saved file so we save
    // exactly what the user framed in the rectangle — not the full sensor
    // frame. Whichever axis exceeds the target aspect gets trimmed equally
    // from both sides.
    const sourceAspect = vw / vh;
    let cropW: number;
    let cropH: number;
    if (sourceAspect > TARGET_ASPECT) {
      // Wider than target → trim the sides.
      cropH = vh;
      cropW = vh * TARGET_ASPECT;
    } else {
      // Taller than target → trim top/bottom.
      cropW = vw;
      cropH = vw / TARGET_ASPECT;
    }
    const cropX = (vw - cropW) / 2;
    const cropY = (vh - cropH) / 2;

    // Down-sample to OUTPUT_WIDTH so the upload + Textract round-trip stays
    // snappy. License text is comfortably legible at this width (see the
    // OUTPUT_WIDTH comment for the DPI math) and the JPEG payload lands
    // around 50 KB.
    const outW = Math.min(OUTPUT_WIDTH, Math.round(cropW));
    const outH = Math.round(outW / TARGET_ASPECT);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `license-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        stopStream();
        setState({ kind: 'idle' });
      },
      'image/jpeg',
      OUTPUT_QUALITY,
    );
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
  };

  const cancelStream = () => {
    stopStream();
    setState({ kind: 'idle' });
  };

  const showCaptured = previewUrl && state.kind === 'idle';
  const showStream = state.kind === 'streaming' || state.kind === 'starting';

  // Bracket color tracks the detector state so the user gets continuous
  // feedback. Green = capture about to fire.
  const bracketColor =
    detectState === 'ready'
      ? 'border-success'
      : detectState === 'almost'
        ? 'border-amber-400'
        : 'border-white/85';
  const hintLabel =
    detectState === 'ready'
      ? 'Hold still…'
      : detectState === 'almost'
        ? 'Almost there'
        : 'Fill the frame with your ID';

  return (
    <div>
      <div className="relative rounded-md overflow-hidden border border-border/60 bg-bg/40 aspect-[1.586]">
        {/* Captured preview */}
        {showCaptured && (
          <img src={previewUrl} alt="License preview" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Live stream (kept mounted while starting so the ref is hooked up) */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${showStream ? '' : 'hidden'}`}
        />

        {/* Empty state. The whole box is the tap target (big drop-zone),
            but a prominent accent pill inside makes the action obvious. The
            inner pill is pointer-events-none so taps anywhere — including
            on the pill itself — fall through to the outer button. */}
        {!showCaptured && state.kind === 'idle' && (
          <button
            type="button"
            onClick={startStream}
            className="absolute inset-0 w-full h-full border-2 border-dashed border-border/60 rounded-md flex items-center justify-center cursor-pointer press-scale transition-all active:bg-surface/40"
          >
            <span className="pointer-events-none px-7 py-4 rounded-full bg-accent text-bg text-lg font-medium shadow-glow flex items-center gap-3">
              <Camera size={22} strokeWidth={2} />
              Tap to take a photo
            </span>
          </button>
        )}

        {/* Starting overlay — fully opaque so the underlying video element
            (which may be playing pre-renegotiation frames at the wrong
            aspect ratio on iOS) is not visible during the 600 ms hold. */}
        {state.kind === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-text-s bg-bg">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-base">Starting camera…</span>
          </div>
        )}

        {/* Streaming overlay: framing brackets, shutter, cancel. The brackets
            sit at the inside edges of the box so the user has a clear "fill
            this rectangle with your ID" cue — necessary because we save at
            600 px wide and rely on a well-framed shot to stay above 150 DPI.
            Color tracks detection state. */}
        {state.kind === 'streaming' && (
          <>
            <div className="absolute inset-2 pointer-events-none">
              <div className={`absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 ${bracketColor} rounded-tl-md transition-colors duration-200`} />
              <div className={`absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 ${bracketColor} rounded-tr-md transition-colors duration-200`} />
              <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 ${bracketColor} rounded-bl-md transition-colors duration-200`} />
              <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 ${bracketColor} rounded-br-md transition-colors duration-200`} />
            </div>

            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-bg/70 backdrop-blur-sm text-sm text-text-p whitespace-nowrap pointer-events-none transition-colors duration-200">
              {hintLabel}
            </div>

            <button
              type="button"
              onClick={() => {
                if (firedRef.current) return;
                firedRef.current = true;
                captureFrame();
              }}
              aria-label="Capture photo"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white/90 border-4 border-white/40 cursor-pointer press-scale active:bg-white shadow-lg flex items-center justify-center"
            >
              <span className="w-10 h-10 rounded-full bg-white" />
            </button>
            <button
              type="button"
              onClick={cancelStream}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-md bg-bg/70 backdrop-blur-sm text-text-p text-base cursor-pointer press-scale active:bg-bg"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Below-image actions */}
      {showCaptured && (
        <button
          type="button"
          onClick={startStream}
          className="w-full mt-3 py-3 text-base text-text-s rounded-md border border-border/60 cursor-pointer press-scale transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Retake
        </button>
      )}

      {/* Fallback path — camera unavailable or denied. We render a normal file
          input so the user can still pick from their gallery. */}
      {state.kind === 'fallback' && (
        <div className="mt-3 space-y-2">
          {error && <div className="text-base text-danger">{error}</div>}
          <label className="w-full py-3 text-base text-text-s rounded-md border border-border/60 cursor-pointer press-scale transition-all flex items-center justify-center gap-2">
            <ImageIcon size={16} />
            Pick from gallery
            <input type="file" accept="image/*" onChange={handleFileFallback} className="hidden" />
          </label>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Detection helpers
// =============================================================================

/** Convert RGBA ImageData buffer to a packed 8-bit grayscale buffer. */
function toGrayscale(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    // Rec.709 luma. Cheap; doesn't need to be perceptually accurate.
    out[j] = (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) | 0;
  }
  return out;
}

/**
 * Sobel-magnitude mean over the four interior bracket strips. We sample the
 * pixels just inside the framing brackets — that's where an ID's edge will
 * land if the user is filling the frame correctly. Returns the *minimum* of
 * the four strips so a single weak side fails the check (e.g. if the user
 * tilts the card, one edge drops out).
 */
function edgeDensityAtBrackets(gray: Uint8ClampedArray, w: number, h: number): number {
  // Strip thickness, ~6% of the shorter side. Stays narrow so background
  // texture doesn't dilute the edge signal.
  const t = Math.max(4, Math.round(h * 0.06));
  // Margin from the very edge — matches `inset-2` on the on-screen brackets
  // so we sample where the user expects the bracket to align with the card.
  const m = Math.max(2, Math.round(h * 0.04));

  const top = sobelStripMean(gray, w, h, m, m, w - 2 * m, t);
  const bottom = sobelStripMean(gray, w, h, m, h - m - t, w - 2 * m, t);
  const left = sobelStripMean(gray, w, h, m, m, t, h - 2 * m);
  const right = sobelStripMean(gray, w, h, w - m - t, m, t, h - 2 * m);
  return Math.min(top, bottom, left, right);
}

/** Mean Sobel magnitude over a rectangular strip. */
function sobelStripMean(
  g: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  sw: number,
  sh: number,
): number {
  let sum = 0;
  let n = 0;
  const x0 = Math.max(1, x);
  const y0 = Math.max(1, y);
  const x1 = Math.min(w - 1, x + sw);
  const y1 = Math.min(h - 1, y + sh);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      // Sobel-x and Sobel-y on the 3×3 neighborhood.
      const tl = g[i - w - 1], tc = g[i - w], tr = g[i - w + 1];
      const ml = g[i - 1], mr = g[i + 1];
      const bl = g[i + w - 1], bc = g[i + w], br = g[i + w + 1];
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      sum += Math.abs(gx) + Math.abs(gy);
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Variance of the Laplacian over the center 60% of the frame. Standard
 * sharpness metric — larger variance = more high-frequency detail = sharper.
 */
function sharpnessCenter(gray: Uint8ClampedArray, w: number, h: number): number {
  const x0 = Math.round(w * 0.2);
  const y0 = Math.round(h * 0.2);
  const x1 = Math.round(w * 0.8);
  const y1 = Math.round(h * 0.8);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let py = Math.max(1, y0); py < Math.min(h - 1, y1); py++) {
    for (let px = Math.max(1, x0); px < Math.min(w - 1, x1); px++) {
      const i = py * w + px;
      // 4-neighbor Laplacian.
      const lap = -gray[i - w] - gray[i - 1] + 4 * gray[i] - gray[i + 1] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Mean absolute difference between two grayscale frames. */
function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  // Sample every 4th pixel — full pass is overkill for stability detection.
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / (a.length / 4);
}
