import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRepo } from "@/lib/db";
import { requireStaff, permissionsForStaff } from "@/lib/auth";
import {
  addNoteAction, assignDeveloperAction, assignTesterAction,
  assignSpecialistAction, declineAssignmentAction, removeSpecialistAction, respondSpecialistAction,
  respondToAssignmentAction, resubmitTicketAction, setEstimationAction, specialistReadyAction,
} from "@/app/actions/tickets";
import { Badge, Button, Card, Field, Msg, selectCls, inputCls } from "@/components/ui";
import { allowedTransitions, ALL_STATUSES, ASSIGNMENT_STATUS_LABELS, REQUEST_TYPE_LABELS, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS, urgentStatusInfo } from "@/lib/labels";
import { fmtDate, parseFileRef } from "@/lib/util";
import { AttachmentUpload } from "@/components/attachment-upload";
import { StatusChangeForm } from "@/components/status-change-form";
import { UrgentProgressForm } from "@/components/urgent-progress-form";
import { SpecDeveloperPicker } from "@/components/spec-developer-picker";
import type { DevStatus, TicketEvent } from "@/lib/types";
import { TeamsMeetings } from "@/components/teams-meetings";
import { teamsConfigStatus } from "@/lib/teams";

export const dynamic = "force-dynamic";

function EventLine({ e }: { e: TicketEvent }) {
  const label =
    e.type === "ticket.created" ? "أنشأ الطلب" :
    e.type === "ticket.assigned"
      ? (e.new_values as { tester?: string })?.tester
        ? `أسند الاختبار إلى ${(e.new_values as { tester?: string })?.tester}`
        : (e.new_values as { specialist?: string })?.specialist
          ? `أسند تخصصاً — ${(e.new_values as { specialist?: string })?.specialist}`
          : `أسند الطلب إلى ${(e.new_values as { developer?: string })?.developer ?? ""}` :
    e.type === "field.changed"
      ? `غيّر الحالة: ${STATUS_LABELS[(e.old_values as { dev_status: DevStatus }).dev_status]} ← ${STATUS_LABELS[(e.new_values as { dev_status: DevStatus }).dev_status]}`
      : e.type === "note.added" ? `أضاف ملاحظة: ${(e.new_values as { note?: string })?.note ?? ""}`
      : e.type === "attachment.added" ? `أرفق ملفاً: ${(e.new_values as { file?: string })?.file ?? ""}`
      : "إجراء تلقائي";
  const icon = { "ticket.created": "🆕", "ticket.assigned": "👤", "field.changed": "🔄", "note.added": "📝", "attachment.added": "📎", "job.executed": "⚙️" }[e.type];
  return (
    <li className="flex gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-sm"><b>{e.actor_label}</b> {label}</p>
        <p className="text-xs text-slate-400">{fmtDate(e.created_at)}</p>
      </div>
    </li>
  );
}

export default async function TicketDetailsPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireStaff();
  const { code } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const perms = await permissionsForStaff(actor);
  const ticket = await repo.ticketByCode(code);
  if (!ticket) notFound();

  // نطاق الرؤية ديناميكي من الإعدادات + الاستثناء الفردي — المتخصص المسند (باك/فرونت/UX) يرى طلبه أيضاً
  const mySpecialistRoles = !ticket.is_urgent
    ? (await repo.specialistList(ticket.id)).filter((x) => x.staff_id === actor.id && x.status !== "declined")
    : [];
  if (!perms.view_all_tickets) {
    const ownCreated = perms.view_own_created && ticket.created_by === actor.id;
    const assigned = perms.view_assigned_tickets
      && (ticket.tester_id === actor.id || ticket.developer_id === actor.id || mySpecialistRoles.length > 0);
    if (!ownCreated && !assigned) redirect("/dashboard?denied=ticket");
  }

  const settings = await repo.settingsGet();
  const customEntries = settings.custom_fields
    .filter((f) => ticket.custom_data?.[f.key])
    .map((f) => ({ label: f.label, value: String(ticket.custom_data![f.key]), isFile: f.type === "file" }));

  const staffAll = await repo.staffList(true);
  const testers = staffAll.filter((s) => s.role === "tester");
  const devs = staffAll.filter((s) => s.role === "developer");

  const [events, attachments, emailLog, auditEntries, meetings, assignments, specialists] = await Promise.all([
    repo.eventList(ticket.id),
    repo.attachmentList(ticket.id),
    perms.emails ? repo.emailLogList(1, 10, ticket.id) : Promise.resolve({ rows: [], total: 0 }),
    perms.view_audit ? repo.auditList("ticket", ticket.id) : Promise.resolve([]),
    (perms.manage_meetings || perms.join_meetings) ? repo.meetingList(ticket.id) : Promise.resolve([]),
    ticket.is_urgent ? repo.assignmentList(ticket.id) : Promise.resolve([]),
    !ticket.is_urgent ? repo.specialistList(ticket.id) : Promise.resolve([]),
  ]);

  const isAssignedTester = ticket.tester_id === actor.id;
  const isAssignedDev = ticket.developer_id === actor.id;
  const myAssignmentStatus = isAssignedTester
    ? (ticket.tester_assignment_status ?? "unassigned")
    : isAssignedDev ? (ticket.developer_assignment_status ?? "unassigned") : null;
  const needsAssignmentResponse = perms.assignment_decision && (isAssignedTester || isAssignedDev) && ["pending", "unassigned", "reassigned"].includes(myAssignmentStatus ?? "");
  // الدعم الفوري: الإسناد يظهر فقط عندما تكون الخانة شاغرة فعلاً (لا أحد مسند أو اعتذر) وقبل الإقفال —
  // بعد ما يخلص أحد الطرفين أو أثناء شغله لا معنى لإعادة الإسناد ولا يظهر النموذج
  const urgentNeedsTester = !!ticket.is_urgent && !ticket.urgent_ended_at && !ticket.tester_id;
  const urgentNeedsDev = !!ticket.is_urgent && !ticket.urgent_ended_at && !ticket.developer_id;
  const canAssignTester = perms.assign_tester && (!ticket.is_urgent || urgentNeedsTester);
  const canAssignDev = perms.assign_developer && (!ticket.is_urgent || urgentNeedsDev);
  // الدعم الفوري بلا استيميشن إطلاقاً — يُقاس بالوقت الفعلي المستخدم لكل شخص
  const canEstimate = perms.set_estimation && !ticket.is_urgent;
  const canUpload = perms.upload_attachment && (perms.view_all_tickets || isAssignedTester || isAssignedDev || mySpecialistRoles.length > 0);
  const acceptedForRole = actor.role === "tester" ? ticket.tester_assignment_status === "accepted" : actor.role === "developer" ? ticket.developer_assignment_status === "accepted" : true;
  // الدعم الفوري «طلب جانبي»: لا حالة تطوير له إطلاقاً — حالته من دورة حياته فقط (قبول/اعتذار/جاري/انتهى)
  const transitions = ticket.is_urgent || !perms.change_status || !acceptedForRole
    ? []
    : actor.role === "support" ? ALL_STATUSES.filter((s) => s !== ticket.dev_status) : allowedTransitions(actor.role, ticket.dev_status);
  const noteLabel = actor.role === "developer" ? "ملاحظات الديف" : actor.role === "tester" ? "ملاحظات التيست" : "ملاحظة مدخل البيانات";
  const canNote = perms.add_note && (perms.view_all_tickets || ticket.created_by === actor.id || isAssignedTester || isAssignedDev || mySpecialistRoles.length > 0);
  // الدعم الفوري «طلب جانبي»: المكلَّف الذي قَبِل يحدّث موقفه (مازلت أعمل / انتهيت) — والأدمن يقدر أيضاً (يُسجل باسمه)
  // من أنهى جزءه (completed) لا يظهر له النموذج مرة أخرى — لا رجوع بعد الإنهاء
  const urgentEnded = !!ticket.urgent_ended_at;
  const canUpdateUrgentProgress = !!ticket.is_urgent && !urgentEnded && perms.update_urgent_progress
    && (actor.role === "admin" || ((isAssignedTester || isAssignedDev) && myAssignmentStatus === "accepted"));
  const myPartDone = (isAssignedTester && ticket.tester_assignment_status === "completed")
    || (isAssignedDev && ticket.developer_assignment_status === "completed");

  // الدعم الفوري: الوقت الفعلي المستخدم لكل شخص — من قبول التكليف حتى الإنهاء (أو حتى الآن إن كان يعمل)
  const fmtMinutes = (mins: number) => {
    if (mins < 1) return "أقل من دقيقة";
    if (mins < 60) return `${Math.round(mins)} دقيقة`;
    const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
    if (h < 24) return `${h} س${m ? ` ${m} د` : ""}`;
    const d = Math.floor(h / 24);
    return `${d} يوم${h % 24 ? ` ${h % 24} س` : ""}`;
  };
  const staffNameOf = (id: string | null) => staffAll.find((s) => s.id === id)?.name ?? "—";
  const urgentTimeUsage = ticket.is_urgent
    ? assignments
        .filter((a) => a.responded_at && a.status !== "declined" && a.status !== "reassigned")
        .map((a) => {
          const start = Date.parse(a.responded_at!);
          const end = a.completed_at ? Date.parse(a.completed_at) : (ticket.urgent_ended_at ? Date.parse(ticket.urgent_ended_at) : Date.now());
          return {
            id: a.id,
            name: staffNameOf(a.staff_id),
            role: a.assignment_role === "tester" ? "التيست" : "الديف",
            minutes: Math.max(0, (end - start) / 60000),
            done: !!a.completed_at,
          };
        })
        .filter((x) => x.minutes > 0 || x.done)
    : [];
  const hasActions = canAssignTester || canAssignDev || canEstimate || canNote || isAssignedTester || isAssignedDev || transitions.length > 0 || canUpdateUrgentProgress || mySpecialistRoles.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold" dir="ltr">{ticket.code}</h1>
          {/* الدعم الفوري لا يعرض حالة التطوير — حالته من دورة حياته فقط */}
          {ticket.is_urgent ? (
            <>
              <Badge color="bg-red-600 text-white">🚨 دعم فوري — طلب جانبي</Badge>
              <Badge color={urgentStatusInfo(ticket).color}>{urgentStatusInfo(ticket).label}</Badge>
            </>
          ) : (
            <Badge color={STATUS_COLORS[ticket.dev_status]}>{STATUS_LABELS[ticket.dev_status]}</Badge>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/dashboard" className="rounded-lg bg-white px-3 py-1.5 shadow-sm hover:bg-slate-50">→ رجوع للتذاكر</Link>
          <Link href={`/track?code=${ticket.code}`} className="rounded-lg bg-white px-3 py-1.5 shadow-sm hover:bg-slate-50">صفحة التتبع العامة ↗</Link>
        </div>
      </div>

      {sp.created && <Msg type="ok">تم إنشاء الطلب بنجاح ✓ — كود التتبع: <b dir="ltr">{ticket.code}</b> (أُطلقت قواعد أتمتة «طلب جديد»)</Msg>}
      {sp.ok && <Msg type="ok">{sp.ok}</Msg>}
      {sp.err && <Msg type="err">{sp.err}</Msg>}

      <div className="grid gap-5 md:grid-cols-3">
        {/* البيانات الأساسية */}
        <div className="space-y-5 md:col-span-2">
          <Card title="بيانات الطلب">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
              <div><dt className="text-slate-400">رقم الطلب</dt><dd className="font-bold">#{ticket.seq}</dd></div>
              <div><dt className="text-slate-400">العميل</dt><dd className="font-semibold">{ticket.client_name}</dd></div>
              <div><dt className="text-slate-400">نوع الطلب</dt><dd>{REQUEST_TYPE_LABELS[ticket.request_type ?? "issue"]}</dd></div>
              <div className="col-span-2 md:col-span-3"><dt className="text-slate-400">عنوان الطلب / المشكلة</dt><dd className="text-base font-bold">{ticket.title || "—"}</dd></div>
              <div><dt className="text-slate-400">بريد مدخل البيانات</dt><dd>{ticket.client_contact || "—"}</dd></div>
              <div><dt className="text-slate-400">مدخل البيانات</dt><dd>{ticket.created_by_name}</dd></div>
              <div><dt className="text-slate-400">المختبِر (التيست)</dt><dd className="font-semibold text-purple-700">{ticket.tester_name ?? "لم يُحدد بعد"}<span className="block text-xs text-slate-400">{ASSIGNMENT_STATUS_LABELS[ticket.tester_assignment_status ?? "unassigned"]}</span></dd></div>
              <div><dt className="text-slate-400">{ticket.is_urgent ? "المطور" : "فريق التطوير"}</dt><dd className="font-semibold">
                {!ticket.is_urgent && specialists.filter((x) => x.status !== "declined").length > 0 ? (
                  specialists.filter((x) => x.status !== "declined").map((sp) => (
                    <span key={sp.id} className="block">
                      {sp.staff_name}
                      <span className="text-xs font-normal text-slate-400"> — {sp.spec_label} · {sp.status === "ready" ? "✅ جاهز" : sp.status === "accepted" ? "🔄 يعمل" : "⏳ بانتظار الرد"}</span>
                    </span>
                  ))
                ) : (
                  <>
                    {ticket.developer_name ?? "غير معيّن"}
                    <span className="block text-xs text-slate-400">{ASSIGNMENT_STATUS_LABELS[ticket.developer_assignment_status ?? "unassigned"]}</span>
                  </>
                )}
              </dd></div>
              {!ticket.is_urgent && (
                <div>
                  <dt className="text-slate-400">⏱️ تقدير التنفيذ الإجمالي (ديف + تيست)</dt>
                  <dd className="font-semibold">
                    {(ticket.est_days || ticket.est_hours)
                      ? `${ticket.est_days ? `${ticket.est_days} يوم` : ""}${ticket.est_days && ticket.est_hours ? " + " : ""}${ticket.est_hours ? `${ticket.est_hours} ساعة` : ""}`
                      : "—"}
                    {(ticket.dev_est_days || ticket.dev_est_hours || ticket.test_est_days || ticket.test_est_hours) && (
                      <span className="block text-xs font-normal text-slate-400">
                        ديف: {(ticket.dev_est_days || ticket.dev_est_hours) ? `${ticket.dev_est_days ? `${ticket.dev_est_days} يوم` : ""}${ticket.dev_est_days && ticket.dev_est_hours ? " + " : ""}${ticket.dev_est_hours ? `${ticket.dev_est_hours} ساعة` : ""}` : "—"}
                        {" · "}تيست: {(ticket.test_est_days || ticket.test_est_hours) ? `${ticket.test_est_days ? `${ticket.test_est_days} يوم` : ""}${ticket.test_est_days && ticket.test_est_hours ? " + " : ""}${ticket.test_est_hours ? `${ticket.test_est_hours} ساعة` : ""}` : "—"}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div><dt className="text-slate-400">المصدر</dt><dd>{ticket.source === "web_guest" ? "نموذج عام (ضيف)" : ticket.source === "update_form" ? "نموذج تحديث" : "داخلي"}</dd></div>
              <div><dt className="text-slate-400">تاريخ الإنشاء</dt><dd>{fmtDate(ticket.created_at)}</dd></div>
              <div><dt className="text-slate-400">آخر تحديث للحالة</dt><dd>{fmtDate(ticket.last_status_change)}</dd></div>
            </dl>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">{ticket.details}</div>
          </Card>

          {/* الدعم الفوري كطلب جانبي — ملخص دورة حياته */}
          {!!ticket.is_urgent && (
            <Card title={urgentEnded ? "✅ الدعم الفوري (طلب جانبي) — انتهى" : "🚨 الدعم الفوري (طلب جانبي) — جارٍ"}>
              <div className={`rounded-xl border p-3 text-sm ${urgentEnded ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                <p className={urgentEnded ? "text-emerald-800" : "text-rose-800"}>
                  {urgentEnded
                    ? "انتهى الدعم الخاص بهذه النقطة — النقطة الجانبية أُغلقت ولا تحتاج متابعة إضافية."
                    : "طلب جانبي لمساعدة السبورت في نقطة محددة — يبقى مفتوحاً حتى يعلن المكلَّف أنه انتهى منها."}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                  <div><dt className="text-slate-400">بدء العمل</dt><dd className="font-semibold">{ticket.urgent_started_at ? fmtDate(ticket.urgent_started_at) : "لم يبدأ بعد (بانتظار قبول التكليف)"}</dd></div>
                  <div><dt className="text-slate-400">انتهاء الدعم</dt><dd className="font-semibold">{ticket.urgent_ended_at ? fmtDate(ticket.urgent_ended_at) : "—"}</dd></div>
                  {!!ticket.actual_minutes && (
                    <div><dt className="text-slate-400">المدة الفعلية</dt><dd className="font-semibold">{ticket.actual_minutes >= 60 ? `${Math.floor(ticket.actual_minutes / 60)} س ${ticket.actual_minutes % 60} د` : `${ticket.actual_minutes} دقيقة`} تقريباً</dd></div>
                  )}
                </dl>
                {urgentTimeUsage.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-bold text-slate-400">⏱️ الوقت المستخدم لكل شخص (من قبول التكليف حتى الإنهاء)</p>
                    <ul className="mt-2 space-y-1">
                      {urgentTimeUsage.map((u) => (
                        <li key={u.id} className="flex items-center justify-between text-sm">
                          <span><b>{u.name}</b> <span className="text-xs text-slate-400">({u.role})</span></span>
                          <span className={`font-bold ${u.done ? "text-emerald-700" : "text-blue-700"}`}>
                            {fmtMinutes(u.minutes)} {u.done ? "✓ أنهى" : "· مازال يعمل"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ticket.urgent_result && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-bold text-slate-400">نتيجة الدعم</p>
                    <p className="mt-1 text-sm leading-relaxed">{ticket.urgent_result}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* المتخصصون: باك / فرونت / UX — كل تخصص شخص وتقدير وعدّاد مستقل */}
          {!ticket.is_urgent && (specialists.length > 0 || canAssignDev) && (
            <Card title="🧩 فريق التطوير حسب التخصص">
              {specialists.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {specialists.map((sp) => {
                    const mine = sp.staff_id === actor.id;
                    const statusBadge = sp.status === "ready"
                      ? <Badge color="bg-emerald-100 text-emerald-800">✅ جاهز</Badge>
                      : sp.status === "accepted"
                        ? <Badge color="bg-blue-100 text-blue-800">🔄 يعمل عليه (العدّاد يعد)</Badge>
                        : sp.status === "declined"
                          ? <Badge color="bg-rose-100 text-rose-800">❌ رفض — أعد الإسناد</Badge>
                          : <Badge color="bg-amber-100 text-amber-800">⏳ بانتظار الرد</Badge>;
                    return (
                      <li key={sp.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">{sp.spec_label}</span>
                            <b className="mx-2">{sp.staff_name}</b>
                            {statusBadge}
                          </div>
                          <span className="text-xs text-slate-500">
                            التقدير: {(sp.est_days || sp.est_hours) ? `${sp.est_days ? `${sp.est_days} يوم` : ""}${sp.est_days && sp.est_hours ? " + " : ""}${sp.est_hours ? `${sp.est_hours} ساعة` : ""}` : "—"}
                            {sp.ready_at ? ` · جاهز منذ ${fmtDate(sp.ready_at)}` : ""}
                          </span>
                        </div>
                        {sp.decline_reason && <p className="mt-1 text-xs text-rose-600">سبب الرفض: {sp.decline_reason}</p>}

                        {canAssignDev && sp.status !== "ready" && (
                          <form action={removeSpecialistAction} className="mt-2">
                            <input type="hidden" name="code" value={ticket.code} />
                            <input type="hidden" name="specialist_id" value={sp.id} />
                            <button type="submit" className="rounded bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100">↩️ إزالة من التخصص (يُبلَّغ بالإيميل)</button>
                          </form>
                        )}

                        {mine && sp.status === "pending" && (
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <form action={respondSpecialistAction}>
                              <input type="hidden" name="code" value={ticket.code} />
                              <input type="hidden" name="specialist_id" value={sp.id} />
                              <input type="hidden" name="decision" value="accepted" />
                              <Button type="submit">✅ أقبل جزء {sp.spec_label} — يبدأ عدّادي</Button>
                            </form>
                            <form action={respondSpecialistAction} className="flex gap-2">
                              <input type="hidden" name="code" value={ticket.code} />
                              <input type="hidden" name="specialist_id" value={sp.id} />
                              <input type="hidden" name="decision" value="declined" />
                              <input name="reason" required minLength={3} placeholder="سبب الرفض (إجباري)…" className={`${inputCls} flex-1`} />
                              <Button type="submit" variant="secondary">❌ رفض</Button>
                            </form>
                          </div>
                        )}
                        {mine && sp.status === "accepted" && (
                          <form action={specialistReadyAction} className="mt-3 flex flex-wrap gap-2">
                            <input type="hidden" name="code" value={ticket.code} />
                            <input type="hidden" name="specialist_id" value={sp.id} />
                            <input name="note" placeholder="ملاحظة اختيارية عن التسليم…" className={`${inputCls} min-w-48 flex-1`} />
                            <Button type="submit">✅ جزئي جاهز — تسليم {sp.spec_label}</Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {specialists.filter((x) => x.status !== "declined").length > 0 && (
                <p className="mb-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  🎯 التاسك تتحول «جاهز للاختبار» تلقائياً عندما يعلن <b>كل</b> المتخصصين جاهزيتهم — الجاهز انتهى دوره، والمتأخر عن تقديره يصله إيميل تأخير باسمه.
                </p>
              )}
              {canAssignDev && settings.dev_specializations.filter((x) => x.active).length > 0 && specialists.length === 0 && ["new", "needs_info"].includes(ticket.dev_status) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  ⚠️ القاعدة الذهبية: التيست يستلم الطلب أولاً ويحوّله «تم التسليم للديف» — بعدها أسند المتخصصين هنا.
                </div>
              )}
              {canAssignDev && settings.dev_specializations.filter((x) => x.active).length > 0 && !(specialists.length === 0 && ["new", "needs_info"].includes(ticket.dev_status)) && (
                <form action={assignSpecialistAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <input type="hidden" name="code" value={ticket.code} />
                  <label className="text-sm"><span className="mb-1 block text-xs font-bold text-slate-600">التخصص ← المطور <span className="font-normal text-slate-400">(القائمة تتصفى حسب تخصص الموظف)</span></span>
                    <SpecDeveloperPicker
                      specs={settings.dev_specializations.filter((x) => x.active).map((x) => ({ key: x.key, label: x.label }))}
                      devs={devs.map((d) => ({ id: d.id, name: d.name, specializations: d.specializations ?? null }))}
                    />
                  </label>
                  <input name="est_days" type="number" min="0" step="0.5" placeholder="تقديره: أيام" className={`${inputCls} w-28`} />
                  <input name="est_hours" type="number" min="0" step="1" placeholder="ساعات" className={`${inputCls} w-24`} />
                  <Button type="submit">🧩 إسناد التخصص</Button>
                </form>
              )}
            </Card>
          )}

          {/* طلب مرفوض: صاحبه يعدّل ويعيد الإرسال — الدورة تبدأ من جديد */}
          {ticket.dev_status === "rejected" && !ticket.is_urgent && (ticket.created_by === actor.id || actor.role === "admin") && (
            <Card title="🔄 الطلب مرفوض — عدّل بياناته وأعد إرساله">
              <form action={resubmitTicketAction} className="space-y-3">
                <input type="hidden" name="code" value={ticket.code} />
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  عالج سبب الرفض المذكور في سجل الأحداث ثم أعد الإرسال — الدورة تبدأ من جديد (مراجعة التيستر ثم التطوير).
                </div>
                <Field label="عنوان الطلب (معدّل)">
                  <input name="title" required minLength={3} maxLength={180} defaultValue={ticket.title ?? ""} className={inputCls} />
                </Field>
                <Field label="التفاصيل (عالج فيها سبب الرفض)">
                  <textarea name="details" required minLength={10} rows={8} defaultValue={ticket.details} className={inputCls} />
                </Field>
                <Button type="submit">🔄 إعادة الإرسال — تبدأ الدورة من جديد</Button>
              </form>
            </Card>
          )}

          {/* الحقول المخصصة (منشئ الحقول من الإعدادات) */}
          {customEntries.length > 0 && (
            <Card title="🧩 حقول مخصصة">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                {customEntries.map((e) => {
                  const ref = e.isFile ? parseFileRef(e.value) : null;
                  return (
                    <div key={e.label}>
                      <dt className="text-slate-400">{e.label}</dt>
                      <dd className="font-semibold">
                        {ref && ref.url.startsWith("http") ? (
                          <a href={ref.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">📎 {ref.name} ↗</a>
                        ) : ref ? (
                          <>📎 {ref.name}</>
                        ) : (
                          e.value
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          )}

          {/* المرفقات */}
          <Card title={`المرفقات (${attachments.length})`}>
            {attachments.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    📎 <a className="text-blue-700 hover:underline" href={`/api/attachments/${a.id}`}>{a.file_name}</a>
                    <span className="text-xs text-slate-400">({Math.round(a.size_bytes / 1024)} ك.ب — {a.uploaded_by})</span>
                  </li>
                ))}
              </ul>
            )}
            {canUpload ? (
              <AttachmentUpload code={ticket.code} />
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">🔒 رفع المرفقات بعد الإنشاء متاح فقط للأدمن أو التيستر/المطور المسند على الطلب.</p>
            )}
          </Card>

          {(perms.manage_meetings || perms.join_meetings) && (
            <Card>
              <TeamsMeetings
                code={ticket.code}
                defaultSubject={`اجتماع ${ticket.code} — ${ticket.title || ticket.client_name}`}
                configured={teamsConfigStatus().ready}
                canManage={perms.manage_meetings}
                canJoin={perms.join_meetings}
                staff={staffAll.map((s) => ({ id: s.id, name: s.name, email: s.email, selected: [ticket.created_by, ticket.tester_id, ticket.developer_id].includes(s.id) }))}
                meetings={meetings.map((m) => ({ id: m.id, subject: m.subject, starts_at: m.starts_at, ends_at: m.ends_at, join_url: m.join_url, status: m.status }))}
              />
            </Card>
          )}

          {/* سير العمل والإجراءات */}
          {hasActions && (
            <Card title="سير العمل والإجراءات">
              <div className="space-y-6">
                {needsAssignmentResponse && (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                    <h3 className="font-extrabold text-amber-900">قرار التكليف مطلوب — {isAssignedTester ? "مسؤول الاختبار" : "المطور"}</h3>
                    <p className="mt-1 text-sm text-amber-800">وافق لبدء العمل، أو ارفض مع كتابة سبب واضح. القرار والسبب يُرسلان لمقدم الطلب والإدارة ويُسجلان بالكامل.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <form action={respondToAssignmentAction}>
                        <input type="hidden" name="code" value={ticket.code} />
                        <input type="hidden" name="decision" value="accepted" />
                        <Button type="submit">✅ أوافق على التكليف</Button>
                      </form>
                      <form action={respondToAssignmentAction} className="space-y-2">
                        <input type="hidden" name="code" value={ticket.code} />
                        <input type="hidden" name="decision" value="declined" />
                        <input name="reason" required minLength={3} className={inputCls} placeholder="سبب رفض التكليف (إجباري)…" />
                        <Button type="submit" variant="secondary">❌ رفض التكليف وإرسال السبب</Button>
                      </form>
                    </div>
                  </div>
                )}

                {canAssignTester && (
                  <form action={assignTesterAction} className="space-y-2 rounded-xl border border-purple-100 bg-purple-50/40 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <Field label="1) إسناد / إعادة إسناد فريق الاختبار (التيست)" hint="التيست يستلم الطلب أولاً ثم يسلّمه للمطوّر — يُرسل إيميل للتيست بالتكليف">
                      <select name="tester_id" required defaultValue={ticket.tester_id ?? ""} className={selectCls}>
                        <option value="" disabled>اختر التيست…</option>
                        {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                    <Button type="submit">إسناد التيست 🧪</Button>
                  </form>
                )}

                {/* إسناد المطوّر المباشر: للدعم الفوري فقط — الطلبات العادية توحّدت على كارت التخصصات */}
                {canAssignDev && ticket.is_urgent && (
                  <form action={assignDeveloperAction} className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <Field label="إسناد / إعادة إسناد المطوّر" hint="دعم فوري — يُرسل إيميل التكليف فوراً">
                      <select name="developer_id" required defaultValue={ticket.developer_id ?? ""} className={selectCls}>
                        <option value="" disabled>اختر المطور…</option>
                        {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Button type="submit">إسناد المطور 👨‍💻</Button>
                  </form>
                )}

                {canEstimate && (
                  <form action={setEstimationAction} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <span className="block text-sm font-bold text-slate-700">⏱️ التقدير — كل طرف يضع تقديره والإجمالي يُجمع تلقائياً</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 text-sm font-semibold text-blue-700">👨‍💻 الديف:</span>
                      <input name="dev_est_days" type="number" min="0" step="0.5" placeholder="أيام" className={`${inputCls} w-24`} defaultValue={ticket.dev_est_days ?? ""} />
                      <input name="dev_est_hours" type="number" min="0" step="1" placeholder="ساعات" className={`${inputCls} w-24`} defaultValue={ticket.dev_est_hours ?? ""} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 text-sm font-semibold text-purple-700">🧪 التيست:</span>
                      <input name="test_est_days" type="number" min="0" step="0.5" placeholder="أيام" className={`${inputCls} w-24`} defaultValue={ticket.test_est_days ?? ""} />
                      <input name="test_est_hours" type="number" min="0" step="1" placeholder="ساعات" className={`${inputCls} w-24`} defaultValue={ticket.test_est_hours ?? ""} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button type="submit" variant="secondary">حفظ التقدير</Button>
                      <span className="text-xs text-slate-500">الإجمالي المعروض في الطلب والاستعلام والإيميلات = مجموع الاثنين (كل 8 ساعات = يوم)</span>
                    </div>
                  </form>
                )}

                {canUpdateUrgentProgress && !myPartDone && (
                  <UrgentProgressForm code={ticket.code} roleLabel={isAssignedTester ? "التيست" : isAssignedDev ? "المطوّر" : "مدير النظام (إجراء إداري يُسجل باسمك)"} />
                )}

                {!!ticket.is_urgent && !urgentEnded && myPartDone && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                    ✅ أنهيت جزءك في هذا الدعم الفوري — الإقفال الرسمي بانتظار إنهاء {isAssignedTester ? "الديف" : "التيست"}. لا يمكنك الرفض أو الاعتذار بعد الإنهاء.
                  </div>
                )}

                {!!ticket.is_urgent && !urgentEnded && !myPartDone && perms.assignment_decision && (isAssignedTester || isAssignedDev) && myAssignmentStatus === "accepted" && (
                  <form action={declineAssignmentAction} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <Field label={`الاعتذار عن الدعم الفوري (أنت ${isAssignedTester ? "التيست" : "المطوّر"} المسند)`} hint="خاص بالدعم الفوري فقط — السبب إجباري، ويصل إيميل لمقدم الطلب والإدارة ثم تعود المهمة لإعادة الإسناد">
                      <input name="reason" required minLength={3} placeholder="مثال: غير متاح حاليًا بسبب عطل آخر عاجل…" className={inputCls} />
                    </Field>
                    <Button type="submit" variant="secondary">🙅 الاعتذار عن الدعم الفوري</Button>
                  </form>
                )}

                {transitions.length > 0 && (
                  <div className="border-t border-slate-100 pt-4">
                    <StatusChangeForm code={ticket.code} transitions={transitions} noteLabel={noteLabel} />
                  </div>
                )}

                {canNote && <form action={addNoteAction} className="space-y-2 border-t border-slate-100 pt-4">
                  <input type="hidden" name="code" value={ticket.code} />
                  <Field label={`${noteLabel} / رد`} hint="مقدم الطلب والتيست والمطور يكتبون ما يريدون هنا؛ تُرسل الملاحظة بالإيميل لكل المسؤولين عن الطلب ما عدا كاتبها، مع التاريخ والتوقيت">
                    <textarea name="note" required minLength={2} rows={3} placeholder="اكتب ملاحظتك أو طلبك أو ردك بالتفصيل…" className={inputCls} />
                  </Field>
                  <Button type="submit" variant="secondary">إرسال الملاحظة للمسؤولين 💬</Button>
                </form>}
              </div>
            </Card>
          )}

          {!hasActions && (
            <Card>
              <p className="text-sm text-slate-500">
                🔒 أنت في وضع القراءة فقط. لتحديث حالة هذه التذكرة استخدم{" "}
                <Link className="font-bold text-blue-700 hover:underline" href={`/update-form?code=${ticket.code}`}>نموذج التحديث العام</Link>{" "}
                (معبأ مسبقاً بكود الطلب).
              </p>
            </Card>
          )}
        </div>

        {/* التايم لاين */}
        <div className="space-y-5">
          <Card title={`سجل الأحداث (${events.length})`}>
            <ul className="space-y-4">{events.map((e) => <EventLine key={e.id} e={e} />)}</ul>
          </Card>

          {perms.view_audit && auditEntries.length > 0 && (
            <Card title={`🔐 سجل التدقيق (${auditEntries.length})`}>
              <ul className="space-y-2 text-xs">
                {auditEntries.slice(0, 30).map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <div className="font-bold text-slate-700">{a.action}</div>
                    <div className="text-slate-500">{a.actor_label || "النظام"}</div>
                    <div className="text-slate-400">{fmtDate(a.created_at)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {perms.emails && emailLog.rows.length > 0 && (
            <Card title="آخر البريد المرسل لهذه التذكرة">
              <ul className="space-y-2 text-xs">
                {emailLog.rows.map((m) => (
                  <li key={m.id} className="rounded-lg bg-slate-50 p-2">
                    <div className="font-bold">{m.subject}</div>
                    <div className="text-slate-500">إلى: {m.to_addr}{m.cc_addr ? ` — CC: ${m.cc_addr}` : ""}</div>
                    <div className="text-slate-400">{m.status === "sent" ? "✅ أُرسل" : m.status === "logged" ? "📝 مسجل (وضع تجريبي)" : m.status} — {fmtDate(m.created_at)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
