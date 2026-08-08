// عامل المهام: يمسك المهام من الطابور وينفذها (إيميلات/إشعارات/تحديث حقول)
import { getRepo } from "./db";
import { enqueueStaleReminders, recipientEmails, resolveRecipients } from "./engine";
import { sendMail } from "./email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "./templates";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import type { Action, DevStatus, Job, Settings } from "./types";
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
  const extra = ((job.payload as { extra_vars?: { old_status: string | null; note: string | null } }).extra_vars) ?? { old_status: null, note: null };
  const ticket = await repo.ticketById(ticketId);
  if (!ticket) throw new Error("التذكرة غير موجودة");

  if (action.type === "send_email") {
    const toRes = await resolveRecipients(repo, ticket, action.to);
    const ccRes = await resolveRecipients(repo, ticket, action.cc);
    let to = recipientEmails(toRes);
    let cc = recipientEmails(ccRes).filter((e) => !to.includes(e));
    if (!to.length && cc.length) { to = cc; cc = []; } // لا مستلم مباشر؟ ترقية CC إلى To
    if (!to.length) return; // لا مستلمين إطلاقاً (مثلاً لا مطور معيّن) — ليس خطأ

    const tmpl = await repo.templateGet(action.template_id);
    if (!tmpl) throw new Error(`القالب غير موجود: ${action.template_id}`);
    const vars = templateVars(ticket, settings, extra);
    const subject = renderTemplate(tmpl.subject, vars, { htmlEscape: false });
    const intro = renderTemplate(tmpl.body_html, vars);
    // القالب له أقسام مرئية يتحكم بها الأدمن — الافتراضي عند عدم التخصيص
    const bodyInner = renderBlocks(vars, tmpl.blocks ?? DEFAULT_TEMPLATE_BLOCKS, intro);
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
    const vars = templateVars(ticket, settings, extra);
    const msg = renderTemplate(action.message, vars, { htmlEscape: false });
    const res = await resolveRecipients(repo, ticket, action.to);
    for (const s of res.staff) {
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
