import { getRepo } from "@/lib/db";
import { Card } from "@/components/ui";
import { GuestSubmitForm } from "@/components/public-forms";

export const dynamic = "force-dynamic";

export default async function PublicSubmitPage() {
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const clients = await repo.clientsList(true);

  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">تقديم طلب دعم فني</h1>
        <p className="mt-1 text-sm text-slate-500">بدون تسجيل دخول — ستستلم كود تتبع لمتابعة حالة طلبك</p>
      </div>
      <Card>
        {settings.allow_guest_submit ? (
          <GuestSubmitForm
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            fields={settings.form_fields}
            customFields={settings.custom_fields.filter((f) => f.guest)}
          />
        ) : (
          <div className="rounded-lg bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800">
            استقبال الطلبات العامة موقوف حالياً من إدارة النظام — تواصل مع فريق الدعم مباشرة.
          </div>
        )}
      </Card>
      <p className="text-center text-xs text-slate-400">
        لديك كود طلب سابق؟ <a href="/track" className="font-bold text-blue-700 hover:underline">تتبع حالة طلبك من هنا</a>
      </p>
    </div>
  );
}
