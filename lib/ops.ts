// عمليات التذاكر الموحّدة — تستدعيها Server Actions و API Routes معاً
import { getRepo } from "./db";
import type { Repo } from "./db";
import { emit } from "./engine";
import { sendMail } from "./email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "./templates";
import { ROLE_LABELS, STATUS_LABELS } from "./labels";
import { DEFAULT_TEMPLATE_BLOCKS } from "./types";
import type { DevStatus, RequestType, Role, Settings, Staff, Ticket, TicketKind, TicketPriority } from "./types";
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

// بريد تكليف التيستر له قالب واحد مركزي قابل للتعديل — لا تنشئ Rule إضافية لنفس التكليف حتى لا يتكرر
async function sendTesterAssignmentEmail(ticket: Ticket, actorLabel: string, excludeStaffId: string | null = null) {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const tmpl = await repo.templateGet("tmpl-tester-assigned");
  const vars = templateVars(ticket, settings);
  const fallbackSubject = `🧪 أُسند إليك اختبار الطلب ${ticket.code}`;
  const subject = tmpl ? renderTemplate(tmpl.subject, vars, { htmlEscape: false }) : fallbackSubject;
  const bodyHtml = tmpl
    ? renderBlocks(vars, { ...DEFAULT_TEMPLATE_BLOCKS, ...(tmpl.blocks ?? {}) }, renderTemplate(tmpl.body_html, vars))
    : `<p>أُسند إليك اختبار طلب <b dir="ltr">${esc(ticket.code)}</b>${ticket.is_urgent ? " — <b style='color:#dc2626'>دعم فوري عاجل</b>" : ""}</p>
       <p><b>العميل:</b> ${esc(ticket.client_name)}</p><p><b>التفاصيل:</b><br>${esc(ticket.details).replaceAll("\n", "<br>")}</p>`;
  await mailParties({
    ticket, to: ["tester"], excludeStaffId, subject, bodyHtml,
    notifyTo: ["tester"], notifyMessage: `أُسند إليك اختبار ${ticket.code}${ticket.is_urgent ? " 🚨" : ""}`,
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
    await repo.eventAdd({
      ticket_id: ticket.id, type: "ticket.assigned", actor_label: input.actor.label,
      old_values: null, new_values: { tester: tester_name },
    });
    await sendTesterAssignmentEmail(ticket, input.actor.label, input.actor.staff_id);
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
  const ts = await repo.staffGet(testerId);
  if (!ts || ts.role !== "tester") return old;
  const patch: Partial<Ticket> = {
    tester_id: testerId,
    tester_name: ts.name,
    tester_assignment_status: "pending",
    overall_status: "awaiting_tester",
    updated_at: nowIso(),
  };
  if (est?.days != null) patch.est_days = est.days;
  if (est?.hours != null) patch.est_hours = est.hours;
  const ticket = await repo.ticketUpdate(ticketId, patch);
  if (!ticket) return null;
  await repo.assignmentCreate({ ticket_id: ticket.id, assignment_role: "tester", staff_id: testerId, assigned_by: assignedBy });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "tester.assigned",
    actor_staff_id: assignedBy, actor_label: actorLabel,
    old_values: { tester_id: old.tester_id, tester_name: old.tester_name },
    new_values: { tester_id: testerId, tester_name: ts.name, status: "pending" },
  });
  await repo.eventAdd({
    ticket_id: ticket.id, type: "ticket.assigned", actor_label: actorLabel,
    old_values: { tester: old.tester_name }, new_values: { tester: ts.name },
  });
  await sendTesterAssignmentEmail(ticket, actorLabel);
  return ticket;
}

// ═══ تحديث تقدير التنفيذ (أيام/ساعات) ═══
export async function setEstimationOp(ticketId: string, est: { days?: number | null; hours?: number | null }): Promise<Ticket | null> {
  const repo = await getRepo();
  const t = await repo.ticketById(ticketId);
  if (!t) return null;
  return repo.ticketUpdate(ticketId, {
    est_days: est.days ?? t.est_days ?? null,
    est_hours: est.hours ?? t.est_hours ?? null,
    updated_at: nowIso(),
  });
}

// ═══ إسناد المطور (لا يتم إلا بعد التيست — القيد مفروض في الأكشن) ═══
export async function assignDeveloperOp(
  ticketId: string, developerId: string, actorLabel: string,
  est?: { days?: number | null; hours?: number | null }, assignedBy: string | null = null,
): Promise<Ticket | null> {
  const repo = await getRepo();
  const old = await repo.ticketById(ticketId);
  if (!old) return null;
  const dev = await repo.staffGet(developerId);
  const patch: Partial<Ticket> = {
    developer_id: developerId,
    developer_name: dev?.name ?? null,
    developer_assignment_status: "pending",
    overall_status: "awaiting_developer",
    updated_at: nowIso(),
  };
  if (est?.days != null) patch.est_days = est.days;
  if (est?.hours != null) patch.est_hours = est.hours;
  const ticket = await repo.ticketUpdate(ticketId, patch);
  if (!ticket) return null;
  await repo.assignmentCreate({ ticket_id: ticket.id, assignment_role: "developer", staff_id: developerId, assigned_by: assignedBy });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action: "developer.assigned",
    actor_staff_id: assignedBy, actor_label: actorLabel,
    old_values: { developer_id: old.developer_id, developer_name: old.developer_name },
    new_values: { developer_id: developerId, developer_name: dev?.name ?? null, status: "pending" },
  });
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
        ...(accepted
          ? { overall_status: "in_development" as const, dev_status: "in_progress" as const, last_status_change: nowIso() }
          : { developer_id: null, developer_name: null, overall_status: "awaiting_developer" as const }),
        updated_at: nowIso(),
      };
  const updated = await repo.ticketUpdate(ticket.id, patch);
  if (!updated) return { ok: false, error: "تعذر تحديث الطلب" };

  const action = `${assignmentRole}.${decision}`;
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticket.id, action,
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { assignment_status: assignment.status, assignee: actor.staff_id },
    new_values: { assignment_status: decision, reason: reason?.trim() || null },
  });
  await repo.eventAdd({
    ticket_id: ticket.id, type: "note.added", actor_label: actorLabel, old_values: null,
    new_values: { note: `${accepted ? "✅ وافق على" : "❌ رفض"} تكليف ${assignmentRole === "tester" ? "الاختبار" : "التطوير"}${reason ? ` — السبب: ${reason.trim()}` : ""}` },
  });

  const admins = (await repo.staffList(true)).filter((s) => s.role === "admin").map((s) => s.email);
  await mailParties({
    ticket: updated,
    to: ["creator"],
    cc: assignmentRole === "tester" ? ["developer"] : ["tester"],
    extraTo: admins,
    excludeStaffId: actor.staff_id,
    subject: `${accepted ? "✅ قبول" : "❌ رفض"} ${assignmentRole === "tester" ? "التيستر" : "المطور"} للتكليف ${ticket.code} — ${actor.name}`,
    bodyHtml: `<p><b>${esc(actorLabel)}</b> ${accepted ? "وافق على" : "رفض"} التكليف بالطلب <b dir="ltr">${esc(ticket.code)}</b>.</p>
      <p><b>العميل:</b> ${esc(ticket.client_name)}</p>
      <p><b>العنوان:</b> ${esc(ticket.title || ticket.details.slice(0, 120))}</p>
      ${reason ? `<p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px"><b>السبب:</b><br>${esc(reason.trim())}</p>` : ""}
      ${TRACK_ROW(updated, await repo.settingsGet())}`,
    notifyTo: ["creator", ...(assignmentRole === "tester" ? (["developer"] as PartyRef[]) : (["tester"] as PartyRef[]))],
    notifyMessage: `${accepted ? "✅" : "❌"} ${actor.name} ${accepted ? "وافق على" : "رفض"} ${ticket.code}`,
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
  const actorLabel = `${actor.name} (${ROLE_LABELS[actor.role]})`;

  const isTester = actor.role === "tester" && t.tester_id === actor.staff_id;
  const isDev = actor.role === "developer" && t.developer_id === actor.staff_id;
  if (!isTester && !isDev) return { ok: false, error: "المهمة غير مسندة إليك حالياً" };
  const currentAssignment = await repo.assignmentCurrent(ticketId, isTester ? "tester" : "developer");
  if (currentAssignment) await repo.assignmentRespond(currentAssignment.id, "declined", reason);

  const patch: Partial<Ticket> = isTester
    ? { tester_id: null, tester_name: null, tester_assignment_status: "declined", overall_status: "awaiting_tester", updated_at: nowIso() }
    : { developer_id: null, developer_name: null, developer_assignment_status: "declined", overall_status: "awaiting_developer", updated_at: nowIso() };
  const updated = await repo.ticketUpdate(ticketId, patch);
  if (!updated) return { ok: false, error: "تعذر التحديث" };

  await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null, new_values: { note: `🙅 اعتذر عن الدعم الفوري — السبب: ${reason}` },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: `${isTester ? "tester" : "developer"}.urgent_withdrawal`,
    actor_staff_id: actor.staff_id, actor_label: actorLabel,
    old_values: { tester_id: t.tester_id, developer_id: t.developer_id },
    new_values: { reason, tester_id: updated.tester_id, developer_id: updated.developer_id },
  });

  const admins = (await repo.staffList(true)).filter((s) => s.role === "admin");
  const adminEmails = admins.map((a) => a.email).filter((e) => e && e.includes("@"));
  // المستلم الرئيسي: مدخل البيانات. لو ضيف بلا بريد صالح → وجّه الرسالة نفسها للإدارة حتى لا تضيع
  const creatorStaff = updated.created_by ? await repo.staffGet(updated.created_by) : null;
  const creatorEmail = creatorStaff?.email && creatorStaff.email.includes("@") ? creatorStaff.email
    : (!creatorStaff && isEmail(updated.client_contact ?? "") ? updated.client_contact : null);
  await mailParties({
    ticket: updated,
    to: creatorEmail ? ["creator"] : [],
    extraTo: creatorEmail ? adminEmails : [],
    forceTo: creatorEmail ? undefined : adminEmails.slice(0, 5),
    excludeStaffId: actor.staff_id,
    subject: `🙅 اعتذار عن ${isTester ? "اختبار" : "تطوير"} الطلب ${t.code} — ${actor.name}`,
    bodyHtml: `<p><b>${esc(actorLabel)}</b> اعتذر عن مهمة <b dir="ltr">${esc(t.code)}</b>${t.is_urgent ? " (دعم فوري 🚨)" : ""}</p>
      <p><b>السبب:</b> ${esc(reason)}</p>
      <p><b>العميل:</b> ${esc(t.client_name)}</p>
      <p style="color:#64748b">المهمة عادت لقائمة غير المُسندة — أعد إسنادها من صفحة الطلب.</p>`,
    notifyTo: ["creator"],
    notifyMessage: `🙅 ${actor.name} اعتذر عن ${t.code}: ${reason.slice(0, 80)}`,
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
  const ticket = await repo.ticketUpdate(ticketId, {
    dev_status: newStatus, last_status_change: nowIso(), updated_at: nowIso(),
  });
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

  // إيميلات مخصوصة (قاعدة الأتمتة العامة تتخطى هذه الحالات)
  const settings = await repo.settingsGet();
  if (newStatus === "rejected") {
    await mailParties({
      ticket, to: ["creator", "client"], cc: ["tester", "developer"],
      subject: `❌ تم رفض الطلب ${ticket.code} — بواسطة ${actorLabel}`,
      bodyHtml: `<p>تم رفض طلب <b dir="ltr">${esc(ticket.code)}</b> (العميل: ${esc(ticket.client_name)})</p>
        <p><b>قام بالرفض:</b> ${esc(actorLabel)}</p>
        <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px"><b>سبب الرفض:</b><br>${esc(note?.trim() || "—")}</p>
        ${TRACK_ROW(ticket, settings)}`,
      notifyTo: ["creator", "tester", "developer"],
      notifyMessage: `❌ ${ticket.code} رُفض بواسطة ${actorLabel.split(" (")[0]}`,
    });
  }
  if (newStatus === "test_failed") {
    await mailParties({
      ticket, to: ["developer", "creator"], cc: ["tester"],
      subject: `🧪 فشل اختبار الطلب ${ticket.code} — عاد للمطور`,
      bodyHtml: `<p>أعاد <b>${esc(actorLabel)}</b> الطلب <b dir="ltr">${esc(ticket.code)}</b> للمطور بعد فشل الاختبار (العميل: ${esc(ticket.client_name)})</p>
        <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px"><b>سبب فشل الاختبار / المشكلة:</b><br>${esc(note?.trim() || "—")}</p>
        ${TRACK_ROW(ticket, settings)}`,
      notifyTo: ["developer", "creator"],
      notifyMessage: `🧪 ${ticket.code} فشل اختبارها — عادت للمطور بالسبب`,
    });
  }
  if (newStatus === "fixed" || newStatus === "closed") {
    const done = newStatus === "closed";
    await mailParties({
      ticket, to: ["client", "creator"], cc: ["tester", "developer"],
      subject: done ? `✅ تم تسليم وإغلاق طلبك ${ticket.code}` : `🔧 تم إصلاح طلبك ${ticket.code} — جاهز للتسليم`,
      bodyHtml: `<p>${done ? "يسعدنا إبلاغك بأنه <b>تم تسليم وإغلاق</b> طلبك" : "تم <b>إصلاح</b> طلبك وهو جاهز للتسليم ويُغلق بعد اعتماده"} <b dir="ltr">${esc(ticket.code)}</b></p>
        <p><b>الحالة النهائية:</b> ${STATUS_LABELS[newStatus]}</p>
        ${note?.trim() ? `<p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px"><b>ملاحظات الفريق:</b><br>${esc(note.trim())}</p>` : ""}
        <p><b>بواسطة:</b> ${esc(actorLabel)}</p>
        ${EST_TEXT(ticket)}
        ${TRACK_ROW(ticket, settings)}`,
      notifyTo: ["creator"],
      notifyMessage: `${done ? "✅" : "🔧"} ${ticket.code} — ${STATUS_LABELS[newStatus]} وأُرسل إيميل لمقدم الطلب`,
    });
  }
  return ticket;
}

// ═══ ملاحظات/ردود الطلب — تصل بالبريد لكل أطراف الطلب (عدا الكاتب) ═══
export async function addNoteOp(
  ticketId: string, note: string, actorLabel: string,
  actorRole?: Role, actorStaffId?: string | null,
) {
  const repo = await getRepo();
  await repo.eventAdd({
    ticket_id: ticketId, type: "note.added", actor_label: actorLabel,
    old_values: null, new_values: { note },
  });
  await repo.auditAdd({
    entity_type: "ticket", entity_id: ticketId, action: "note.added",
    actor_staff_id: actorStaffId ?? null, actor_label: actorLabel,
    old_values: null, new_values: { note },
  });
  const t = await repo.ticketById(ticketId);
  if (!t) return;

  // الملاحظة تُعرض لكل أطراف الطلب: مدخل البيانات ↔ التيست ↔ الديف — بكل إيميل
  const isStatus = actorRole === "developer" ? "ملاحظات الديف" : actorRole === "tester" ? "ملاحظات التيست" : "ملاحظة";
  const settings = await repo.settingsGet();
  await mailParties({
    ticket: t, to: ["creator", "tester", "developer"], excludeStaffId: actorStaffId ?? null,
    subject: `💬 ${isStatus} جديدة على ${t.code} — ${actorLabel}`,
    bodyHtml: `<p>أضاف <b>${esc(actorLabel)}</b> ${isStatus} على الطلب <b dir="ltr">${esc(t.code)}</b> (العميل: ${esc(t.client_name)}):</p>
      <p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px">${esc(note).replaceAll("\n", "<br>")}</p>
      <p style="color:#64748b">الحالة الحالية: ${STATUS_LABELS[t.dev_status]} — بتاريخ ${new Date().toLocaleString("ar-EG")}</p>
      ${TRACK_ROW(t, settings)}`,
    notifyTo: ["creator", "tester", "developer"],
    notifyMessage: `💬 ${actorLabel.split(" (")[0]} على ${t.code}: ${note.slice(0, 70)}`,
  });
}
