-- تخصصات الموظف (المطور): باك/فرونت/UX... — تُستخدم لفلترة قوائم الإسناد
-- فارغة/null = المطور يظهر في كل قوائم التخصصات
alter table staff add column if not exists specializations jsonb;
