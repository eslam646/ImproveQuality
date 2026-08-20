// عامل المهام: يمسك المهام من الطابور وينفذها (إيميلات/إشعارات/تحديث حقول)
import { getRepo } from "./db";
import { enqueueStaleReminders, recipientEmails, resolveRecipients } from "./engine";
import { processEstimationReminders } from "./estimation-reminders";
import { sendMail } from "./email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "./templates";
import { assignmentEmailActions } from "./assignment-links";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import type { Action, DevStatus, Job, Settings, Staff } from "./types";
import { nowIso } from "./util";

export interface ProcessReport {
  remindersEnqueued: number;
  processed: number;
  sent: number;
  retried: number;
  dead: number;
  skipped: number;
}

export async function processAll(): Promise<ProcessReport> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const remindersEnqueued = await enqueueStaleReminders();
  // تذكيرات التقدير الزمني (منتصف/قبل النهاية/تأخير) — Idempotent ولا تفشل الدورة كلها
  try { await processEstimationReminders(); } catch (e) { console.error("estimation reminders:", e); }
  try { const { processSpecialistReminders } = await import("./estimation-reminders"); await processSpecialistReminders(); } catch (e) { console.error("specialist reminders:", e); }

  const jobs = await repo.jobsDue(25);
  const report: ProcessReport = { remindersEnqueued, processed: 0, sent: 0, retried: 0, dead: 0, skipped: 0 };

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
    const subject = renderTemplate(tmpl.subject, vars, { htmlEscape: false });
    const intro = renderTemplate(tmpl.body_html, vars);
    // القالب له أقسام مرئية يتحكم بها الأدمن — الافتراضي عند عدم التخصيص
    const bodyInner = renderBlocks(vars, { ...DEFAULT_TEMPLATE_BLOCKS, ...(tmpl.blocks ?? {}) }, intro);

    // ═══ أزرار القرار شخصية وسرية — لا تُرسل أبداً في إيميل جماعي ═══
    // من له قرار معلق يستلم نسخته الخاصة وحده (بأزراره الموقعة باسمه)، والبقية يستلمون النسخة العامة بلا أزرار.
    // هذا يمنع وصول أزرار «أحمد» إلى صندوق «ليلى» فيُسجل قبول باسمه وهي الضاغطة.
    const personal: { staff: Staff; role: "tester" | "developer" }[] = [];
    const devStaff = ticket.developer_id ? await repo.staffGet(ticket.developer_id) : null;
    if (devStaff?.email && ticket.developer_assignment_status === "pending") {
      const em = devStaff.email.toLowerCase();
      if (to.includes(em) || cc.includes(em)) personal.push({ staff: devStaff, role: "developer" });
    }
    const testerStaff = ticket.tester_id ? await repo.staffGet(ticket.tester_id) : null;
    if (testerStaff?.email && ticket.tester_assignment_status === "pending") {
      const em = testerStaff.email.toLowerCase();
      if (to.includes(em) || cc.includes(em)) personal.push({ staff: testerStaff, role: "tester" });
    }

    // 1) نسخ شخصية بأزرار لكل صاحب قرار معلق — كل واحد وحده تماماً
    for (const p of personal) {
      const em = p.staff.email.toLowerCase();
      to = to.filter((e) => e !== em);
      cc = cc.filter((e) => e !== em);
      const personalHtml = wrapEmail(subject, bodyInner + assignmentEmailActions(settings.base_url, ticket, p.role, p.staff), settings);
      const plog = await repo.emailLogAdd({
        job_id: job.id, ticket_id: ticket.id, to_addr: p.staff.email, cc_addr: null,
        provider: "pending", provider_msg_id: null, subject, body_html: personalHtml, status: "logged", error: null,
      });
      const pres = await sendMail({ to: [p.staff.email], cc: [], subject, html: personalHtml }, settings);
      if (pres.error) {
        await repo.emailLogSetProvider(plog.id, pres.provider, pres.msgId, "failed", pres.error);
        throw new Error(pres.error);
      }
      await repo.emailLogSetProvider(plog.id, pres.provider, pres.msgId, pres.provider === "log" ? "logged" : "sent", null);
    }

    // 2) النسخة العامة بلا أزرار لبقية المستلمين
    if (!to.length && cc.length) { to = cc; cc = []; }
    if (!to.length) return;
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
