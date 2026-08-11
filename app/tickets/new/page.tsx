import { getRepo } from "@/lib/db";
import { requireActionPermission } from "@/lib/auth";
import { createTicketAction } from "@/app/actions/tickets";
import { Button, Card, Field, inputCls, Msg, selectCls } from "@/components/ui";
import { CustomFieldInput } from "@/components/public-forms";
import { REQUEST_TYPE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireActionPermission("create_standard_ticket");
  const sp = await searchParams;
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const cfg = settings.form_fields;
  const show = (k: string) => cfg.find((f) => f.key === k)?.visible ?? true;
  const req = (k: string) => cfg.find((f) => f.key === k)?.required ?? false;
  const labelOf = (k: string) => cfg.find((f) => f.key === k)?.label ?? k;
  const star = (k: string) => (req(k) ? " *" : "");
  const orderOf = (k: string) => { const i = cfg.findIndex((f) => f.key === k); return i < 0 ? 500 : i; };

  const all = await repo.staffList(true);
  const devs = all.filter((s) => s.role === "developer");
  const testers = all.filter((s) => s.role === "tester");
  const creators = all.filter((s) => s.role === "support" || s.role === "admin");
  const clients = await repo.clientsList(true);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold">إنشاء طلب دعم جديد</h1>
      {sp.err && <Msg type="err">{sp.err}</Msg>}
      <Card>
        <form action={createTicketAction} className="flex flex-col gap-4">
          {show("client") && (
            <Field style={{ order: orderOf("client") }} label={`${labelOf("client")}${star("client")}`} hint="اختر من قائمة العملاء، أو اكتب اسمًا جديدًا في الحقل التالي">
              <select name="client_id" className={selectCls} defaultValue="">
                <option value="">— اختر عميلًا مسجلًا —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input name="client_name" className={`${inputCls} mt-2`} placeholder="أو اكتب اسم عميل جديد غير مسجل بالقائمة" />
            </Field>
          )}
          {show("request_type") && (
            <Field style={{ order: orderOf("request_type") }} label={`${labelOf("request_type")}${star("request_type")}`}>
              <select name="request_type" required={req("request_type")} className={selectCls} defaultValue="issue">
                {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-500">عند اختيار «تعديل على طلب سابق» اكتب كود الطلب الأصلي:</p>
              <input name="linked_ticket_code" dir="ltr" className={`${inputCls} mt-1 font-mono`} placeholder="T-XXXXXXXX (اختياري إلا عند التعديل)" />
            </Field>
          )}
          {show("title") && (
            <Field style={{ order: orderOf("title") }} label={`${labelOf("title")}${star("title")}`} hint="عنوان مختصر يظهر في الجدول والإيميلات">
              <input name="title" required={req("title")} minLength={3} maxLength={180} className={inputCls} placeholder="مثال: توقف مزامنة الفواتير بعد تحديث النظام" />
            </Field>
          )}
          {show("client_contact") && (
            <Field style={{ order: orderOf("client_contact") }} label={`${labelOf("client_contact")}${star("client_contact")}`} hint="البريد الخاص بمدخل البيانات، وليس بريد العميل">
              <input name="client_contact" type="email" dir="ltr" className={inputCls} placeholder="requester@company.com" />
            </Field>
          )}
          {show("details") && (
            <Field style={{ order: orderOf("details") }} label={`${labelOf("details")}${star("details")}`} hint="اكتب الوصف والخطوات والنتيجة المتوقعة والفعلية بدون اختصار">
              <textarea name="details" required={req("details")} minLength={10} rows={12} className={inputCls} placeholder="اشرح الطلب أو المشكلة بالتفصيل، وخطوات إعادة المشكلة، والنتيجة الحالية والمتوقعة…" />
            </Field>
          )}
          {show("creator") && (
            <Field style={{ order: orderOf("creator") }} label={`${labelOf("creator")}${star("creator")}`} hint="يظهر اسمه كمدخل للطلب ويصله إشعار — افتراضيًا أنت">
              <select name="creator_id" className={selectCls} defaultValue={actor.id}>
                {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {show("tester") && (
            <Field style={{ order: orderOf("tester") }} label={`${labelOf("tester")}${star("tester")}`} hint="التيستر يراجع اكتمال البيانات والمرفقات أولاً؛ سيصله إيميل التكليف">
              <select name="tester_id" required className={selectCls} defaultValue="">
                <option value="" disabled>— اختر مسؤول الاختبار —</option>
                {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          )}
          {show("developer") && (
            <Field style={{ order: orderOf("developer") }} label={`${labelOf("developer")}${star("developer")}`} hint="اختياري في الطلب العادي؛ لا يُسنَد المطور إلا بعد اختيار التيستر">
              <select name="developer_id" className={selectCls} defaultValue="">
                <option value="">— يحدده التيستر لاحقاً —</option>
                {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          {settings.custom_fields.filter((f) => f.internal).length > 0 && (
            <div style={{ order: 800 }} className="space-y-4 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs font-bold text-blue-800">🧩 حقول مخصصة (يضيفها الأدمن من الإعدادات)</p>
              {settings.custom_fields.filter((f) => f.internal).map((cf) => (
                <Field key={cf.key} label={`${cf.label}${cf.required ? " *" : ""}`}>
                  <CustomFieldInput f={cf} />
                </Field>
              ))}
            </div>
          )}
          <div style={{ order: 999 }} className="flex gap-2">
            <Button type="submit">إنشاء الطلب ✓</Button>
          </div>
        </form>
      </Card>
      <p className="text-xs text-slate-500">
        سيتم توليد كود تتبع عشوائي آمن تلقائياً، وتُطلق قاعدة «طلب جديد» (إيميل للإدارة + إشعار داخلي).
        الحقول الظاهرة والإجبارية يتحكم بها الأدمن من «الإعدادات ← تصميم النماذج».
      </p>
    </div>
  );
}
