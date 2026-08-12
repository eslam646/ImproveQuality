"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { cancelTeamsCalendarMeeting, createTeamsCalendarMeeting } from "@/lib/teams";
import { escapeHtml } from "@/lib/util";
import { sendMail } from "@/lib/email";
import { renderBlocks, renderTemplate, templateVars, wrapEmail } from "@/lib/templates";
import { DEFAULT_TEMPLATE_BLOCKS } from "@/lib/types";

export async function createTeamsMeetingAction(input: { code: string; subject: string; startsAt: string; durationMinutes: number; staffIds: string[] }) {
  const actor = await requireActionPermission("manage_meetings");
  const repo = await getRepo(); const ticket = await repo.ticketByCode(input.code);
  if (!ticket) return { ok: false, error: "الطلب غير موجود" };
  const start = new Date(input.startsAt); const duration = Math.max(15, Math.min(480, Number(input.durationMinutes) || 30));
  if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 60_000) return { ok: false, error: "حدد موعدًا صحيحًا في المستقبل" };
  const end = new Date(start.getTime() + duration * 60_000);
  const all = await repo.staffList(true);
  const selected = all.filter((s) => input.staffIds.includes(s.id) && s.email.includes("@"));
  if (!selected.length) return { ok: false, error: "اختر مشاركًا واحدًا على الأقل" };
  const subject = input.subject.trim() || `اجتماع الطلب ${ticket.code} — ${ticket.title || ticket.client_name}`;
  try {
    const graph = await createTeamsCalendarMeeting({
      subject, startIso: start.toISOString(), endIso: end.toISOString(), attendeeEmails: selected.map((s) => s.email),
      bodyHtml: `<p>اجتماع مرتبط بالطلب <b>${escapeHtml(ticket.code)}</b></p><p><b>العميل:</b> ${escapeHtml(ticket.client_name)}</p><p><b>العنوان:</b> ${escapeHtml(ticket.title || ticket.details.slice(0,120))}</p>`,
    });
    const meeting = await repo.meetingCreate({ ticket_id: ticket.id, provider: "teams", provider_meeting_id: graph.providerMeetingId, subject, starts_at: start.toISOString(), ends_at: end.toISOString(), join_url: graph.joinUrl, organizer_staff_id: actor.id, status: "scheduled" });
    await repo.meetingParticipantsAdd(selected.map((s) => ({ meeting_id: meeting.id, staff_id: s.id, email: s.email, response_status: "pending", joined_at: null, left_at: null })));
    await repo.eventAdd({ ticket_id: ticket.id, type: "note.added", actor_label: actor.name, old_values: null, new_values: { note: `📅 أنشأ اجتماع Teams: ${subject}` } });
    await repo.auditAdd({ entity_type: "ticket", entity_id: ticket.id, action: "teams_meeting.created", actor_staff_id: actor.id, actor_label: actor.name, new_values: { meeting_id: meeting.id, starts_at: meeting.starts_at, participant_ids: selected.map((s)=>s.id) } });
    revalidatePath(`/tickets/${ticket.code}`);
    return { ok: true, meetingId: meeting.id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function addManualTeamsMeetingAction(input: { code: string; subject: string; startsAt: string; durationMinutes: number; staffIds: string[]; joinUrl: string }) {
  const actor = await requireActionPermission("manage_meetings");
  const repo = await getRepo(); const ticket = await repo.ticketByCode(input.code);
  if (!ticket) return { ok: false, error: "الطلب غير موجود" };
  let parsedUrl: URL;
  try { parsedUrl = new URL(input.joinUrl.trim()); } catch { return { ok: false, error: "رابط Teams غير صالح" }; }
  const host = parsedUrl.hostname.toLowerCase();
  if (parsedUrl.protocol !== "https:" || !(host === "teams.microsoft.com" || host.endsWith(".teams.microsoft.com") || host === "teams.live.com" || host.endsWith(".teams.live.com"))) {
    return { ok: false, error: "الصق رابط اجتماع رسمي من teams.microsoft.com أو teams.live.com" };
  }
  const start = new Date(input.startsAt); const duration = Math.max(15, Math.min(480, Number(input.durationMinutes) || 30));
  if (!Number.isFinite(start.getTime())) return { ok: false, error: "موعد الاجتماع غير صحيح" };
  const end = new Date(start.getTime() + duration * 60_000);
  const all = await repo.staffList(true);
  const selected = all.filter((s) => input.staffIds.includes(s.id) && s.email.includes("@"));
  if (!selected.length) return { ok: false, error: "اختر مشاركًا واحدًا على الأقل" };
  const subject = input.subject.trim() || `اجتماع الطلب ${ticket.code} — ${ticket.title || ticket.client_name}`;
  const meeting = await repo.meetingCreate({ ticket_id: ticket.id, provider: "teams", provider_meeting_id: null, subject, starts_at: start.toISOString(), ends_at: end.toISOString(), join_url: parsedUrl.toString(), organizer_staff_id: actor.id, status: "scheduled" });
  await repo.meetingParticipantsAdd(selected.map((s) => ({ meeting_id: meeting.id, staff_id: s.id, email: s.email, response_status: "pending", joined_at: null, left_at: null })));
  const settings = await repo.settingsGet();
  const tmpl = await repo.templateGet("tmpl-teams-manual-invite");
  const vars = {
    ...templateVars(ticket, settings),
    meeting_subject: subject,
    meeting_start: start.toLocaleString("ar-EG"),
    meeting_end: end.toLocaleString("ar-EG"),
    meeting_duration: `${duration} دقيقة`,
    meeting_join_url: parsedUrl.toString(),
  };
  const emailSubject = tmpl ? renderTemplate(tmpl.subject, vars, { htmlEscape: false }) : `📅 ${subject}`;
  const emailInner = tmpl
    ? renderBlocks(vars, { ...DEFAULT_TEMPLATE_BLOCKS, ...(tmpl.blocks ?? {}) }, renderTemplate(tmpl.body_html, vars))
    : `<p>تمت دعوتك لاجتماع Teams.</p><p><a href="${escapeHtml(parsedUrl.toString())}" target="_blank">الانضمام إلى Teams</a></p>`;
  const html = wrapEmail(emailSubject, emailInner, settings);
  const to = selected.map((s) => s.email);
  const sent = await sendMail({ to, cc: [], subject: emailSubject, html }, settings);
  await repo.emailLogAdd({ job_id: null, ticket_id: ticket.id, to_addr: to.join(","), cc_addr: null, provider: sent.provider, provider_msg_id: sent.msgId, subject: emailSubject, body_html: html, status: sent.error ? "failed" : sent.provider === "log" ? "logged" : "sent", error: sent.error ?? null });
  await repo.eventAdd({ ticket_id: ticket.id, type: "note.added", actor_label: actor.name, old_values: null, new_values: { note: `📅 أضاف رابط اجتماع Teams: ${subject}` } });
  await repo.auditAdd({ entity_type: "ticket", entity_id: ticket.id, action: "teams_meeting.manual_link_added", actor_staff_id: actor.id, actor_label: actor.name, new_values: { meeting_id: meeting.id, starts_at: meeting.starts_at, participant_ids: selected.map((s)=>s.id) } });
  revalidatePath(`/tickets/${ticket.code}`);
  return { ok: true, meetingId: meeting.id };
}

export async function cancelTeamsMeetingAction(meetingId: string) {
  const actor = await requireActionPermission("manage_meetings"); const repo = await getRepo(); const meeting = await repo.meetingGet(meetingId);
  if (!meeting) return { ok: false, error: "الاجتماع غير موجود" };
  try {
    if (meeting.provider_meeting_id) await cancelTeamsCalendarMeeting(meeting.provider_meeting_id);
    await repo.meetingUpdate(meeting.id, { status: "cancelled" });
    await repo.auditAdd({ entity_type: "ticket", entity_id: meeting.ticket_id ?? meeting.id, action: "teams_meeting.cancelled", actor_staff_id: actor.id, actor_label: actor.name, new_values: { meeting_id: meeting.id } });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
