# Educare Attendance Portal — System Specification
> Last updated: 2026-05-26. Use this document to maintain or replicate the system. Replace all Educare-specific values (campus names, trainer names, emails, domain, colours) when deploying for another RTO.

---

## 1. What the System Does

A web-based student attendance portal for Educare (an RTO with multiple campuses). It provides:

- **QR code self-check-in** — students scan a poster on arrival, no login required
- **Trainer daily roll** — trainers log in with Microsoft 365, see their class, mark absences, send roll email
- **Admin dashboard** — attendance rates by trainer/campus, at-risk flags, absence reporting
- **Automated email reports** — fortnightly and monthly reports sent via Vercel cron
- **Enrollment management** — enroll, withdraw, and manage student status via UI
- **Attendance rate calculation** — accounts for public holidays and course-specific school breaks, calculated from commenced date

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (single file) | `educare-portal.html`, no build step, no framework |
| Backend | Node.js CommonJS serverless functions | Vercel functions in `/api/` |
| Database | Azure SQL (MSSQL) | `mssql` npm package |
| Auth | Microsoft MSAL.js (PKCE) + Microsoft Graph | `@azure/msal-browser` v2 from CDN |
| Email | Microsoft Graph API (client credentials) | Shared mailbox, no SMTP needed |
| Hosting | Vercel (Hobby plan) | Auto-deploy from GitHub |
| Cron | Vercel Cron | 1st and 15th of month, 8am AEST |

---

## 3. Repository Structure

```
/
├── educare-portal.html       # Main portal — all-in-one SPA (~8,000+ lines)
├── educarecheckin.html       # QR check-in page (public, no login)
├── trainer-portal.html       # Separate mobile-friendly trainer portal
├── vercel.json               # Routing rewrites + cron + cache headers
├── package.json              # CommonJS, mssql dependency
├── robots.txt                # Disallow all (prevents search indexing)
├── api/
│   ├── _auth.js              # validateToken, isAdminUser, ensureAdminCache
│   ├── _calendar.js          # workingDaysInRange — holiday/break-aware session count
│   ├── _db.js                # getPool, sql (singleton connection pool)
│   ├── _graph.js             # Microsoft Graph token + sendMail()
│   ├── _trainers.js          # Server-side email→trainer name map (IDOR prevention)
│   ├── attendance.js         # GET check-ins for a given date
│   ├── checkin.js            # POST QR check-in (public — no auth required)
│   ├── checkout.js           # POST QR check-out (requires auth token)
│   ├── cron-report.js        # GET cron endpoint (triggers email reports)
│   ├── enroll.js             # POST enroll/upsert a student (admin only)
│   ├── records.js            # GET attendance history + notes (trainer-scoped)
│   ├── save.js               # POST manual attendance mark (present/absent)
│   ├── send-email.js         # POST trigger fortnightly/monthly/absence emails
│   ├── settings.js           # GET/PUT app_settings key-value store
│   ├── students.js           # GET/POST/PATCH student roster
│   ├── summary.js            # GET attendance rate summary per trainer/course
│   └── withdraw.js           # POST change enrollment status / withdraw student
```

> **Vercel Hobby plan limit: 12 serverless functions.** `/api/` currently has exactly 12 `.js` files (underscore-prefixed helpers don't count). Do not add more without removing one or upgrading the plan.

---

## 4. Database Schema

Four tables in Azure SQL:

```sql
-- Student master record
CREATE TABLE students (
    id           VARCHAR(20)    PRIMARY KEY,
    name         NVARCHAR(200)  NOT NULL,
    campus       NVARCHAR(100)  DEFAULT '',
    withdrawn    BIT            DEFAULT 0
);

-- One row per student-course enrollment
CREATE TABLE enrollments (
    id           INT            IDENTITY(1,1) PRIMARY KEY,
    studentId    VARCHAR(20)    NOT NULL REFERENCES students(id),
    studentName  NVARCHAR(200)  DEFAULT '',
    course       NVARCHAR(300)  DEFAULT '',
    courseCode   VARCHAR(20)    DEFAULT '',
    trainer      NVARCHAR(200)  DEFAULT '',
    campus       NVARCHAR(100)  DEFAULT '',
    commenced    DATE           NULL,
    expectedEnd  DATE           NULL,
    status       VARCHAR(20)    DEFAULT 'active',  -- 'active' | 'not-started' | 'inactive' | 'completed' | 'graduated'
    isPrimary    BIT            DEFAULT 0
);
CREATE INDEX ix_enrollments_student ON enrollments(studentId);
CREATE INDEX ix_enrollments_trainer ON enrollments(trainer);

-- Attendance check-in records
CREATE TABLE attendance (
    id              INT            IDENTITY(1,1) PRIMARY KEY,
    studentId       VARCHAR(20)    NOT NULL,
    studentName     NVARCHAR(200)  DEFAULT '',
    course          NVARCHAR(300)  DEFAULT '',
    courseCode      VARCHAR(20)    DEFAULT '',
    trainer         NVARCHAR(200)  DEFAULT '',
    campus          NVARCHAR(100)  DEFAULT '',
    checkinTime     DATETIME2      NULL,
    checkoutTime    DATETIME2      NULL,
    attendanceDate  DATE           NOT NULL,
    notes           NVARCHAR(500)  DEFAULT ''
);

-- App-wide key-value configuration store
CREATE TABLE app_settings (
    [key]   VARCHAR(100)   PRIMARY KEY,
    value   NVARCHAR(MAX)  NOT NULL   -- JSON string
);

-- Seed required keys
INSERT INTO app_settings ([key], value) VALUES
    ('admin_emails',    '["admin@educare.edu.au"]'),
    ('email_config',    '{"recipients":["manager@educare.edu.au"]}'),
    ('trainer_schedule','{}');
```

---

## 5. Environment Variables

Set in Vercel dashboard → Settings → Environment Variables:

| Variable | Description |
|---|---|
| `DB_SERVER` | Azure SQL server hostname (e.g. `server.database.windows.net`) |
| `DB_NAME` | Database name |
| `DB_USER` | SQL login username |
| `DB_PASSWORD` | SQL login password |
| `GRAPH_TENANT_ID` | Azure AD tenant ID (GUID) |
| `GRAPH_CLIENT_ID` | Azure AD app client ID (GUID) |
| `GRAPH_CLIENT_SECRET` | Azure AD app client secret |
| `MAIL_FROM` | Shared mailbox address for outbound email (e.g. `noreply@educare.edu.au`) |
| `CRON_SECRET` | Random secret for cron auth — `openssl rand -hex 32` |

---

## 6. API Endpoints

All files in `/api/` are CommonJS modules (`module.exports = async (req, res) => { ... }`).

### Auth Levels
- **Public** — no token required (`checkin`, `checkout`)
- **Auth** — valid Microsoft Graph Bearer token in `Authorization: Bearer <token>` header
- **Admin** — Auth + email in `app_settings.admin_emails` (or hardcoded fallback in `_auth.js`)

### Endpoint Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/checkin` | Public | QR self-check-in. Upserts student, inserts attendance row. 409 if already checked in today. |
| `POST` | `/api/checkout` | Public | Updates `checkoutTime` on today's attendance record for a student. Same trust model as `/api/checkin`. |
| `GET` | `/api/attendance?date=YYYY-MM-DD` | Auth | Returns all check-ins for a date. Trainer-scoped for non-admins. |
| `GET` | `/api/summary` | Auth | Returns roster + per-student attendance rate from commenced date. Trainer-scoped. |
| `GET` | `/api/records?student=ID` | Auth | Full attendance history for one student (no date cap). |
| `GET` | `/api/records` | Auth | Recent records. Trainer-scoped for non-admins. |
| `POST` | `/api/save` | Auth | Manual attendance upsert: mark present or absent for one or more dates. |
| `GET` | `/api/students` | Auth | Student roster. Supports `?status=`, `?trainer=`, `?search=` filters. |
| `POST` | `/api/students` | Admin | Add or update a student record. |
| `PATCH` | `/api/students` | Admin | Update student/enrollment status (e.g. `not-started` → `active`). |
| `POST` | `/api/enroll` | Admin | Enroll a student in a course. Upserts `students` + `enrollments`. Optional `status` field sets `enrollments.status` (defaults to `active`). |
| `POST` | `/api/withdraw` | Admin | Update enrollment status. Reason: `not-started`, `completed`, `not-my-student`, `withdrawn`. |
| `GET` | `/api/settings?key=KEY` | Auth | Read a settings value from `app_settings`. |
| `PUT` | `/api/settings` | Admin | Write/upsert a settings value. Body: `{ key, value }`. |
| `POST` | `/api/send-email` | Auth or CRON_SECRET | Send email report. Body: `{ type }`. Types: `fortnightly`, `monthly`, `absence`. |
| `GET` | `/api/cron-report` | CRON_SECRET | Called by Vercel cron. Triggers fortnightly (always) + monthly (on 1st). |

---

## 7. Shared API Helpers

### `_auth.js`
```js
validateToken(req)          // Validates Bearer token via GET /v1.0/me. In-memory cache 55s.
isAdminUser(email)          // Checks hardcoded ADMIN_EMAILS + dbAdminCache (refreshed every 5 min)
ensureAdminCache(pool)      // Loads admin_emails from app_settings into memory. Call before isAdminUser.
```
**Pattern used in every protected endpoint:**
```js
const pool = await getPool();
await ensureAdminCache(pool);   // refresh DB-backed admin list
const adminUser = isAdminUser(email);
```

### `_db.js`
```js
getPool()   // Returns singleton SQL connection pool. Reconnects if pool is dead.
sql         // Re-export of mssql type helpers (sql.VarChar, sql.Date, etc.)
```
Connection config reads from `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` env vars.

### `_graph.js`
```js
sendMail({ to, subject, htmlBody })
// Gets OAuth client-credential token (cached until near expiry)
// Sends via POST /v1.0/users/{MAIL_FROM}/sendMail (BCC all recipients)
```

### `_trainers.js`
```js
trainersFromEmail(email)  // Returns [trainerDisplayName, ...] or []
```
Used by `summary.js`, `records.js`, `save.js` to scope queries to the logged-in trainer. Must mirror the `TRAINER_EMAILS` map in `educare-portal.html`.

### `_calendar.js`
```js
workingDaysInRange(startDate, endDate)  // Returns count of working days (Mon–Fri, excl. public holidays)
```
Used by `send-email.js` for the report period header.

---

## 8. Frontend Architecture (`educare-portal.html`)

Single-page application. All HTML, CSS, JS in one file. No build step, no bundler.

### CDN Dependencies
```html
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@2/lib/msal-browser.min.js"></script>
```

### Key Global State
```js
let currentUser = null;        // { name, email, role: 'admin'|'trainer', trainer?, dualRole? }
let msalInstance = null;       // MSAL PublicClientApplication
let allStudents = [];          // Roster returned from /api/summary, scoped to user
let attendance = [];           // Today's check-in records from /api/attendance
let notStartedStudents = [];   // Students with status='not-started'
let TRAINER_SCHEDULE = {};     // Loaded from app_settings, falls back to hardcoded constant
```

### MSAL Login Flow
```
1. initMsal()           — clear stale locks, instantiate PublicClientApplication
2. getAllAccounts()      — check for existing session
3. No session           → show login screen → loginPopup({ scopes: ['User.Read'] })
4. acquireTokenSilent   → Bearer token used on every authFetch() call
5. handleMsalAccount()  → determine role → showPortal()
6. 30-minute idle timer → auto logout
```

### Role Determination
```
email in admin_emails   →  isAdmin = true
email in TRAINER_EMAILS →  isTrainer = true
Both                    →  dualRole; defaults to trainer view (Switch button visible)
Neither                 →  "Access Denied" shown
```

### Navigation Tabs

| Tab | Visible to | Purpose |
|---|---|---|
| Daily Attendance | Admin + Trainer | Today's check-ins; mark absent |
| Dashboard | Admin only | Rate cards, at-risk flags, trainer comparison |
| Rate Check | Admin + Trainer | Attendance % per student with history modal |
| My Class | Admin + Trainer | Trainer's class list with mark/absence tools |
| Not Started | Admin only | Students not yet active; Not Checked In sub-tab |
| Holidays | Admin + Trainer | Public holiday and school break calendar |
| Settings | Admin only | Email reports, QR config, roster, admin access |

### Not Checked In / Not Started Tab Logic
```js
// Not Checked In tab — active students + not-started students who have ever attended
const notIn = myScope.filter(s =>
  !todayIn.has(s.id) &&
  (s.status === 'active' || (s.status === 'not-started' && s.lastCheckin))
);
// Tentative tab — not-started students with NO attendance history
const upcoming = myScope.filter(s => s.status === 'not-started' && !s.lastCheckin);
```

### Settings Tabs
Four sub-tabs managed via `switchSettingsTab()`:
1. **Email Reports** — trigger fortnightly/monthly/absence emails; configure recipients
2. **QR Code** — display and download check-in QR code
3. **Roster** — bulk enroll students via spreadsheet paste
4. **Admin Access** — add/remove admin emails; changes write to `app_settings.admin_emails` in DB

---

## 9. Attendance Rate Calculation

### Formula
```
rate = present_sessions / expected_sessions × 100
```

### Expected Sessions
Calculated from `commenced` date to today using `_calendar.js`. Each scheduled class day is counted unless it falls on a public holiday or within a school break period.

### Calendar Break Types
| Type | Course category | Breaks |
|---|---|---|
| `4week` | CHC courses (ECE, Community Services, Individual Support, Ageing, Massage) | April, mid-year 4-week, year-end |
| `8week` | SIT cookery (Certificate III Commercial Cookery) | April, mid-year 8-week, year-end |
| `none` | Kitchen Management, Hospitality Management, others | No breaks, year-round |

### At-Risk Threshold
Students with overall rate < 80% show an **At Risk** badge.

---

## 10. Security

### Authentication & Authorisation
- MSAL PKCE browser flow — token scoped to `User.Read` only
- Server validates every request via `GET https://graph.microsoft.com/v1.0/me`
- 55-second in-memory token cache per serverless instance
- Admin list: hardcoded fallback + DB-backed `app_settings.admin_emails` (5-min TTL)
- 30-minute idle auto-logout client-side
- Trainer scoping: trainer name derived server-side from email via `_trainers.js`; client `?trainer=` param ignored for non-admins

### Endpoint Security Summary
| Endpoint | Level |
|---|---|
| `/api/checkin` | Public |
| `/api/checkout` | Public — same trust model as `/api/checkin` |
| `/api/attendance`, `/api/summary`, `/api/records`, `/api/save`, `/api/students GET` | Any authenticated user; trainer-scoped |
| `/api/students POST/PATCH`, `/api/enroll`, `/api/withdraw`, `/api/settings PUT` | Admin only |
| `/api/send-email` | Auth or `x-cron-secret` header |
| `/api/cron-report` | `x-cron-secret` only |

### XSS Prevention
`escHtml()` applied to all user-controlled data rendered via `innerHTML`. All DB-bound inputs use parameterised queries (`.input()` with typed `sql.*` parameters).

### Search Engine Blocking
- `robots.txt`: `Disallow: /`
- `X-Robots-Tag: noindex, nofollow` via `vercel.json`
- `<meta name="robots" content="noindex, nofollow">` in portal `<head>`

---

## 11. QR Check-In Page (`educarecheckin.html`)

Separate file, no authentication required.

**Flow:**
1. Page requests GPS location
2. Haversine check → detect campus or block if too far away
3. Student enters Student ID (saved to `localStorage`)
4. Student selects trainer and course from dropdowns
5. Ticks declaration checkbox
6. **Check In** → `POST /api/checkin` → 409 if already checked in today
7. **Check Out** → `POST /api/checkout`

Trainer/course dropdowns are hardcoded in `educarecheckin.html` and must be updated manually when trainers or courses change.

---

## 12. Email Reports

All sent via Microsoft Graph as BCC from the `MAIL_FROM` shared mailbox.

| Type | Content | Trigger |
|---|---|---|
| `fortnightly` | Attendance % per trainer for last 14 days | Cron (1st, 15th) + manual |
| `monthly` | Attendance % per trainer for current calendar month | Cron (1st) + manual |
| `absence` | Students with no attendance in last 14 days | Cron (1st, 15th) + manual |

Cron schedule: `vercel.json` → `"0 22 1,15 * *"` (10pm UTC = 8am AEST).

Email recipients stored in `app_settings.email_config`:
```json
{ "recipients": ["manager@educare.edu.au"] }
```

---

## 13. Roster Management

### Enrollment Status Values
| Status | Meaning |
|---|---|
| `active` | Student is in the daily roll |
| `not-started` | Enrolled but not yet commenced — shown in Not Started tab |
| `inactive` | Removed from roll (via "not my student" or "withdrawn" action) |
| `completed` | Course completed (set via `/api/withdraw` reason `completed`) |
| `graduated` | Student finished — set via `/api/enroll` `status` field from the "Graduated / Course Completed" UI action; hidden from all roster views, attendance history retained |

### Enrolling a Student
- **Single student:** Admin UI → Enroll Student button → fills name, ID, course, trainer, dates
- **Bulk:** Roster tab in Settings → paste spreadsheet data → bulk upsert

### Withdrawing / Changing Status
Admin can use the withdraw actions per enrollment:
- **Not started** — sets status to `not-started`
- **Completed** — sets status to `completed`
- **Not my student** — sets status to `inactive`
- **Withdrawn** — sets status to `inactive` + sets `students.withdrawn = 1`

---

## 14. Customising for a New RTO

### `educare-portal.html`
1. `clientId` — your Azure AD app client ID (MSAL config)
2. `ADMIN_EMAILS` array — fallback admin emails (client-side)
3. `TRAINER_EMAILS` object — `{ "Display Name": "email@rto.edu.au" }`
4. `TRAINER_SCHEDULE` constant — initial schedule (or manage via Settings UI)
5. `PUBLIC_HOLIDAYS` — your state's public holidays, updated annually
6. `SCHOOL_BREAKS` array — your academic calendar breaks
7. `getCourseCalendarType()` — map course names to `'4week'` | `'8week'` | `'none'`
8. Campus names — search/replace all occurrences
9. `normCampus()` — map venue strings to canonical campus names
10. Branding: CSS variables `--brand`, gradient colours in `header` rule

### `educarecheckin.html`
1. `campuses` array — GPS coordinates + radius (km) per campus
2. Trainer/course dropdown data
3. RTO name and branding

### `api/_auth.js`
1. `ADMIN_EMAILS` Set — same as portal fallback admin list

### `api/_trainers.js`
1. `_map` — `{ 'email@rto.edu.au': ['Display Name'] }` (reverse of `TRAINER_EMAILS`)

### `api/cron-report.js`
1. `BASE` constant — your deployed domain (e.g. `https://yourapp.vercel.app`)

---

## 15. Deployment Checklist

**Infrastructure**
- [ ] Azure SQL created with 4 tables: `students`, `enrollments`, `attendance`, `app_settings`
- [ ] `app_settings` seeded: `admin_emails`, `email_config`, `trainer_schedule`
- [ ] Azure AD app registered — delegated `User.Read` (login) + application `Mail.Send` (email)
- [ ] Redirect URI added (Vercel deployment URL)
- [ ] All 9 environment variables set in Vercel dashboard

**Code**
- [ ] `educare-portal.html` — clientId, campus names, trainers, holidays, branding
- [ ] `educarecheckin.html` — campus GPS coords, trainer-course dropdowns, branding
- [ ] `api/_auth.js` — `ADMIN_EMAILS` fallback
- [ ] `api/_trainers.js` — email → trainer name map
- [ ] `api/cron-report.js` — `BASE` domain URL
- [ ] GitHub repo connected to Vercel (auto-deploy on push to `main`)

**Testing**
- [ ] QR check-in from a mobile device at each campus
- [ ] Trainer login (Microsoft 365) → daily roll visible
- [ ] Admin login → Settings → Admin Access tab shows admin list
- [ ] Manually trigger email report from Settings → Email Reports
- [ ] Cron job visible in Vercel dashboard → Cron Jobs tab

---

## 16. Known Limitations

| Issue | Impact | Workaround |
|---|---|---|
| No DST adjustment in attendance times | Check-in times 1hr off Oct–Apr for AEDT states | Low practical risk for QLD campus |
| No unique constraint on `(studentId, attendanceDate)` in `attendance` table | Duplicate rows possible if API is bypassed | Don't insert directly; use `/api/save` |
| Trainer/course list in QR page is hardcoded | Must update `educarecheckin.html` manually when trainers change | Update on every roster change |
| Token cache is per serverless instance | First call per cold-start hits Graph API | 55s cache reduces load; acceptable for Hobby plan |
| No rate limiting on `/api/checkin` | Open to bot abuse | Vercel platform protection applies |
| No audit log table | Admin deletes and bulk updates untracked | Add `audit_log` table if compliance required |
