// Mirrors TRAINER_SCHEDULE_DEFAULT in educare-portal.html — MUST be kept in
// sync manually when a trainer's default schedule changes there. Lets the
// backend (email reports, dashboard summary) compute expected sessions the
// same way the portal does, instead of assuming every weekday is a class day.
// Day convention: 0=Mon..6=Sun, offsets from that week's Monday.
//
// Custom courses an admin adds via Settings → Trainer Schedule are persisted
// to app_settings['trainer_schedule'] and are NOT reflected in this hardcoded
// object — call loadMergedSchedule(pool) instead of using getClassDays()
// directly if a request has a pool available, to pick those up too (mirrors
// the portal's own loadTrainerSchedule() merge: defaults always win for any
// course already defined here; DB can only add courses not in the defaults).
const TRAINER_SCHEDULE_DEFAULT = {
  "Troy Scott||Brisbane CBD":        { t: "Troy Scott", c: "Brisbane CBD", courses: { "CHC33021 Certificate III in Individual Support": [0,1,2,3], "CHC52021 Diploma of Community Services": [0,1,2,3], "CHC52025 Diploma of Community Services": [0,1,2,3] } },
  "Maggie Yu Huang||Brisbane CBD":   { t: "Maggie Yu Huang", c: "Brisbane CBD", courses: { "CHC30121 Certificate III in Early Childhood Education and Care": [3,4], "CHC50121 Diploma of Early Childhood Education and Care": [3,4], "CHC50125 Diploma of Early Childhood Education and Care": [3,4] } },
  "Zeyun Ma||Brisbane CBD":          { t: "Zeyun Ma", c: "Brisbane CBD", courses: { "CHC33021 Certificate III in Individual Support": [2] } },
  "Sherwin Thiarhia||Brisbane CBD":  { t: "Sherwin Thiarhia", c: "Brisbane CBD", courses: { "CHC33021 Certificate III in Individual Support": [0,1], "CHC43015 Certificate IV in Ageing Support": [0,1] } },
  "Nati Belen||Southport GC":        { t: "Nati Belen", c: "Southport GC", courses: { "CHC30121 Certificate III in Early Childhood Education and Care": [0,3], "CHC50121 Diploma of Early Childhood Education and Care": [0,3], "CHC50125 Diploma of Early Childhood Education and Care": [0,3] } },
  "Vijeta Srivastava||Southport GC": { t: "Vijeta Srivastava", c: "Southport GC", courses: { "CHC43015 Certificate IV in Ageing Support": [0,1,2,3], "CHC43121 Certificate IV in Disability Support": [0,1,2,3], "CHC52021 Diploma of Community Services": [0,1,2,3], "CHC52025 Diploma of Community Services": [0,1,2,3] } },
  "Toriqul Mozumder||Southport GC":  { t: "Toriqul Mozumder", c: "Southport GC", courses: { "CHC33021 Certificate III in Individual Support": [0,2] } },
  "Alessandro Tavian||Woolloongabba":{ t: "Alessandro Tavian", c: "Woolloongabba", courses: { "CPC30220 Certificate III in Carpentry": [0,1,2,3,4], "CPC31320 Certificate III in Wall and Floor Tiling": [0,1,2,3,4], "CPC40120 Certificate IV in Building and Construction": [0,1,2,3,4] } },
};

const DEFAULT_SESSIONS_PER_WEEK = 2; // fallback when a course isn't found

function getClassDays(trainer, course, courseCode, schedule) {
  const src = schedule || TRAINER_SCHEDULE_DEFAULT;
  const entry = Object.values(src).find(e => e.t === trainer);
  if (!entry || !entry.courses) return null;
  const exactKey = `${courseCode || ''} ${course || ''}`.trim();
  if (entry.courses[exactKey]) return entry.courses[exactKey];
  const nameMatch = Object.entries(entry.courses).find(([key]) => course && key.endsWith(course));
  return nameMatch ? nameMatch[1] : null;
}

function sessionsPerWeekFor(trainer, course, courseCode, schedule) {
  const days = getClassDays(trainer, course, courseCode, schedule);
  return days && days.length ? days.length : DEFAULT_SESSIONS_PER_WEEK;
}

// Merges app_settings['trainer_schedule'] (admin-added custom courses) on top
// of the hardcoded defaults, exactly like the portal's loadTrainerSchedule():
// defaults always win for any course key already defined there; the DB can
// only contribute courses not already present. Falls back to defaults alone
// on any error (missing table, malformed JSON, etc).
async function loadMergedSchedule(pool) {
  const merged = JSON.parse(JSON.stringify(TRAINER_SCHEDULE_DEFAULT));
  try {
    const result = await pool.request().query(
      "SELECT value FROM app_settings WHERE [key]='trainer_schedule'"
    );
    if (!result.recordset.length) return merged;
    const dbSchedule = JSON.parse(result.recordset[0].value);
    if (!dbSchedule || typeof dbSchedule !== 'object') return merged;
    Object.entries(dbSchedule).forEach(([key, dbEntry]) => {
      if (!merged[key]) return; // ignore unknown trainer keys, same as portal
      Object.entries(dbEntry).forEach(([field, val]) => {
        if (field !== 'courses') merged[key][field] = val;
      });
      if (dbEntry.courses) {
        Object.entries(dbEntry.courses).forEach(([course, days]) => {
          if (merged[key].courses[course] === undefined) merged[key].courses[course] = days;
        });
      }
    });
  } catch { /* table/row may not exist yet — keep hardcoded defaults */ }
  return merged;
}

module.exports = {
  TRAINER_SCHEDULE: TRAINER_SCHEDULE_DEFAULT, // back-compat alias
  TRAINER_SCHEDULE_DEFAULT,
  getClassDays,
  sessionsPerWeekFor,
  loadMergedSchedule,
  DEFAULT_SESSIONS_PER_WEEK,
};
