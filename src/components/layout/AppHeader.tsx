import type { ReactNode } from 'react';

export default function AppHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-2 flex items-center shrink-0 relative min-h-[60px]">
      {left && <div className="z-10">{left}</div>}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex items-center">
          <img src={`${import.meta.env.BASE_URL}inkflow_logo.png`} alt="Keeps Ink" className="w-7 h-7 absolute -left-9" />
          <span className="font-display text-lg font-bold text-text-p tracking-wide">Keeps Ink</span>
        </div>
      </div>
      {right && <div className="ml-auto z-10">{right}</div>}
    </div>
  );
}
