import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Material 3 morphing-shape loading indicator.
 *
 * Renders an SVG path that cycles through a sequence of rounded polygon
 * shapes (circle → 4-petal → scallop → wavy → soft square) with smooth
 * path morphing. The whole indicator also rotates slowly for extra motion.
 *
 * Follows the Material 3 "Loading indicator" pattern (not the classic
 * "progress indicator" spinner): morphing shapes signal activity without
 * implying determinate progress.
 *
 * Replaces the listening orb while the user is dictating. Tap to stop.
 */

// Build a closed SVG path for an N-point rounded polygon given the radii.
// Uses Catmull-Rom → Bezier conversion so every shape has an identical
// command structure (N cubic beziers + close). This is what lets Framer
// Motion smoothly morph between them — both paths must have matching
// command sequences.
function makePath(radii: number[]): string {
  const cx = 50;
  const cy = 50;
  const n = radii.length;
  const pts: Array<[number, number]> = radii.map((r, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2; // start at top (12 o'clock)
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

  const smooth = 1 / 6; // Catmull-Rom tension
  let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: [number, number] = [
      p1[0] + (p2[0] - p0[0]) * smooth,
      p1[1] + (p2[1] - p0[1]) * smooth,
    ];
    const c2: [number, number] = [
      p2[0] - (p3[0] - p1[0]) * smooth,
      p2[1] - (p3[1] - p1[1]) * smooth,
    ];
    d += ` C ${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  d += ' Z';
  return d;
}

// Every shape uses the same total point count so their paths share command
// structure and morph smoothly. 84 = LCM(4, 6, 7) gives exact symmetry for
// 4-, 6-, and 7-fold shapes.
const TOTAL_POINTS = 84;

// Smooth cosine profile — pure N-sided cookie. Rounded peaks AND rounded
// valleys (no cusps). Good for cookie-style shapes.
function cookieRadii(N: number, peak: number, valley: number): number[] {
  const pointsPerPetal = TOTAL_POINTS / N;
  return Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const p = (i % pointsPerPetal) / pointsPerPetal; // 0 at peak, 0.5 at valley
    const t = (Math.cos(p * 2 * Math.PI) + 1) / 2; // 1 at peak, 0 at valley
    return valley + (peak - valley) * t;
  });
}

// Clover profile — flatter (more circular) petals with sharp V-shape
// valleys between them. Uses |cos|^0.5 which creates the signature cusp
// at each valley crossing.
function cloverRadii(N: number, peak: number, valley: number, exp = 0.5): number[] {
  const pointsPerPetal = TOTAL_POINTS / N;
  return Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const p = (i % pointsPerPetal) / pointsPerPetal;
    const t = Math.pow(Math.abs(Math.cos(p * Math.PI)), exp);
    return valley + (peak - valley) * t;
  });
}

// Order: 6-cookie → 4-cookie → 7-cookie → 4-leaf clover → back to 6-cookie
const SHAPES: string[] = [
  makePath(cookieRadii(6, 40, 34)),    // 6-sided cookie
  makePath(cookieRadii(4, 40, 30)),    // 4-sided cookie
  makePath(cookieRadii(7, 40, 36)),    // 7-sided cookie
  makePath(cloverRadii(4, 42, 24)),    // 4-leaf clover
];

const MORPH_INTERVAL_MS = 1100; // dwell on each shape

interface LoadingIndicatorProps {
  /** Tap handler — stops listening */
  onStop: () => void;
}

export default function LoadingIndicator({ onStop }: LoadingIndicatorProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % SHAPES.length);
    }, MORPH_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed top-[108px] left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center pointer-events-none"
    >
      <button
        onClick={onStop}
        aria-label="Stop listening"
        className="relative w-44 h-44 pointer-events-auto cursor-pointer press-scale focus:outline-none"
      >
        {/* Slow continuous rotation wraps the morphing shape */}
        <motion.div
          className="w-full h-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        >
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            aria-hidden="true"
          >
            <motion.path
              fill="#DE0000"
              d={SHAPES[0]}
              animate={{ d: SHAPES[idx] }}
              transition={{ duration: MORPH_INTERVAL_MS / 1000, ease: 'easeInOut' }}
            />
          </svg>
        </motion.div>
      </button>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.12, duration: 0.25 }}
        className="mt-3 text-[13px] text-text-s font-medium tracking-[0.15em] uppercase"
      >
        Listening
      </motion.div>
    </motion.div>
  );
}
