import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRepo } from "@/lib/db";
import { requireStaff, permissionsForStaff } from "@/lib/auth";
import {
  addNoteAction, assignDeveloperAction, assignTesterAction,
  declineAssignmentAction, respondToAssignmentAction, setEstimationAction,
} from "@/app/actions/tickets";
import { Badge, Button, Card, Field, Msg, selectCls, inputCls } from "@/components/ui";
import { allowedTransitions, ALL_STATUSES, ASSIGNMENT_STATUS_LABELS, REQUEST_TYPE_LABELS, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS, urgentStatusInfo } from "@/lib/labels";
import { fmtDate, parseFileRef } from "@/lib/util";
import { AttachmentUpload } from "@/components/attachment-upload";
import { StatusChangeForm } from "@/components/status-change-form";
import { UrgentProgressForm } from "@/components/urgent-progress-form";
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

  // نطاق الرؤية ديناميكي من الإعدادات + الاستثناء الفردي
  if (!perms.view_all_tickets) {
    const ownCreated = perms.view_own_created && ticket.created_by === actor.id;
    const assigned = perms.view_assigned_tickets && (ticket.tester_id === actor.id || ticket.developer_id === actor.id);
    if (!ownCreated && !assigned) redirect("/dashboard?denied=ticket");
  }

  const settings = await repo.settingsGet();
  const customEntries = settings.custom_fields
    .filter((f) => ticket.custom_data?.[f.key])
    .map((f) => ({ label: f.label, value: String(ticket.custom_data![f.key]), isFile: f.type === "file" }));

  const staffAll = await repo.staffList(true);
  const testers = staffAll.filter((s) => s.role === "tester");
  const devs = staffAll.filter((s) => s.role === "developer");

  const [events, attachments, emailLog, auditEntries, meetings] = await Promise.all([
    repo.eventList(ticket.id),
    repo.attachmentList(ticket.id),
    perms.emails ? repo.emailLogList(1, 10, ticket.id) : Promise.resolve({ rows: [], total: 0 }),
    perms.view_audit ? repo.auditList("ticket", ticket.id) : Promise.resolve([]),
    (perms.manage_meetings || perms.join_meetings) ? repo.meetingList(ticket.id) : Promise.resolve([]),
  ]);

  const isAssignedTester = ticket.tester_id === actor.id;
  const isAssignedDev = ticket.developer_id === actor.id;
  const myAssignmentStatus = isAssignedTester
    ? (ticket.tester_assignment_status ?? "unassigned")
    : isAssignedDev ? (ticket.developer_assignment_status ?? "unassigned") : null;
  const needsAssignmentResponse = perms.assignment_decision && (isAssignedTester || isAssignedDev) && ["pending", "unassigned", "reassigned"].includes(myAssignmentStatus ?? "");
  const canAssignTester = perms.assign_tester;
  const canAssignDev = perms.assign_developer;
  const canEstimate = perms.set_estimation;
  const canUpload = perms.upload_attachment && (perms.view_all_tickets || isAssignedTester || isAssignedDev);
  const acceptedForRole = actor.role === "tester" ? ticket.tester_assignment_status === "accepted" : actor.role === "developer" ? ticket.developer_assignment_status === "accepted" : true;
  // الدعم الفوري «طلب جانبي»: لا حالة تطوير له إطلاقاً — حالته من دورة حياته فقط (قبول/اعتذار/جاري/انتهى)
  const transitions = ticket.is_urgent || !perms.change_status || !acceptedForRole
    ? []
    : actor.role === "support" ? ALL_STATUSES.filter((s) => s !== ticket.dev_status) : allowedTransitions(actor.role, ticket.dev_status);
  const noteLabel = actor.role === "developer" ? "ملاحظات الديف" : actor.role === "tester" ? "ملاحظات التيست" : "ملاحظة مدخل البيانات";
  const canNote = perms.add_note && (perms.view_all_tickets || ticket.created_by === actor.id || isAssignedTester || isAssignedDev);
  // الدعم الفوري «طلب جانبي»: المكلَّف الذي قَبِل يحدّث موقفه (مازلت أعمل / انتهيت) — والأدمن يقدر أيضاً (يُسجل باسمه)
  const urgentEnded = !!ticket.urgent_ended_at;
  const canUpdateUrgentProgress = !!ticket.is_urgent && !urgentEnded && perms.update_urgent_progress
    && (actor.role === "admin" || ((isAssignedTester || isAssignedDev) && myAssignmentStatus === "accepted"));
  const hasActions = canAssignTester || canAssignDev || canEstimate || canNote || isAssignedTester || isAssignedDev || transitions.length > 0 || canUpdateUrgentProgress;

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
              <div><dt className="text-slate-400">المطور</dt><dd className="font-semibold">{ticket.developer_name ?? "غير معيّن"}<span className="block text-xs text-slate-400">{ASSIGNMENT_STATUS_LABELS[ticket.developer_assignment_status ?? "unassigned"]}</span></dd></div>
              <div>
                <dt className="text-slate-400">⏱️ تقدير التنفيذ</dt>
                <dd className="font-semibold">
                  {(ticket.est_days || ticket.est_hours)
                    ? `${ticket.est_days ? `${ticket.est_days} يوم` : ""}${ticket.est_days && ticket.est_hours ? " + " : ""}${ticket.est_hours ? `${ticket.est_hours} ساعة` : ""}`
                    : "—"}
                </dd>
              </div>
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
                {ticket.urgent_result && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-bold text-slate-400">نتيجة الدعم</p>
                    <p className="mt-1 text-sm leading-relaxed">{ticket.urgent_result}</p>
                  </div>
                )}
              </div>
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
                    <div className="flex flex-wrap gap-2">
                      <input name="est_days" type="number" min="0" step="0.5" placeholder="التقدير: أيام" className={`${inputCls} w-32`} defaultValue={ticket.est_days ?? ""} />
                      <input name="est_hours" type="number" min="0" step="1" placeholder="أو ساعات" className={`${inputCls} w-28`} defaultValue={ticket.est_hours ?? ""} />
                    </div>
                    <Button type="submit">إسناد التيست 🧪</Button>
                  </form>
                )}

                {canAssignDev && (
                  ticket.tester_id ? (
                    <form action={assignDeveloperAction} className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                      <input type="hidden" name="code" value={ticket.code} />
                      <Field label="2) إسناد / إعادة إسناد المطوّر" hint={`يُرسل إيميل للمطور + نسخة لمدخل البيانات — ${canAssignTester ? "لديك صلاحية إسناد المطور" : "سلّمها للمطور المناسب"}`}>
                        <select name="developer_id" required defaultValue={ticket.developer_id ?? ""} className={selectCls}>
                          <option value="" disabled>اختر المطور…</option>
                          {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <input name="est_days" type="number" min="0" step="0.5" placeholder="التقدير: أيام" className={`${inputCls} w-32`} defaultValue={ticket.est_days ?? ""} />
                        <input name="est_hours" type="number" min="0" step="1" placeholder="أو ساعات" className={`${inputCls} w-28`} defaultValue={ticket.est_hours ?? ""} />
                      </div>
                      <Button type="submit">إسناد المطور 👨‍💻</Button>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      ⚠️ لا يُسنَد المطوّر إلا بعد تعيين فريق الاختبار (التيست) أولاً — حدّد التيست ثم سلّمها للمطور.
                    </div>
                  )
                )}

                {canEstimate && (
                  <form action={setEstimationAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <span className="text-sm font-semibold text-slate-700">⏱️ تعديل التقدير:</span>
                    <input name="est_days" type="number" min="0" step="0.5" placeholder="أيام" className={`${inputCls} w-24`} defaultValue={ticket.est_days ?? ""} />
                    <input name="est_hours" type="number" min="0" step="1" placeholder="ساعات" className={`${inputCls} w-24`} defaultValue={ticket.est_hours ?? ""} />
                    <Button type="submit" variant="secondary">حفظ التقدير</Button>
                  </form>
                )}

                {canUpdateUrgentProgress && (
                  <UrgentProgressForm code={ticket.code} roleLabel={isAssignedTester ? "التيست" : isAssignedDev ? "المطوّر" : "مدير النظام (إجراء إداري يُسجل باسمك)"} />
                )}

                {!!ticket.is_urgent && !urgentEnded && perms.assignment_decision && (isAssignedTester || isAssignedDev) && myAssignmentStatus === "accepted" && (
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
