// تذكيرات التقدير الزمني للديف والتيست — دورة محكومة يتحكم فيها الأدمن من الإعدادات
// المنطق:
//   - عدّاد الديف يبدأ عند «قيد التطوير» (dev_started_at) ومدته = تقدير الديف
//   - عدّاد التيست يبدأ عند «جاري الاختبار» (test_started_at) ومدته = تقدير التيست
//   - تذكير المنتصف → تذكير قبل النهاية بـN ساعة → إيميل تأخير عند التجاوز (يتكرر كل M ساعة اختيارياً)
//   - كل تذكير يُرسل مرة واحدة (idempotent) عبر tickets.reminders_sent
import { getRepo } from "./db";
import { sendMail } from "./email";
import { wrapEmail } from "./templates";
import { STATUS_LABELS } from "./labels";
import { escapeHtml, isEmail, nowIso } from "./util";
import type { EstimationReminderCfg, Settings, Staff, Ticket } from "./types";

const esc = escapeHtml;

interface Phase {
  key: "dev" | "test";
  roleLabel: string;
  startedAt: string;
  totalHours: number;      // مدة التقدير بالساعات
  assigneeId: string;
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
      assigneeId: t.developer_id, activeStatuses: ["in_progress"],
    });
  }
  const testTotal = estHours(t.test_est_days, t.test_est_hours, cfg.day_hours);
  if (t.tester_id && t.test_started_at && testTotal > 0) {
    out.push({
      key: "test", roleLabel: "التيست", startedAt: t.test_started_at, totalHours: testTotal,
      assigneeId: t.tester_id, activeStatuses: ["testing"],
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

async function sendReminder(input: {
  ticket: Ticket; phase: Phase; kind: "halfway" | "before_end" | "overdue";
  assignee: Staff; settings: Settings; cfg: EstimationReminderCfg; hoursLeft: number; overdueHours?: number;
}) {
  const repo = await getRepo();
  const { ticket: t, phase, kind, assignee, settings, cfg } = input;
  const track = `${settings.base_url}/tickets/${encodeURIComponent(t.code)}`;
  const titles = {
    halfway: `⏳ منتصف مهلة ${phase.roleLabel} — ${t.code}`,
    before_end: `⚠️ اقتربت نهاية مهلة ${phase.roleLabel} (${cfg.before_end_hours} ساعة متبقية) — ${t.code}`,
    overdue: `🔴 التاسك متأخرة عندك — تجاوزت تقدير ${phase.roleLabel} ${input.overdueHours ? `بـ${Math.floor(input.overdueHours)} ساعة` : ""} — ${t.code}`,
  } as const;
  const bodies = {
    halfway: `<p>مرحباً <b>${esc(assignee.name)}</b> 👋</p>
      <p>وصلت إلى <b>منتصف المهلة المقدرة</b> لدورك في الطلب <b dir="ltr">${esc(t.code)}</b> (${esc(t.client_name)}).</p>
      <p><b>المتبقي:</b> ${fmtRemaining(input.hoursLeft)} — <b>الحالة:</b> ${STATUS_LABELS[t.dev_status]}</p>`,
    before_end: `<p>مرحباً <b>${esc(assignee.name)}</b> ⚠️</p>
      <p>باقي <b>${fmtRemaining(input.hoursLeft)}</b> على نهاية المهلة المقدرة لدورك في <b dir="ltr">${esc(t.code)}</b> (${esc(t.client_name)}).</p>
      <p>لو في عائق اكتب ملاحظة على الطلب فوراً حتى يعلم الجميع.</p>`,
    overdue: `<p>مرحباً <b>${esc(assignee.name)}</b> 🔴</p>
      <p>الطلب <b dir="ltr">${esc(t.code)}</b> (${esc(t.client_name)}) <b>تجاوز التقدير الزمني المحدد لدورك${input.overdueHours ? ` بـ${Math.floor(input.overdueHours)} ساعة تقريباً` : ""}</b>.</p>
      <p>حدّث الحالة أو اكتب سبب التأخير على الطلب — هذه الرسالة تصل أيضاً للإدارة.</p>`,
  } as const;
  const btn = `<p style="margin:16px 0 0"><a href="${track}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">فتح الطلب ↗</a></p>`;

  const admins = cfg.cc_admins && kind === "overdue"
    ? (await repo.staffList(true)).filter((s) => s.role === "admin").map((s) => s.email).filter(isEmail)
    : [];
  const subject = titles[kind];
  const html = wrapEmail(subject, bodies[kind] + btn, settings);
  const result = await sendMail({ to: [assignee.email], cc: admins, subject, html }, settings);
  await repo.emailLogAdd({
    job_id: null, ticket_id: t.id, to_addr: assignee.email, cc_addr: admins.join(",") || null,
    provider: result.provider, provider_msg_id: result.msgId, subject, body_html: html,
    status: result.error ? "failed" : result.provider === "log" ? "logged" : "sent", error: result.error ?? null,
  });
  await repo.notifyAdd({ staff_id: assignee.id, ticket_id: t.id, message: subject });
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

  let sent = 0;
  const now = Date.now();
  for (const t of candidates) {
    if (t.is_urgent) continue; // الدعم الفوري له دورته الخاصة
    const reminders = { ...(t.reminders_sent ?? {}) };
    let dirty = false;
    for (const phase of phasesOf(t, cfg)) {
      if (!phase.activeStatuses.includes(t.dev_status)) continue;
      const assignee = await repo.staffGet(phase.assigneeId);
      if (!assignee?.email || !isEmail(assignee.email)) continue;

      const startMs = Date.parse(phase.startedAt);
      const totalMs = phase.totalHours * 3600_000;
      const endMs = startMs + totalMs;
      const hoursLeft = (endMs - now) / 3600_000;

      // 1) منتصف المهلة
      const halfKey = `${phase.key}.halfway`;
      if (cfg.halfway && !reminders[halfKey] && now >= startMs + totalMs / 2 && now < endMs) {
        await sendReminder({ ticket: t, phase, kind: "halfway", assignee, settings, cfg, hoursLeft });
        reminders[halfKey] = nowIso(); dirty = true; sent++;
      }
      // 2) قبل النهاية بـN ساعة
      const beforeKey = `${phase.key}.before_end`;
      if (cfg.before_end && !reminders[beforeKey] && hoursLeft > 0 && hoursLeft <= cfg.before_end_hours) {
        await sendReminder({ ticket: t, phase, kind: "before_end", assignee, settings, cfg, hoursLeft });
        reminders[beforeKey] = nowIso(); dirty = true; sent++;
      }
      // 3) تجاوز التقدير — مرة واحدة أو متكرر كل M ساعة
      const overdueKey = `${phase.key}.overdue`;
      if (cfg.overdue && now > endMs) {
        const last = reminders[overdueKey] ? Date.parse(reminders[overdueKey]) : 0;
        const repeatMs = cfg.overdue_repeat_hours > 0 ? cfg.overdue_repeat_hours * 3600_000 : Infinity;
        if (!last || (repeatMs !== Infinity && now - last >= repeatMs)) {
          await sendReminder({ ticket: t, phase, kind: "overdue", assignee, settings, cfg, hoursLeft, overdueHours: (now - endMs) / 3600_000 });
          reminders[overdueKey] = nowIso(); dirty = true; sent++;
        }
      }
    }
    if (dirty) await repo.ticketUpdate(t.id, { reminders_sent: reminders, updated_at: nowIso() });
  }
  return sent;
}
