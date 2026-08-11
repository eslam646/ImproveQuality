import { getRepo } from "@/lib/db";
import { Card, EmptyState, Badge } from "@/components/ui";
import { PublicUpdateForm } from "@/components/public-forms";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { currentStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PublicUpdateFormPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const code = (sp.code ?? "").trim();
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const ticket = settings.allow_public_update && code ? await repo.ticketByCode(code) : null;
  const actor = await currentStaff();
  const canUpdate = !!ticket && !!actor && (
    actor.role === "admin"
    || (actor.role === "tester" && ticket.tester_id === actor.id && ticket.tester_assignment_status === "accepted")
    || (actor.role === "developer" && ticket.developer_id === actor.id && ticket.developer_assignment_status === "accepted")
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">نموذج تحديث حالة الطلب</h1>
        <p className="mt-1 text-sm text-slate-500">معبأ مسبقاً بناءً على كود الطلب — الحقول الأساسية محمية من التعديل</p>
      </div>
      {!settings.allow_public_update ? (
        <EmptyState>نموذج التحديث العام موقوف حالياً من إدارة النظام — تواصل مع فريق الدعم مباشرة.</EmptyState>
      ) : !ticket ? (
        <EmptyState>
          {code ? <>كود الطلب <b dir="ltr">{code}</b> غير موجود — تأكد من الكود وحاول مجدداً.</> : "أضف كود الطلب إلى الرابط: ‎/update-form?code=T-XXXX‎"}
        </EmptyState>
      ) : !canUpdate ? (
        <EmptyState>هذه الصفحة لتحديث التيستر أو المطور المسند فقط. مدخل البيانات في وضع القراءة وإضافة الملاحظات من صفحة الطلب.</EmptyState>
      ) : (
        <Card>
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
            <div><span className="block text-xs text-slate-400">كود الطلب (مقفل)</span><b dir="ltr">{ticket.code}</b></div>
            <div><span className="block text-xs text-slate-400">العميل (مقفل)</span><b>{ticket.client_name}</b></div>
            <div><span className="block text-xs text-slate-400">المطور (مقفل)</span><b>{ticket.developer_name ?? "—"}</b></div>
            <div><span className="block text-xs text-slate-400">الحالة الحالية</span><Badge color={STATUS_COLORS[ticket.dev_status]}>{STATUS_LABELS[ticket.dev_status]}</Badge></div>
          </div>
          <PublicUpdateForm code={ticket.code} currentStatus={ticket.dev_status} />
        </Card>
      )}
    </div>
  );
}
