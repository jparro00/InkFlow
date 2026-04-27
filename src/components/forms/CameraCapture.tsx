// In-page camera capture used by the consent-form license step. Replaces
// `<input type="file" capture="environment">`, which on iOS hands off to the
// fullscreen native camera UI and dumps the user out of our flow. With
// getUserMedia we keep the live video preview inside our own square (the
// "little square" the artist asked for) and snap a frame on shutter tap.
//
// Trade-off: getUserMedia requires HTTPS (Vercel ✓) and triggers the
// browser's camera permission prompt on first use. On denial / unavailable
// camera (desktop, locked perm) we fall back to a plain file input.

import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Loader2, ImageIcon } from 'lucide-react';

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

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // Tear down the stream on unmount so we don't leave the camera light on.
  // Reading the ref directly inside the cleanup avoids a stale-closure issue
  // and keeps the dep list empty.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
      setState({ kind: 'streaming' });
    } catch (e) {
      console.warn('getUserMedia failed', e);
      stopStream();
      const msg = e instanceof Error ? e.message : 'Camera unavailable';
      setError(msg);
      setState({ kind: 'fallback' });
    }
  };

  const captureFrame = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `license-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        stopStream();
        setState({ kind: 'idle' });
      },
      'image/jpeg',
      0.92,
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

        {/* Empty / starting overlay */}
        {!showCaptured && state.kind === 'idle' && (
          <button
            type="button"
            onClick={startStream}
            className="absolute inset-0 w-full h-full border-2 border-dashed border-border/60 rounded-md flex flex-col items-center justify-center gap-2 text-text-t cursor-pointer press-scale transition-all active:bg-surface/40"
          >
            <Camera size={28} strokeWidth={1.5} />
            <span className="text-sm">Tap to take a photo</span>
          </button>
        )}

        {state.kind === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-text-s bg-bg/40">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Starting camera…</span>
          </div>
        )}

        {/* Streaming overlay: shutter + cancel */}
        {state.kind === 'streaming' && (
          <>
            <button
              type="button"
              onClick={captureFrame}
              aria-label="Capture photo"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white/90 border-4 border-white/40 cursor-pointer press-scale active:bg-white shadow-lg flex items-center justify-center"
            >
              <span className="w-10 h-10 rounded-full bg-white" />
            </button>
            <button
              type="button"
              onClick={cancelStream}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-md bg-bg/70 backdrop-blur-sm text-text-p text-sm cursor-pointer press-scale active:bg-bg"
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
          className="w-full mt-3 py-3 text-sm text-text-s rounded-md border border-border/60 cursor-pointer press-scale transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Retake
        </button>
      )}

      {/* Fallback path — camera unavailable or denied. We render a normal file
          input so the user can still pick from their gallery. */}
      {state.kind === 'fallback' && (
        <div className="mt-3 space-y-2">
          {error && <div className="text-sm text-danger">{error}</div>}
          <label className="w-full py-3 text-sm text-text-s rounded-md border border-border/60 cursor-pointer press-scale transition-all flex items-center justify-center gap-2">
            <ImageIcon size={16} />
            Pick from gallery
            <input type="file" accept="image/*" onChange={handleFileFallback} className="hidden" />
          </label>
        </div>
      )}
    </div>
  );
}
