import { getRepo } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { StaffLoginButtons, MagicLinkForm, PinLoginForm } from "@/components/login-forms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const existing = await currentStaff();
  if (existing) redirect("/dashboard");

  const repo = await getRepo();
  const staff = await repo.staffList(true);
  const mode = process.env.AUTH_MODE ?? "demo";

  return (
    <div className="mx-auto max-w-md py-10">
      <Card title={mode === "supabase" ? "تسجيل الدخول" : mode === "pin" ? "تسجيل الدخول للنظام" : "دخول تجريبي — اختر هويتك"}>
        {mode === "supabase" ? (
          <MagicLinkForm />
        ) : mode === "pin" ? (
          <>
            <p className="mb-4 text-sm text-slate-500">نظام تذاكر الدعم الفني — اختر اسمك وأدخل رقمك السري:</p>
            <PinLoginForm staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))} />
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              وضع العرض التجريبي: اضغط أي هوية للدخول فوراً — بدون كلمة مرور وبدون كوكيز، وتقدر تبدّل الدور في أي وقت من الشريط العلوي. في الإنتاج يُفعَّل الدخول عبر ماجيك لينك البريد.
            </p>
            <StaffLoginButtons staff={staff.map((s) => ({ id: s.id, name: s.name, role: s.role }))} />
          </>
        )}
      </Card>
    </div>
  );
}
