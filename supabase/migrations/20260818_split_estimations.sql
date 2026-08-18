-- تقدير منفصل للديف والتيست — والإجمالي (est_days/est_hours) يُجمع تلقائياً في التطبيق
-- آمنة تماماً: إضافة أعمدة جديدة فقط، لا تغيير ولا حذف لأي بيانات موجودة
alter table tickets add column if not exists dev_est_days  real;
alter table tickets add column if not exists dev_est_hours real;
alter table tickets add column if not exists test_est_days  real;
alter table tickets add column if not exists test_est_hours real;

-- تحقق سريع بعد التنفيذ:
-- select column_name from information_schema.columns
-- where table_name = 'tickets' and column_name like '%est%';
