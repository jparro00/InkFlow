import { useUIStore } from '../../stores/uiStore';
import Logo from '../common/Logo';

export default function AppHeader() {
  const headerLeft = useUIStore((s) => s.headerLeft);
  const headerRight = useUIStore((s) => s.headerRight);

  return (
    <div className="px-3 flex items-center shrink-0 relative h-[68px]">
      {headerLeft && <div className="z-10">{headerLeft}</div>}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex items-center">
          <Logo className="w-14 h-14 absolute -left-16" />
          <span className="font-display text-lg font-bold text-text-p tracking-wide">Ink Bloop</span>
        </div>
      </div>
      {headerRight && <div className="ml-auto z-10">{headerRight}</div>}
    </div>
  );
}
