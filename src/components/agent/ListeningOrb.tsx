import { motion } from 'framer-motion';

interface ListeningOrbProps {
  /** Audio level 0-1 — drives the inner core and outer glow scale */
  level: number;
  /** Tapping the orb stops recording */
  onStop: () => void;
}

/**
 * Full-viewport listening indicator shown while the user is dictating.
 * Nebulous morphing orb in accent colors (red/pink) with:
 *   - Counter-rotating conic-gradient layers for "swirl" energy
 *   - Morphing blob (borderRadius animation) for organic feel
 *   - Audio-level-reactive core and outer glow
 * Tap anywhere on the orb to stop recording immediately.
 *
 * Positioned at top-center of the viewport on top of the agent panel (z-60).
 */
export default function ListeningOrb({ level, onStop }: ListeningOrbProps) {
  // Clamp level to a gentle range so the UI doesn't thrash on loud bursts
  const l = Math.min(Math.max(level, 0), 1);
  const glowScale = 1 + l * 0.4;
  const coreSize = 16 + l * 28; // 16-44px
  const coreBlur = Math.max(4, 10 - l * 6); // sharper when louder

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center pointer-events-none"
    >
      <button
        onClick={onStop}
        aria-label="Stop listening"
        className="relative w-56 h-56 rounded-full pointer-events-auto cursor-pointer press-scale"
      >
        {/* Outer ambient glow — level-reactive */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(222,0,0,0.35), rgba(204,0,104,0.2) 40%, transparent 70%)',
            filter: 'blur(30px)',
            transform: `scale(${glowScale})`,
            transition: 'transform 120ms ease-out',
          }}
        />

        {/* Rotating conic gradient — the "swirl" */}
        <motion.div
          className="absolute inset-2 rounded-full pointer-events-none"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{
            background:
              'conic-gradient(from 0deg, #DE0000, #CC0068, #FF4477, #DE0000, #990044, #DE0000)',
            filter: 'blur(18px)',
            opacity: 0.85,
          }}
        />

        {/* Counter-rotating gradient — adds depth */}
        <motion.div
          className="absolute inset-4 rounded-full pointer-events-none"
          animate={{ rotate: -360 }}
          transition={{ duration: 13, repeat: Infinity, ease: 'linear' }}
          style={{
            background:
              'conic-gradient(from 180deg, transparent 0%, #FF6699 25%, transparent 50%, #DE0000 75%, transparent 100%)',
            filter: 'blur(14px)',
            mixBlendMode: 'screen',
            opacity: 0.7,
          }}
        />

        {/* Morphing blob — breathes, shifts shape */}
        <motion.div
          className="absolute inset-8 pointer-events-none"
          animate={{
            borderRadius: [
              '50% 50% 50% 50%',
              '60% 40% 55% 45%',
              '45% 55% 40% 60%',
              '55% 45% 60% 40%',
              '50% 50% 50% 50%',
            ],
            scale: [1, 1.06, 0.96, 1.04, 1],
            rotate: [0, 45, 90, 135, 180],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(circle at 40% 35%, rgba(255,200,220,0.7), rgba(222,0,0,0.5) 50%, rgba(150,0,50,0.3) 100%)',
            filter: 'blur(6px)',
          }}
        />

        {/* Core — small bright center, level-reactive */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            width: coreSize,
            height: coreSize,
            background:
              'radial-gradient(circle, rgba(255,230,240,0.95), rgba(255,150,180,0.7) 50%, rgba(222,0,0,0.4))',
            filter: `blur(${coreBlur}px)`,
            transition:
              'width 100ms ease-out, height 100ms ease-out, filter 100ms ease-out',
          }}
        />
      </button>

      {/* Caption */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-2 text-[13px] text-text-s font-medium tracking-[0.15em] uppercase"
      >
        Listening
      </motion.div>
    </motion.div>
  );
}
