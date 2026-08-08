import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRepo } from "@/lib/db";
import { requireStaff, canManage, isAdmin } from "@/lib/auth";
import {
  addNoteAction, assignDeveloperAction, assignTesterAction,
  declineAssignmentAction, setEstimationAction,
} from "@/app/actions/tickets";
import { Badge, Button, Card, Field, Msg, selectCls, inputCls } from "@/components/ui";
import { allowedTransitions, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { fmtDate, parseFileRef } from "@/lib/util";
import { AttachmentUpload } from "@/components/attachment-upload";
import { StatusChangeForm } from "@/components/status-change-form";
import type { DevStatus, TicketEvent } from "@/lib/types";

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
  const ticket = await repo.ticketByCode(code);
  if (!ticket) notFound();

  // عزل الرؤية: الديف يرى تذاكره فقط — ومدخل البيانات يرى ما يخصّه أو الجديد غير المُسنَد
  if (actor.role === "developer" && ticket.developer_id !== actor.id) {
    redirect("/dashboard?denied=ticket");
  }
  if (actor.role === "support") {
    const involved = ticket.created_by === actor.id || ticket.developer_id === actor.id || ticket.tester_id === actor.id;
    const unassigned = !ticket.tester_id && !ticket.developer_id;
    if (!involved && !unassigned) redirect("/dashboard?denied=ticket");
  }

  const settings = await repo.settingsGet();
  const customEntries = settings.custom_fields
    .filter((f) => ticket.custom_data?.[f.key])
    .map((f) => ({ label: f.label, value: String(ticket.custom_data![f.key]), isFile: f.type === "file" }));

  const staffAll = await repo.staffList(true);
  const testers = staffAll.filter((s) => s.role === "tester");
  const devs = staffAll.filter((s) => s.role === "developer");

  const [events, attachments, emailLog] = await Promise.all([
    repo.eventList(ticket.id),
    repo.attachmentList(ticket.id),
    isAdmin(actor) ? repo.emailLogList(1, 10, ticket.id) : Promise.resolve({ rows: [], total: 0 }),
  ]);

  const manage = canManage(actor);
  const isAssignedTester = ticket.tester_id === actor.id;
  const isAssignedDev = ticket.developer_id === actor.id;
  const canAssignDev = manage || (actor.role === "tester" && isAssignedTester);
  const transitions = allowedTransitions(actor.role, ticket.dev_status);
  const noteLabel = actor.role === "developer" ? "ملاحظات الديف" : actor.role === "tester" ? "ملاحظات التيست" : "ملاحظة";
  const hasActions = manage || isAssignedTester || isAssignedDev || transitions.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold" dir="ltr">{ticket.code}</h1>
          <Badge color={STATUS_COLORS[ticket.dev_status]}>{STATUS_LABELS[ticket.dev_status]}</Badge>
          {!!ticket.is_urgent && <Badge color="bg-red-600 text-white">🚨 دعم فوري</Badge>}
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
              <div><dt className="text-slate-400">تواصل العميل</dt><dd>{ticket.client_contact || "—"}</dd></div>
              <div><dt className="text-slate-400">مدخل البيانات</dt><dd>{ticket.created_by_name}</dd></div>
              <div><dt className="text-slate-400">المختبِر (التيست)</dt><dd className="font-semibold text-purple-700">{ticket.tester_name ?? "لم يُحدد بعد"}</dd></div>
              <div><dt className="text-slate-400">المطور</dt><dd className="font-semibold">{ticket.developer_name ?? "غير معيّن"}</dd></div>
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
            <AttachmentUpload code={ticket.code} />
          </Card>

          {/* سير العمل والإجراءات */}
          {hasActions && (
            <Card title="سير العمل والإجراءات">
              <div className="space-y-6">
                {manage && (
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
                      <Field label="2) إسناد / إعادة إسناد المطوّر" hint={`يُرسل إيميل للمطور + نسخة لمدخل البيانات — ${manage ? "يمكن للتيست المسند أيضاً تسليمها للمطور" : "أنت التيست المسند — سلّمها للمطور المناسب"}`}>
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

                {manage && (
                  <form action={setEstimationAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <span className="text-sm font-semibold text-slate-700">⏱️ تعديل التقدير:</span>
                    <input name="est_days" type="number" min="0" step="0.5" placeholder="أيام" className={`${inputCls} w-24`} defaultValue={ticket.est_days ?? ""} />
                    <input name="est_hours" type="number" min="0" step="1" placeholder="ساعات" className={`${inputCls} w-24`} defaultValue={ticket.est_hours ?? ""} />
                    <Button type="submit" variant="secondary">حفظ التقدير</Button>
                  </form>
                )}

                {(isAssignedTester || isAssignedDev) && (
                  <form action={declineAssignmentAction} className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                    <input type="hidden" name="code" value={ticket.code} />
                    <Field label={`الاعتذار عن المهمة (أنت ${isAssignedTester ? "التيست" : "المطوّر"} المسند)`} hint="السبب إجباري — يصل إيميل لمدخل البيانات والإدارة، وتعود المهمة لغير المُسندة">
                      <input name="reason" required minLength={3} placeholder="مثال: مش متاح حالياً — عندي تسليم عاجل آخر…" className={inputCls} />
                    </Field>
                    <Button type="submit" variant="secondary">🙅 اعتذار عن المهمة</Button>
                  </form>
                )}

                {transitions.length > 0 && (
                  <div className="border-t border-slate-100 pt-4">
                    <StatusChangeForm code={ticket.code} transitions={transitions} noteLabel={noteLabel} />
                  </div>
                )}

                <form action={addNoteAction} className="space-y-2 border-t border-slate-100 pt-4">
                  <input type="hidden" name="code" value={ticket.code} />
                  <Field label={`${noteLabel} / رد`} hint="تُرسل بالإيميل لكل أطراف الطلب (مدخل البيانات ↔ التيست ↔ الديف) مع توقيت الإرسال">
                    <textarea name="note" required minLength={2} rows={2} placeholder="اكتب ملاحظتك أو ردّك هنا…" className={inputCls} />
                  </Field>
                  <Button type="submit" variant="secondary">إرسال للكل 💬</Button>
                </form>
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

          {isAdmin(actor) && emailLog.rows.length > 0 && (
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
