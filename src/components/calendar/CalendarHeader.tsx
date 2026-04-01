import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import type { CalendarView } from '../../types';

const viewLabels: CalendarView[] = ['month', 'week', 'day'];

export default function CalendarHeader() {
  const { calendarView, setCalendarView, calendarDate, setCalendarDate, openBookingForm } =
    useUIStore();

  const navigate = (dir: -1 | 1) => {
    if (calendarView === 'month') {
      setCalendarDate(dir === 1 ? addMonths(calendarDate, 1) : subMonths(calendarDate, 1));
    } else if (calendarView === 'week') {
      setCalendarDate(dir === 1 ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1));
    } else {
      setCalendarDate(dir === 1 ? addDays(calendarDate, 1) : subDays(calendarDate, 1));
    }
  };

  const goToday = () => setCalendarDate(new Date());

  const title =
    calendarView === 'day'
      ? format(calendarDate, 'EEE, MMM d')
      : format(calendarDate, 'MMMM yyyy');

  return (
    <div className="px-5 pt-6 pb-4 lg:px-6 lg:pt-6 lg:pb-4">
      {/* Title row */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl lg:text-2xl text-text-p">{title}</h1>
        <button
          onClick={() => openBookingForm()}
          className="w-12 h-12 lg:w-auto lg:h-auto lg:px-4 lg:py-2.5 bg-accent text-bg rounded-xl flex items-center justify-center gap-2 text-sm cursor-pointer press-scale transition-transform"
        >
          <Plus size={20} />
          <span className="hidden lg:inline">New Booking</span>
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-text-s active:bg-elevated transition-colors cursor-pointer press-scale"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={goToday}
            className="px-4 h-12 text-sm rounded-xl border border-border text-text-s active:bg-elevated transition-colors cursor-pointer press-scale"
          >
            Today
          </button>
          <button
            onClick={() => navigate(1)}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-text-s active:bg-elevated transition-colors cursor-pointer press-scale"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* View toggle pill */}
        <div className="flex rounded-xl bg-surface p-1.5 gap-1">
          {viewLabels.map((v) => (
            <button
              key={v}
              onClick={() => setCalendarView(v)}
              className={`px-4 py-2 text-sm rounded-lg capitalize transition-all duration-200 cursor-pointer ${
                calendarView === v
                  ? 'bg-elevated text-accent shadow-sm'
                  : 'text-text-t active:text-text-s'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
