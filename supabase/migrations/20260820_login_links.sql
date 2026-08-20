-- روابط الدخول الشخصية (Magic Links):
-- عمود kind يفرّق بين رابط «نموذج طلب فقط» (request) ورابط «دخول كامل» (login)
alter table private_access_links add column if not exists kind text not null default 'request'
  check (kind in ('request','login'));

-- تحقق:
-- select column_name from information_schema.columns
-- where table_name='private_access_links' and column_name='kind';
