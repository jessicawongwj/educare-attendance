# Class List → Trainer Roster: Import & Filtering Logic

> Companion to `SYSTEM-SPEC.md`. This doc isolates the **"spreadsheet of enrolments" → "per-teacher class list"** pipeline so it can be replicated in another project, independent of the attendance/check-in features.

There are two distinct, independent problems here:

- **Stage A — Steady-state filtering**: given a roster table where every student row already has a `trainer` field, show each logged-in teacher only *their* students (and only the right subset of those).
- **Stage B — Periodic reconciliation**: given a fresh "class list" export from the source system (TMS/SIS/Excel), diff it against the live roster and apply graduate / add / update operations.

---

## 1. Canonical Student Record Schema

Every student is one row with these fields:

```
id          — unique student/contact ID from the source system (e.g. "14123456")
name        — full name, "Given SURNAME" convention
course      — full course name (display string)
courseCode  — short code (e.g. "BSB50420")
trainer     — trainer DISPLAY NAME — must exactly match a key in the trainer map (section 4)
campus      — campus name — must exactly match a canonical campus name
commenced   — start date (YYYY-MM-DD)
expectedEnd — expected completion date (YYYY-MM-DD)
status      — 'active' | 'not-started' | 'graduated' | 'archived'
withdrawn   — 0 | 1
email       — optional
graduatedAt — date the student was marked graduated (nullable, set automatically)
```

**`id` is the join key for everything.** All matching between the class-list export and the live roster is done by `id`, never by name (names get re-typed/re-ordered between systems).

### Status lifecycle
- `active` — shown in the daily roll / "Current Students"
- `not-started` — enrolled, commencement date in the future, hidden from the daily roll until it arrives
- `graduated` — finished; hidden from active views, shown in a separate "Recent Graduates" view with `graduatedAt`; **reversible** (see section 7)
- `archived` — soft-deleted, hidden everywhere

---

## 2. Class List Input Format

The source export (Excel/CSV) has one row per *current enrolment*, with columns:

| Source column | Maps to |
|---|---|
| `campus` | `campus` |
| `trainer` | `trainer` (see section 4 for normalisation) |
| `courseCode` | `courseCode` |
| `courseName` | `course` |
| `fullName` | `name` |
| `contactId` | `id` |
| `enrolmentDate` | (informational only, not stored) |
| `commencementDate` | `commenced` |
| `expectedCompletionDate` | `expectedEnd` |

**Date handling**: Excel stores dates as serial numbers (days since 1899-12-30). Convert with:
```python
date(1899, 12, 30) + timedelta(days=int(serial))
```

**Important caveat — the export is not always a complete superset of the live roster.** Some entire programs/cohorts may be structurally excluded from the export (e.g. a partner institution's diploma that's tracked in a different system). Before treating "missing from file" as "graduated", confirm with the business whether the *whole course* is simply absent from this export — see the exclusion allowlist in section 6.

---

## 3. Trainer Identity Mapping (Stage A, prerequisite)

Two parallel maps must exist and stay in sync:

1. **Server-side, email → trainer name(s)** (used for authorization — a logged-in user can only see/edit students whose `trainer` field matches one of *their* names):
   ```js
   const _map = {
     'jane.smith@school.edu':  ['Jane Smith'],
     // one login can own multiple display names:
     'kylie.ma@school.edu':    ['Kylie MA', 'Zeyun MA'],
   };
   ```
2. **Client-side, trainer name → email** (for UI dropdowns, schedule lookups).

**Combo identities**: one real person may appear under two different `trainer` display-name strings in the live roster (e.g. historical naming, or two different programs taught by the same person under different "instructor of record" names). When importing a class list:
- The export's `trainer` column may itself contain a combo string like `"Name A / Name B"` representing one person across two course types.
- Remap this to whichever single name the *live roster already uses* for that person+course combination — build this remap table by inspecting which course/cohort each combo string applies to, not generically.

---

## 4. Per-Teacher Class Filtering (Stage A — runs on every page load)

A teacher's class is **not** simply `roster.filter(s => s.trainer === me)`. It's further scoped by an optional **schedule table**:

```js
// keyed by "Trainer Name||Campus Name"
TRAINER_SCHEDULE = {
  "Jane Smith||Main Campus": {
    t: "Jane Smith",
    c: "Main Campus",
    courses: {
      "Certificate III in Foo": [1, 3],   // day indices this course runs, 0=Mon..4=Fri
      "Diploma of Bar":        [0, 2, 4]
    },
    excludeCodes: ["XYZ123"]  // optional: course codes to hide from THIS teacher's view
                              // (e.g. an online-only stream of a course they also teach in person)
  }
}
```

`filterTrainerStudents(students, trainerName)`:
```js
function filterTrainerStudents(students, trainerName) {
  const sched = Object.values(TRAINER_SCHEDULE).find(e => e.t === trainerName);
  if (!sched) return students.filter(s => s.trainer === trainerName);
  return students.filter(s => {
    if (s.trainer !== trainerName) return false;
    if (s.campus && s.campus !== sched.c) return false;
    if (sched.excludeCodes?.includes(s.courseCode)) return false;
    return true;
  });
}
```

This logic is **independent of reconciliation** — it just narrows whatever rows currently exist in the roster table down to "what this teacher should see today."

---

## 5. Reconciliation Algorithm (Stage B — run when a new class list arrives)

Inputs: `classList` (fresh export, N rows) and `liveRoster` (DB, M rows). Match every row by `id`.

Partition into categories:

| # | Condition | Default action |
|---|---|---|
| **A** | In DB, not in file, `expectedEnd` ≤ today | Mark `graduated` (likely finished naturally) |
| **B** | In DB, not in file, but belongs to a course on the **exclusion allowlist** (whole course structurally absent from this export) | **Do nothing** |
| **C** | In DB, not in file, `expectedEnd` is in the future, course NOT on allowlist | Business decision — typically: if the file is treated as authoritative, mark `graduated` anyway (means they left early/were withdrawn) |
| **D** | In file, not in DB | Add as new student, `status='active'` — **except** rows matching a known non-student pattern (see below) |
| **E** | In both | Leave as-is; optionally backfill any blank fields (e.g. `courseCode`) in the DB from the file |

### Exclusions to check for in category D ("in file, not in DB")
- **Online-only cohorts** that this portal doesn't track at all — identify by trainer+course combination, not by name.
- **Placeholder/admin rows** — non-person names like `"ADMIN ..."`, `"... Trainer"`, generic test rows. Filter these out by pattern before adding.

### Course-name normalisation
The export's `courseName` string may not exactly match the display string already used in the DB for the same `courseCode` (e.g. an internal "this course is run under a partner brand" naming convention). When adding new students, prefer reusing the **DB's existing `course` string for that `courseCode`+`trainer` combination** over the raw file value, so the new rows render identically to existing peers.

---

## 6. Applying the Reconciliation (idempotent batch op)

Implement as a single endpoint that takes a structured payload and applies all four operation types in one transaction-ish pass:

```
{
  graduateIds:    ["id1", "id2", ...],
  addStudents:    [{id, name, course, courseCode, trainer, campus, commenced, expectedEnd, status:'active'}, ...],
  courseCodeFixes:[{id, courseCode}, ...],
  dateUpdates:    [{id, commenced, expectedEnd}, ...]
}
```

Make every step **idempotent** so the whole op can be safely re-run if it times out partway:
- Graduations: `UPDATE students SET status='graduated', graduatedAt=GETDATE() WHERE id IN (...) AND status <> 'graduated'`
- Additions: upsert (`IF EXISTS UPDATE ELSE INSERT`), never plain `INSERT`
- New columns needed for this feature (e.g. `graduatedAt`): guard with `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE ...) ALTER TABLE ... ADD ...`

Return counts of each operation applied (`{graduated, added, codeFixes, dateFixes}`) so the operator can confirm the result matches the dry-run report.

---

## 7. Undo Safety Net — "Recent Graduates"

Because category A/C graduations are inferred (not explicit teacher action), provide a one-click undo:

- A view listing students with `status='graduated'`, sorted by `graduatedAt DESC`, scoped per-teacher the same way as section 4 (filter by `trainer`).
- A "Reactivate" action per row: `UPDATE students SET status='active', graduatedAt=NULL WHERE id=@id`.

This turns an irreversible-feeling bulk operation into a reversible one, which makes it safe to run reconciliation more aggressively (e.g. category C).

---

## 8. Recommended Workflow When a New Class List Arrives

1. Parse the export into the canonical schema (section 2).
2. Diff against live roster by `id` → produce categories A-E (section 5).
3. **Present a dry-run report to the operator**, broken out by category, *especially* flagging:
   - Any course appearing entirely in one of {file-only, DB-only} that wasn't on a known allowlist — this usually means a new program or a structural export gap, not real graduations.
   - Combo trainer-name strings that need remapping (section 3).
4. Get explicit per-category sign-off (don't assume "missing from file = graduated" without confirmation — category B exists precisely because that assumption is sometimes wrong).
5. Build the structured payload (section 6) and apply it via the idempotent batch op.
6. Verify via the "Recent Graduates" view and the per-teacher filtered views (section 4).

---

## 9. Implementation Status (Educare, as of 2026-06-15)

What's actually wired up vs. still aspirational in this doc:

| Item | Status |
|---|---|
| `status='graduated'` persists to `enrollments.status` | ✅ Done — `/api/enroll` now accepts an optional `status` field (previously hardcoded to `'active'` on every save, silently reverting the "Graduated" and "Not Started" UI actions). |
| `status='not-started'` persists via the same path | ✅ Done (same fix as above). |
| "Not My Student" (unassign trainer, `trainer=''`) persists | ✅ Done — `/api/enroll` no longer 400s on empty `trainer`. |
| `status='archived'` | ⚠️ Checked by frontend filters but nothing ever sets it — no UI action, no API path. Treat as unused/dead until a use case is defined. |
| `graduatedAt` column | ❌ Not implemented — section 7's "Recent Graduates" view and "Reactivate" undo cannot be built until this column + a corresponding view/endpoint exist. |
| Reconciliation batch endpoint (section 6) | ❌ Not implemented — no endpoint accepts `{graduateIds, addStudents, courseCodeFixes, dateUpdates}` yet. |
| Single-flat-table vs `students`+`enrollments` split (section 1) | ⚠️ Real schema is normalized (`students` + `enrollments`, joined via `COALESCE` in `/api/summary`). Any reconciliation work must target the correct table per row — see `SYSTEM-SPEC.md` §4. |
