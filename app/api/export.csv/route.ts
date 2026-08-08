import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { requireStaff, permissionsOf } from "@/lib/auth";
import { STATUS_LABELS } from "@/lib/labels";

// تصدير CSV — يحترم صلاحية export_csv من مصفوفة الأدوار،
// ويضيف أعمدة لكل حقل مخصص يعرّفه الأدمن (بنفس ترتيب منشئ الحقول)
export async function GET() {
  const actor = await requireStaff(["admin", "support"]);
  const perms = await permissionsOf(actor.role);
  if (!perms.export_csv) {
    return NextResponse.json({ error: "صلاحية تصدير CSV غير مفعّلة لدورك — راجع مدير النظام" }, { status: 403 });
  }
  const repo = await getRepo();
  const settings = await repo.settingsGet();
  const customFields = settings.custom_fields;
  const { rows } = await repo.ticketList({ pageSize: 100000 });

  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = [
    "رقم", "كود الطلب", "العميل", "تواصل العميل", "مدخل البيانات", "المطور",
    "حالة التطوير", "المصدر", "آخر تحديث للحالة", "تاريخ الإنشاء",
    ...customFields.map((f) => f.label),
  ];
  const lines = rows.map((t) =>
    [
      t.seq, t.code, t.client_name, t.client_contact ?? "", t.created_by_name,
      t.developer_name ?? "", STATUS_LABELS[t.dev_status], t.source,
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
