import MonthView from '../components/calendar/MonthView';
import DayView from '../components/calendar/DayView';
import YearView from '../components/calendar/YearView';
import { useUIStore } from '../stores/uiStore';

export default function CalendarPage() {
  const calendarView = useUIStore((s) => s.calendarView);

  return (
    <div className="h-full flex flex-col">
      {calendarView === 'year' && <YearView />}
      {calendarView === 'month' && <MonthView />}
      {calendarView === 'day' && <DayView />}
    </div>
  );
}
