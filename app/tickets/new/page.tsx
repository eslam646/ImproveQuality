import { getRepo } from "@/lib/db";
import { requirePerm } from "@/lib/auth";
import { createTicketAction } from "@/app/actions/tickets";
import { Button, Card, Field, inputCls, Msg, selectCls } from "@/components/ui";
import { CustomFieldInput } from "@/components/public-forms";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePerm("new_ticket");
  const sp = await searchParams;
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const cfg = settings.form_fields;
  const show = (k: string) => cfg.find((f) => f.key === k)?.visible ?? true;
  const req = (k: string) => cfg.find((f) => f.key === k)?.required ?? false;
  const labelOf = (k: string) => cfg.find((f) => f.key === k)?.label ?? k;
  const star = (k: string) => (req(k) ? " *" : "");

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
        <form action={createTicketAction} className="space-y-4">
          {show("client") && (
            <Field label={`${labelOf("client")}${star("client")}`} hint="اختر من قائمة العملاء، أو اكتب اسمًا جديدًا في الحقل التالي">
              <select name="client_id" className={selectCls} defaultValue="">
                <option value="">— اختر عميلًا مسجلًا —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input name="client_name" className={`${inputCls} mt-2`} placeholder="أو اكتب اسم عميل جديد غير مسجل بالقائمة" />
            </Field>
          )}
          {show("client_contact") && (
            <Field label={`${labelOf("client_contact")}${star("client_contact")}`} hint="بريد إلكتروني → سيصله إشعار تلقائي عند إنشاء الطلب وتحديثه">
              <input name="client_contact" className={inputCls} placeholder="client@example.com أو رقم هاتف" />
            </Field>
          )}
          {show("details") && (
            <Field label={`${labelOf("details")}${star("details")}`}>
              <textarea name="details" rows={5} className={inputCls} placeholder="اشرح المشكلة أو الطلب بالتفصيل…" />
            </Field>
          )}
          {show("creator") && (
            <Field label={`${labelOf("creator")}${star("creator")}`} hint="يظهر اسمه كمدخل للطلب ويصله إشعار — افتراضيًا أنت">
              <select name="creator_id" className={selectCls} defaultValue={actor.id}>
                {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {show("developer") && (
            <>
              <Field label="إسناد إلى مختبِر (التيست)" hint="التيست يستلم الطلب أولاً ثم يسلّمه للمطوّر — يُرسل إيميل تكليف للمختار">
                <select name="tester_id" className={selectCls} defaultValue="">
                  <option value="">— بدون إسناد الآن —</option>
                  {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label={`${labelOf("developer")}${star("developer")}`} hint="⚠️ القاعدة: لا يُسنَد المطوّر إلا بعد اختيار التيست أولاً — ثم يُطلق إيميل للمطور وCC لك ولمديره">
                <select name="developer_id" className={selectCls} defaultValue="">
                  <option value="">— بدون إسناد الآن —</option>
                  {devs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            </>
          )}
          {settings.custom_fields.filter((f) => f.internal).length > 0 && (
            <div className="space-y-4 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
              <p className="text-xs font-bold text-blue-800">🧩 حقول مخصصة (يضيفها الأدمن من الإعدادات)</p>
              {settings.custom_fields.filter((f) => f.internal).map((cf) => (
                <Field key={cf.key} label={`${cf.label}${cf.required ? " *" : ""}`}>
                  <CustomFieldInput f={cf} />
                </Field>
              ))}
            </div>
          )}
          <div className="flex gap-2">
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
