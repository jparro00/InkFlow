import { useUIStore } from '../../stores/uiStore';
import Logo from '../common/Logo';

export default function AppHeader() {
  const headerLeft = useUIStore((s) => s.headerLeft);
  const headerRight = useUIStore((s) => s.headerRight);

  return (
    <div className="px-3 flex items-center shrink-0 relative h-[68px]">
      {headerLeft && <div className="z-10">{headerLeft}</div>}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* "Ink Bloop" wordmark stays the centered anchor; the logo sits to
            its left via absolute offset. Tight 4 px gap so the logo doesn't
            stick out far enough to overlap the headerLeft slot (where
            Calendar shows the year in month view). */}
        <div className="relative flex items-center">
          <Logo className="w-14 h-14 absolute -left-[60px]" />
          <span className="font-display text-lg font-bold text-text-p tracking-wide">Ink Bloop</span>
        </div>
      </div>
      {headerRight && <div className="ml-auto z-10">{headerRight}</div>}
    </div>
  );
}
