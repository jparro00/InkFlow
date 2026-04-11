import MonthView from '../components/calendar/MonthView';
import DayView from '../components/calendar/DayView';
import YearView from '../components/calendar/YearView';
import { useUIStore } from '../stores/uiStore';

export default function CalendarPage() {
  const calendarView = useUIStore((s) => s.calendarView);
  const todayHandler = useUIStore((s) => s.todayHandler);

  return (
    <div className="h-full flex flex-col">
      {calendarView === 'year' && <YearView />}
      {calendarView === 'month' && <MonthView />}
      {calendarView === 'day' && <DayView />}

      {/* Shared Today button — same position across all views */}
      {todayHandler && (
        <button
          onClick={todayHandler}
          className="fixed bottom-[100px] left-5 lg:left-auto lg:bottom-8 px-4 py-2.5 bg-elevated border border-border/60 text-text-p text-[17px] font-medium rounded-xl shadow-md cursor-pointer press-scale transition-all z-30"
        >
          Today
        </button>
      )}
    </div>
  );
}
