"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertRuleAction } from "@/app/actions/rules";
import type { Action, AutomationRule, Condition, Recipient, Role, TriggerType } from "@/lib/types";
import { ALL_STATUSES, ROLE_LABELS, STATUS_LABELS } from "@/lib/labels";

const REF_OPTIONS = [
  { v: "creator", l: "مدخل البيانات (مقدم الطلب)" },
  { v: "tester", l: "التيستر المعيّن (ديناميكي)" },
  { v: "developer", l: "المطور المعيّن (ديناميكي)" },
  { v: "ticket_parties", l: "كل المسؤولين عن الطلب" },
  { v: "creator_manager", l: "مدير مدخل البيانات" },
  { v: "tester_manager", l: "مدير التيستر" },
  { v: "developer_manager", l: "مدير المطور" },
  { v: "ticket_managers", l: "مديرو كل أطراف الطلب" },
  { v: "client", l: "بريد مقدم الطلب المسجل بالتذكرة" },
  { v: "previous_assignee", l: "المكلَّف السابق (الذي سُحب منه التكليف)" },
  { v: "event_target", l: "الشخص المعني بالحدث (المتخصص المسند/المتأخر)" },
] as const;

type RecState = { refs: string[]; roles: string[]; staff: string[]; emails: string };
const emptyRec = (): RecState => ({ refs: [], roles: [], staff: [], emails: "" });

function recToState(recs: Recipient[]): RecState {
  const s = emptyRec();
  for (const r of recs) {
    if (r.kind === "ref") s.refs.push(r.ref);
    else if (r.kind === "role") s.roles.push(r.role);
    else if (r.kind === "staff") s.staff.push(r.staff_id);
    else s.emails = s.emails ? `${s.emails}, ${r.email}` : r.email;
  }
  return s;
}

function stateToRec(s: RecState): Recipient[] {
  const out: Recipient[] = [];
  s.refs.forEach((r) => out.push({ kind: "ref", ref: r as never }));
  s.roles.forEach((r) => out.push({ kind: "role", role: r as Role }));
  s.staff.forEach((id) => out.push({ kind: "staff", staff_id: id }));
  s.emails.split(",").map((e) => e.trim()).filter(Boolean).forEach((e) => out.push({ kind: "email", email: e }));
  return out;
}

type ActionState =
  | { type: "send_email"; to: RecState; cc: RecState; template_id: string }
  | { type: "notify"; to: RecState; message: string }
  | { type: "update_field"; field: string; value: string };

function actionToState(a: Action): ActionState {
  if (a.type === "send_email") return { type: "send_email", to: recToState(a.to), cc: recToState(a.cc), template_id: a.template_id };
  if (a.type === "notify") return { type: "notify", to: recToState(a.to), message: a.message };
  return { type: "update_field", field: a.field, value: a.value };
}

function stateToAction(s: ActionState): Action {
  if (s.type === "send_email") return { type: "send_email", to: stateToRec(s.to), cc: stateToRec(s.cc), template_id: s.template_id };
  if (s.type === "notify") return { type: "notify", to: stateToRec(s.to), message: s.message };
  return { type: "update_field", field: "dev_status", value: s.value };
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function RecipientsPicker({ title, value, onChange, staff }: {
  title: string; value: RecState; onChange: (v: RecState) => void;
  staff: { id: string; name: string; role: Role }[];
}) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button type="button" key={label} onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-blue-400"}`}>
      {label}
    </button>
  );
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-xs font-bold text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {REF_OPTIONS.map((o) => chip(o.l, value.refs.includes(o.v), () => onChange({ ...value, refs: toggle(value.refs, o.v) })))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["admin", "support", "developer", "tester"] as Role[]).map((r) =>
          chip(`كل ${ROLE_LABELS[r]}`, value.roles.includes(r), () => onChange({ ...value, roles: toggle(value.roles, r) })))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {staff.map((s) => chip(`👤 ${s.name}`, value.staff.includes(s.id), () => onChange({ ...value, staff: toggle(value.staff, s.id) })))}
      </div>
      <input
        className={`${inputCls} mt-2`} placeholder="إيميلات إضافية (CC ثابتة) مفصولة بفاصلة…"
        value={value.emails} onChange={(e) => onChange({ ...value, emails: e.target.value })}
      />
    </div>
  );
}

export function RuleBuilder({ initial, templates, staff }: {
  initial: AutomationRule | null;
  templates: { id: string; name: string }[];
  staff: { id: string; name: string; role: Role }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [trigger, setTrigger] = useState<TriggerType>(initial?.trigger_type ?? "ticket.created");
  const [triggerField, setTriggerField] = useState(initial?.trigger_field ?? "dev_status");
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<ActionState[]>(initial?.actions.map(actionToState) ?? [
    { type: "send_email", to: { ...emptyRec(), refs: ["creator_manager"] }, cc: emptyRec(), template_id: templates[0]?.id ?? "" },
  ]);
  const [enabled, setEnabled] = useState(initial ? !!initial.enabled : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name.trim()) { setError("اكتب اسم القاعدة"); return; }
    if (!actions.length) { setError("أضف إجراءً واحداً على الأقل"); return; }
    for (const a of actions) {
      if (a.type === "send_email" && !a.template_id) { setError("اختر قالب البريد لكل إجراء إيميل"); return; }
      if (a.type === "notify" && !a.message.trim()) { setError("اكتب نص الإشعار"); return; }
    }
    setBusy(true);
    const res = await upsertRuleAction({
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(),
      trigger_type: trigger,
      trigger_field: trigger === "field.changed" ? triggerField : null,
      conditions,
      actions: actions.map(stateToAction),
      enabled: enabled ? 1 : 0,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "خطأ"); return; }
    router.push("/automation");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* ① متى */}
      <section className="rounded-xl border-2 border-blue-200 bg-white p-5">
        <p className="mb-3 font-extrabold text-blue-800">① متى؟ (المشغّل)</p>
        <div className="grid gap-2">
          {([
            { v: "ticket.created", l: "🆕 عند إنشاء طلب جديد" },
            { v: "tester.assigned", l: "🧪 عند تكليف التيستر (إيميل التكليف بأزرار القبول/الرفض)" },
            { v: "ticket.assigned", l: "👤 عند تعيين/إعادة تعيين مطور على تذكرة" },
            { v: "tester.accepted", l: "✅ عند قبول التيستر للتكليف" },
            { v: "tester.declined", l: "❌ عند رفض التيستر للتكليف (بسبب)" },
            { v: "developer.accepted", l: "✅ عند قبول المطور للتكليف" },
            { v: "developer.declined", l: "❌ عند رفض المطور للتكليف (بسبب)" },
            { v: "assignment.revoked", l: "↩️ عند سحب التكليف من شخص (إعادة إسناد)" },
            { v: "spec.assigned", l: "🧩 عند تكليف متخصص (باك/فرونت/UX)" },
            { v: "spec.accepted", l: "✅ عند قبول المتخصص لجزئه" },
            { v: "spec.declined", l: "❌ عند رفض المتخصص لجزئه (بسبب)" },
            { v: "spec.ready", l: "🏁 عند إعلان متخصص جاهزية جزئه" },
            { v: "spec.overdue", l: "🔴 متخصص تجاوز تقديره ولم يعلن الجاهزية" },
            { v: "urgent.withdrawal", l: "🙅 عند الاعتذار عن الدعم الفوري بعد القبول" },
            { v: "urgent.progress", l: "🚨 عند تحديث موقف الدعم الفوري (مازلت أعمل / انتهيت)" },
            { v: "ticket.rejected", l: "❌ عند رفض الطلب نهائياً (بسبب)" },
            { v: "test.failed", l: "🧪 عند فشل الاختبار (يعود للمطور بالسبب)" },
            { v: "ticket.delivered", l: "📦 عند الإصلاح أو التسليم والإغلاق" },
            { v: "note.added", l: "💬 عند إضافة ملاحظة / رد جديد" },
            { v: "est.dev.halfway", l: "⏳ منتصف مهلة تقدير الديف (التوقيت من ⏰ الإعدادات)" },
            { v: "est.dev.before_end", l: "⚠️ قرب نهاية مهلة تقدير الديف" },
            { v: "est.dev.overdue", l: "🔴 تجاوز تقدير الديف (التاسك متأخرة)" },
            { v: "est.test.halfway", l: "⏳ منتصف مهلة تقدير التيست" },
            { v: "est.test.before_end", l: "⚠️ قرب نهاية مهلة تقدير التيست" },
            { v: "est.test.overdue", l: "🔴 تجاوز تقدير التيست (التاسك متأخرة)" },
            { v: "field.changed", l: "🔄 عند تغيير حقل معيّن" },
            { v: "schedule.stale", l: "⏰ مجدول: تذكير بالتذاكر المتوقفة (يفحص كل دقيقة ويرسل مرة واحدة يومياً)" },
          ] as { v: TriggerType; l: string }[]).map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="trigger" checked={trigger === o.v} onChange={() => setTrigger(o.v)} />
              {o.l}
            </label>
          ))}
        </div>
        {trigger === "field.changed" && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span>الحقل:</span>
            <select className={inputCls} value={triggerField} onChange={(e) => setTriggerField(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="dev_status">حالة التطوير</option>
              <option value="overall_status">الحالة العامة</option>
              <option value="tester_assignment_status">قرار / حالة التيستر</option>
              <option value="developer_assignment_status">قرار / حالة المطور</option>
              <option value="tester_id">التيستر المعيّن</option>
              <option value="developer_id">المطور المعيّن</option>
              <option value="priority">الأولوية</option>
            </select>
          </div>
        )}
        {trigger === "schedule.stale" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            مدة «التوقف» تُضبط من صفحة الإعدادات (افتراضياً 24 ساعة). الإرسال مضمون مرة واحدة يومياً لكل تذكرة بفضل مفاتيح عدم التكرار.
          </p>
        )}
      </section>

      {/* ② شروط */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-3 font-extrabold text-slate-700">② شروط ؟ (اختياري)</p>
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select className={inputCls} style={{ maxWidth: 180 }} value={c.field}
                onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                <option value="dev_status">حالة التطوير</option>
                <option value="overall_status">الحالة العامة</option>
                <option value="request_type">نوع الطلب</option>
                <option value="ticket_kind">عادي / دعم فوري</option>
                <option value="priority">الأولوية</option>
                <option value="tester_assignment_status">حالة تكليف التيستر</option>
                <option value="developer_assignment_status">حالة تكليف المطور</option>
                <option value="tester_id">التيستر المعيّن</option>
                <option value="developer_id">المطور المعيّن</option>
                <option value="created_by">مدخل البيانات</option>
                <option value="source">مصدر الطلب</option>
              </select>
              <select className={inputCls} style={{ maxWidth: 120 }} value={c.op}
                onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"] } : x)))}>
                <option value="eq">يساوي</option>
                <option value="neq">لا يساوي</option>
                <option value="in">ضمن قائمة</option>
              </select>
              {c.field === "dev_status" && c.op !== "in" ? (
                <select className={inputCls} style={{ maxWidth: 180 }} value={c.value}
                  onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              ) : (
                <input className={inputCls} style={{ maxWidth: 260 }} value={c.value}
                  placeholder={c.op === "in" ? "new,in_progress,…" : "القيمة"}
                  onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              )}
              <button type="button" className="text-rose-600" onClick={() => setConditions(conditions.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-blue-700" onClick={() => setConditions([...conditions, { field: "dev_status", op: "eq", value: "new" }])}>
            + إضافة شرط
          </button>
        </div>
      </section>

      {/* ③ ماذا */}
      <section className="rounded-xl border-2 border-green-200 bg-white p-5">
        <p className="mb-3 font-extrabold text-green-800">③ ماذا يحدث؟ (الإجراءات)</p>
        <div className="space-y-4">
          {actions.map((a, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">الإجراء {i + 1} من {actions.length}</span>
                <select className={inputCls} style={{ maxWidth: 240 }} value={a.type}
                  onChange={(e) => {
                    const t = e.target.value;
                    setActions(actions.map((x, j) => {
                      if (j !== i) return x;
                      if (t === "send_email") return { type: "send_email", to: emptyRec(), cc: emptyRec(), template_id: templates[0]?.id ?? "" };
                      if (t === "notify") return { type: "notify", to: emptyRec(), message: "تحديث على التذكرة {{code}}" };
                      return { type: "update_field", field: "dev_status", value: "in_progress" };
                    }));
                  }}>
                  <option value="send_email">📧 إرسال إيميل</option>
                  <option value="notify">🔔 إشعار داخلي</option>
                  <option value="update_field">✏️ تحديث حالة التذكرة</option>
                </select>
                <button type="button" className="text-rose-600" onClick={() => setActions(actions.filter((_, j) => j !== i))}>✕ حذف</button>
              </div>

              {a.type === "send_email" && (
                <>
                  <div className="text-sm">
                    <span className="mb-1 block text-xs font-bold text-slate-500">القالب:</span>
                    <select className={inputCls} value={a.template_id}
                      onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, template_id: e.target.value } : x)))}>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <RecipientsPicker title="إلى (To):" value={a.to} staff={staff}
                    onChange={(v) => setActions(actions.map((x, j) => (j === i ? { ...x, to: v } : x)))} />
                  <RecipientsPicker title="نسخة كربونية (CC):" value={a.cc} staff={staff}
                    onChange={(v) => setActions(actions.map((x, j) => (j === i ? { ...x, cc: v } : x)))} />
                </>
              )}

              {a.type === "notify" && (
                <>
                  <input className={inputCls} value={a.message} placeholder="نص الإشعار — يدعم متغيرات مثل {{code}} و {{client_name}}"
                    onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))} />
                  <RecipientsPicker title="يصل إلى:" value={a.to} staff={staff}
                    onChange={(v) => setActions(actions.map((x, j) => (j === i ? { ...x, to: v } : x)))} />
                </>
              )}

              {a.type === "update_field" && (
                <div className="flex items-center gap-2 text-sm">
                  <span>اجعل «حالة التطوير» =</span>
                  <select className={inputCls} style={{ maxWidth: 200 }} value={a.value}
                    onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-green-700"
            onClick={() => setActions([...actions, { type: "send_email", to: emptyRec(), cc: emptyRec(), template_id: templates[0]?.id ?? "" }])}>
            + إضافة إجراء آخر
          </button>
        </div>
      </section>

      {/* حفظ */}
      <section className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <input className={`${inputCls} max-w-xs`} value={name} placeholder="اسم القاعدة (مثال: إبلاغ المدير عند الإصلاح)" onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> مفعّلة
        </label>
        <div className="flex-1" />
        <button disabled={busy} onClick={save} className="rounded-lg bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "جارٍ الحفظ…" : "حفظ القاعدة ✓"}
        </button>
      </section>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
    </div>
  );
}
