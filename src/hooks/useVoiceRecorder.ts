import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAgentStore } from '../stores/agentStore';

// Config (tunable constants)
const MAX_DURATION_MS = 15_000;      // hard cap on recording length
const SILENCE_MS = 2_000;            // 2s of silence → auto-stop
const SILENCE_THRESHOLD = 0.02;      // RMS below this counts as silence (0-1)
const LEVEL_UPDATE_MS = 100;         // throttle level updates to the UI

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'recording'; startedAt: number; level: number }
  | { kind: 'transcribing' }
  | { kind: 'error'; message: string };

export type StopReason = 'silence' | 'manual' | 'cap' | 'error';

interface Options {
  onTranscript: (text: string) => void;
}

/**
 * Tap-to-record voice input. Starts MediaRecorder + AudioContext when `start()`
 * is called. Stops automatically after 2s of silence, on manual `stopManual()`,
 * or at a 15s hard cap. On stop, sends the audio blob to the `transcribe-audio`
 * edge function and calls `onTranscript` with the result.
 *
 * iOS PWA considerations handled:
 *   - MIME type probing (iOS needs audio/mp4, Chrome audio/webm)
 *   - getUserMedia only called inside user-gesture handler
 *   - Waits for final `dataavailable` event before building blob
 *   - Full track + AudioContext cleanup so the iOS status-bar mic indicator clears
 *   - AudioContext fallback: if it fails, recording still works (no silence detection)
 */
export function useVoiceRecorder({ onTranscript }: Options) {
  const [state, setState] = useState<VoiceState>({ kind: 'idle' });

  // Refs hold all the imperative recording state so React re-renders don't
  // disrupt the active MediaRecorder/AudioContext.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastLevelUpdateRef = useRef<number>(0);
  const stopReasonRef = useRef<StopReason>('manual');
  const stoppedRef = useRef(false); // guard against double-stop

  // Pick a MIME type MediaRecorder can record on this browser.
  const pickMimeType = useCallback((): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/aac',
    ];
    for (const t of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return ''; // fall back to browser default
  }, []);

  // Full cleanup — safe to call from any exit path.
  const cleanup = useCallback(() => {
    if (capTimerRef.current) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    silenceStartRef.current = null;
    lastLevelUpdateRef.current = 0;
  }, []);

  // Assembles the blob from collected chunks, sends to Groq, calls onTranscript.
  const transcribe = useCallback(
    async (blob: Blob, durationMs: number, reason: StopReason) => {
      const agentStore = useAgentStore.getState();
      agentStore.logTrace('voice_stop', {
        durationMs,
        stopReason: reason,
        bytes: blob.size,
      });

      if (blob.size === 0) {
        setState({ kind: 'error', message: 'No audio captured' });
        setTimeout(() => setState({ kind: 'idle' }), 2000);
        agentStore.logTrace('voice_error', { stage: 'empty_blob' });
        return;
      }

      setState({ kind: 'transcribing' });
      const startedAt = Date.now();

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Content-Type': blob.type || mimeTypeRef.current || 'audio/webm',
          },
          body: blob,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Transcription failed (${resp.status}): ${errText}`);
        }

        const data = (await resp.json()) as { text?: string; error?: string };
        if (data.error) throw new Error(data.error);

        const text = (data.text || '').trim();
        agentStore.logTrace('voice_transcribed', {
          textLength: text.length,
          latencyMs: Date.now() - startedAt,
        });

        setState({ kind: 'idle' });

        if (text.length > 0) {
          onTranscript(text);
        } else {
          // Empty transcript — probably just noise. Silently reset.
          agentStore.logTrace('voice_error', { stage: 'empty_transcript' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transcription failed';
        agentStore.logTrace('voice_error', { stage: 'transcribe', message: msg });
        setState({ kind: 'error', message: msg });
        setTimeout(() => setState({ kind: 'idle' }), 2000);
      }
    },
    [onTranscript]
  );

  // Called by manual tap, silence timeout, or cap timeout.
  const stopRecording = useCallback(
    (reason: StopReason) => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      stopReasonRef.current = reason;

      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        cleanup();
        setState({ kind: 'idle' });
        return;
      }

      const startedAt =
        state.kind === 'recording' ? state.startedAt : Date.now();
      const durationMs = Date.now() - startedAt;

      // Wait for the final dataavailable + stop event pair (iOS fires them
      // asynchronously after stop()).
      recorder.addEventListener(
        'stop',
        () => {
          const chunks = chunksRef.current;
          const blob = new Blob(chunks, {
            type: mimeTypeRef.current || 'audio/webm',
          });
          // Release mic + audio context BEFORE transcribing so the iOS red
          // mic indicator disappears while the user waits.
          cleanup();
          chunksRef.current = [];
          void transcribe(blob, durationMs, reason);
        },
        { once: true }
      );

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch (err) {
        // If stop throws, force cleanup + idle.
        cleanup();
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Stop failed',
        });
        setTimeout(() => setState({ kind: 'idle' }), 2000);
      }
    },
    [cleanup, state, transcribe]
  );

  // Monitor audio level for silence detection. Runs via rAF when recording.
  const monitorLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    // RMS of the waveform, normalized around 128 (silent = 128, loud = 0 or 255).
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // -1 to 1
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / buf.length);
    const now = performance.now();

    // Silence detection
    if (rms < SILENCE_THRESHOLD) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current >= SILENCE_MS) {
        stopRecording('silence');
        return;
      }
    } else {
      silenceStartRef.current = null;
    }

    // Throttled state update for the UI pulse
    if (now - lastLevelUpdateRef.current >= LEVEL_UPDATE_MS) {
      lastLevelUpdateRef.current = now;
      setState((prev) =>
        prev.kind === 'recording' ? { ...prev, level: Math.min(rms * 4, 1) } : prev
      );
    }

    rafIdRef.current = requestAnimationFrame(monitorLevel);
  }, [stopRecording]);

  const start = useCallback(async () => {
    if (state.kind !== 'idle' && state.kind !== 'error') return;

    const agentStore = useAgentStore.getState();
    stoppedRef.current = false;
    chunksRef.current = [];
    silenceStartRef.current = null;
    lastLevelUpdateRef.current = 0;

    setState({ kind: 'requesting' });

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ kind: 'error', message: 'Voice input not supported on this device' });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
      return;
    }

    // Query current permission state (if supported) so we can log & short-circuit.
    // This is informational only — getUserMedia still drives the actual prompt
    // behavior. But it helps us understand why the prompt is firing.
    let permState: string = 'unknown';
    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        permState = result.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch {
      // Some browsers don't support 'microphone' as a permission name — ignore
    }
    agentStore.logTrace('voice_permission_state', { permState });
    // Also log to console for live debugging during dev
    // eslint-disable-next-line no-console
    console.log('[voice] permission state before getUserMedia:', permState);

    if (permState === 'denied') {
      const msg = 'Mic access blocked — enable in browser settings';
      agentStore.logTrace('voice_error', { stage: 'permission_denied_api', message: msg });
      setState({ kind: 'error', message: msg });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Map DOMException names to friendlier user-facing messages. Without
      // this, raw browser strings like "The object can not be found here."
      // (Firefox's NotFoundError phrasing) get shown to users.
      const name = err instanceof Error ? err.name : '';
      const msg =
        name === 'NotAllowedError'
          ? 'Mic access blocked — enable in browser settings'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No microphone found — check your audio input device'
            : name === 'NotReadableError'
              ? 'Microphone is in use by another app'
              : err instanceof Error
                ? err.message
                : 'Microphone unavailable';
      agentStore.logTrace('voice_error', { stage: 'permission', name, message: msg });
      setState({ kind: 'error', message: msg });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
      return;
    }

    streamRef.current = stream;

    // AudioContext for silence detection. Safari is quirky here — if it
    // fails, we still record, just without silence detection (manual tap
    // + 15s cap are the fallbacks).
    let audioContextOk = false;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        // Some browsers require resume() after a user gesture.
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        audioContextOk = true;
      }
    } catch {
      // Swallow — recording still works without silence detection.
      audioCtxRef.current = null;
      analyserRef.current = null;
    }

    // MIME + MediaRecorder
    const mime = pickMimeType();
    mimeTypeRef.current = mime;
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      cleanup();
      const msg = err instanceof Error ? err.message : 'Recorder init failed';
      agentStore.logTrace('voice_error', { stage: 'recorder_init', message: msg });
      setState({ kind: 'error', message: msg });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    });

    recorder.addEventListener('error', (e) => {
      const msg =
        (e as unknown as { error?: Error }).error?.message || 'Recorder error';
      agentStore.logTrace('voice_error', { stage: 'recorder_runtime', message: msg });
      if (!stoppedRef.current) {
        stopRecording('error');
      }
    });

    // Track ended (interruption, e.g. phone call)
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (!stoppedRef.current) {
          stopRecording('error');
        }
      });
    });

    const startedAt = Date.now();

    // Start recording. Ask for a chunk every 500ms so cancel-early still
    // has data. Stop() will also flush a final chunk.
    try {
      recorder.start(500);
    } catch (err) {
      cleanup();
      const msg = err instanceof Error ? err.message : 'Recorder start failed';
      setState({ kind: 'error', message: msg });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
      return;
    }

    // 15s hard cap
    capTimerRef.current = setTimeout(() => {
      if (!stoppedRef.current) {
        stopRecording('cap');
      }
    }, MAX_DURATION_MS);

    // Kick off silence monitor if AudioContext is working
    if (audioContextOk) {
      rafIdRef.current = requestAnimationFrame(monitorLevel);
    }

    setState({ kind: 'recording', startedAt, level: 0 });
    agentStore.logTrace('voice_start', { hasSilenceDetection: audioContextOk });
  }, [cleanup, monitorLevel, pickMimeType, state.kind, stopRecording]);

  const stopManual = useCallback(() => {
    stopRecording('manual');
  }, [stopRecording]);

  const reset = useCallback(() => {
    cleanup();
    setState({ kind: 'idle' });
    stoppedRef.current = false;
    chunksRef.current = [];
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, start, stopManual, reset };
}
