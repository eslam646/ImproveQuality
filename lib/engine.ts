// محرك الأتمتة: مطابقة القواعد مع الأحداث + حل المستلمين + إدراج المهام في الطابور
import { getRepo, type Repo } from "./db";
import type {
  Action, AutomationContext, AutomationRule, Condition, DevStatus, Recipient, Staff, Ticket, TriggerType,
} from "./types";
import { FINAL_STATUSES } from "./labels";

export interface FiredEvent {
  id: number;
  type: TriggerType | "attachment.added";
  changedField?: string | null;
  ctx: AutomationContext;
}

// تقييم الشروط على القيم الجديدة للتذكرة
export function matchConditions(conds: Condition[], ticket: Ticket): boolean {
  for (const c of conds) {
    const val = String((ticket as unknown as Record<string, unknown>)[c.field] ?? "");
    if (c.op === "eq" && val !== c.value) return false;
    if (c.op === "neq" && val === c.value) return false;
    if (c.op === "in") {
      const list = c.value.split(",").map((s) => s.trim());
      if (!list.includes(val)) return false;
    }
  }
  return true;
}

// حل مراجع المستلمين → موظفون/عناوين بريد فعلية (بديل دالة SWITCH — بالانضمام لا بالكود)
export async function resolveRecipients(
  repo: Repo,
  ticket: Ticket,
  recs: Recipient[],
  extras?: { previous_assignee_id?: string | null; event_target_id?: string | null },
): Promise<{ staff: Staff[]; emails: string[] }> {
  const staffOut: Staff[] = [];
  const emails: string[] = [];
  const cache = new Map<string, Staff | null>();
  const getStaff = async (id: string | null | undefined) => {
    if (!id) return null;
    if (!cache.has(id)) cache.set(id, await repo.staffGet(id));
    return cache.get(id) ?? null;
  };
  const managerOf = async (s: Staff | null) => (s?.manager_id ? getStaff(s.manager_id) : null);

  for (const r of recs) {
    if (r.kind === "email") { if (r.email) emails.push(r.email.trim()); continue; }
    if (r.kind === "staff") { const s = await getStaff(r.staff_id); if (s && s.active) staffOut.push(s); continue; }
    if (r.kind === "role") {
      const all = await repo.staffList(true);
      staffOut.push(...all.filter((s) => s.role === r.role));
      continue;
    }
    // refs الديناميكية المرتبطة بالتذكرة الحالية
    const creator = ticket.created_by ? await getStaff(ticket.created_by) : null;
    const tester = ticket.tester_id ? await getStaff(ticket.tester_id) : null;
    const developer = ticket.developer_id ? await getStaff(ticket.developer_id) : null;
    if (r.ref === "ticket_parties") {
      [creator, tester, developer].forEach((s) => { if (s?.active) staffOut.push(s); });
      continue;
    }
    if (r.ref === "event_target") {
      // الشخص المعني بالحدث نفسه (متخصص أُسند/تأخر...) — يصل من سياق الحدث
      const tgt = await getStaff(extras?.event_target_id);
      if (tgt?.active) staffOut.push(tgt);
      continue;
    }
    if (r.ref === "previous_assignee") {
      // المكلَّف السابق الذي سُحب منه التكليف — يصل من سياق الحدث
      const prev = await getStaff(extras?.previous_assignee_id);
      if (prev?.active) staffOut.push(prev);
      continue;
    }
    if (r.ref === "ticket_managers") {
      for (const person of [creator, tester, developer]) {
        const manager = await managerOf(person);
        if (manager?.active) staffOut.push(manager);
      }
      continue;
    }
    let target: Staff | null = null;
    switch (r.ref) {
      case "developer": target = developer; break;
      case "tester": target = tester; break;
      case "creator": target = creator; break;
      case "developer_manager": target = await managerOf(developer); break;
      case "tester_manager": target = await managerOf(tester); break;
      case "creator_manager": target = await managerOf(creator); break;
      case "client":
        if (ticket.client_contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticket.client_contact.trim()))
          emails.push(ticket.client_contact.trim());
        break;
    }
    if (target && target.active) staffOut.push(target);
  }

  // إزالة التكرار
  const seenStaff = new Set<string>();
  const uniqStaff = staffOut.filter((s) => (seenStaff.has(s.id) ? false : (seenStaff.add(s.id), true)));
  const seenEmails = new Set<string>();
  const uniqEmails = emails.filter((e) => {
    const k = e.toLowerCase();
    return seenEmails.has(k) ? false : (seenEmails.add(k), true);
  });
  return { staff: uniqStaff, emails: uniqEmails };
}

export function recipientEmails(res: { staff: Staff[]; emails: string[] }): string[] {
  const set = new Set<string>();
  res.staff.forEach((s) => s.email && set.add(s.email.toLowerCase()));
  res.emails.forEach((e) => set.add(e.toLowerCase()));
  return [...set];
}

// نقطة الدخول الرئيسية: تُستدعى بعد كل تغيير على التذاكر
export async function emit(evt: FiredEvent): Promise<number> {
  const repo = await getRepo();
  const rules = await repo.rulesEnabled();
  let enqueued = 0;

  for (const rule of rules) {
    if (rule.trigger_type === "schedule.stale") continue; // يعالجها عامل التذكيرات
    if (rule.trigger_type !== evt.type) continue;
    if (rule.trigger_type === "field.changed" && rule.trigger_field && rule.trigger_field !== evt.changedField) continue;
    if (!matchConditions(rule.conditions, evt.ctx.ticket)) continue;

    await repo.ruleBump(rule.id);
    let idx = 0;
    for (const action of rule.actions) {
      await enqueueAction(rule, action, evt, idx++);
      enqueued++;
    }
  }
  return enqueued;
}

async function enqueueAction(rule: AutomationRule, action: Action, evt: FiredEvent, idx: number) {
  const repo = await getRepo();
  const base = {
    ticket_id: evt.ctx.ticket.id,
    extra_vars: {
      old_status: (evt.ctx.old?.dev_status as DevStatus | undefined) ?? null,
      note: (evt.ctx as { note?: string }).note ?? null,
      // متغيرات الحدث الإضافية (actor_name, reason, progress_label...) + استثناء منفّذ الفعل من البريد
      custom: evt.ctx.vars ?? null,
      exclude_staff_id: evt.ctx.actor_staff_id ?? null,
    },
  };
  await repo.jobEnqueue({
    idempotency_key: `rule:${rule.id}:evt:${evt.id}:${idx}`,
    type: action.type === "send_email" ? "send_email" : action.type === "notify" ? "notify" : "update_field",
    payload: { ...base, action },
  });
}

// فحص التذكيرات المجدولة — يستدعيه العامل في كل دورة (Idempotent: مرة واحدة يومياً لكل تذكرة)
export async function enqueueStaleReminders(): Promise<number> {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const rules = (await repo.rulesEnabled()).filter((r) => r.trigger_type === "schedule.stale");
  if (!rules.length) return 0;

  const { rows: stale } = await repo.ticketList({ staleOlderThanHours: settings.stale_hours, pageSize: 500 });
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;

  for (const rule of rules) {
    let fired = false;
    for (const ticket of stale) {
      if (FINAL_STATUSES.includes(ticket.dev_status)) continue;
      if (!matchConditions(rule.conditions, ticket)) continue;
      let idx = 0;
      for (const action of rule.actions) {
        const res = await repo.jobEnqueue({
          idempotency_key: `stale:${rule.id}:${ticket.id}:${today}:${idx++}`,
          type: action.type === "send_email" ? "send_email" : action.type === "notify" ? "notify" : "update_field",
          payload: { ticket_id: ticket.id, action, extra_vars: { old_status: null, note: null } },
        });
        if (res === "created") { count++; fired = true; }
      }
    }
    if (fired) await repo.ruleBump(rule.id);
  }
  return count;
}
