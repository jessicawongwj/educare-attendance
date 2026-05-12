import pymssql
import openpyxl
from collections import defaultdict

wb = openpyxl.load_workbook('Educare_DB.xlsx')
ws = wb.active
rows = list(ws.iter_rows(values_only=True))[1:]

status_map = {
    'Active - Still Studying': 'active',
    'Upcoming': 'not-started',
}

# Collect all enrollments per student (preserve order — first = primary)
students = defaultdict(list)
for row in rows:
    trainer, status, code, course, name, cid, start, end = row
    if not cid:
        continue
    key = (str(code) if code else '', str(course) if course else '')
    # Avoid duplicate course entries for the same student
    existing_codes = [e['courseCode'] for e in students[cid]]
    if str(code) in existing_codes:
        continue
    students[cid].append({
        'name':       str(name).title() if name else '',
        'course':     str(course) if course else '',
        'courseCode': str(code) if code else '',
        'trainer':    str(trainer) if trainer else '',
        'status':     status_map.get(status, 'active'),
        'start':      start.date() if start else None,
        'end':        end.date() if end else None,
    })

conn = pymssql.connect(
    server='cb-attendance-server.database.windows.net',
    user='cbadmin',
    password='Ntr1#qez66',
    database='educare-attendance-db',
    tds_version='7.4'
)
cursor = conn.cursor()

# Clear existing enrollments
cursor.execute('DELETE FROM enrollments')
print('Cleared existing enrollments.')

inserted = 0
skipped  = 0
for cid, entries in students.items():
    for i, e in enumerate(entries):
        is_primary = 1 if i == 0 else 0
        try:
            cursor.execute("""
                INSERT INTO enrollments
                  (studentId, course, courseCode, trainer, commenced, expectedEnd, status, isPrimary)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (str(cid), e['course'], e['courseCode'], e['trainer'],
                  e['start'], e['end'], e['status'], is_primary))
            inserted += 1
        except Exception as ex:
            print(f'  Skipped {cid} [{e["courseCode"]}]: {ex}')
            skipped += 1

conn.commit()
conn.close()

dual = sum(1 for entries in students.values() if len(entries) > 1)
print(f'\nDone — {inserted} enrollments inserted, {skipped} skipped.')
print(f'{dual} students have multiple enrollments.')
