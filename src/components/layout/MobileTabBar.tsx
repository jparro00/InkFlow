import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, Users, MessageCircle, MessageSquareText, Settings } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const tabs = [
  { to: '/', icon: Calendar, label: 'Calendar' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/feedback', icon: MessageSquareText, label: 'Feedback' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function MobileTabBar() {
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const setCalendarDate = useUIStore((s) => s.setCalendarDate);
  const scrollToCurrentMonth = useUIStore((s) => s.scrollToCurrentMonth);
  const calendarView = useUIStore((s) => s.calendarView);
  const location = useLocation();

  const handleTabClick = (to: string) => {
    if (to === '/' && location.pathname === '/') {
      if (calendarView === 'month' && scrollToCurrentMonth) {
        // Already in month view — scroll to current month
        scrollToCurrentMonth();
      } else {
        // In day/year view — switch to month view on current month
        setCalendarDate(new Date());
        setCalendarView('month');
      }
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden safe-bottom">
      <div className="bg-surface/80 backdrop-blur-xl border-t border-border/60">
        <div className="flex items-center justify-around h-[100px]">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => handleTabClick(to)}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 min-h-[72px] py-3 transition-all duration-200 press-scale ${
                  isActive
                    ? 'text-accent'
                    : 'text-text-t active:text-text-s'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={24}
                    strokeWidth={1.5}
                    style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.5)) drop-shadow(0 0 14px rgba(var(--accent-rgb),0.25))' } : undefined}
                  />
                  <span className="text-xs mt-1 font-medium">{label}</span>
                  {isActive && (
                    <span
                      className="absolute bottom-0.5 left-1/2 -translate-x-1/2 pointer-events-none"
                      style={{
                        width: 56,
                        height: 8,
                        background: 'radial-gradient(ellipse 40% 50% at center, rgba(var(--accent-rgb),0.9) 0%, rgba(var(--accent-rgb),0.4) 30%, rgba(var(--accent-rgb),0.1) 60%, transparent 100%)',
                      }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
