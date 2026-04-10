import { NavLink } from 'react-router-dom';
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden safe-bottom">
      <div className="bg-surface/80 backdrop-blur-xl border-t border-border/60">
        <div className="flex items-center justify-around h-20 px-4">
          {tabs.map(({ to, icon: Icon, label, action }) => (
            <NavLink
              key={to}
              to={action === 'search' ? '#' : to}
              onClick={
                action === 'search'
                  ? (e) => {
                      e.preventDefault();
                      setSearchOpen(true);
                    }
                  : undefined
              }
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-w-[60px] min-h-[48px] px-4 py-2 rounded-2xl transition-all duration-200 press-scale ${
                  isActive && action !== 'search'
                    ? 'bg-accent/12 text-accent'
                    : 'text-text-t active:text-text-s'
                }`
              }
            >
              <Icon size={24} strokeWidth={1.5} />
              <span className="text-[11px] mt-1 font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
