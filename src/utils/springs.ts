// iOS UIKit-matched spring presets for Framer Motion
// Based on UISpringTimingParameters default curves

export const iosSpring = {
  // Interactive gesture snap (carousel, page flip)
  snap: { type: 'spring' as const, stiffness: 350, damping: 35, mass: 0.8 },
  // Modal/sheet presentation
  present: { type: 'spring' as const, stiffness: 200, damping: 28, mass: 1.0 },
  // Sheet/modal dismiss
  dismiss: { type: 'spring' as const, stiffness: 300, damping: 32, mass: 0.8 },
  // Page transitions (gentler, slightly underdamped for subtle overshoot)
  gentle: { type: 'spring' as const, stiffness: 180, damping: 24, mass: 1.0 },
  // Snap-back / cancel gesture
  cancel: { type: 'spring' as const, stiffness: 400, damping: 35 },
  // Tab crossfade
  tab: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1.0] as [number, number, number, number] },
};
