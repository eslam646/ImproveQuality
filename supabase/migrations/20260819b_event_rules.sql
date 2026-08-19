-- فصل كل إيميل في النظام كقاعدة أتمتة مستقلة — توسيع المشغّلات المسموحة
alter table automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table automation_rules add constraint automation_rules_trigger_type_check check (trigger_type in (
  'ticket.created','ticket.assigned','tester.assigned',
  'tester.accepted','tester.declined','developer.accepted','developer.declined',
  'urgent.withdrawal','urgent.progress',
  'ticket.rejected','test.failed','ticket.delivered','note.added',
  'field.changed','schedule.stale'
));

-- تحقق:
-- select conname from pg_constraint where conname = 'automation_rules_trigger_type_check';
