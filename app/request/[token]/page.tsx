import { notFound } from "next/navigation";
import { createPrivateRequestAction } from "@/app/actions/tickets";
import { Card, Field, inputCls, Msg, selectCls } from "@/components/ui";
import { getRepo } from "@/lib/db";
import { REQUEST_TYPE_LABELS } from "@/lib/labels";
import { hashPrivateToken } from "@/lib/private-links";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

export default async function PrivateRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const repo = await getRepo();
  const rawLink = token ? await repo.privateLinkByHash(hashPrivateToken(token)) : null;
  const link = rawLink && (rawLink.kind ?? "request") === "request" ? rawLink : null;
  if (!link) notFound();
  const requester = await repo.staffGet(link.staff_id);
  if (!requester || !requester.active || requester.role !== "support") notFound();
  const [clients, staff] = await Promise.all([repo.clientsList(true), repo.staffList(true)]);
  const testers = staff.filter((s) => s.role === "tester");

  if (sp.created) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <Card>
          <div className="space-y-4 text-center">
            <div className="text-5xl">✅</div>
            <h1 className="text-xl font-extrabold text-emerald-700">تم تسجيل الطلب باسم {requester.name}</h1>
            <p>كود الطلب:</p>
            <div className="rounded-xl bg-slate-900 py-3 font-mono text-xl font-bold text-white" dir="ltr">{sp.created}</div>
            <a href={`/track?code=${sp.created}`} className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">عرض حالة الطلب</a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div className="rounded-2xl bg-gradient-to-l from-blue-700 to-indigo-600 p-5 text-white">
        <p className="text-sm text-blue-100">رابط خاص وآمن — الهوية محددة تلقائيًا</p>
        <h1 className="mt-1 text-2xl font-extrabold">طلب جديد باسم {requester.name}</h1>
        <p className="mt-2 text-sm text-blue-100">لا تشارك هذا الرابط؛ يمكن للإدارة إلغاؤه وإصدار رابط جديد في أي وقت.</p>
      </div>
      {sp.err && <Msg type="err">{sp.err}</Msg>}
      <Card title="بيانات الطلب">
        <form action={createPrivateRequestAction} className="space-y-4">
          <input type="hidden" name="access_token" value={token} />
          <Field label="مدخل البيانات">
            <input readOnly value={`${requester.name} — ${requester.email}`} className={`${inputCls} bg-slate-100`} />
          </Field>
          <Field label="العميل *">
            <select name="client_id" required defaultValue="" className={selectCls}>
              <option value="" disabled>اختر العميل…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="نوع الطلب *">
            <select name="request_type" required defaultValue="issue" className={selectCls}>
              {Object.entries(REQUEST_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input name="linked_ticket_code" dir="ltr" className={`${inputCls} mt-2 font-mono`} placeholder="كود الطلب السابق عند اختيار تعديل — T-XXXXXXXX" />
          </Field>
          <Field label="عنوان الطلب / المشكلة *">
            <input name="title" required minLength={3} maxLength={180} className={inputCls} placeholder="عنوان مختصر وواضح" />
          </Field>
          <Field label="التفاصيل والخطوات *" hint="اكتب كل التفاصيل وخطوات إعادة المشكلة والنتيجة الحالية والمتوقعة">
            <textarea name="details" required minLength={10} rows={12} className={inputCls} placeholder="اكتب كل ما تحتاجه هنا بدون اختصار…" />
          </Field>
          <Field label="مسؤول الاختبار *" hint="سيصله إيميل، ثم يوافق أو يرفض بسبب واضح">
            <select name="tester_id" required defaultValue="" className={selectCls}>
              <option value="" disabled>اختر التيستر…</option>
              {testers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            رفع المرفق الإجباري والفيديو عبر R2 سيكون في الدفعة التالية؛ لن يُنشر هذا النموذج على الإنتاج قبل اكتماله.
          </div>
          <SubmitButton className="w-full py-2.5 text-base" pendingText="⏳ جارٍ إرسال الطلب… لا تضغط مرة أخرى">إرسال الطلب</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
