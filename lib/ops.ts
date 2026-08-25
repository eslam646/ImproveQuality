// عمليات التذاكر الموحّدة — تستدعيها Server Actions و API Routes معاً
import { getRepo } from "./db";
import type { Repo } from "./db";
import { emit } from "./engine";
import { sendMail } from "./email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "./templates";
import { ROLE_LABELS, STATUS_LABELS } from "./labels";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import type { AutomationContext, DevStatus, RequestType, Role, Settings, Staff, Ticket, TicketKind, TicketPriority } from "./types";
import { escapeHtml, genTicketCode, isEmail, nowIso } from "./util";

// ═══ بريد الأطراف المباشر: إيميل + تسجيل + إشعار داخلي ═══
type PartyRef = "creator" | "tester" | "developer" | "client";

async function resolveParty(repo: Repo, ticket: Ticket, ref: PartyRef): Promise<{ staff: Staff | null; email: string | null }> {
  const pick = async (id: string | null | undefined) => (id ? repo.staffGet(id) : null);
  if (ref === "creator") {
    const s = await pick(ticket.created_by);
    const fallback = !s && ticket.client_contact && isEmail(ticket.client_contact) ? ticket.client_contact : null;
    return { staff: s ?? null, email: s?.email ?? fallback };
  }
  if (ref === "tester") { const s = await pick(ticket.tester_id); return { staff: s ?? null, email: s?.email ?? null }; }
  if (ref === "developer") { const s = await pick(ticket.developer_id); return { staff: s ?? null, email: s?.email ?? null }; }
  // client: وسيلة التواصل قد تكون هاتفاً — لا نرسل إلا للبريد الصحيح
  const em = ticket.client_contact && isEmail(ticket.client_contact) ? ticket.client_contact : null;
  return { staff: null, email: em };
}

async function mailParties(input: {
  ticket: Ticket;
  to: PartyRef[];
  cc?: PartyRef[];
  excludeStaffId?: string | null;
  subject: string;
  bodyHtml: string;
  notifyTo?: PartyRef[];      // إشعار داخلي (الجرس) لهؤلاء
  notifyMessage?: string;
  extraTo?: string[];         // عناوين إضافية (مثل الإدارة في الاعتذارات)
  forceTo?: string[];         // تجاوز: استخدم هذه العناوين كـ«إلى» مباشرة (حين لا يوجد منشئ صالح)
}) {
  const repo = await getRepo();
  const settings = await repo.settingsGet();

  const collect = async (refs: PartyRef[]) => {
    const emails: string[] = [];
    const staffIds: string[] = [];
    for (const r of refs) {
      const p = await resolveParty(repo, input.ticket, r);
      if (p.staff && p.staff.id !== input.excludeStaffId && p.email && isEmail(p.email)) {
        emails.push(p.email); staffIds.push(p.staff.id);
      } else if (!p.staff && p.email) {
        emails.push(p.email);
      }
    }
    return { emails, staffIds };
  };

  const toSet = input.forceTo?.length
    ? [...new Set(input.forceTo.filter((e) => e && isEmail(e)))]
    : [...new Set((await collect(input.to)).emails)];
  const ccSet = [...new Set((await collect(input.cc ?? [])).emails)].filter((e) => !toSet.includes(e));
  for (const e of input.extraTo ?? []) if (!toSet.includes(e) && isEmail(e)) ccSet.push(e);

  if (toSet.length || ccSet.length) {
    const result = await sendMail(
      { to: toSet, cc: ccSet, subject: input.subject, html: wrapEmail(input.subject, input.bodyHtml, settings) },
      settings,
    );
    await repo.emailLogAdd({
      job_id: null, ticket_id: input.ticket.id,
      to_addr: toSet.join(","), cc_addr: ccSet.join(",") || null,
      provider: result.provider, provider_msg_id: result.msgId,
      subject: input.subject, body_html: input.bodyHtml,
      status: result.error ? "failed" : result.provider === "log" ? "logged" : "sent",
      error: result.error ?? null,
    });
  }

  if (input.notifyTo?.length && input.notifyMessage) {
    const { staffIds } = await collect(input.notifyTo);
    for (const sid of new Set(staffIds)) {
      await repo.notifyAdd({ staff_id: sid, ticket_id: input.ticket.id, message: input.notifyMessage });
    }
  }
}

const esc = escapeHtml;
const EST_TEXT = (t: Ticket) =>
  t.est_days || t.est_hours
    ? `<p style="margin:8px 0;color:#475569">⏱️ التقدير: ${t.est_days ? `${t.est_days} يوم ` : ""}${t.est_hours ? `${t.est_hours} ساعة` : ""}</p>`
    : "";
const TRACK_ROW = (t: Ticket, s: Settings) =>
  `<p style="margin:14px 0 0"><a href="${s.base_url}/track?code=${t.code}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">تتبع حالة الطلب ↗</a></p>`;

// بريد تكليف التيستر يمر عبر قاعدة أتمتة «تكليف التيستر» + قالب «تكليف التيستر بطلب» —
// أزرار القبول/الرفض الموقعة يُلحقها العامل تلقائياً عندما يكون قرار التيستر pending
async function fireTesterAssignedEvent(ticket: Ticket, actorLabel: string, actorStaffId: string | null = null) {
  const repo = await getRepo();
  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "ticket.assigned", actor_label: actorLabel,
    old_values: null, new_values: { tester: ticket.tester_name },
  });
  await emit({
    id: evt.id, type: "tester.assigned",
    ctx: { ticket, old: null, actor_label: actorLabel, actor_staff_id: actorStaffId },
  });
}

// ═══ إنشاء طلب ═══
export async function createTicketOp(input: {
  client_id?: string | null;
  client_name: string; client_contact: string | null; title?: string | null; details: string;
  request_type?: RequestType; ticket_kind?: TicketKind; priority?: TicketPriority;
  linked_ticket_id?: string | null; urgent_reason?: string | null; affected_service?: string | null;
  developer_id?: string | null;
  tester_id?: string | null;
  is_urgent?: boolean;
  creator_id?: string | null; // مدخّل البيانات المختار من القائمة
  actor: { staff_id: string | null; label: string };
  source: Ticket["source"];
  custom_data?: Record<string, string>; // قيم الحقول المخصصة من منشئ الحقول
}): Promise<Ticket> {
  const repo = await getRepo();

  // العميل من قائمة الاختيار له أولوية على النص الحر
  let clientName = input.client_name;
  let contact = input.client_contact;
  if (input.client_id) {
    const c = (await repo.clientsList()).find((x) => x.id === input.client_id);
    if (c) { clientName = c.name; contact = c.contact_email ?? contact; }
  }

  // مدخّل البيانات المختار
  let creatorId = input.actor.staff_id;
  let creatorLabel = input.actor.label;
  if (input.creator_id) {
    const s = await repo.staffGet(input.creator_id);
    if (s) { creatorId = s.id; creatorLabel = s.name; }
  }

  let developer_name: string | null = null;
  if (input.developer_id) {
    const dev = await repo.staffGet(input.developer_id);
    developer_name = dev?.name ?? null;
  }
  let tester_name: string | null = null;
  if (input.tester_id) {
    const ts = await repo.staffGet(input.tester_id);
    tester_name = ts?.name ?? null;
  }
  const urgent = input.ticket_kind === "instant_support" || !!input.is_urgent;

  // حماية من التكرار: نفس المدخل + نفس العنوان/التفاصيل خلال دقيقتين = ضغطة زر مكررة، نعيد الطلب الموجود بدل إنشاء نسخة
  const recent = await repo.ticketList({ created_by: creatorId ?? undefined, page: 1, pageSize: 5 });
  const dupCutoff = Date.now() - 2 * 60000;
  const dup = recent.rows.find((r) =>
    Date.parse(r.created_at) >= dupCutoff &&
    r.client_name === clientName &&
    (r.title ?? "") === (input.title?.trim() || "") &&
    r.details === input.details,
  );
  if (dup) return dup;
  const ticket = await repo.ticketCreate({
    client_name: clientName, client_contact: contact || null,
    title: input.title?.trim() || null,
    details: input.details,
    request_type: input.request_type ?? "issue",
    ticket_kind: urgent ? "instant_support" : (input.ticket_kind ?? "standard"),
    priority: input.priority ?? (urgent ? "critical" : "normal"),
    linked_ticket_id: input.linked_ticket_id ?? null,
    urgent_reason: input.urgent_reason ?? null,
    affected_service: input.affected_service ?? null,
    created_by: creatorId, created_by_name: creatorLabel,
    developer_id: input.developer_id || null, developer_name, source: input.source,
    code: genTicketCode(),
    custom_data: input.custom_data ?? {},
    tester_id: input.tester_id ?? null, tester_name,
    is_urgent: urgent,
  });

  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "ticket.created",
    actor_staff_id: input.actor.staff_id, actor_label: input.actor.label,
    old_values: null, new_values: { code: ticket.code, title: ticket.title, request_type: ticket.request_type, ticket_kind: ticket.ticket_kind },
  });
  if (input.tester_id) {
    await repo.assignmentCreate({ ticket_id: ticket.id, assignment_role: "tester", staff_id: input.tester_id, assigned_by: input.actor.staff_id });
  }

  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "ticket.created", actor_label: input.actor.label,
    old_values: null, new_values: { client_name: ticket.client_name, source: ticket.source, urgent: urgent },
  });
  await emit({ id: evt.id, type: "ticket.created", ctx: { ticket, old: null, actor_label: input.actor.label } });

  if (input.tester_id && tester_name) {
    await fireTesterAssignedEvent(ticket, input.actor.label, input.actor.staff_id);
  }
  if (input.developer_id) {
    await assignDeveloperOp(ticket.id, input.developer_id, input.actor.label, undefined, input.actor.staff_id);
  }
  return (await repo.ticketById(ticket.id)) ?? ticket;
}

// ═══ إسناد الاختبار (التيست أولاً — قبل المطور دائماً) ═══
export async function assignTesterOp(
  ticketId: string, testerId: string, actorLabel: string,
  est?: { days?: number | null; hours?: number | null }, assignedBy: string | null = null,
): Promise<Ticket | null> {
  const repo = await getRepo();
  const old = await repo.ticketById(ticketId);
  if (!old) return null;
  if (old.dev_status === "rejected") return old; // مرفوض نهائياً — مجمّد حتى يعيد صاحبه إرساله
  const ts = await repo.staffGet(testerId);
  if (!ts || ts.role !== "tester") return old;
  const patch: Partial<Ticket> = {
    tester_id: testerId,
    tester_name: ts.name,
    tester_assignment_status: "pending",
    overall_status: "awaiting_tester",
    updated_at: nowIso(),
  };
  // التقدير المدخل مع إسناد التيست = تقدير التيست — والإجمالي يُجمع تلقائياً
  if (est?.days != null) patch.test_est_days = est.days;
  if (est?.hours != null) patch.test_est_hours = est.hours;
  if (est?.days != null || est?.hours != null) {
    const totals = sumEstimation({ ...old, ...patch });
    patch.est_days = totals.est_days;
    patch.est_hours = totals.est_hours;
  }
  const ticket = await repo.ticketUpdate(ticketId, patch);
  if (!ticket) return null;
  await repo.assignmentCreate({ ticket_id: ticket.id, assignment_role: "tester", staff_id: testerId, assigned_by: assignedBy });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "tester.assigned",
    actor_staff_id: assignedBy, actor_label: actorLabel,
    old_values: { tester_id: old.tester_id, tester_name: old.tester_name },
    new_values: { tester_id: testerId, tester_name: ts.name, status: "pending" },
  });
  // إعادة إسناد؟ أبلغ المكلَّف السابق أن تكليفه سُحب (قاعدة أتمتة قابلة للتحكم)
  if (old.tester_id && old.tester_id !== testerId) {
    await fireAssignmentRevoked(ticket, "tester", old.tester_id, old.tester_name, ts.name, actorLabel, assignedBy);
  }
  await fireTesterAssignedEvent(ticket, actorLabel, assignedBy);
  return ticket;
}

// ═══ سحب التكليف عند إعادة الإسناد — يمر عبر قاعدة «سحب التكليف» ═══
async function fireAssignmentRevoked(
  ticket: Ticket, role: "tester" | "developer",
  previousId: string, previousName: string | null | undefined,
  newName: string, actorLabel: string, actorStaffId: string | null,
) {
  const repo = await getRepo();
  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `↩️ سُحب تكليف ${role === "tester" ? "الاختبار" : "التطوير"} من ${previousName ?? "—"} وأُسند إلى ${newName}` },
  });
  await emit({
    id: evt.id, type: "assignment.revoked",
    ctx: {
      ticket, old: null, actor_label: actorLabel, actor_staff_id: actorStaffId,
      vars: {
        previous_assignee: previousName ?? "—",
        previous_assignee_id: previousId,
        new_assignee: newName,
        assignment_role_label: role === "tester" ? "مسؤول الاختبار" : "المطور",
        actor_name: actorLabel.split(" (")[0],
      },
    },
  });
}

// ═══ التقدير المنفصل: الديف يضع تقديره والتيست يضع تقديره — والإجمالي يُجمع تلقائياً ═══
// est_days/est_hours الإجمالية هي المعروضة في الطلب والاستعلام والإيميلات
function sumEstimation(t: Pick<Ticket, "dev_est_days" | "dev_est_hours" | "test_est_days" | "test_est_hours" | "est_days" | "est_hours">): { est_days: number | null; est_hours: number | null } {
  const hasSplit = t.dev_est_days != null || t.dev_est_hours != null || t.test_est_days != null || t.test_est_hours != null;
  if (!hasSplit) return { est_days: t.est_days ?? null, est_hours: t.est_hours ?? null }; // توافق خلفي مع التذاكر القديمة
  let days = (t.dev_est_days ?? 0) + (t.test_est_days ?? 0);
  let hours = (t.dev_est_hours ?? 0) + (t.test_est_hours ?? 0);
  // كل 8 ساعات عمل = يوم — حتى لا يظهر «12 ساعة» بدل «يوم و4 ساعات»
  if (hours >= 8) { days += Math.floor(hours / 8); hours = hours % 8; }
  return { est_days: days || null, est_hours: hours || null };
}

export async function setEstimationOp(
  ticketId: string,
  est: {
    // توافق خلفي: التقدير العام القديم (يُحفظ في الإجمالي مباشرة إن لم يوجد تقسيم)
    days?: number | null; hours?: number | null;
    dev?: { days?: number | null; hours?: number | null };
    test?: { days?: number | null; hours?: number | null };
  },
): Promise<Ticket | null> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return null;
  const patch: Partial<Ticket> = { updated_at: nowIso() };
  if (est.dev) {
    if (est.dev.days != null) patch.dev_est_days = est.dev.days;
    if (est.dev.hours != null) patch.dev_est_hours = est.dev.hours;
  }
  if (est.test) {
    if (est.test.days != null) patch.test_est_days = est.test.days;
    if (est.test.hours != null) patch.test_est_hours = est.test.hours;
  }
  if (!est.dev && !est.test) {
    // النمط القديم — تقدير عام واحد
    patch.est_days = est.days ?? t.est_days ?? null;
    patch.est_hours = est.hours ?? t.est_hours ?? null;
    return repo.ticketUpdate(ticketId, patch);
  }
  // الإجمالي الموحّد: تقديرات المتخصصين + الديف المباشر + التيست (كل 8 ساعات = يوم)
  await repo.ticketUpdate(ticketId, patch);
  const specialists = await repo.specialistList(ticketId);
  const after = (await repo.ticketById(ticketId))!;
  let days = (after.dev_est_days ?? 0) + (after.test_est_days ?? 0);
  let hours = (after.dev_est_hours ?? 0) + (after.test_est_hours ?? 0);
  for (const sp of specialists.filter((x) => x.status !== "declined")) {
    days += sp.est_days ?? 0;
    hours += sp.est_hours ?? 0;
  }
  if (hours >= 8) { days += Math.floor(hours / 8); hours = hours % 8; }
  return repo.ticketUpdate(ticketId, { est_days: days || null, est_hours: hours || null, updated_at: nowIso() });
}

// ═══ إسناد المطور (لا يتم إلا بعد التيست — القيد مفروض في الأكشن) ═══
export async function assignDeveloperOp(
  ticketId: string, developerId: string, actorLabel: string,
  est?: { days?: number | null; hours?: number | null }, assignedBy: string | null = null,
): Promise<Ticket | null> {
  const repo = await getRepo();
  const old = await repo.ticketById(ticketId);
  if (!old) return null;
  if (old.dev_status === "rejected") return old; // مرفوض نهائياً — لا إسناد
  const dev = await repo.staffGet(developerId);
  const patch: Partial<Ticket> = {
    developer_id: developerId,
    developer_name: dev?.name ?? null,
    developer_assignment_status: "pending",
    overall_status: "awaiting_developer",
    updated_at: nowIso(),
  };
  // الطلب العادي: إسناد الديف = «تم التسليم للديف» — الديف نفسه يبدأ «قيد التطوير» عندما يشتغل فعلاً
  if (!old.is_urgent && ["new", "needs_info"].includes(old.dev_status)) {
    patch.dev_status = "handed_to_dev";
    patch.last_status_change = nowIso();
  }
  // التقدير المدخل مع إسناد المطور = تقدير الديف — والإجمالي يُجمع تلقائياً
  if (est?.days != null) patch.dev_est_days = est.days;
  if (est?.hours != null) patch.dev_est_hours = est.hours;
  if (est?.days != null || est?.hours != null) {
    const totals = sumEstimation({ ...old, ...patch });
    patch.est_days = totals.est_days;
    patch.est_hours = totals.est_hours;
  }
  const ticket = await repo.ticketUpdate(ticketId, patch);
  if (!ticket) return null;
  await repo.assignmentCreate({ ticket_id: ticket.id, assignment_role: "developer", staff_id: developerId, assigned_by: assignedBy });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "developer.assigned",
    actor_staff_id: assignedBy, actor_label: actorLabel,
    old_values: { developer_id: old.developer_id, developer_name: old.developer_name },
    new_values: { developer_id: developerId, developer_name: dev?.name ?? null, status: "pending" },
  });
  // إعادة إسناد؟ أبلغ المطور السابق أن تكليفه سُحب
  if (old.developer_id && old.developer_id !== developerId) {
    await fireAssignmentRevoked(ticket, "developer", old.developer_id, old.developer_name, dev?.name ?? "—", actorLabel, assignedBy);
  }
  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "ticket.assigned", actor_label: actorLabel,
    old_values: { developer: old.developer_name }, new_values: { developer: dev?.name },
  });
  await emit({ id: evt.id, type: "ticket.assigned", ctx: { ticket, old, actor_label: actorLabel } });
  return ticket;
}

// ═══ قبول/رفض التكليف — قرار مستقل للتيستر والمطور ═══
export async function respondToAssignmentOp(
  ticketId: string,
  actor: { staff_id: string; name: string; role: Role },
  decision: "accepted" | "declined",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const ticket = await repo.ticketById(ticketId);
  if (!ticket) return { ok: false, error: "الطلب غير موجود" };
  const assignmentRole = actor.role === "tester" ? "tester" : actor.role === "developer" ? "developer" : null;
  if (!assignmentRole) return { ok: false, error: "هذا الإجراء متاح للتيستر والمطور فقط" };
  const assignedId = assignmentRole === "tester" ? ticket.tester_id : ticket.developer_id;
  if (assignedId !== actor.staff_id) return { ok: false, error: "هذا التكليف غير مسند إليك" };
  // بعد الإقفال الرسمي أو إنهاء جزئك لا يوجد قرار تكليف — يمنع «رفض» متأخر من رابط الإيميل القديم
  if (ticket.urgent_ended_at) return { ok: false, error: "هذا الدعم الفوري انتهى وأُقفل — لا يمكن قبول أو رفض التكليف بعد الإقفال" };
  const myStatus = assignmentRole === "tester" ? ticket.tester_assignment_status : ticket.developer_assignment_status;
  if (myStatus === "completed") return { ok: false, error: "لقد أنهيت عملك على هذا الطلب بالفعل — لا يمكن رفض التكليف بعد الإنهاء" };
  if (myStatus === "accepted" && decision === "accepted") return { ok: false, error: "قبلت هذا التكليف بالفعل" };
  if (decision === "declined" && (!reason || reason.trim().length < 3)) {
    return { ok: false, error: "سبب رفض التكليف إجباري" };
  }

  let assignment = await repo.assignmentCurrent(ticket.id, assignmentRole);
  if (!assignment) {
    assignment = await repo.assignmentCreate({
      ticket_id: ticket.id, assignment_role: assignmentRole, staff_id: actor.staff_id, assigned_by: null,
    });
  }
  await repo.assignmentRespond(assignment.id, decision, reason?.trim() || null);

  const actorLabel = `${actor.name} (${ROLE_LABELS[actor.role]})`;
  const accepted = decision === "accepted";
  const patch: Partial<Ticket> = assignmentRole === "tester"
    ? {
        tester_assignment_status: decision,
        ...(accepted ? { overall_status: "awaiting_developer" as const } : { tester_id: null, tester_name: null, overall_status: "awaiting_tester" as const }),
        updated_at: nowIso(),
      }
    : {
        developer_assignment_status: decision,
        // قبول الديف ≠ بدء الشغل: الحالة لا تتحول لـ«قيد التطوير» إلا عندما يبدأ هو فعلياً
        // (الدعم الفوري فقط يبدأ فور القبول لأنه عاجل بطبيعته)
        ...(accepted
          ? (ticket.is_urgent
              ? { overall_status: "in_development" as const, dev_status: "in_progress" as const, last_status_change: nowIso() }
              : { overall_status: "in_development" as const })
          : { developer_id: null, developer_name: null, overall_status: "awaiting_developer" as const }),
        updated_at: nowIso(),
      };
  // الدعم الفوري «طلب جانبي»: القبول يبدأ عدّاد الدعم فعلياً
  if (accepted && ticket.is_urgent && !ticket.urgent_started_at) patch.urgent_started_at = nowIso();
  const updated = await repo.ticketUpdate(ticket.id, patch);
  if (!updated) return { ok: false, error: "تعذر تحديث الطلب" };

  const action = `${assignmentRole}.${decision}`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action,
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { assignment_status: assignment.status, assignee: actor.staff_id },
    new_values: { assignment_status: decision, reason: reason?.trim() || null },
  });
  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "note.added", actor_label: actorLabel, old_values: null,
    new_values: { note: `${accepted ? "✅ وافق على" : "❌ رفض"} تكليف ${assignmentRole === "tester" ? "الاختبار" : "التطوير"}${reason ? ` — السبب: ${reason.trim()}` : ""}` },
  });

  // الإيميل يمر عبر قاعدة الأتمتة المخصصة للحدث — تتحكم في مستلميها من صفحة الأتمتة
  await emit({
    id: evt.id, type: `${assignmentRole}.${decision}` as "tester.accepted",
    ctx: {
      ticket: updated, old: ticket, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: { actor_name: actor.name, actor_role: ROLE_LABELS[actor.role], reason: reason?.trim() ?? "" },
    },
  });
  return { ok: true };
}

// ═══ الاعتذار عن الدعم الفوري بعد القبول — بسبب إجباري ═══
export async function declineAssignmentOp(
  ticketId: string,
  actor: { staff_id: string; name: string; role: Role },
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  if (!t.is_urgent) return { ok: false, error: "الاعتذار متاح لطلبات الدعم الفوري فقط" };
  if (t.urgent_ended_at) return { ok: false, error: "هذا الدعم الفوري انتهى وأُقفل — لا اعتذار بعد الإقفال" };
  const actorLabel = `${actor.name} (${ROLE_LABELS[actor.role]})`;

  const isTester = actor.role === "tester" && t.tester_id === actor.staff_id;
  const isDev = actor.role === "developer" && t.developer_id === actor.staff_id;
  if (!isTester && !isDev) return { ok: false, error: "المهمة غير مسندة إليك حالياً" };
  const myStatus = isTester ? t.tester_assignment_status : t.developer_assignment_status;
  if (myStatus === "completed") return { ok: false, error: "لقد أنهيت عملك على هذا الطلب — لا اعتذار بعد الإنهاء" };
  const currentAssignment = await repo.assignmentCurrent(ticketId, isTester ? "tester" : "developer");
  if (currentAssignment) await repo.assignmentRespond(currentAssignment.id, "declined", reason);

  const patch: Partial<Ticket> = isTester
    ? { tester_id: null, tester_name: null, tester_assignment_status: "declined", overall_status: "awaiting_tester", updated_at: nowIso() }
    : { developer_id: null, developer_name: null, developer_assignment_status: "declined", overall_status: "awaiting_developer", updated_at: nowIso() };
  const updated = await repo.ticketUpdate(ticketId, patch);
  if (!updated) return { ok: false, error: "تعذر التحديث" };

  const evt = await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null, new_values: { note: `🙅 اعتذر عن الدعم الفوري — السبب: ${reason}` },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: `${isTester ? "tester" : "developer"}.urgent_withdrawal`,
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { tester_id: t.tester_id, developer_id: t.developer_id },
    new_values: { reason, tester_id: updated.tester_id, developer_id: updated.developer_id },
  });

  // الإيميل يمر عبر قاعدة «اعتذار عن الدعم الفوري» — مستلموها بيدك من صفحة الأتمتة
  await emit({
    id: evt.id, type: "urgent.withdrawal",
    ctx: {
      ticket: updated, old: t, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: { actor_name: actor.name, actor_role: ROLE_LABELS[actor.role], reason },
    },
  });
  return { ok: true };
}

// ═══ الدعم الفوري «طلب جانبي»: تحديث الموقف — مازلت أعمل / انتهيت فينتهي الدعم ═══
export async function updateUrgentProgressOp(
  ticketId: string,
  actor: { staff_id: string; name: string; role: Role },
  progress: "still_working" | "done",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  if (!t.is_urgent) return { ok: false, error: "تحديث الموقف متاح لطلبات الدعم الفوري فقط" };
  if (t.urgent_ended_at) return { ok: false, error: "هذا الدعم الفوري انتهى بالفعل — لا يمكن تحديث موقفه" };

  const isTester = actor.role === "tester" && t.tester_id === actor.staff_id;
  const isDev = actor.role === "developer" && t.developer_id === actor.staff_id;
  const isAdmin = actor.role === "admin";
  if (!isTester && !isDev && !isAdmin) return { ok: false, error: "هذه النقطة غير مسندة إليك حالياً" };
  // من أنهى جزءه لا يحدّث موقفه مرة أخرى — لا تكرار للإنهاء ولا رجوع بعده
  const myStatus = isTester ? t.tester_assignment_status : isDev ? t.developer_assignment_status : null;
  if (myStatus === "completed") return { ok: false, error: "أنهيت جزءك بالفعل — الإقفال الرسمي بانتظار باقي المكلفين" };

  const actorLabel = `${actor.name} (${ROLE_LABELS[actor.role]})`;
  const done = progress === "done";
  if (done && (!note || note.trim().length < 3)) {
    return { ok: false, error: "اكتب باختصار نتيجة الدعم قبل الإنهاء — تُرسل بالإيميل وتُحفظ في السجل" };
  }

  const now = nowIso();
  const startedAt = t.urgent_started_at ?? t.created_at;
  const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(startedAt)) / 60000));

  // ═══ قاعدة الإغلاق الرسمي ═══
  // الطلب لا يُقفل إلا لما «كل المكلَّفين الحاليين» ينهوا:
  //  - تيست + ديف موجودان → لازم الاثنان يعلنان الانتهاء
  //  - تيست فقط (لا ديف) → إنهاء التيست يقفل الطلب
  //  - ديف فقط (لا تيست) → إنهاء الديف يقفل الطلب
  //  - الأدمن → إغلاق إداري فوري للطرفين معاً
  const adminClose = isAdmin && !isTester && !isDev;
  let updated: Ticket;
  let fullyClosed = false;
  if (done) {
    const patch: Partial<Ticket> = { urgent_started_at: t.urgent_started_at ?? startedAt, updated_at: now };
    if ((isTester || adminClose) && t.tester_id) patch.tester_assignment_status = "completed";
    if ((isDev || adminClose) && t.developer_id) patch.developer_assignment_status = "completed";
    const testerDone = !t.tester_id || (patch.tester_assignment_status ?? t.tester_assignment_status) === "completed";
    const devDone = !t.developer_id || (patch.developer_assignment_status ?? t.developer_assignment_status) === "completed";
    fullyClosed = testerDone && devDone;
    if (fullyClosed) {
      patch.urgent_ended_at = now;
      patch.urgent_result = note!.trim();
      patch.actual_minutes = minutes;
      patch.overall_status = "closed";
      patch.dev_status = "closed";
      patch.last_status_change = now;
    }
    const u = await repo.ticketUpdate(ticketId, patch);
    if (!u) return { ok: false, error: "تعذر تسجيل الإنهاء" };
    updated = u;
    if ((isTester || adminClose) && t.tester_id) await repo.assignmentComplete(ticketId, "tester");
    if ((isDev || adminClose) && t.developer_id) await repo.assignmentComplete(ticketId, "developer");
  } else {
    // «مازلت في الطلب»: يثبت بداية العمل إن لم تكن مسجلة ويحدّث آخر نشاط
    const u = await repo.ticketUpdate(ticketId, {
      urgent_started_at: t.urgent_started_at ?? now,
      overall_status: "in_development",
      dev_status: t.dev_status === "new" ? "in_progress" : t.dev_status,
      updated_at: now,
    });
    if (!u) return { ok: false, error: "تعذر تحديث الموقف" };
    updated = u;
  }

  const waitingFor = done && !fullyClosed
    ? (updated.tester_assignment_status !== "completed" && updated.tester_id ? "التيست" : "الديف")
    : null;
  const progressText = done
    ? fullyClosed
      ? "✅ انتهيت — انتهى الدعم الفوري لهذه النقطة وأُقفل الطلب رسمياً"
      : `✅ أنهى ${isTester ? "التيست" : "الديف"} جزءه — الطلب لا يُقفل رسمياً إلا بعد إنهاء ${waitingFor}`
    : "🔄 مازلت أعمل على هذه النقطة";
  const evt = await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `${progressText}${note?.trim() ? ` — ${note.trim()}` : ""}${done ? ` (المدة الفعلية: ${minutes} دقيقة تقريباً)` : ""}` },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: done ? (fullyClosed ? "urgent.completed" : `urgent.${isTester ? "tester" : "developer"}_done`) : "urgent.still_working",
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { dev_status: t.dev_status, urgent_started_at: t.urgent_started_at, urgent_ended_at: t.urgent_ended_at },
    new_values: { progress, fully_closed: fullyClosed, note: note?.trim() || null, ...(done && fullyClosed ? { actual_minutes: minutes } : {}) },
  });

  // بريد الموقف يمر عبر قاعدة «موقف الدعم الفوري» — مستلموها وقالبها بيدك من صفحة الأتمتة
  await emit({
    id: evt.id, type: "urgent.progress",
    ctx: {
      ticket: updated, old: t, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: {
        actor_name: actor.name,
        actor_role: ROLE_LABELS[actor.role],
        progress_label: done
          ? (fullyClosed ? "انتهى الدعم الفوري وأُقفل الطلب ✅" : `أنهى ${isTester ? "التيست" : "الديف"} جزءه — بانتظار ${waitingFor} للإقفال الرسمي ⏳`)
          : "مازال العمل جارياً 🔄",
        note: note?.trim() ?? "",
        duration_minutes: done && fullyClosed ? String(minutes) : "",
      },
    },
  });
  return { ok: true };
}

// ═══ تغيير الحالة ═══
export async function changeStatusOp(
  ticketId: string,
  newStatus: DevStatus,
  actorLabel: string,
  note?: string,
): Promise<Ticket | null> {
  const repo = await getRepo();
  const old = await repo.ticketById(ticketId);
  if (!old || old.dev_status === newStatus) return old;
  const statusPatch: Partial<Ticket> = {
    dev_status: newStatus, last_status_change: nowIso(), updated_at: nowIso(),
  };
  // عدّادات التقدير: «قيد التطوير» تبدأ عدّاد الديف — «جاري الاختبار» تبدأ عدّاد التيست
  // إعادة الدخول للحالة (مثلاً بعد فشل الاختبار) تعيد ضبط العدّاد والتذكيرات الخاصة به
  const reminders = { ...(old.reminders_sent ?? {}) };
  if (newStatus === "in_progress") {
    statusPatch.dev_started_at = nowIso();
    for (const k of Object.keys(reminders)) if (k.startsWith("dev.")) delete reminders[k];
    statusPatch.reminders_sent = reminders;
  }
  if (newStatus === "testing") {
    statusPatch.test_started_at = nowIso();
    for (const k of Object.keys(reminders)) if (k.startsWith("test.")) delete reminders[k];
    statusPatch.reminders_sent = reminders;
  }
  const ticket = await repo.ticketUpdate(ticketId, statusPatch);
  if (!ticket) return null;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "status.changed", actor_label: actorLabel,
    old_values: { dev_status: old.dev_status, overall_status: old.overall_status },
    new_values: { dev_status: newStatus, note: note?.trim() || null },
  });
  const evt = await repo.eventAdd({
    ticket_id: ticket.id, type: "field.changed", actor_label: actorLabel,
    old_values: { dev_status: old.dev_status }, new_values: { dev_status: newStatus },
  });
  await emit({
    id: evt.id, type: "field.changed", changedField: "dev_status",
    ctx: { ticket, old, actor_label: actorLabel, ...(note ? { note } : {}) },
  });
  if (note?.trim()) {
    await repo.eventAdd({
      ticket_id: ticket.id, type: "note.added", actor_label: actorLabel,
      old_values: null, new_values: { note },
    });
  }

  // الحالات المخصوصة تمر عبر قواعد أتمتة مستقلة — مستلمو كل إيميل بيدك من صفحة الأتمتة
  // (قاعدة «تغير حالة التطوير» العامة تتخطى هذه الحالات منعاً للتكرار)
  const specialVars = {
    actor_name: actorLabel.split(" (")[0],
    actor_role: actorLabel.includes("(") ? actorLabel.split(" (")[1].replace(")", "") : "",
    reason: note?.trim() ?? "",
  };
  if (newStatus === "rejected") {
    await emit({
      id: evt.id, type: "ticket.rejected",
      ctx: { ticket, old, actor_label: actorLabel, vars: specialVars },
    });
  }
  if (newStatus === "test_failed") {
    // فشل الاختبار يعيد فتح الدورة تلقائياً: كل متخصص «جاهز» يعود «يعمل» بعدّاد جديد من الآن —
    // بدون هذا كانوا يظلون «جاهز» بلا أي زر، والتذكرة تتجمد على «فشل الاختبار» للأبد
    if (!ticket.is_urgent) {
      const specs = (await repo.specialistList(ticket.id)).filter((x) => x.is_current && x.status === "ready");
      for (const sp of specs) {
        await repo.specialistUpdate(sp.id, {
          status: "accepted", ready_at: null,
          started_at: nowIso(), // عدّاد الإصلاح يبدأ فوراً — الفشل معناه «ارجع اشتغل الآن»
          reminders_sent: null, // تذكيرات التقدير تبدأ من جديد لجولة الإصلاح
        });
      }
      if (specs.length) {
        await repo.eventAdd({
          ticket_id: ticket.id, type: "note.added", actor_label: "النظام",
          old_values: null,
          new_values: { note: `🔁 فشل الاختبار أعاد فتح جولة تطوير جديدة — عاد للعمل: ${specs.map((s) => `${s.staff_name} (${s.spec_label})`).join("، ")} — كلٌ يسلّم «جزئي جاهز» مجدداً وعندها تعود تلقائياً «جاهز للاختبار»` },
        });
      }
    }
    await emit({
      id: evt.id, type: "test.failed",
      ctx: { ticket, old, actor_label: actorLabel, vars: specialVars },
    });
  }
  if (newStatus === "fixed" || newStatus === "closed") {
    await emit({
      id: evt.id, type: "ticket.delivered",
      ctx: { ticket, old, actor_label: actorLabel, ...(note ? { note } : {}), vars: specialVars },
    });
  }
  return ticket;
}

// ═══ ملاحظات/ردود الطلب — تمر عبر قاعدة «ملاحظة/رد جديد» وتُستثنى كاتبها تلقائياً ═══
export async function addNoteOp(
  ticketId: string, note: string, actorLabel: string,
  actorRole?: Role, actorStaffId?: string | null,
) {
  const repo = await getRepo();
  const evt = await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null, new_values: { note },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: "note.added",
    actor_staff_id: actorStaffId ?? null, actor_label: actorLabel,
    old_values: null, new_values: { note },
  });
  // الملاحظة تعديل فعلي على التذكرة — ترفعها لأعلى ترتيب «الأحدث تعديلاً»
  const t = await repo.ticketUpdate(ticketId, { updated_at: nowIso() });
  if (!t) return;

  const isStatus = actorRole === "developer" ? "ملاحظات الديف" : actorRole === "tester" ? "ملاحظات التيست" : "ملاحظة";
  await emit({
    id: evt.id, type: "note.added",
    ctx: {
      ticket: t, old: null, actor_label: actorLabel, actor_staff_id: actorStaffId ?? null,
      note,
      vars: { actor_name: actorLabel.split(" (")[0], note_kind: isStatus },
    } as AutomationContext & { note: string },
  });
}

// ═══════════ المتخصصون (باك/فرونت/UX) — كل تخصص له شخص وتقدير وحالة مستقلة ═══════════
// القاعدة: التاسك لا تتحول «جاهز للاختبار» إلا بعد ما كل المتخصصين الحاليين يعلنون الجاهزية

async function specialistVars(sp: { spec_label: string; staff_name: string }, extra?: Record<string, string>) {
  return { spec_label: sp.spec_label, specialist_name: sp.staff_name, ...(extra ?? {}) };
}

// إجمالي تقدير التذكرة = مجموع تقديرات المتخصصين + تقدير الديف الرئيسي + تقدير التيست
async function recalcTicketEstimation(ticketId: string): Promise<void> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return;
  const specialists = await repo.specialistList(ticketId);
  let days = (t.dev_est_days ?? 0) + (t.test_est_days ?? 0);
  let hours = (t.dev_est_hours ?? 0) + (t.test_est_hours ?? 0);
  for (const sp of specialists.filter((x) => x.status !== "declined")) {
    days += sp.est_days ?? 0;
    hours += sp.est_hours ?? 0;
  }
  if (hours >= 8) { days += Math.floor(hours / 8); hours = hours % 8; }
  await repo.ticketUpdate(ticketId, { est_days: days || null, est_hours: hours || null, updated_at: nowIso() });
}

// إسناد متخصص لتخصص معيّن — إعادة الإسناد تسحب الحالي وتبلغه
export async function assignSpecialistOp(
  ticketId: string, specKey: string, staffId: string,
  est: { days?: number | null; hours?: number | null },
  actorLabel: string, assignedBy: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  if (t.is_urgent) return { ok: false, error: "الدعم الفوري لا يستخدم التخصصات — تيست وديف مباشرة" };
  if (t.dev_status === "rejected") return { ok: false, error: "الطلب مرفوض نهائياً — لا إسناد عليه حتى يعيد مدخل البيانات إرساله" };
  const settings = await repo.settingsGet();
  const spec = settings.dev_specializations.find((x) => x.key === specKey && x.active);
  if (!spec) return { ok: false, error: "التخصص غير موجود أو موقوف" };
  const staff = await repo.staffGet(staffId);
  if (!staff || !staff.active || staff.role !== "developer") return { ok: false, error: "اختر مطوراً نشطاً" };

  // القاعدة الذهبية موحّدة: لا إسناد تطوير قبل استلام التيست وتحويله «تم التسليم للديف»
  const existingSpecs = await repo.specialistList(ticketId);
  // توافق خلفي: تذكرة عليها متخصصون بالفعل (أُسندوا قبل تفعيل القاعدة) يستمر العمل عليها
  const beforeHandoff = existingSpecs.length === 0 && ["new", "needs_info"].includes(t.dev_status);
  if (beforeHandoff) {
    return { ok: false, error: "التيست يستلم الطلب أولاً ويحوّله «تم التسليم للديف» — بعدها أسند المتخصصين" };
  }

  // يُسمح بأكثر من شخص لنفس التخصص (باك×2 مثلاً) — لكن لا يُكرر نفس الشخص في نفس التخصص
  const existing = existingSpecs.filter((x) => x.spec_key === specKey && x.status !== "declined");
  if (existing.some((x) => x.staff_id === staffId)) {
    return { ok: false, error: `${staff.name} مسند بالفعل على تخصص «${spec.label}» في هذا الطلب` };
  }

  const sp = await repo.specialistAdd({
    ticket_id: ticketId, spec_key: spec.key, spec_label: spec.label,
    staff_id: staff.id, staff_name: staff.name,
    est_days: est.days ?? null, est_hours: est.hours ?? null, assigned_by: assignedBy,
  });
  await recalcTicketEstimation(ticketId);
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: "specialist.assigned",
    actor_staff_id: assignedBy, actor_label: actorLabel,
    old_values: null,
    new_values: { spec: spec.key, spec_label: spec.label, staff_id: staff.id, staff_name: staff.name, team_size: existing.length + 1 },
  });
  const evt = await repo.eventAdd({
    ticket_id: ticketId, type: "ticket.assigned", actor_label: actorLabel,
    old_values: null, new_values: { specialist: `${spec.label}: ${staff.name}` },
  });
  await emit({
    id: evt.id, type: "spec.assigned",
    ctx: {
      ticket: t, old: null, actor_label: actorLabel, actor_staff_id: assignedBy,
      vars: await specialistVars(sp, { specialist_id: staff.id }),
    },
  });
  return { ok: true };
}

// إزالة متخصص من الطلب — تُبلغه عبر قاعدة «سحب التكليف» ويعاد حساب الإجمالي
export async function removeSpecialistOp(
  specialistId: string, actorLabel: string, actorStaffId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const sp = await repo.specialistGet(specialistId);
  if (!sp || !sp.is_current) return { ok: false, error: "التكليف غير موجود أو أُزيل بالفعل" };
  const t = await repo.ticketById(sp.ticket_id);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  if (sp.status === "ready") return { ok: false, error: "أعلن جاهزيته بالفعل — لا معنى لإزالته بعد إنهاء جزئه" };

  await repo.specialistRemove(sp.id);
  await recalcTicketEstimation(sp.ticket_id);
  await repo.auditAdd({
    entity_type: "ticket", entity_id: sp.ticket_id, action: "specialist.removed",
    actor_staff_id: actorStaffId, actor_label: actorLabel,
    old_values: { spec: sp.spec_key, staff_id: sp.staff_id, staff_name: sp.staff_name, status: sp.status },
    new_values: null,
  });
  const evt = await repo.eventAdd({
    ticket_id: sp.ticket_id, type: "note.added", actor_label: actorLabel,
    old_values: null, new_values: { note: `↩️ أُزيل ${sp.staff_name} من تخصص «${sp.spec_label}»` },
  });
  // إبلاغ المُزال عبر قاعدة «سحب التكليف» نفسها
  await emit({
    id: evt.id, type: "assignment.revoked",
    ctx: {
      ticket: t, old: null, actor_label: actorLabel, actor_staff_id: actorStaffId,
      vars: {
        previous_assignee: sp.staff_name, previous_assignee_id: sp.staff_id,
        new_assignee: "—", assignment_role_label: sp.spec_label,
        actor_name: actorLabel.split(" (")[0],
      },
    },
  });

  // إزالة آخر متأخر قد تجعل الجميع المتبقين جاهزين → التاسك تتحول «جاهز للاختبار» تلقائياً
  const remaining = (await repo.specialistList(sp.ticket_id)).filter((x) => x.status !== "declined");
  const allReady = remaining.length > 0 && remaining.every((x) => x.status === "ready");
  if (allReady && !["ready_for_test", "testing", "test_passed", "closed", "fixed", "rejected"].includes(t.dev_status)) {
    await changeStatusOp(sp.ticket_id, "ready_for_test", "النظام — اكتملت جاهزية كل التخصصات بعد إزالة متخصص");
  }
  return { ok: true };
}

// قرار المتخصص: قبول / رفض بسبب — القبول يبدأ عدّاد تقديره
export async function respondSpecialistOp(
  specialistId: string,
  actor: { staff_id: string; name: string },
  decision: "accepted" | "declined",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const sp = await repo.specialistGet(specialistId);
  if (!sp || !sp.is_current) return { ok: false, error: "التكليف غير موجود أو سُحب" };
  if (sp.staff_id !== actor.staff_id) return { ok: false, error: "هذا التكليف غير مسند إليك" };
  if (sp.status === "ready") return { ok: false, error: "أعلنت الجاهزية بالفعل — لا قرار بعد الإنهاء" };
  if (sp.status !== "pending") return { ok: false, error: "تم الرد على هذا التكليف بالفعل" };
  if (decision === "declined" && (!reason || reason.trim().length < 3)) return { ok: false, error: "سبب الرفض إجباري" };

  const t = await repo.ticketById(sp.ticket_id);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  // القبول التزام فقط — العدّاد لا يبدأ إلا عندما يضغط «أبدأ الشغل» بنفسه
  await repo.specialistUpdate(sp.id, {
    status: decision, responded_at: nowIso(),
    decline_reason: decision === "declined" ? reason!.trim() : null,
    started_at: null,
  });
  if (decision === "declined") await recalcTicketEstimation(sp.ticket_id);

  const actorLabel = `${actor.name} (${sp.spec_label})`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: sp.ticket_id, action: `specialist.${decision}`,
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { status: sp.status }, new_values: { status: decision, reason: reason?.trim() || null },
  });
  const evt = await repo.eventAdd({
    ticket_id: sp.ticket_id, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `${decision === "accepted" ? `✅ قبل تكليف «${sp.spec_label}» — العدّاد يبدأ عندما يبدأ الشغل فعلياً` : `❌ رفض تكليف «${sp.spec_label}» — السبب: ${reason?.trim()}`}` },
  });
  await emit({
    id: evt.id, type: decision === "accepted" ? "spec.accepted" : "spec.declined",
    ctx: {
      ticket: t, old: null, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: await specialistVars(sp, { actor_name: actor.name, reason: reason?.trim() ?? "" }),
    },
  });
  return { ok: true };
}

// المتخصص يبدأ الشغل فعلياً — هنا فقط يبدأ عدّاد تقديره (القبول التزام والبدء شغل)
// وأول متخصص يبدأ يحوّل التاسك «قيد التطوير» تلقائياً
// المتخصص يحدد/يعدل تقدير جزئه بنفسه (أو من يملك صلاحية «تعديل التقدير») —
// بلا تقدير لا يبدأ الشغل أصلاً، فلا يوجد «شغل إلى ما لا نهاية» بلا عدّاد ولا تذكيرات
export async function setSpecialistEstimateOp(
  specialistId: string,
  actor: { staff_id: string; name: string; canEstimateOthers?: boolean },
  est: { days?: number | null; hours?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const sp = await repo.specialistGet(specialistId);
  if (!sp || !sp.is_current) return { ok: false, error: "التكليف غير موجود أو سُحب" };
  if (sp.staff_id !== actor.staff_id && !actor.canEstimateOthers) {
    return { ok: false, error: "تقدير هذا الجزء يضعه صاحبه (أو من يملك صلاحية تعديل التقدير)" };
  }
  if (sp.status === "ready") return { ok: false, error: "أعلن الجاهزية بالفعل — لا تعديل للتقدير بعد التسليم" };
  const days = est.days != null && est.days > 0 ? est.days : null;
  const hours = est.hours != null && est.hours > 0 ? est.hours : null;
  if (!days && !hours) return { ok: false, error: "حدد تقديراً فعلياً (أيام و/أو ساعات أكبر من صفر)" };
  const t = await repo.ticketById(sp.ticket_id);
  if (!t) return { ok: false, error: "الطلب غير موجود" };

  const hadEstimate = (sp.est_days ?? 0) > 0 || (sp.est_hours ?? 0) > 0;
  await repo.specialistUpdate(sp.id, { est_days: days, est_hours: hours });
  await recalcTicketEstimation(sp.ticket_id);
  const fmt = `${days ? `${days} يوم` : ""}${days && hours ? " + " : ""}${hours ? `${hours} ساعة` : ""}`;
  const actorLabel = `${actor.name} (${sp.spec_label})`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: sp.ticket_id, action: "specialist.estimated",
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { est_days: sp.est_days, est_hours: sp.est_hours },
    new_values: { est_days: days, est_hours: hours },
  });
  await repo.eventAdd({
    ticket_id: sp.ticket_id, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `⏱️ ${hadEstimate ? "عدّل" : "حدد"} ${actor.name} تقدير جزء «${sp.spec_label}»: ${fmt}` },
  });
  return { ok: true };
}

export async function specialistStartOp(
  specialistId: string,
  actor: { staff_id: string; name: string },
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const sp = await repo.specialistGet(specialistId);
  if (!sp || !sp.is_current) return { ok: false, error: "التكليف غير موجود أو سُحب" };
  if (sp.staff_id !== actor.staff_id) return { ok: false, error: "هذا التكليف غير مسند إليك" };
  if (sp.status === "pending") return { ok: false, error: "اقبل التكليف أولاً قبل بدء الشغل" };
  if (sp.status === "ready") return { ok: false, error: "أعلنت الجاهزية بالفعل — انتهى دورك" };
  if (sp.status !== "accepted") return { ok: false, error: "لا يمكن بدء الشغل على هذا التكليف" };
  if (sp.started_at) return { ok: false, error: "بدأت الشغل بالفعل — عدّادك يعمل" };
  // لا بدء بلا تقدير: بدون مهلة محددة لا يوجد عدّاد ولا تذكيرات — والشغل يصبح مفتوحاً بلا نهاية
  if (!((sp.est_days ?? 0) > 0 || (sp.est_hours ?? 0) > 0)) {
    return { ok: false, error: "حدد تقدير جزئك أولاً (أيام/ساعات) ثم ابدأ — لا شغل بلا مهلة وعدّاد" };
  }
  const t = await repo.ticketById(sp.ticket_id);
  if (!t) return { ok: false, error: "الطلب غير موجود" };

  await repo.specialistUpdate(sp.id, { started_at: nowIso() });
  const actorLabel = `${actor.name} (${sp.spec_label})`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: sp.ticket_id, action: "specialist.started",
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { started_at: null }, new_values: { started_at: nowIso() },
  });
  await repo.eventAdd({
    ticket_id: sp.ticket_id, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `🚀 بدأ ${actor.name} الشغل على جزء «${sp.spec_label}» — عدّاد تقديره يعمل الآن` },
  });
  // أول واحد يبدأ فعلياً → التاسك كلها «قيد التطوير»
  if (t.dev_status === "handed_to_dev" || t.dev_status === "needs_info") {
    await changeStatusOp(sp.ticket_id, "in_progress", `النظام — بدأ ${actor.name} («${sp.spec_label}») الشغل فعلياً`);
  }
  return { ok: true };
}

// المتخصص يعلن «جاهز من ناحيتي» — ولما كل المتخصصين يجهزون تتحول التاسك «جاهز للاختبار» تلقائياً
export async function specialistReadyOp(
  specialistId: string,
  actor: { staff_id: string; name: string },
  note?: string,
): Promise<{ ok: boolean; error?: string; allReady?: boolean }> {
  const repo = await getRepo();
  const sp = await repo.specialistGet(specialistId);
  if (!sp || !sp.is_current) return { ok: false, error: "التكليف غير موجود أو سُحب" };
  if (sp.staff_id !== actor.staff_id) return { ok: false, error: "هذا التكليف غير مسند إليك" };
  if (sp.status === "ready") return { ok: false, error: "أعلنت الجاهزية بالفعل" };
  if (sp.status !== "accepted") return { ok: false, error: "اقبل التكليف أولاً قبل إعلان الجاهزية" };
  if (!sp.started_at) return { ok: false, error: "ابدأ الشغل أولاً («قيد التطوير») ثم أعلن الجاهزية عند الانتهاء" };
  const t = await repo.ticketById(sp.ticket_id);
  if (!t) return { ok: false, error: "الطلب غير موجود" };

  await repo.specialistUpdate(sp.id, { status: "ready", ready_at: nowIso() });
  const actorLabel = `${actor.name} (${sp.spec_label})`;

  // هل الجميع جاهز؟ (نتجاهل المرفوضين — خاناتهم بانتظار إعادة إسناد ولا تعطل)
  const all = await repo.specialistList(sp.ticket_id);
  const relevant = all.filter((x) => x.status !== "declined");
  const allReady = relevant.length > 0 && relevant.every((x) => x.status === "ready");

  await repo.auditAdd({
    entity_type: "ticket", entity_id: sp.ticket_id, action: "specialist.ready",
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { status: "accepted" }, new_values: { status: "ready", all_ready: allReady, note: note?.trim() || null },
  });
  const evt = await repo.eventAdd({
    ticket_id: sp.ticket_id, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `✅ «${sp.spec_label}» جاهز من ناحية ${actor.name}${note?.trim() ? ` — ${note.trim()}` : ""}${allReady ? " — 🎉 كل التخصصات جاهزة، تحولت التاسك لجاهز للاختبار" : ""}` },
  });
  await emit({
    id: evt.id, type: "spec.ready",
    ctx: {
      ticket: t, old: null, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: await specialistVars(sp, {
        actor_name: actor.name, note: note?.trim() ?? "",
        all_ready: allReady ? "1" : "",
        pending_specs: relevant.filter((x) => x.status !== "ready").map((x) => `${x.spec_label} (${x.staff_name})`).join("، ") || "—",
      }),
    },
  });

  // الجميع جاهز → التاسك كلها «جاهز للاختبار» ودورة التيست تبدأ
  if (allReady && !["ready_for_test", "testing", "test_passed", "closed", "fixed", "rejected"].includes(t.dev_status)) {
    await changeStatusOp(sp.ticket_id, "ready_for_test", "النظام — اكتملت جاهزية كل التخصصات");
  }
  return { ok: true, allReady };
}

// ═══ إعادة إرسال طلب مرفوض — مدخل البيانات يعدّل بياناته وتبدأ الدورة من جديد ═══
export async function resubmitTicketOp(
  ticketId: string,
  actor: { staff_id: string; name: string; role: Role },
  changes: { title: string; details: string },
): Promise<{ ok: boolean; error?: string }> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return { ok: false, error: "الطلب غير موجود" };
  if (t.dev_status !== "rejected") return { ok: false, error: "إعادة الإرسال متاحة للطلبات المرفوضة نهائياً فقط" };
  if (t.is_urgent) return { ok: false, error: "الدعم الفوري المرفوض يُسجل من جديد — لا يُعاد إرساله" };
  // صاحب الطلب أو الأدمن فقط
  if (actor.role !== "admin" && t.created_by !== actor.staff_id) {
    return { ok: false, error: "إعادة الإرسال حق مدخل البيانات صاحب الطلب (أو الأدمن)" };
  }
  const title = changes.title.trim();
  const details = changes.details.trim();
  if (title.length < 3) return { ok: false, error: "عنوان الطلب إجباري (3 أحرف فأكثر)" };
  if (details.length < 10) return { ok: false, error: "التفاصيل إجبارية (10 أحرف فأكثر) — عالج سبب الرفض فيها" };

  const now = nowIso();
  // الدورة تبدأ من جديد: جديد + تصفير التكليفات والعدّادات (يبقى التيستر السابق مسنداً بانتظار رد جديد إن وجد)
  const updated = await repo.ticketUpdate(ticketId, {
    title, details,
    dev_status: "new",
    overall_status: "new",
    tester_assignment_status: t.tester_id ? "pending" : "unassigned",
    developer_assignment_status: "unassigned",
    developer_id: null, developer_name: null,
    dev_started_at: null, test_started_at: null, reminders_sent: null,
    version: (t.version ?? 1) + 1,
    last_status_change: now, updated_at: now,
  });
  if (!updated) return { ok: false, error: "تعذر إعادة الإرسال" };
  // إزالة متخصصي الجولة السابقة — الإسناد يُعاد بعد تسليم التيست الجديد
  for (const sp of await repo.specialistList(ticketId)) await repo.specialistRemove(sp.id);
  if (t.tester_id) {
    await repo.assignmentCreate({ ticket_id: ticketId, assignment_role: "tester", staff_id: t.tester_id, assigned_by: actor.staff_id });
  }

  const actorLabel = `${actor.name} (${ROLE_LABELS[actor.role]})`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: "ticket.resubmitted",
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { title: t.title, details: t.details.slice(0, 200), version: t.version ?? 1 },
    new_values: { title, details: details.slice(0, 200), version: (t.version ?? 1) + 1 },
  });
  const evt = await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null,
    new_values: { note: `🔄 عُدّل الطلب وأُعيد إرساله بعد الرفض (نسخة ${(t.version ?? 1) + 1}) — الدورة بدأت من جديد` },
  });
  // إيميل إعادة الإرسال عبر قاعدة الأتمتة + إعادة تكليف التيستر بالبريد
  await emit({
    id: evt.id, type: "ticket.resubmitted",
    ctx: {
      ticket: updated, old: t, actor_label: actorLabel, actor_staff_id: actor.staff_id,
      vars: { actor_name: actor.name, version: String((t.version ?? 1) + 1) },
    },
  });
  if (updated.tester_id) await fireTesterAssignedEvent(updated, actorLabel, actor.staff_id);
  return { ok: true };
}
