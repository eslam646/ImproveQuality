import { requirePerm, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Card } from "@/components/ui";
import { StaffManager } from "@/components/staff-manager";
import { ClientsManager } from "@/components/clients-manager";
import { ROLE_LABELS } from "@/lib/labels";
import { PrivateLinksManager } from "@/components/private-links-manager";
import { LoginLinksManager } from "@/components/login-links-manager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requirePerm("staff");
  const repo = await getRepo();
  const staff = await repo.staffList();
  const clients = await repo.clientsList();
  const privateLinks = await repo.privateLinksList();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">الموظفون والتوجيه</h1>
        <p className="text-sm text-slate-500">
          هنا البديل المرئي لدالة SWITCH في Lark: <b>المدير المباشر</b> + البريد لكل موظف — والأتمتة تحل المستلمين تلقائياً بالانضمام
        </p>
      </div>
      <Card>
        <StaffManager
          staff={staff.map((s) => ({
            id: s.id, name: s.name, email: s.email, role: s.role,
            role_label: ROLE_LABELS[s.role], manager_id: s.manager_id, active: !!s.active,
          }))}
        />
      </Card>
      <div>
        <h2 className="text-xl font-extrabold">🔐 الروابط الخاصة لمدخلي البيانات (نموذج طلب فقط)</h2>
        <p className="text-sm text-slate-500">بديل آمن لقائمة الأسماء العامة؛ كل رابط يثبت هوية صاحبه ويمكن إلغاؤه فورًا.</p>
      </div>
      <Card>
        <PrivateLinksManager
          requesters={staff.filter((s) => s.role === "support" && s.active).map((s) => ({ id: s.id, name: s.name, email: s.email }))}
          links={privateLinks.filter((l) => (l.kind ?? "request") === "request").map((l) => ({ id: l.id, staff_id: l.staff_id, active: !!l.active, created_at: l.created_at, last_used_at: l.last_used_at }))}
        />
      </Card>
      <div>
        <h2 className="text-xl font-extrabold">🔗 روابط الدخول الشخصية (Magic Links) — دخول كامل بدون PIN</h2>
        <p className="text-sm text-slate-500">الموظف يفتح رابطه فيدخل النظام بهويته وصلاحيات دوره مباشرة — مدير النظام مستثنى ويدخل بالرقم السري فقط.</p>
      </div>
      <Card>
        <LoginLinksManager
          staff={staff.filter((s) => s.active && s.role !== "admin").map((s) => ({ id: s.id, name: s.name, email: s.email, role_label: ROLE_LABELS[s.role] }))}
          links={privateLinks.filter((l) => (l.kind ?? "request") === "login").map((l) => ({ id: l.id, staff_id: l.staff_id, active: !!l.active, created_at: l.created_at, last_used_at: l.last_used_at }))}
        />
      </Card>
      <div>
        <h2 className="text-xl font-extrabold">العملاء — القائمة المنسدلة</h2>
        <p className="text-sm text-slate-500">تظهر في نموذج إنشاء الطلب الداخلي ونموذج الضيوف العام</p>
      </div>
      <Card>
        <ClientsManager
          isAdmin
          clients={clients.map((c) => ({ id: c.id, name: c.name, contact_email: c.contact_email, active: !!c.active }))}
        />
      </Card>
    </div>
  );
}
