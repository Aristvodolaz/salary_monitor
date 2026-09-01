/** Inclusive calendar-day filter. DATETIME compared to 'YYYY-MM-DD' otherwise drops the last day after 00:00. */
export function sqlInclusiveDayRange(column: string, startParam = 'startDate', endParam = 'endDate') {
  return {
    start: `CAST(${column} AS DATE) >= CAST(@${startParam} AS DATE)`,
    end: `CAST(${column} AS DATE) <= CAST(@${endParam} AS DATE)`,
  };
}
