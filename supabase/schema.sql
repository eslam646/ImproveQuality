-- =====================================================================
--  Support Hub — مخطط قاعدة البيانات الكامل لـ Supabase (PostgreSQL)
--  الصق هذا الملف كاملاً في: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

-- ① الجداول الأساسية -----------------------------------------------------

create table if not exists staff (
  id text primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('admin','support','developer','tester')),
  manager_id text references staff(id),
  active integer not null default 1,
  pin_hash text,                          -- دخول الإنتاج برقم سري لكل موظف
  created_at timestamptz not null default now()
);

create table if not exists tickets (
  seq bigint generated always as identity primary key,
  id text unique not null,
  code text unique not null,               -- كود عشوائي عالي الإنتروبيا (مقاوم للتخمين)
  client_name text not null,
  client_contact text,
  details text not null,
  created_by text references staff(id),
  created_by_name text not null,           -- اسم المدخل (أو الضيف) وقت الإنشاء
  developer_id text references staff(id),
  developer_name text,
  dev_status text not null default 'new' check (dev_status in
    ('new','in_progress','ready_for_test','test_passed','test_failed','needs_info','fixed','closed','rejected')),
  source text not null default 'internal' check (source in ('internal','web_guest','update_form')),
  last_status_change timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  custom_data jsonb not null default '{}'   -- قيم الحقول المخصصة
);
alter table tickets add column if not exists custom_data jsonb not null default '{}';
alter table tickets add column if not exists tester_id text;
alter table tickets add column if not exists tester_name text;
alter table tickets add column if not exists est_hours numeric;
alter table tickets add column if not exists est_days numeric;
alter table tickets add column if not exists is_urgent boolean not null default false;
create index if not exists idx_tickets_status on tickets(dev_status);
create index if not exists idx_tickets_dev on tickets(developer_id);
create index if not exists idx_tickets_stale on tickets(dev_status, last_status_change);

create table if not exists events (         -- سجل أحداث غير قابل للتعديل (Timeline + مصدر الأتمتة)
  id bigint generated always as identity primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  type text not null,
  actor_label text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_ticket on events(ticket_id);

create table if not exists automation_rules (  -- القواعد كبيانات: أتمتة جديدة = صف جديد
  id text primary key,
  name text not null,
  trigger_type text not null check (trigger_type in ('ticket.created','ticket.assigned','field.changed','schedule.stale')),
  trigger_field text,
  conditions jsonb not null default '[]',
  actions jsonb not null default '[]',
  enabled integer not null default 1,
  run_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists jobs (               -- طابور المهام (Outbox) — لا تضيع أتمتة أبداً
  id text primary key,
  idempotency_key text unique not null,         -- ⭐ يمنع تكرار أي إيميل/إجراء
  type text not null check (type in ('send_email','notify','update_field')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','processing','done','failed','dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_jobs_pick on jobs(status, run_after);

create table if not exists email_templates (
  id text primary key,
  name text not null,
  subject text not null,          -- تدعم {{متغيرات}}
  body_html text not null default '',
  blocks jsonb,                   -- الأقسام المرئية القابلة للتفعيل (null = الافتراضي)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (            -- قائمة العملاء المنسدلة
  id text primary key,
  name text not null,
  contact_email text,
  active integer not null default 1,
  created_at timestamptz not null default now()
);

insert into clients (id, name, contact_email) values
  ('cl-nour', 'شركة النور للتجارة', 'client1@example.com'),
  ('cl-amal', 'مؤسسة الأمل', 'client2@example.com'),
  ('cl-future', 'شركة المستقبل للتقنية', 'client3@example.com'),
  ('cl-reem', 'استوديو ريم للتصميم', 'client4@example.com')
on conflict (id) do nothing;

create table if not exists email_log (          -- كل رسالة صادرة مسجلة بالكامل
  id text primary key,
  job_id text,
  ticket_id text,
  to_addr text not null,
  cc_addr text,
  provider text not null,
  provider_msg_id text,
  subject text not null,
  body_html text not null,
  status text not null default 'logged',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  staff_id text not null references staff(id),
  ticket_id text,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_staff on notifications(staff_id, read_at);

create table if not exists attachments (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  file_name text not null,
  size_bytes bigint not null default 0,
  path text not null,
  driver text not null default 'local',
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (key text primary key, value text not null);

-- ② حماية إضافية على مستوى الصفوف (RLS) ----------------------------------
-- ملاحظة: التطبيق يتصل بمفتاح service_role (يتجاوز RLS) ويفرض الصلاحيات في
-- الخادم. هذه السياسات خط دفاع ثانٍ لو استُخدم مفتاح anon من المتصفح لاحقاً.

alter table tickets enable row level security;
alter table staff enable row level security;

drop policy if exists "staff_select_all" on staff;
create policy "staff_select_all" on staff for select to authenticated using (true);
drop policy if exists "tickets_select_all" on tickets;
create policy "tickets_select_all" on tickets for select to authenticated using (true);
drop policy if exists "tickets_admin_write" on tickets;
create policy "tickets_admin_write" on tickets for all to authenticated
  using (exists (select 1 from staff s where s.id = auth.uid()::text and s.role in ('admin','support')))
  with check (exists (select 1 from staff s where s.id = auth.uid()::text and s.role in ('admin','support')));

-- ③ الجدولة الداخلية: عامل المهام كل دقيقة (بديل Vercel Cron المجاني) -----
-- pg_cron + pg_net متاحان مجاناً في كل خطط Supabase.
-- بعد نشر تطبيقك، عدّل الرابط والسر ثم شغّل هذا القسم:

create extension if not exists pg_cron;
create extension if not exists pg_net;

/*
select cron.schedule(
  'support-hub-worker',
  '* * * * *',   -- كل دقيقة
  $$
  select net.http_post(
    url := 'https://YOUR-APP-DOMAIN/api/worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-secret', 'CHANGE_ME_اهعب_SECRET_قوي'
    ),
    body := '{}'::jsonb
  );
  $$
);
*/

-- لمراقبة تنفيذ الجدولة:
-- select * from cron.job_run_details order by start_time desc limit 10;

-- ④ النظيف الدوري (اختياري): حذف المهام المنتهية الأقدم من 30 يوماً --------
/*
select cron.schedule('support-hub-cleanup', '17 3 * * *', $$
  delete from jobs where status in ('done','dead') and created_at < now() - interval '30 days';
$$);
*/
