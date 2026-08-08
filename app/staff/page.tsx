import { requirePerm, requireStaff } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { Card } from "@/components/ui";
import { StaffManager } from "@/components/staff-manager";
import { ClientsManager } from "@/components/clients-manager";
import { ROLE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requirePerm("staff");
  const repo = await getRepo();
  const staff = await repo.staffList();
  const clients = await repo.clientsList();

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
