import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, Users, Search, Settings } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const tabs = [
  { to: '/', icon: Calendar, label: 'Calendar', action: undefined },
  { to: '/clients', icon: Users, label: 'Clients', action: undefined },
  { to: '/search', icon: Search, label: 'Search', action: 'search' as const },
  { to: '/settings', icon: Settings, label: 'Settings', action: undefined },
];

export default function MobileTabBar() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const setCalendarDate = useUIStore((s) => s.setCalendarDate);
  const location = useLocation();

  const handleTabClick = (to: string, action: string | undefined, e: React.MouseEvent) => {
    if (action === 'search') {
      e.preventDefault();
      setSearchOpen(true);
    } else if (to === '/' && location.pathname === '/') {
      setCalendarView('month');
      setCalendarDate(new Date());
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden safe-bottom">
      <div className="bg-surface/80 backdrop-blur-xl border-t border-border/60">
        <div className="flex items-center justify-around h-20 px-4">
          {tabs.map(({ to, icon: Icon, label, action }) => (
            <NavLink
              key={to}
              to={action === 'search' ? '#' : to}
              onClick={(e) => handleTabClick(to, action, e)}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center min-w-[60px] min-h-[48px] px-4 py-2 rounded-lg transition-all duration-200 press-scale ${
                  isActive && action !== 'search'
                    ? 'text-accent'
                    : 'text-text-t active:text-text-s'
                }`
              }
            >
              {({ isActive }) => {
                const active = isActive && action !== 'search';
                return (
                  <>
                    <Icon
                      size={24}
                      strokeWidth={1.5}
                      style={active ? { filter: 'drop-shadow(0 0 6px rgba(176,140,232,0.5)) drop-shadow(0 0 14px rgba(176,140,232,0.25))' } : undefined}
                    />
                    <span className="text-xs mt-1 font-medium">{label}</span>
                    {active && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2" style={{ width: 44, height: 6 }}>
                        {/* Core bright line */}
                        <span
                          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            width: 20,
                            height: 2,
                            background: 'rgba(176,140,232,0.8)',
                            boxShadow: '0 0 6px rgba(176,140,232,0.6)',
                          }}
                        />
                        {/* Wide diffused glow */}
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: 'radial-gradient(ellipse 100% 100% at center, rgba(176,140,232,0.35) 0%, rgba(176,140,232,0.08) 50%, transparent 100%)',
                          }}
                        />
                      </span>
                    )}
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
