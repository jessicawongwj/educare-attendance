-- Educare 2026 Academic Calendar — Public Holidays & School Breaks
-- Run this once against the Azure SQL database to populate the holidays table.
-- Source: 2026 Academic Calendar_Educare.pdf (QLD dates)

DECLARE @json NVARCHAR(MAX) = N'[
  {"date":"2026-01-01","description":"New Year''s Day","type":"public"},
  {"date":"2026-01-26","description":"Australia Day","type":"public"},
  {"date":"2026-04-03","description":"Good Friday","type":"public"},
  {"date":"2026-04-06","description":"Easter Monday","type":"public"},
  {"date":"2026-04-07","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-08","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-09","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-10","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-13","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-14","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-15","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-16","description":"School Break — Easter","type":"closure"},
  {"date":"2026-04-17","description":"School Break — Easter","type":"closure"},
  {"date":"2026-05-04","description":"Labour Day (QLD)","type":"public"},
  {"date":"2026-06-29","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-06-30","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-01","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-02","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-03","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-06","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-07","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-08","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-09","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-07-10","description":"School Break — Mid-year","type":"closure"},
  {"date":"2026-08-12","description":"Ekka Show Day (Brisbane)","type":"public"},
  {"date":"2026-09-21","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-22","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-23","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-24","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-25","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-28","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-29","description":"School Break — Spring","type":"closure"},
  {"date":"2026-09-30","description":"School Break — Spring","type":"closure"},
  {"date":"2026-10-01","description":"School Break — Spring","type":"closure"},
  {"date":"2026-10-02","description":"School Break — Spring","type":"closure"},
  {"date":"2026-12-21","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-22","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-23","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-24","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-25","description":"Christmas Day","type":"public"},
  {"date":"2026-12-28","description":"Boxing Day (observed)","type":"public"},
  {"date":"2026-12-29","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-30","description":"School Break — Year-end","type":"closure"},
  {"date":"2026-12-31","description":"School Break — Year-end","type":"closure"}
]';

IF EXISTS (SELECT 1 FROM app_settings WHERE [key] = 'holidays')
  UPDATE app_settings SET value = @json WHERE [key] = 'holidays';
ELSE
  INSERT INTO app_settings ([key], value) VALUES ('holidays', @json);

SELECT 'Done — ' + CAST(
  (SELECT COUNT(*) FROM OPENJSON(@json)) AS VARCHAR
) + ' dates inserted.' AS result;
