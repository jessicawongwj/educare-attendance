// QLD public holidays computed programmatically — no year expiry.
// School breaks must be updated annually; see SCHOOL_BREAKS below.

function toISO(d) { return d.toISOString().slice(0, 10); }

// Anonymous Gregorian algorithm for Easter Sunday
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100,
        d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451),
        month = Math.floor((h + l - 7 * m + 114) / 31),
        day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// N-th occurrence of a weekday (0=Sun..6=Sat) in a given month
function nthWeekday(year, month, weekday, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday && ++count === n) return toISO(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// Observed date for a holiday that falls on a weekend (AU substitute rule)
function observed(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2); // Sat → Mon
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
  return toISO(d);
}

function buildPublicHolidays(year) {
  const h = new Set();

  h.add(observed(`${year}-01-01`)); // New Year's Day
  h.add(observed(`${year}-01-26`)); // Australia Day

  // Easter (Good Friday + Easter Monday never fall on a weekend)
  const easter = easterSunday(year);
  const gf = new Date(easter); gf.setUTCDate(easter.getUTCDate() - 2);
  const em = new Date(easter); em.setUTCDate(easter.getUTCDate() + 1);
  h.add(toISO(gf)); // Good Friday
  h.add(toISO(em)); // Easter Monday

  h.add(nthWeekday(year, 5, 1, 1));  // Labour Day QLD: 1st Monday in May
  h.add(nthWeekday(year, 8, 3, 2));  // Ekka: 2nd Wednesday in August (Brisbane)
  h.add(nthWeekday(year, 10, 1, 1)); // King's Birthday QLD: 1st Monday in October

  // Anzac Day — fixed 25 April, no QLD substitute when it falls on a weekend
  h.add(`${year}-04-25`);

  // Christmas + Boxing Day with substitution
  const dow25 = new Date(Date.UTC(year, 11, 25)).getUTCDay();
  if (dow25 === 6) {
    h.add(`${year}-12-27`); h.add(`${year}-12-28`); // both shift to Mon + Tue
  } else if (dow25 === 0) {
    h.add(`${year}-12-26`); h.add(`${year}-12-27`);
  } else {
    h.add(`${year}-12-25`);
    const dow26 = (dow25 + 1) % 7;
    h.add(dow26 === 6 ? `${year}-12-28` : dow26 === 0 ? `${year}-12-27` : `${year}-12-26`);
  }

  return h;
}

// QLD school term breaks by year.
// ⚠ Update annually: https://education.qld.gov.au/about-us/calendar
// 2027 dates are estimated from the typical QLD pattern — verify before year starts.
const SCHOOL_BREAKS = {
  2026: [
    ['2026-04-06', '2026-04-19'], // confirmed — 2026 Educare Academic Calendar
    ['2026-06-29', '2026-07-12'], // confirmed
    ['2026-09-21', '2026-10-04'], // confirmed
    ['2026-12-21', '2026-12-31'], // confirmed (continues into 2027, see below)
  ],
  2027: [
    ['2027-01-01', '2027-01-03'], // confirmed — year-end break continuation, resumes Mon 4 Jan 2027
    ['2027-04-02', '2027-04-16'], // ESTIMATED — confirm with QLD Education
    ['2027-06-28', '2027-07-09'], // ESTIMATED
    ['2027-09-20', '2027-10-01'], // ESTIMATED
    ['2027-12-20', '2027-12-31'], // ESTIMATED
  ],
};

const _holidayCache = {};
function getPublicHolidays(year) {
  if (!_holidayCache[year]) _holidayCache[year] = buildPublicHolidays(year);
  return _holidayCache[year];
}

function isWorkingDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const year = +iso.slice(0, 4);
  if (getPublicHolidays(year).has(iso)) return false;
  const breaks = SCHOOL_BREAKS[year] || [];
  if (!SCHOOL_BREAKS[year]) {
    console.warn(`_calendar: no school breaks defined for ${year} — only weekends and public holidays excluded`);
  }
  return !breaks.some(([s, e]) => iso >= s && iso <= e);
}

function workingDaysInRange(startIso, endIso) {
  let count = 0;
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d <= end) {
    if (isWorkingDay(d.toISOString().slice(0, 10))) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// Backward-compat export (current year snapshot, used by some callers)
const PUBLIC_HOLIDAYS = getPublicHolidays(new Date().getUTCFullYear());

// ── Schedule-aware expected sessions ────────────────────────────────────────
// Mirrors calcExpectedSessionsBetween()/isSchoolBreakWeek() in
// educare-portal.html EXACTLY, so the backend (email reports, dashboard
// summary) produces the same numbers as the portal for the same student
// instead of workingDaysInRange()'s flat "every weekday" assumption. Day
// convention matches the portal's TRAINER_SCHEDULE: 0=Mon..6=Sun, offsets
// from that week's Monday — NOT JS's native getDay() (0=Sun).
function isSchoolBreakWeek(weekMondayIso) {
  for (let d = 0; d < 5; d++) {
    const day = new Date(weekMondayIso + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + d);
    const key = toISO(day);
    const year = +key.slice(0, 4);
    const breaks = SCHOOL_BREAKS[year] || [];
    if (!breaks.some(([s, e]) => key >= s && key <= e)) return false;
  }
  return true;
}

// sessionsPerWeek is only used as the fallback when classDays is unavailable
// (trainer/course not found in _schedule.js) — mirrors the portal's
// calcExpectedSessionsBetween() else-branch exactly, so an unconfigured course
// degrades to the old flat assumption instead of silently reporting 0 expected.
function expectedSessionsBetween(startIso, endIso, classDays, sessionsPerWeek = 2) {
  const start = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  if (isNaN(start.getTime()) || start > end) return 0;

  const monday = new Date(start);
  const dow = monday.getUTCDay(); // 0=Sun..6=Sat (native JS)
  monday.setUTCDate(monday.getUTCDate() - ((dow + 6) % 7)); // normalise to that week's Monday

  let total = 0;
  const cur = new Date(monday);
  while (cur <= end) {
    if (isSchoolBreakWeek(toISO(cur))) { cur.setUTCDate(cur.getUTCDate() + 7); continue; }
    if (classDays && classDays.length) {
      for (const offset of classDays) {
        const day = new Date(cur);
        day.setUTCDate(day.getUTCDate() + offset);
        if (day < start || day > end) continue;
        const key = toISO(day);
        const year = +key.slice(0, 4);
        if (!getPublicHolidays(year).has(key)) total++;
      }
    } else {
      // Fallback: no schedule info — sessionsPerWeek minus any weekday holidays
      let phCount = 0, weekActive = false;
      for (let d = 0; d < 5; d++) {
        const day = new Date(cur);
        day.setUTCDate(day.getUTCDate() + d);
        if (day >= start && day <= end) {
          weekActive = true;
          const key = toISO(day);
          const year = +key.slice(0, 4);
          if (getPublicHolidays(year).has(key)) phCount++;
        }
      }
      if (weekActive) total += Math.max(0, sessionsPerWeek - phCount);
    }
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return total;
}

module.exports = { PUBLIC_HOLIDAYS, SCHOOL_BREAKS, isWorkingDay, workingDaysInRange, expectedSessionsBetween };
