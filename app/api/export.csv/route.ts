import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { permissionsForStaff, requireActionPermission } from "@/lib/auth";
import { STATUS_LABELS } from "@/lib/labels";

// تصدير CSV — يحترم صلاحية export_csv من مصفوفة الأدوار،
// ويضيف أعمدة لكل حقل مخصص يعرّفه الأدمن (بنفس ترتيب منشئ الحقول)
export async function GET() {
  const actor = await requireActionPermission("export_csv");
  const perms = await permissionsForStaff(actor);
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const customFields = settings.custom_fields;
  const { rows: allRows } = await repo.ticketList({ pageSize: 100000 });
  // فريق التطوير (متخصصون) لكل تذكرة — يظهر في عمود المطور
  const teamByTicket: Record<string, string> = {};
  for (const t of allRows) {
    if (t.is_urgent) continue;
    const specs = (await repo.specialistList(t.id)).filter((x) => x.status !== "declined");
    if (specs.length) teamByTicket[t.id] = specs.map((x) => `${x.staff_name} (${x.spec_label})`).join("، ");
  }
  const rows = perms.view_all_tickets ? allRows : allRows.filter((t) =>
    (perms.view_own_created && t.created_by === actor.id)
    || (perms.view_assigned_tickets && (t.tester_id === actor.id || t.developer_id === actor.id))
  );

  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = [
    "رقم", "كود الطلب", "العميل", "تواصل العميل", "مدخل البيانات", "المطور",
    "حالة التطوير", "المصدر", "آخر تحديث للحالة", "تاريخ الإنشاء",
    ...customFields.map((f) => f.label),
  ];
  const lines = rows.map((t) =>
    [
      t.seq, t.code, t.client_name, t.client_contact ?? "", t.created_by_name,
      teamByTicket[t.id] ?? t.developer_name ?? "", STATUS_LABELS[t.dev_status], t.source,
      t.last_status_change, t.created_at,
      ...customFields.map((f) => t.custom_data?.[f.key] ?? ""),
    ].map(esc).join(","),
  );
  const csv = "\uFEFF" + header.map(esc).join(",") + "\n" + lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
