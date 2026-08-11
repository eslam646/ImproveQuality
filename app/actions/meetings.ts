"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { cancelTeamsCalendarMeeting, createTeamsCalendarMeeting } from "@/lib/teams";
import { escapeHtml } from "@/lib/util";

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
