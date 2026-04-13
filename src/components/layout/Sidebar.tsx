import { NavLink } from 'react-router-dom';
import { Calendar, Users, Search, Palette, Settings } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const navItems = [
  { to: '/', icon: Calendar, label: 'Calendar', action: undefined },
  { to: '/clients', icon: Users, label: 'Clients', action: undefined },
  { to: '/search', icon: Search, label: 'Search', action: 'search' as const },
  { to: '/theme', icon: Palette, label: 'Theme', action: undefined },
  { to: '/settings', icon: Settings, label: 'Settings', action: undefined },
];

export default function Sidebar() {
  const { sidebarCollapsed, setSearchOpen } = useUIStore();

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-surface/90 backdrop-blur-xl border-r border-border/40 z-40 flex-col hidden lg:flex transition-all duration-300 ${
        sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 h-16 border-b border-border/40 ${sidebarCollapsed ? 'justify-center px-0' : 'px-6'}`}>
        <img src={`${import.meta.env.BASE_URL}inkbloop_logo.png`} alt="Ink Bloop" className="w-6 h-6 shrink-0" />
        {!sidebarCollapsed && (
          <span className="font-display text-md text-text-p font-bold tracking-wide">
            Ink Bloop
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 flex flex-col gap-1 px-3">
        {navItems.map(({ to, icon: Icon, label, action }) => (
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
              `flex items-center gap-3 rounded-md transition-all duration-200 ${
                sidebarCollapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
              } ${
                isActive && action !== 'search'
                  ? 'text-accent bg-accent/8 shadow-glow'
                  : 'text-text-t hover:text-text-s hover:bg-elevated/40'
              }`
            }
          >
            <Icon size={20} strokeWidth={1.5} />
            {!sidebarCollapsed && <span className="text-sm">{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
