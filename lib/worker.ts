// عامل المهام: يمسك المهام من الطابور وينفذها (إيميلات/إشعارات/تحديث حقول)
import { getRepo } from "./db";
import { enqueueStaleReminders, recipientEmails, resolveRecipients } from "./engine";
import { processEstimationReminders } from "./estimation-reminders";
import { sendMail } from "./email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "./templates";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import type { Action, DevStatus, Job, Settings, Ticket } from "./types";
import { nowIso } from "./util";

export interface ProcessReport {
  remindersEnqueued: number;
  processed: number;
  sent: number;
  retried: number;
  dead: number;
  skipped: number;
}

// معالجة المهام المستحقة فقط (إيميلات/إشعارات) — تُستدعى فور كل حدث وأيضاً من الدورة المجدولة
export async function processDueJobs(limit = 25): Promise<Omit<ProcessReport, "remindersEnqueued">> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const jobs = await repo.jobsDue(limit);
  const report = { processed: 0, sent: 0, retried: 0, dead: 0, skipped: 0 };

  for (const job of jobs) {
    if (!(await repo.jobClaim(job.id))) { report.skipped++; continue; }
    try {
      await executeJob(job, settings);
      await repo.jobDone(job.id);
      report.processed++;
      if (job.type === "send_email") report.sent++;
    } catch (e) {
      const err = String(e).slice(0, 500);
      const nextAttempt = job.attempts + 1;
      if (nextAttempt >= job.max_attempts) {
        await repo.jobFail(job.id, err, null);
        report.dead++;
      } else {
        const backoffSec = Math.min(3600, 2 ** nextAttempt * 60);
        await repo.jobFail(job.id, err, new Date(Date.now() + backoffSec * 1000).toISOString());
        report.retried++;
      }
    }
  }
  return report;
}

// معالجة مهمة واحدة بعينها (زر «إرسال هذه الرسالة» في لوحة الطابور) — يستعيدها أولاً لو كانت عالقة/مؤجلة
export async function processOneJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const job = await repo.jobGet(jobId);
  if (!job) return { ok: false, error: "المهمة غير موجودة" };
  if (job.status === "done") return { ok: false, error: "أُرسلت بالفعل" };
  // استعادة العالقة/الميتة/المؤجلة → queued مستحقة الآن ثم قفل عادي
  await repo.jobRequeue(jobId);
  if (!(await repo.jobClaim(jobId))) return { ok: false, error: "تعذر قفل المهمة — جرّب مجدداً" };
  try {
    await executeJob({ ...job, status: "processing" }, settings);
    await repo.jobDone(jobId);
    return { ok: true };
  } catch (e) {
    const err = String(e).slice(0, 300);
    await repo.jobFail(jobId, err, null);
    return { ok: false, error: err };
  }
}

// معاينة مستلمي مهمة بريد (بدون إرسال): مين هيستلم To ومين CC — بالأسماء والعناوين
// تقبل المهمة نفسها + كاش تذاكر مشترك لتفادي N+1 عند عرض قائمة طويلة
export async function previewJobRecipients(
  jobOrId: Job | string,
  ticketCache?: Map<string, Ticket | null>,
): Promise<{ to: string[]; cc: string[]; excluded: string | null }> {
  const repo = await getRepo();
  const job = typeof jobOrId === "string" ? await repo.jobGet(jobOrId) : jobOrId;
  if (!job) return { to: [], cc: [], excluded: null };
  const action = (job.payload as { action: Action }).action;
  if (action.type !== "send_email") return { to: [], cc: [], excluded: null };
  const ticketId = (job.payload as { ticket_id: string }).ticket_id;
  let ticket: Ticket | null;
  if (ticketCache?.has(ticketId)) {
    ticket = ticketCache.get(ticketId) ?? null;
  } else {
    ticket = await repo.ticketById(ticketId);
    ticketCache?.set(ticketId, ticket);
  }
  if (!ticket) return { to: [], cc: [], excluded: null };
  const extra = ((job.payload as { extra_vars?: { custom?: Record<string, string> | null; exclude_staff_id?: string | null } }).extra_vars) ?? {};
  const custom = extra.custom as Record<string, string> | null | undefined;
  const extraResolve = {
    previous_assignee_id: custom?.previous_assignee_id ?? null,
    event_target_id: custom?.specialist_id ?? custom?.event_target_id ?? null,
  };
  const toRes = await resolveRecipients(repo, ticket, action.to, extraResolve);
  const ccRes = await resolveRecipients(repo, ticket, action.cc, extraResolve);
  const label = (s: { name: string; email: string | null }) => `${s.name} <${s.email ?? "بلا بريد"}>`;
  const excludeId = extra.exclude_staff_id ?? null;
  const excludedStaff = excludeId ? [...toRes.staff, ...ccRes.staff].find((s) => s.id === excludeId) : null;
  const to = [...toRes.staff.filter((s) => s.id !== excludeId).map(label), ...toRes.emails];
  const cc = [...ccRes.staff.filter((s) => s.id !== excludeId).map(label), ...ccRes.emails.filter((e) => !toRes.emails.includes(e))];
  return { to, cc, excluded: excludedStaff ? `${excludedStaff.name} (منفّذ الفعل — يُستثنى تلقائياً)` : null };
}

export async function processAll(): Promise<ProcessReport> {
  // استعادة العالق «قيد المعالجة» (انقطعت عمليته على Cloudflare قبل الإرسال) — يعود للطابور تلقائياً
  try { const repo = await getRepo(); await repo.jobsRecoverStuck(5); } catch (e) { console.error("recover stuck:", e); }
  // التذكيرات المجدولة كلها محصّنة — فشل أي نوع منها لا يوقف إرسال الإيميلات
  let remindersEnqueued = 0;
  try { remindersEnqueued = await enqueueStaleReminders(); } catch (e) { console.error("stale reminders:", e); }
  try { await processEstimationReminders(); } catch (e) { console.error("estimation reminders:", e); }
  try { const { processSpecialistReminders } = await import("./estimation-reminders"); await processSpecialistReminders(); } catch (e) { console.error("specialist reminders:", e); }

  const jobReport = await processDueJobs(25);
  return { remindersEnqueued, ...jobReport };
}

async function executeJob(job: Job, settings: Settings): Promise<void> {
  const repo = await getRepo();
  const action = (job.payload as { action: Action }).action;
  const ticketId = (job.payload as { ticket_id: string }).ticket_id;
  const extra = ((job.payload as { extra_vars?: { old_status: string | null; note: string | null; custom?: Record<string, string> | null; exclude_staff_id?: string | null } }).extra_vars)
    ?? { old_status: null, note: null };
  const ticket = await repo.ticketById(ticketId);
  if (!ticket) throw new Error("التذكرة غير موجودة");

  if (action.type === "send_email") {
    const custom = extra.custom as Record<string, string> | null | undefined;
    const extraResolve = {
      previous_assignee_id: custom?.previous_assignee_id ?? null,
      event_target_id: custom?.specialist_id ?? custom?.event_target_id ?? null,
    };
    const toRes = await resolveRecipients(repo, ticket, action.to, extraResolve);
    const ccRes = await resolveRecipients(repo, ticket, action.cc, extraResolve);
    // منفّذ الفعل لا يستلم إيميلاً عن فعله هو (مثلاً: التيستر الذي قَبِل لا يصله «قَبِل التيستر»)
    const excludeId = extra.exclude_staff_id ?? null;
    const excludeEmail = excludeId
      ? [...toRes.staff, ...ccRes.staff].find((s) => s.id === excludeId)?.email?.toLowerCase() ?? null
      : null;
    let to = recipientEmails(toRes).filter((e) => e !== excludeEmail);
    let cc = recipientEmails(ccRes).filter((e) => !to.includes(e) && e !== excludeEmail);
    if (!to.length && cc.length) { to = cc; cc = []; } // لا مستلم مباشر؟ ترقية CC إلى To
    if (!to.length) return; // لا مستلمين إطلاقاً (مثلاً لا مطور معيّن) — ليس خطأ

    const tmpl = await repo.templateGet(action.template_id);
    if (!tmpl) throw new Error(`القالب غير موجود: ${action.template_id}`);
    const vars = { ...templateVars(ticket, settings, extra), ...(extra.custom ?? {}) };
    // {{developer_name}} يعرض فريق التطوير الكامل (المتخصصين) إن وُجد
    if (!ticket.is_urgent) {
      try {
        const specs = (await repo.specialistList(ticket.id)).filter((x) => x.status !== "declined");
        if (specs.length) {
          const team = specs.map((x) => `${x.staff_name} (${x.spec_label})`).join("، ");
          vars.developer_name = team;
          vars["ticket.developer_name"] = team;
        }
      } catch { /* جدول غير موجود بعد */ }
    }
    const subject = renderTemplate(tmpl.subject, vars, { htmlEscape: false });
    const intro = renderTemplate(tmpl.body_html, vars);
    // القالب له أقسام مرئية يتحكم بها الأدمن — الافتراضي عند عدم التخصيص
    const bodyInner = renderBlocks(vars, { ...DEFAULT_TEMPLATE_BLOCKS, ...(tmpl.blocks ?? {}) }, intro);

    // قرار التصميم النهائي: إيميل واحد مجمّع (To + CC) بلا أزرار قبول/رفض إطلاقاً —
    // القرار يُتخذ من داخل النظام فقط (زر «عرض الطلب» آمن: بلا هوية، والجلسة والصلاحيات هما الحكم)
    const html = wrapEmail(subject, bodyInner, settings);

    const log = await repo.emailLogAdd({
      job_id: job.id, ticket_id: ticket.id, to_addr: to.join(", "), cc_addr: cc.join(", ") || null,
      provider: "pending", provider_msg_id: null, subject, body_html: html, status: "logged", error: null,
    });

    const result = await sendMail({ to, cc, subject, html }, settings);
    if (result.error) {
      await repo.emailLogSetProvider(log.id, result.provider, result.msgId, "failed", result.error);
      throw new Error(result.error); // يعيد المحاولة لاحقاً
    }
    await repo.emailLogSetProvider(log.id, result.provider, result.msgId, result.provider === "log" ? "logged" : "sent", null);
    return;
  }

  if (action.type === "notify") {
    const vars = { ...templateVars(ticket, settings, extra), ...(extra.custom ?? {}) };
    const msg = renderTemplate(action.message, vars, { htmlEscape: false });
    const c2 = extra.custom as Record<string, string> | null | undefined;
    const res = await resolveRecipients(repo, ticket, action.to, { previous_assignee_id: c2?.previous_assignee_id ?? null, event_target_id: c2?.specialist_id ?? c2?.event_target_id ?? null });
    for (const s of res.staff) {
      if (s.id === (extra.exclude_staff_id ?? null)) continue;
      await repo.notifyAdd({ staff_id: s.id, ticket_id: ticket.id, message: msg });
    }
    return;
  }

  if (action.type === "update_field") {
    // تحديث حقول محدود وآمن — بدون إعادة إطلاق أحداث (تفادياً للحلقات)
    if (action.field === "dev_status") {
      await repo.ticketUpdate(ticket.id, {
        dev_status: action.value as DevStatus,
        last_status_change: nowIso(),
        updated_at: nowIso(),
      });
    }
  }
}
