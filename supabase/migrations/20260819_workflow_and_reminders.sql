-- سير عمل جديد + تذكيرات التقدير الزمني
-- 1) حالتان جديدتان: «تم التسليم للديف» و«جاري الاختبار» — تعديل قيد الفحص على dev_status
alter table tickets drop constraint if exists tickets_dev_status_check;
alter table tickets add constraint tickets_dev_status_check check (dev_status in
  ('new','handed_to_dev','in_progress','ready_for_test','testing','test_passed','test_failed','needs_info','fixed','closed','rejected'));

-- 2) أعمدة عدّادات التقدير والتذكيرات (إضافة فقط — آمنة تماماً)
alter table tickets add column if not exists dev_started_at timestamptz;
alter table tickets add column if not exists test_started_at timestamptz;
alter table tickets add column if not exists reminders_sent jsonb;

-- تحقق سريع:
-- select column_name from information_schema.columns where table_name='tickets'
--   and column_name in ('dev_started_at','test_started_at','reminders_sent');
