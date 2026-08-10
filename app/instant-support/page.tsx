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

          <Field label="بريد العميل (اختياري)" hint="يُستخدم لإرسال تحديثات الطلب للعميل">
            <input name="client_contact" type="email" dir="ltr" className={inputCls} placeholder="client@example.com" />
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

          <Field label="التقدير المبدئي للاستجابة">
            <div className="flex gap-2">
              <input name="est_days" type="number" min="0" max="15" step="0.5" className={inputCls} placeholder="أيام" />
              <input name="est_hours" type="number" min="0" max="24" step="1" className={inputCls} placeholder="ساعات" />
            </div>
          </Field>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            مقدم الطلب: <b>{actor.name}</b>. بعد الإنشاء يمكنه إضافة ملاحظات حرة، وتُرسل بالإيميل لكل المسؤولين عن الطلب.
          </div>

          <Button type="submit">🚨 إنشاء وإرسال التكليف فورًا</Button>
        </form>
      </Card>
    </div>
  );
}
