import { useUIStore } from '../../stores/uiStore';
import Logo from '../common/Logo';

export default function AppHeader() {
  const headerLeft = useUIStore((s) => s.headerLeft);
  const headerRight = useUIStore((s) => s.headerRight);

  return (
    <div className="px-3 flex items-center shrink-0 relative h-[68px]">
      {headerLeft && <div className="z-10">{headerLeft}</div>}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        // Bias the centered group 1% of header width to the left for a hair
        // of optical compensation. Pure mathematical center looks slightly
        // right-heavy because the wordmark's caps lean visually right.
        style={{ transform: 'translateX(-1%)' }}
      >
        {/* Logo + wordmark center as a single unit. Container gap is zero,
            so the only visible spacing is the SVG's own internal padding —
            tweak that by editing logo.svg if you want the artwork tighter. */}
        <div className="flex items-center">
          <Logo className="w-14 h-14" />
          <span className="font-display text-lg font-bold text-text-p tracking-wide">Ink Bloop</span>
        </div>
      </div>
      {headerRight && <div className="ml-auto z-10">{headerRight}</div>}
    </div>
  );
}
