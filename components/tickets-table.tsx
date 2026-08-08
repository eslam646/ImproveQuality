import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import type { Ticket } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export function TicketsTable({ rows, readOnlyNote }: { rows: Ticket[]; readOnlyNote?: string }) {
  if (!rows.length) return <EmptyState>لا توجد تذاكر مطابقة — جرّب تعديل الفلاتر أو أنشئ طلباً جديداً.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      {readOnlyNote && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{readOnlyNote}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-right text-xs text-slate-500">
            <th className="px-4 py-3">رقم</th>
            <th className="px-4 py-3">كود الطلب</th>
            <th className="px-4 py-3">العميل</th>
            <th className="px-4 py-3">التفاصيل</th>
            <th className="px-4 py-3">مدخل البيانات</th>
            <th className="px-4 py-3">المطور</th>
            <th className="px-4 py-3">حالة التطوير</th>
            <th className="px-4 py-3">المصدر</th>
            <th className="px-4 py-3">آخر تحديث للحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-500">#{t.seq}</td>
              <td className="px-4 py-2.5">
                <Link href={`/tickets/${t.code}`} className="font-bold text-blue-700 hover:underline" dir="ltr">
                  {t.code}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-semibold">{t.client_name}</td>
              <td className="max-w-56 px-4 py-2.5">
                <span className="line-clamp-2 text-slate-600">{t.details}</span>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{t.created_by_name}</td>
              <td className="px-4 py-2.5 text-slate-600">{t.developer_name ?? <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-2.5"><Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge></td>
              <td className="px-4 py-2.5 text-xs text-slate-500">
                {t.source === "web_guest" ? "نموذج عام" : t.source === "update_form" ? "نموذج تحديث" : "داخلي"}
              </td>
              <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(t.last_status_change)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
