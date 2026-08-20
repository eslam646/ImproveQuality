-- المتخصصون على التاسك (باك/فرونت/UX) — كل تخصص له شخص وتقدير وحالة وعدّاد مستقل
create table if not exists ticket_specialists (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  spec_key text not null,
  spec_label text not null,
  staff_id text not null references staff(id),
  staff_name text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','ready')),
  est_days numeric,
  est_hours numeric,
  started_at timestamptz,
  ready_at timestamptz,
  decline_reason text,
  reminders_sent jsonb,
  assigned_by text references staff(id),
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  is_current boolean not null default true
);
create index if not exists idx_specialists_ticket on ticket_specialists(ticket_id, is_current);

alter table ticket_specialists enable row level security;

-- مشغّلات المتخصصين في قواعد الأتمتة
alter table automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table automation_rules add constraint automation_rules_trigger_type_check check (trigger_type in (
  'ticket.created','ticket.assigned','tester.assigned',
  'tester.accepted','tester.declined','developer.accepted','developer.declined',
  'assignment.revoked','urgent.withdrawal','urgent.progress',
  'spec.assigned','spec.accepted','spec.declined','spec.ready','spec.overdue',
  'ticket.rejected','test.failed','ticket.delivered','note.added',
  'est.dev.halfway','est.dev.before_end','est.dev.overdue',
  'est.test.halfway','est.test.before_end','est.test.overdue',
  'field.changed','schedule.stale'
));
