import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MonthView from '../components/calendar/MonthView';
import DayView from '../components/calendar/DayView';
import YearView from '../components/calendar/YearView';
import { useUIStore } from '../stores/uiStore';
import { iosSpring } from '../utils/springs';
import type { CalendarView } from '../types';

const viewDepth: Record<CalendarView, number> = { year: 0, month: 1, day: 2 };

const viewVariants = {
  enter: (dir: 'push' | 'pop') => ({
    x: dir === 'push' ? '80%' : '-30%',
    opacity: dir === 'push' ? 0.8 : 0.6,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: 'push' | 'pop') => ({
    x: dir === 'push' ? '-30%' : '80%',
    opacity: dir === 'push' ? 0.6 : 0.8,
  }),
};

export default function CalendarPage() {
  const calendarView = useUIStore((s) => s.calendarView);
  const prevViewRef = useRef<CalendarView>(calendarView);
  const dirRef = useRef<'push' | 'pop'>('push');

  if (calendarView !== prevViewRef.current) {
    dirRef.current = viewDepth[calendarView] > viewDepth[prevViewRef.current] ? 'push' : 'pop';
    prevViewRef.current = calendarView;
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <AnimatePresence custom={dirRef.current} initial={false} mode="popLayout">
        <motion.div
          key={calendarView}
          custom={dirRef.current}
          variants={viewVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={iosSpring.gentle}
          className="h-full"
        >
          {calendarView === 'year' && <YearView />}
          {calendarView === 'month' && <MonthView />}
          {calendarView === 'day' && <DayView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
