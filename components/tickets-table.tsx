"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { ASSIGNMENT_STATUS_LABELS, REQUEST_TYPE_LABELS, STATUS_COLORS, STATUS_LABELS, TICKET_KIND_LABELS } from "@/lib/labels";
import type { Ticket } from "@/lib/types";
import { fmtDate } from "@/lib/util";

const COLUMN_LABELS = {
  seq: "رقم", code: "كود الطلب", kind: "التصنيف", client: "العميل", title: "العنوان والتفاصيل",
  creator: "مدخل البيانات", tester: "التيستر", developer: "المطور", status: "الحالة", updated: "آخر تحديث",
} as const;
type ColumnKey = keyof typeof COLUMN_LABELS;
const ALL_COLUMNS = Object.keys(COLUMN_LABELS) as ColumnKey[];

export function TicketsTable({ rows, readOnlyNote, storageKey = "support-hub-ticket-columns" }: { rows: Ticket[]; readOnlyNote?: string; storageKey?: string }) {
  const [visible, setVisible] = useState<ColumnKey[]>(ALL_COLUMNS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]") as ColumnKey[];
      if (Array.isArray(saved) && saved.length) setVisible(saved.filter((k) => ALL_COLUMNS.includes(k)));
    } catch { /* الافتراضي */ }
  }, [storageKey]);
  const show = (k: ColumnKey) => visible.includes(k);
  const toggle = (k: ColumnKey) => {
    const next = show(k) ? visible.filter((x) => x !== k) : [...visible, k];
    if (!next.length) return;
    setVisible(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  if (!rows.length) return <EmptyState>لا توجد تذاكر مطابقة — جرّب تعديل الفلاتر أو أنشئ طلباً جديداً.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="flex justify-end border-b border-slate-100 px-3 py-2">
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">☷ التحكم في الأعمدة</summary>
          <div className="absolute left-0 z-20 mt-2 grid w-64 grid-cols-2 gap-1 rounded-xl border bg-white p-3 shadow-xl">
            {ALL_COLUMNS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                <input type="checkbox" checked={show(k)} onChange={() => toggle(k)} className="accent-blue-600" />
                {COLUMN_LABELS[k]}
              </label>
            ))}
            <button onClick={() => { setVisible(ALL_COLUMNS); localStorage.removeItem(storageKey); }} className="col-span-2 mt-2 rounded bg-slate-100 py-1 text-xs font-bold">إعادة الضبط</button>
          </div>
        </details>
      </div>
      {readOnlyNote && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{readOnlyNote}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-right text-xs text-slate-500">
            {show("seq") && <th className="px-4 py-3">رقم</th>}
            {show("code") && <th className="px-4 py-3">كود الطلب</th>}
            {show("kind") && <th className="px-4 py-3">التصنيف</th>}
            {show("client") && <th className="px-4 py-3">العميل</th>}
            {show("title") && <th className="px-4 py-3">العنوان / التفاصيل</th>}
            {show("creator") && <th className="px-4 py-3">مدخل البيانات</th>}
            {show("tester") && <th className="px-4 py-3">التيستر</th>}
            {show("developer") && <th className="px-4 py-3">المطور</th>}
            {show("status") && <th className="px-4 py-3">الحالة</th>}
            {show("updated") && <th className="px-4 py-3">آخر تحديث</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
              {show("seq") && <td className="px-4 py-2.5 text-slate-500">#{t.seq}</td>}
              {show("code") && <td className="px-4 py-2.5">
                <Link href={`/tickets/${t.code}`} className="font-bold text-blue-700 hover:underline" dir="ltr">
                  {t.code}
                </Link>
              </td>}
              {show("kind") && <td className="px-4 py-2.5 text-xs">
                <div className={`mb-1 w-fit rounded-full px-2 py-0.5 font-bold ${t.ticket_kind === "instant_support" || t.is_urgent ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                  {t.ticket_kind === "instant_support" || t.is_urgent ? "🚨 دعم فوري" : TICKET_KIND_LABELS.standard}
                </div>
                <div className="text-slate-500">{REQUEST_TYPE_LABELS[t.request_type ?? "issue"]}</div>
              </td>}
              {show("client") && <td className="px-4 py-2.5 font-semibold">{t.client_name}</td>}
              {show("title") && <td className="max-w-72 px-4 py-2.5">
                <div className="font-bold text-slate-800">{t.title || "بدون عنوان"}</div>
                <span className="line-clamp-2 text-xs text-slate-500">{t.details}</span>
              </td>}
              {show("creator") && <td className="px-4 py-2.5 text-slate-600">{t.created_by_name}</td>}
              {show("tester") && <td className="px-4 py-2.5 text-slate-600">
                <div>{t.tester_name ?? <span className="text-slate-400">—</span>}</div>
                <div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.tester_assignment_status ?? "unassigned"]}</div>
              </td>}
              {show("developer") && <td className="px-4 py-2.5 text-slate-600">
                <div>{t.developer_name ?? <span className="text-slate-400">—</span>}</div>
                <div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.developer_assignment_status ?? "unassigned"]}</div>
              </td>}
              {show("status") && <td className="px-4 py-2.5"><Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge></td>}
              {show("updated") && <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(t.last_status_change)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
