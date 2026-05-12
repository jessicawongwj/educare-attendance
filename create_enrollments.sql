-- Run this in Azure SQL Query Editor

CREATE TABLE enrollments (
    id          INT           NOT NULL PRIMARY KEY IDENTITY(1,1),
    studentId   VARCHAR(20)   NOT NULL REFERENCES students(id),
    course      NVARCHAR(300) NOT NULL DEFAULT '',
    courseCode  VARCHAR(20)   NOT NULL DEFAULT '',
    trainer     NVARCHAR(200) NOT NULL DEFAULT '',
    commenced   DATE          NULL,
    expectedEnd DATE          NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'active',
    isPrimary   BIT           NOT NULL DEFAULT 0
);

CREATE INDEX ix_enrollments_student ON enrollments(studentId);
CREATE INDEX ix_enrollments_trainer ON enrollments(trainer);
