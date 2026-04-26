/**
 * Schedule configuration — edit these values to match your working schedule.
 *
 * The schedule agent uses these rules to determine availability
 * when you ask things like "am I free this week?" or "what days are open?"
 */
export const scheduleConfig = {
  /** Days you typically work (0 = Sunday, 1 = Monday, ..., 6 = Saturday) */
  workingDays: [1, 2, 3, 4, 5] as number[],

  /** Your working hours window */
  workingHours: { start: '10:00', end: '20:00' },

  /** Default session length in hours (used when calculating gaps) */
  defaultSessionDuration: 3,

  /** Minimum free hours in a gap to count as "available" */
  minGapForAvailable: 2,

  /**
   * Morning/evening slot boundaries.
   * The day is split into a morning block (workingHours.start → eveningStart)
   * and an evening block (eveningStart → workingHours.end). A slot is "free"
   * if a session of defaultSessionDuration can fit in its block without
   * overlapping an existing booking.
   */
  morningStart: '10:00',
  eveningStart: '18:00',
};
