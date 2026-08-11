import { createInstantSupportAction } from "@/app/actions/tickets";
import { requirePerm } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Button, Card, Field, inputCls, Msg, selectCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InstantSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePerm("new_ticket");
  const sp = await searchParams;
  const repo = await getRepo();
  const [staff, clients] = await Promise.all([repo.staffList(true), repo.clientsList(true)]);
  const testers = staff.filter((s) => s.role === "tester");
  const developers = staff.filter((s) => s.role === "developer");
  const requesters = staff.filter((s) => s.role === "support" || s.role === "admin");

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-l from-rose-600 to-orange-500 p-5 text-white shadow-sm">
        <p className="text-sm font-bold text-rose-100">مخصص للأعطال الحرجة والمشكلات على السيرفر</p>
        <h1 className="mt-1 text-2xl font-extrabold">🚨 إنشاء طلب دعم فوري</h1>
        <p className="mt-2 text-sm text-rose-50">
          سيصل التكليف فورًا إلى مسؤول الاختبار والمطور. يمكن لأي منهما الاعتذار عن هذا الطلب العاجل فقط مع كتابة سبب إجباري.
        </p>
      </div>

      {sp.err && <Msg type="err">{sp.err}</Msg>}

      <Card title="بيانات المشكلة الطارئة">
        <form action={createInstantSupportAction} className="space-y-4">
          <Field label="العميل *" hint="اختر عميلاً مسجلاً، أو اكتب اسماً جديداً">
            <select name="client_id" className={selectCls} defaultValue="">
              <option value="">— اختر العميل —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="client_name" className={`${inputCls} mt-2`} placeholder="أو اكتب اسم العميل" />
          </Field>

          <Field label="مدخل البيانات (مقدم الطلب) *" hint="يُستخدم اسمه وبريده ديناميكيًا في الإيميلات والسجل">
            <select name="creator_id" required className={selectCls} defaultValue={requesters.some((r) => r.id === actor.id) ? actor.id : (requesters[0]?.id ?? "")}>
              <option value="" disabled>اختر مدخل البيانات…</option>
              {requesters.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.email}</option>)}
            </select>
          </Field>

          <Field label="عنوان المشكلة الطارئة *" hint="عنوان مختصر يظهر في الجدول والإيميلات">
            <input name="title" required minLength={3} maxLength={180} className={inputCls} placeholder="مثال: توقف خدمة الفواتير على سيرفر الإنتاج" />
          </Field>

          <Field label="السيرفر / قاعدة البيانات / الخدمة المتأثرة *">
            <input name="affected_service" required minLength={2} className={inputCls} placeholder="مثال: Production API / SQL Server / خدمة الفواتير" />
          </Field>

          <Field label="تفاصيل المشكلة الطارئة *" hint="اكتب ما حدث وتأثيره والخطوات التي جُربت وما المطلوب فوراً">
            <textarea name="details" required minLength={10} rows={9} className={inputCls} placeholder="مثال: السيرفر متوقف منذ الساعة… والخدمة المتأثرة… والخطوات التي تم تنفيذها…" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="مسؤول الاختبار *" hint="سيصله إيميل تكليف فوري">
              <select name="tester_id" required className={selectCls} defaultValue="">
                <option value="" disabled>اختر التيست…</option>
                {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="المطور *" hint="سيصله إيميل بعد إسناد التيست">
              <select name="developer_id" required className={selectCls} defaultValue="">
                <option value="" disabled>اختر المطور…</option>
                {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            سيُسجل اسم مدخل البيانات المختار ويصل البريد إليه وإلى المسؤولين وفق قواعد الأتمتة. العميل نفسه لا يحتاج بريدًا.
          </div>

          <Button type="submit">🚨 إنشاء وإرسال التكليف فورًا</Button>
        </form>
      </Card>
    </div>
  );
}
