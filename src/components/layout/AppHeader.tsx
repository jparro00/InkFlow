import { useUIStore } from '../../stores/uiStore';
import Logo from '../common/Logo';

export default function AppHeader() {
  const headerLeft = useUIStore((s) => s.headerLeft);
  const headerRight = useUIStore((s) => s.headerRight);

  return (
    <div className="px-3 flex items-center shrink-0 relative h-[68px]">
      {headerLeft && <div className="z-10">{headerLeft}</div>}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Logo + wordmark in a single horizontal flex group so they stay
            tight together and the whole unit centers — no absolute offsets
            that can punch out into the headerLeft slot (where Calendar puts
            the year in month view). */}
        <div className="flex items-center gap-2">
          <Logo className="w-14 h-14" />
          <span className="font-display text-lg font-bold text-text-p tracking-wide">Ink Bloop</span>
        </div>
      </div>
      {headerRight && <div className="ml-auto z-10">{headerRight}</div>}
    </div>
  );
}
