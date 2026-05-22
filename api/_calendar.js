const PUBLIC_HOLIDAYS = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-26', // Australia Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-04', // Labour Day QLD
  '2026-08-12', // Ekka Wednesday (Brisbane)
  '2026-12-25', // Christmas Day
  '2026-12-28', // Boxing Day substitute
]);

const SCHOOL_BREAKS = [
  ['2026-04-06', '2026-04-17'],
  ['2026-06-29', '2026-07-10'],
  ['2026-09-21', '2026-10-02'],
  ['2026-12-21', '2026-12-31'],
];

function isWorkingDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (PUBLIC_HOLIDAYS.has(iso)) return false;
  return !SCHOOL_BREAKS.some(([s, e]) => iso >= s && iso <= e);
}

function workingDaysInRange(startIso, endIso) {
  let count = 0;
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (isWorkingDay(iso)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

module.exports = { PUBLIC_HOLIDAYS, SCHOOL_BREAKS, isWorkingDay, workingDaysInRange };
