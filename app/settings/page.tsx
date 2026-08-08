import { requirePerm } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Card, Msg } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { FormDesigner } from "@/components/form-designer";
import { LinkCenter } from "@/components/link-center";
import { RolePermissionsEditor } from "@/components/role-permissions-editor";
import { CustomFieldsBuilder } from "@/components/custom-fields-builder";
import { TrackCfgEditor } from "@/components/track-cfg-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePerm("settings");
  const sp = await searchParams;
  const repo = await getRepo();
  const s = await repo.settingsGet();
  const brevo = !!process.env.BREVO_API_KEY;
  const resend = !!process.env.RESEND_API_KEY;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold">إعدادات النظام</h1>
      {sp.ok && <Msg type="ok">تم حفظ الإعدادات ✓</Msg>}
      <Card title="🔗 روابط المشاركة العامة (بدون تسجيل دخول)">
        <LinkCenter
          baseUrl={s.base_url}
          allowGuestSubmit={s.allow_guest_submit}
          allowTrack={s.allow_track}
          allowPublicUpdate={s.allow_public_update}
        />
      </Card>
      <Card title="🛡️ صلاحيات الأدوار — ما يظهر لكل دور">
        <RolePermissionsEditor initial={s.role_permissions} />
      </Card>
      <Card title="🧩 الحقول المخصصة — أضف حقولك بلا كود">
        <CustomFieldsBuilder initial={s.custom_fields} />
      </Card>
      <Card title="الإعدادات العامة">
        <SettingsForm initial={s} />
      </Card>
      <Card title="تصميم النماذج — الحقول الأساسية الظاهرة والإجبارية">
        <FormDesigner initial={s.form_fields} />
      </Card>
      <Card title="🔍 صفحة الاستعلام العامة — ماذا يرى صاحب الكود">
        <TrackCfgEditor initial={s.track_cfg} />
      </Card>
      <Card title="حالة مزودي البريد">
        <ul className="space-y-2 text-sm">
          <li>{brevo ? "✅ Brevo مفعّل (300 إيميل/يوم)" : "⬜ Brevo غير مضبوط (BREVO_API_KEY)"}</li>
          <li>{resend ? "✅ Resend احتياطي مفعّل (3,000/شهر)" : "⬜ Resend غير مضبوط (RESEND_API_KEY)"}</li>
          {!brevo && !resend && <li className="font-bold text-blue-700">📝 وضع التسجيل نشط: الإيميلات تظهر في «سجل البريد» دون إرسال فعلي — مثالي للتجربة.</li>}
        </ul>
      </Card>
      <Card title="جدولة عامل المهام (Cron)">
        <p className="mb-2 text-sm text-slate-600">
          نقطة العامل: <code className="rounded bg-slate-100 px-2 py-0.5" dir="ltr">POST {s.base_url}/api/worker</code>
          {" "}بالترويسة <code className="rounded bg-slate-100 px-2 py-0.5" dir="ltr">x-worker-secret: {process.env.WORKER_SECRET || "dev-secret"}</code>
        </p>
        <p className="text-xs text-slate-500">
          في الإنتاج تُستدعى كل دقيقة عبر pg_cron داخل Supabase — SQL جاهز في ملف supabase/schema.sql ودليل README.
          محلياً: شغّل <code dir="ltr" className="rounded bg-slate-100 px-1">npm run worker</code> في نافذة أخرى.
        </p>
      </Card>
    </div>
  );
}
