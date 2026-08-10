import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import { ASSIGNMENT_STATUS_LABELS, REQUEST_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS, TICKET_KIND_LABELS } from "@/lib/labels";
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
            <th className="px-4 py-3">التصنيف</th>
            <th className="px-4 py-3">العميل</th>
            <th className="px-4 py-3">العنوان / التفاصيل</th>
            <th className="px-4 py-3">مدخل البيانات</th>
            <th className="px-4 py-3">التيستر</th>
            <th className="px-4 py-3">المطور</th>
            <th className="px-4 py-3">الحالة</th>
            <th className="px-4 py-3">آخر تحديث</th>
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
              <td className="px-4 py-2.5 text-xs">
                <div className={`mb-1 w-fit rounded-full px-2 py-0.5 font-bold ${t.ticket_kind === "instant_support" || t.is_urgent ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                  {t.ticket_kind === "instant_support" || t.is_urgent ? "🚨 دعم فوري" : TICKET_KIND_LABELS.standard}
                </div>
                <div className="text-slate-500">{REQUEST_TYPE_LABELS[t.request_type ?? "issue"]}</div>
              </td>
              <td className="px-4 py-2.5 font-semibold">{t.client_name}</td>
              <td className="max-w-72 px-4 py-2.5">
                <div className="font-bold text-slate-800">{t.title || "بدون عنوان"}</div>
                <span className="line-clamp-2 text-xs text-slate-500">{t.details}</span>
              </td>
              <td className="px-4 py-2.5 text-slate-600">{t.created_by_name}</td>
              <td className="px-4 py-2.5 text-slate-600">
                <div>{t.tester_name ?? <span className="text-slate-400">—</span>}</div>
                <div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.tester_assignment_status ?? "unassigned"]}</div>
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                <div>{t.developer_name ?? <span className="text-slate-400">—</span>}</div>
                <div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.developer_assignment_status ?? "unassigned"]}</div>
              </td>
              <td className="px-4 py-2.5"><Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge></td>
              <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(t.last_status_change)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
