-- Support Hub V2 — Foundation migration (DRAFT)
-- لا تُنفذ على Production قبل Staging + Backup + مراجعة التطبيق.
-- إضافية فقط: لا تحذف بيانات أو أعمدة حالية.

begin;

create extension if not exists pgcrypto;

-- 1) العملاء ومدخلو البيانات ------------------------------------------------
alter table clients add column if not exists logo_url text;
alter table clients add column if not exists project_url text;
alter table clients add column if not exists admin_url text;
alter table clients add column if not exists notes text;
alter table clients add column if not exists updated_at timestamptz not null default now();

alter table staff add column if not exists client_id text references clients(id) on delete set null;
alter table staff add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_staff_client on staff(client_id);

create table if not exists private_access_links (
  id text primary key default gen_random_uuid()::text,
  staff_id text not null references staff(id) on delete cascade,
  token_hash text not null unique,
  label text,
  active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_private_links_staff on private_access_links(staff_id, active);

-- 2) توسيع التذاكر -----------------------------------------------------------
alter table tickets add column if not exists title text;
alter table tickets add column if not exists request_type text not null default 'issue';
alter table tickets add column if not exists ticket_kind text not null default 'standard';
alter table tickets add column if not exists priority text not null default 'normal';
alter table tickets add column if not exists overall_status text not null default 'new';
alter table tickets add column if not exists tester_assignment_status text not null default 'unassigned';
alter table tickets add column if not exists developer_assignment_status text not null default 'unassigned';
alter table tickets add column if not exists linked_ticket_id text references tickets(id) on delete set null;
alter table tickets add column if not exists urgent_reason text;
alter table tickets add column if not exists affected_service text;
alter table tickets add column if not exists urgent_requested_at timestamptz;
alter table tickets add column if not exists urgent_started_at timestamptz;
alter table tickets add column if not exists urgent_ended_at timestamptz;
alter table tickets add column if not exists urgent_result text;
alter table tickets add column if not exists actual_minutes integer;
alter table tickets add column if not exists version integer not null default 1;

-- توافق خلفي مع is_urgent الحالي
update tickets
set ticket_kind = 'instant_support',
    priority = 'critical',
    urgent_requested_at = coalesce(urgent_requested_at, created_at)
where is_urgent = true and ticket_kind = 'standard';

create index if not exists idx_tickets_kind on tickets(ticket_kind);
create index if not exists idx_tickets_tester on tickets(tester_id);
create index if not exists idx_tickets_creator on tickets(created_by);
create index if not exists idx_tickets_overall_status on tickets(overall_status);
create index if not exists idx_tickets_created_at on tickets(created_at desc);

-- 3) تاريخ الإسناد والقبول/الرفض -------------------------------------------
create table if not exists ticket_assignments (
  id text primary key default gen_random_uuid()::text,
  ticket_id text not null references tickets(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('tester','developer')),
  staff_id text not null references staff(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','declined','reassigned','completed','cancelled')),
  decline_reason text,
  assigned_by text references staff(id) on delete set null,
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  is_current boolean not null default true
);
create index if not exists idx_assignments_ticket on ticket_assignments(ticket_id, assignment_role, is_current);
create index if not exists idx_assignments_staff on ticket_assignments(staff_id, status);

-- 4) الملاحظات والمرفقات ----------------------------------------------------
create table if not exists ticket_notes (
  id text primary key default gen_random_uuid()::text,
  ticket_id text not null references tickets(id) on delete cascade,
  author_staff_id text references staff(id) on delete set null,
  author_label text not null,
  author_role text,
  body text not null,
  visibility text not null default 'ticket_parties' check (visibility in ('ticket_parties','managers','internal')),
  created_at timestamptz not null default now()
);
create index if not exists idx_ticket_notes_ticket on ticket_notes(ticket_id, created_at);

alter table attachments add column if not exists mime_type text;
alter table attachments add column if not exists storage_key text;
alter table attachments add column if not exists visibility text not null default 'ticket_parties';
alter table attachments add column if not exists uploaded_by_staff_id text references staff(id) on delete set null;
alter table attachments add column if not exists checksum text;

-- 5) Views وفلاتر محفوظة ----------------------------------------------------
create table if not exists saved_views (
  id text primary key default gen_random_uuid()::text,
  owner_staff_id text references staff(id) on delete cascade,
  role_scope text,
  name text not null,
  columns jsonb not null default '[]',
  filters jsonb not null default '{}',
  sorting jsonb not null default '[]',
  is_default boolean not null default false,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_views_owner on saved_views(owner_staff_id);

-- 6) التقارير الأسبوعية ------------------------------------------------------
create table if not exists weekly_reports (
  id text primary key default gen_random_uuid()::text,
  week_start date not null,
  week_end date not null,
  staff_id text references staff(id) on delete cascade,
  report_type text not null check (report_type in ('personal','manager')),
  metrics jsonb not null default '{}',
  html_body text,
  delivery_status text not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (week_start, staff_id, report_type)
);

-- 7) الشكاوى السرية ----------------------------------------------------------
create table if not exists complaints (
  id text primary key default gen_random_uuid()::text,
  complainant_id text not null references staff(id) on delete restrict,
  subject_staff_id text not null references staff(id) on delete restrict,
  related_ticket_id text references tickets(id) on delete set null,
  reason text not null,
  status text not null default 'new' check (status in ('new','under_review','resolved','closed')),
  assigned_manager_id text references staff(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists complaint_events (
  id text primary key default gen_random_uuid()::text,
  complaint_id text not null references complaints(id) on delete cascade,
  actor_id text references staff(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 8) مركز مشاريع العملاء ----------------------------------------------------
create table if not exists client_resources (
  id text primary key default gen_random_uuid()::text,
  client_id text not null references clients(id) on delete cascade,
  resource_type text not null check (resource_type in ('project','admin','repository','user_guide','document','other')),
  title text not null,
  url text,
  storage_key text,
  notes text,
  active boolean not null default true,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_resources_client on client_resources(client_id, active);

-- 9) الإجازات والعمل من المنزل ---------------------------------------------
create table if not exists availability (
  id text primary key default gen_random_uuid()::text,
  staff_id text not null references staff(id) on delete cascade,
  kind text not null check (kind in ('leave','work_from_home')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  backup_staff_id text references staff(id) on delete set null,
  note text,
  status text not null default 'approved' check (status in ('pending','approved','rejected','cancelled')),
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_availability_staff_range on availability(staff_id, starts_at, ends_at);

-- 10) اجتماعات Microsoft Teams ---------------------------------------------
create table if not exists meetings (
  id text primary key default gen_random_uuid()::text,
  ticket_id text references tickets(id) on delete set null,
  provider text not null default 'teams' check (provider in ('teams')),
  provider_meeting_id text,
  subject text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  join_url text,
  organizer_staff_id text references staff(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','started','ended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meeting_participants (
  id text primary key default gen_random_uuid()::text,
  meeting_id text not null references meetings(id) on delete cascade,
  staff_id text references staff(id) on delete cascade,
  email text,
  response_status text not null default 'pending',
  joined_at timestamptz,
  left_at timestamptz,
  check (staff_id is not null or email is not null),
  unique (meeting_id, staff_id)
);
create index if not exists idx_meeting_participants_meeting on meeting_participants(meeting_id);

-- 11) سجل تدقيق موحد --------------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_staff_id text references staff(id) on delete set null,
  actor_label text,
  old_values jsonb,
  new_values jsonb,
  request_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_actor on audit_log(actor_staff_id, created_at desc);

-- البيانات الحساسة: لا توجد Policies مفتوحة لها في هذه المرحلة.
alter table private_access_links enable row level security;
alter table complaints enable row level security;
alter table complaint_events enable row level security;
alter table audit_log enable row level security;

commit;
