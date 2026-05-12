import csv, io, re, pymssql
from datetime import datetime, timezone

# ── helpers ──────────────────────────────────────────────────────────────
def parse_course(s):
    """'CHC43015 Certificate IV in Ageing Support' → ('CHC43015', 'Certificate IV...')"""
    m = re.match(r'^([A-Z]{3}\d+)\s+(.+)$', (s or '').strip())
    return (m.group(1), m.group(2)) if m else ('', (s or '').strip())

def parse_dt(s):
    if not s: return None
    s = s.strip()
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None

def attendance_date(s):
    """AttendanceDate column is midnight UTC = local date. Take date portion."""
    if not s: return None
    return s.strip()[:10]   # YYYY-MM-DD

# ── load CSV ─────────────────────────────────────────────────────────────
with open("Attendance Records.csv", encoding='utf-8-sig') as f:
    lines = f.readlines()
# first line is SharePoint schema blob — skip it
reader = csv.DictReader(io.StringIO(''.join(lines[1:])))
rows = list(reader)
print(f"CSV rows loaded: {len(rows)}")

# ── connect ───────────────────────────────────────────────────────────────
conn = pymssql.connect(
    server='cb-attendance-server.database.windows.net',
    user='cbadmin', password='Ntr1#qez66',
    database='educare-attendance-db', tds_version='7.4'
)
cur = conn.cursor()

# ── 1. find student IDs not in our students table ─────────────────────────
cur.execute('SELECT id FROM students')
known_ids = {r[0] for r in cur.fetchall()}
csv_ids   = {r['StudentID'] for r in rows}
missing   = csv_ids - known_ids

# Insert missing students as withdrawn historical records
for cid in missing:
    sample = next(r for r in rows if r['StudentID'] == cid)
    code, course = parse_course(sample['Course'])
    name = sample['Name'].strip().title()
    trainer = sample['Trainer'].strip()
    campus  = sample['Campus'].strip()
    try:
        cur.execute("""
            INSERT INTO students (id, name, course, courseCode, trainer, campus, status, withdrawn)
            VALUES (%s,%s,%s,%s,%s,%s,'active',1)
        """, (cid, name, course, code, trainer, campus))
    except Exception as e:
        print(f"  Student insert skipped {cid}: {e}")
print(f"Inserted {len(missing)} withdrawn/historical students.")

# ── 2. deduplicate: keep first check-in per student per date ──────────────
seen_pairs = set()
deduped = []
for r in rows:
    key = (r['StudentID'], attendance_date(r['AttendanceDate']))
    if key in seen_pairs:
        continue
    seen_pairs.add(key)
    deduped.append(r)
print(f"Rows after deduplication: {len(deduped)} (dropped {len(rows)-len(deduped)} dupes)")

# ── 3. check which student+date combos already exist in attendance ─────────
cur.execute('SELECT studentId, attendanceDate FROM attendance')
existing_pairs = {(r[0], str(r[1])) for r in cur.fetchall()}
print(f"Existing attendance records in DB: {len(existing_pairs)}")

# ── 4. insert historical records ──────────────────────────────────────────
inserted = skipped = 0
for r in deduped:
    sid     = r['StudentID']
    name    = r['Name'].strip().title()
    trainer = r['Trainer'].strip()
    campus  = r['Campus'].strip()
    code, course = parse_course(r['Course'])
    checkin_dt   = parse_dt(r['CheckInTime'])
    checkout_dt  = parse_dt(r['CheckOutTime']) if r['CheckOutTime'].strip() else None
    att_date     = attendance_date(r['AttendanceDate'])

    if not checkin_dt or not att_date:
        skipped += 1
        continue

    if (sid, att_date) in existing_pairs:
        skipped += 1
        continue

    try:
        cur.execute("""
            INSERT INTO attendance
              (studentId, studentName, course, courseCode, trainer, campus,
               checkinTime, checkoutTime, attendanceDate)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (sid, name, course, code, trainer, campus,
              checkin_dt, checkout_dt, att_date))
        inserted += 1
    except Exception as e:
        print(f"  Skip {sid} {att_date}: {e}")
        skipped += 1

conn.commit()
conn.close()
print(f"\nDone — {inserted} records inserted, {skipped} skipped.")
