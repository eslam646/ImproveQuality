// تذكيرات التقدير الزمني للديف والتيست — دورة محكومة:
//   - التوقيتات (منتصف/قبل النهاية/تكرار التأخير) من «⏰ الإعدادات»
//   - المستلمون والقوالب من صفحة «الأتمتة» (6 قواعد مستقلة: ديف/تيست × منتصف/قبل النهاية/تأخير)
// المنطق:
//   - عدّاد الديف يبدأ عند «قيد التطوير» (dev_started_at) ومدته = تقدير الديف
//   - عدّاد التيست يبدأ عند «جاري الاختبار» (test_started_at) ومدته = تقدير التيست
//   - كل تذكير يُرسل مرة واحدة (idempotent) عبر tickets.reminders_sent
import { getRepo } from "./db";
import { emit } from "./engine";
import { nowIso } from "./util";
import type { EstimationReminderCfg, Ticket, TriggerType } from "./types";

interface Phase {
  key: "dev" | "test";
  roleLabel: string;
  startedAt: string;
  totalHours: number;      // مدة التقدير بالساعات
  assigneeId: string;
  assigneeName: string;
  activeStatuses: Ticket["dev_status"][]; // التذكير فقط طالما الحالة ضمن مرحلة العمل
}

function estHours(days: number | null | undefined, hours: number | null | undefined, dayHours: number): number {
  return (days ?? 0) * dayHours + (hours ?? 0);
}

function phasesOf(t: Ticket, cfg: EstimationReminderCfg): Phase[] {
  const out: Phase[] = [];
  const devTotal = estHours(t.dev_est_days, t.dev_est_hours, cfg.day_hours);
  if (t.developer_id && t.dev_started_at && devTotal > 0) {
    out.push({
      key: "dev", roleLabel: "المطور", startedAt: t.dev_started_at, totalHours: devTotal,
      assigneeId: t.developer_id, assigneeName: t.developer_name ?? "المطور", activeStatuses: ["in_progress"],
    });
  }
  const testTotal = estHours(t.test_est_days, t.test_est_hours, cfg.day_hours);
  if (t.tester_id && t.test_started_at && testTotal > 0) {
    out.push({
      key: "test", roleLabel: "التيست", startedAt: t.test_started_at, totalHours: testTotal,
      assigneeId: t.tester_id, assigneeName: t.tester_name ?? "التيست", activeStatuses: ["testing"],
    });
  }
  return out;
}

function fmtRemaining(hoursLeft: number): string {
  if (hoursLeft <= 0) return "انتهت المهلة";
  const h = Math.floor(hoursLeft);
  const m = Math.round((hoursLeft - h) * 60);
  return `${h ? `${h} ساعة` : ""}${h && m ? " و" : ""}${m ? `${m} دقيقة` : ""}` || "أقل من دقيقة";
}

async function fireReminder(
  t: Ticket, phase: Phase, kind: "halfway" | "before_end" | "overdue",
  hoursLeft: number, overdueHours: number,
): Promise<void> {
  const repo = await getRepo();
  const evt = await repo.eventAdd({
    ticket_id: t.id, type: "job.executed", actor_label: "نظام التذكيرات",
    old_values: null, new_values: { reminder: `${phase.key}.${kind}` },
  });
  await emit({
    id: evt.id,
    type: `est.${phase.key}.${kind}` as TriggerType,
    ctx: {
      ticket: t, old: null, actor_label: "نظام التذكيرات",
      vars: {
        phase_role: phase.roleLabel,
        assignee_name: phase.assigneeName,
        remaining: fmtRemaining(hoursLeft),
        overdue_hours: String(Math.max(0, Math.floor(overdueHours))),
      },
    },
  });
}

// تُستدعى من عامل المهام كل دورة — Idempotent بالكامل
export async function processEstimationReminders(): Promise<number> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const cfg = settings.estimation_reminders;
  if (!cfg.enabled) return 0;

  // نفحص التذاكر النشطة فقط (قيد التطوير أو جاري الاختبار)
  const candidates: Ticket[] = [];
  for (const status of ["in_progress", "testing"] as const) {
    const { rows } = await repo.ticketList({ status, pageSize: 300 });
    candidates.push(...rows);
  }

  let fired = 0;
  const now = Date.now();
  for (const t of candidates) {
    if (t.is_urgent) continue; // الدعم الفوري له دورته الخاصة بلا تقديرات
    const reminders = { ...(t.reminders_sent ?? {}) };
    let dirty = false;
    for (const phase of phasesOf(t, cfg)) {
      if (!phase.activeStatuses.includes(t.dev_status)) continue;

      const startMs = Date.parse(phase.startedAt);
      const totalMs = phase.totalHours * 3600_000;
      const endMs = startMs + totalMs;
      const hoursLeft = (endMs - now) / 3600_000;
      const overdueHours = (now - endMs) / 3600_000;

      // 1) منتصف المهلة
      const halfKey = `${phase.key}.halfway`;
      if (cfg.halfway && !reminders[halfKey] && now >= startMs + totalMs / 2 && now < endMs) {
        await fireReminder(t, phase, "halfway", hoursLeft, 0);
        reminders[halfKey] = nowIso(); dirty = true; fired++;
      }
      // 2) قبل النهاية بـN ساعة
      const beforeKey = `${phase.key}.before_end`;
      if (cfg.before_end && !reminders[beforeKey] && hoursLeft > 0 && hoursLeft <= cfg.before_end_hours) {
        await fireReminder(t, phase, "before_end", hoursLeft, 0);
        reminders[beforeKey] = nowIso(); dirty = true; fired++;
      }
      // 3) تجاوز التقدير — مرة واحدة أو متكرر كل M ساعة
      const overdueKey = `${phase.key}.overdue`;
      if (cfg.overdue && now > endMs) {
        const last = reminders[overdueKey] ? Date.parse(reminders[overdueKey]) : 0;
        const repeatMs = cfg.overdue_repeat_hours > 0 ? cfg.overdue_repeat_hours * 3600_000 : Infinity;
        if (!last || (repeatMs !== Infinity && now - last >= repeatMs)) {
          await fireReminder(t, phase, "overdue", hoursLeft, overdueHours);
          reminders[overdueKey] = nowIso(); dirty = true; fired++;
        }
      }
    }
    if (dirty) await repo.ticketUpdate(t.id, { reminders_sent: reminders, updated_at: nowIso() });
  }
  return fired;
}
