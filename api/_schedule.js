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
  "Carol Ly||Brisbane CBD":          { t: "Carol Ly", c: "Brisbane CBD", courses: { "CHC43015 Certificate IV in Ageing Support": [0], "CHC33021 Certificate III in Individual Support": [4] } },   // Mon C4AS (316 Ade, took over from Sherwin) + Fri C3IS e-learning
  "Nicole Hicks||Brisbane CBD":      { t: "Nicole Hicks", c: "Brisbane CBD", courses: { "CHC30121 Certificate III in Early Childhood Education and Care": [3], "CHC50121 Diploma of Early Childhood Education and Care": [3], "CHC50125 Diploma of Early Childhood Education and Care": [3] } }, // Thu combined C3ECEC + DipECEC (316 Ade, took over from Maggie)
  "Zeyun Ma||Brisbane CBD":          { t: "Zeyun Ma", c: "Brisbane CBD", courses: { "CHC33021 Certificate III in Individual Support": [2] } },
  "Nati Belen||Southport GC":        { t: "Nati Belen", c: "Southport GC", courses: { "CHC30121 Certificate III in Early Childhood Education and Care": [0,3], "CHC50121 Diploma of Early Childhood Education and Care": [0,3], "CHC50125 Diploma of Early Childhood Education and Care": [0,3] } },
  "Vijeta Srivastava||Southport GC": { t: "Vijeta Srivastava", c: "Southport GC", courses: { "CHC43015 Certificate IV in Ageing Support": [2,3], "CHC43121 Certificate IV in Disability Support": [0,1,2,3], "CHC52021 Diploma of Community Services": [2,3], "CHC52025 Diploma of Community Services": [2,3] } },
  "Toriqul Mozumder||Southport GC":  { t: "Toriqul Mozumder", c: "Southport GC", courses: { "CHC33021 Certificate III in Individual Support": [0,2] } },
  "Alessandro Tavian||Woolloongabba":{ t: "Alessandro Tavian", c: "Woolloongabba", courses: { "CPC30220 Certificate III in Carpentry": [0,1,2,3,4], "CPC31320 Certificate III in Wall and Floor Tiling": [0,1,2,3,4], "CPC40120 Certificate IV in Building and Construction": [0,1,2,3,4] } },
  // Post-Foundation (week 8+) trainers — see PROGRESSION below for how students move onto these.
  // "Sandro" is Alessandro Tavian himself (not a separate person) — his post-Foundation Tiling
  // students move to Wed/Thu, but he's the same trainer throughout, so there's no name change
  // for Tiling, just a day-schedule change (see the "— Post-Foundation" course variant above,
  // under his own Woolloongabba entry, rather than a second trainer entry here).
  "Malcolm Lange||Woolloongabba":     { t: "Malcolm Lange", c: "Woolloongabba", courses: { "CPC30220 Certificate III in Carpentry": [0,1] } },              // Mon/Tue
  // Rama: Saturday Carpentry, and his 34-week Tiling group (Thu/Fri) — this is the same group
  // referred to as "Fast Track" in ops conversation; still confirming with the user whether that's
  // literally the same cohort as cohortLabel='rama' Tiling or a distinct-but-identically-scheduled
  // one (see PROGRESSION comment below) before wiring 'fasttrack' to route here too.
  "Rama||Woolloongabba":              { t: "Rama", c: "Woolloongabba", courses: { "CPC30220 Certificate III in Carpentry": [5], "CPC31320 Certificate III in Wall and Floor Tiling — 34wk": [3,4] } }, // Sat / Thu+Fri
};

// ── Foundation → Post-Foundation progression (Carpentry/Tiling only) ───────
// See educare-portal.html's mirror of this block for the frontend copy — keep both in sync.
const PROGRESSION = {
  FOUNDATION_WEEKS: 7,               // weeks 1–7 = Foundation Stage
  FOUNDATION_TRAINER: "Alessandro Tavian",
  // courseCode → post-Foundation (week 8+) trainer. Tiling stays with Alessandro Tavian
  // himself ("Sandro" is his own nickname, not a separate trainer) — see the comment on his
  // TRAINER_SCHEDULE entry above re: the Wed/Thu day-schedule question still to be resolved.
  POST_FOUNDATION_TRAINER: { "CPC30220": "Malcolm Lange", "CPC31320": "Alessandro Tavian" },
  // Tiling stays with the same trainer at week 8, so there's no name change to key a day lookup
  // off — this narrows his Tiling days for post-Foundation students specifically. 0=Mon..6=Sun.
  TILING_POST_FOUNDATION_DAYS: [2, 3], // Wed/Thu
  // Saturday Carpentry students' real compliance requirement is Tue+Sat (2 days/week), not
  // Mon-Fri (or the 2/week default landing on the wrong days) — confirmed with Maria. This is a
  // baseline correction, not a new business rule, so — unlike the week-based progression above —
  // it applies immediately to every Saturday-labelled student regardless of commencement date or
  // PROGRESSION_CUTOVER_DATE. A student attending only one of the two still shows as genuinely
  // under-attending — this fixes the denominator, it doesn't erase a real attendance gap.
  SATURDAY_CARPENTRY_DAYS: [1, 5], // Tue + Sat
  RAMA_TRAINER: "Rama",
  RAMA_ACTIVE_FROM: "2026-09-10",    // Rama unavailable at all before this date
  RAMA_TILING_GROUP_ACTIVE: false,   // flip once the 34-week Tiling group's enrolments are confirmed
  // Only students who commenced on/after this date get the new automatic progression —
  // anyone already enrolled keeps whatever trainer is already on their record, untouched.
  // Adjust this to your actual go-live date before relying on it.
  PROGRESSION_CUTOVER_DATE: "2026-08-28",
};

// Calendar weeks since commencement (week of commencement = week 1). Returns null if commenced is falsy.
function getTrainingWeek(commencedDate, todayDate) {
  if (!commencedDate) return null;
  const c = new Date(commencedDate + 'T00:00:00');
  const t = new Date((todayDate || new Date().toISOString().slice(0,10)) + 'T00:00:00');
  if (isNaN(c) || isNaN(t)) return null;
  const days = Math.floor((t - c) / 86400000);
  if (days < 0) return null; // hasn't commenced yet
  return Math.floor(days / 7) + 1;
}

// Computes the trainer a Carpentry/Tiling student should currently show under, given the
// PROGRESSION rules above. Returns null for anything this logic doesn't apply to (wrong
// course, pre-cutover student, Saturday/Fast Track label) — callers should fall back to the
// student's own stored `trainer` field in that case, i.e. this never overrides by itself.
function resolveEffectiveTrainer(student, todayDate) {
  const today = todayDate || new Date().toISOString().slice(0,10);
  const code = student.courseCode;
  if (!PROGRESSION.POST_FOUNDATION_TRAINER[code]) return null; // not a Carpentry/Tiling course

  if (student.cohortLabel === 'rama') {
    if (today < PROGRESSION.RAMA_ACTIVE_FROM) return null; // Rama not onboard yet — leave as-is
    if (code === 'CPC30220') return PROGRESSION.RAMA_TRAINER;               // Saturday Carpentry
    if (code === 'CPC31320') return PROGRESSION.RAMA_TILING_GROUP_ACTIVE ? PROGRESSION.RAMA_TRAINER : null;
    return null;
  }
  if (student.cohortLabel === 'saturday' || student.cohortLabel === 'fasttrack') return null; // no auto-progression

  if (!student.commenced || student.commenced < PROGRESSION.PROGRESSION_CUTOVER_DATE) return null; // pre-existing student
  const week = getTrainingWeek(student.commenced, today);
  if (week === null) return null;
  return week <= PROGRESSION.FOUNDATION_WEEKS
    ? PROGRESSION.FOUNDATION_TRAINER
    : PROGRESSION.POST_FOUNDATION_TRAINER[code];
}

// Companion to resolveEffectiveTrainer(): covers cases where the correct expected class days
// for a student aren't just "look up their trainer's course" — either because the trainer
// doesn't change (Tiling at week 8) or because the cohort has its own fixed schedule regardless
// of trainer/week (Saturday Carpentry). Returns a days array to override the normal
// TRAINER_SCHEDULE lookup, or null to use that lookup as normal.
function resolveEffectiveClassDays(student, todayDate) {
  if (student.cohortLabel === 'saturday' && student.courseCode === 'CPC30220') {
    return PROGRESSION.SATURDAY_CARPENTRY_DAYS;
  }
  if (student.courseCode !== 'CPC31320') return null;
  if (student.cohortLabel) return null; // Saturday/Fast Track/Rama Tiling have their own schedule entries
  const today = todayDate || new Date().toISOString().slice(0,10);
  if (!student.commenced || student.commenced < PROGRESSION.PROGRESSION_CUTOVER_DATE) return null;
  const week = getTrainingWeek(student.commenced, today);
  if (week === null || week <= PROGRESSION.FOUNDATION_WEEKS) return null;
  return PROGRESSION.TILING_POST_FOUNDATION_DAYS;
}

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

// Prefer this over getClassDays()/sessionsPerWeekFor() wherever a specific student's own class
// days are needed (expected-session/rate calcs) — it applies the Tiling post-Foundation day
// override above; every other case falls through to the normal trainer/course lookup unchanged.
function getClassDaysForStudent(student, schedule, todayDate) {
  const override = resolveEffectiveClassDays(student, todayDate);
  return override || getClassDays(student.trainer, student.course, student.courseCode, schedule);
}
function sessionsPerWeekForStudent(student, schedule, todayDate) {
  const days = getClassDaysForStudent(student, schedule, todayDate);
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
  PROGRESSION,
  getTrainingWeek,
  resolveEffectiveTrainer,
  resolveEffectiveClassDays,
  getClassDaysForStudent,
  sessionsPerWeekForStudent,
};
