import { Mic, Loader2, Square, AlertCircle } from 'lucide-react';
import type { VoiceState } from '../../hooks/useVoiceRecorder';

interface MicButtonProps {
  state: VoiceState;
  onStart: () => void;
  onStopManual: () => void;
  disabled?: boolean;
}

/**
 * Single-button mic control for the agent composer.
 *
 *   idle         → mic icon, accent bg (matches send button)
 *   requesting   → spinner (permission prompt is showing)
 *   recording    → audio-reactive pulsing red circle; tap to stop manually
 *   transcribing → spinner (audio sent to Groq)
 *   error        → error flash (auto-resets after 2s via hook)
 */
export default function MicButton({
  state,
  onStart,
  onStopManual,
  disabled,
}: MicButtonProps) {
  const base =
    'w-14 h-14 rounded-xl flex items-center justify-center shrink-0 cursor-pointer press-scale transition-all disabled:opacity-30 disabled:cursor-not-allowed';

  if (state.kind === 'idle') {
    return (
      <button
        onClick={onStart}
        disabled={disabled}
        className={`${base} bg-accent text-bg shadow-glow active:shadow-glow-strong`}
        title="Tap to record"
        aria-label="Start voice input"
      >
        <Mic size={22} />
      </button>
    );
  }

  if (state.kind === 'requesting') {
    return (
      <button
        disabled
        className={`${base} bg-accent/40 text-bg`}
        aria-label="Requesting microphone permission"
      >
        <Loader2 size={22} className="animate-spin" />
      </button>
    );
  }

  if (state.kind === 'recording') {
    // Scale the inner glow by audio level (0-1). Keep a baseline pulse
    // so there's always movement even on low volume.
    const glowScale = 1 + state.level * 0.5;
    return (
      <button
        onClick={onStopManual}
        className={`${base} relative bg-accent text-bg`}
        title="Tap to stop"
        aria-label="Stop recording"
      >
        {/* Expanding glow ring driven by audio level */}
        <span
          className="absolute inset-0 rounded-xl bg-accent/60 animate-pulse pointer-events-none"
          style={{
            transform: `scale(${glowScale})`,
            transition: 'transform 100ms ease-out',
          }}
        />
        <Square
          size={18}
          fill="currentColor"
          className="relative z-10"
        />
      </button>
    );
  }

  if (state.kind === 'transcribing') {
    return (
      <button
        disabled
        className={`${base} bg-accent text-bg`}
        aria-label="Transcribing"
      >
        <Loader2 size={22} className="animate-spin" />
      </button>
    );
  }

  // error
  return (
    <button
      disabled
      className={`${base} bg-red-500/20 text-red-400 border border-red-500/40`}
      title={state.message}
      aria-label={`Error: ${state.message}`}
    >
      <AlertCircle size={22} />
    </button>
  );
}
