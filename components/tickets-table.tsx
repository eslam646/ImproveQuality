"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]") as ColumnKey[];
      if (Array.isArray(saved) && saved.length) setVisible(saved.filter((k) => ALL_COLUMNS.includes(k)));
    } catch { /* الافتراضي */ }
  }, [storageKey]);
  const persist = (next: ColumnKey[]) => { setVisible(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const toggle = (k: ColumnKey) => {
    const next = visible.includes(k) ? visible.filter((x) => x !== k) : [...visible, k];
    if (next.length) persist(next);
  };
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...visible]; const [x] = next.splice(from, 1); next.splice(to, 0, x); persist(next);
  };
  const cell = (k: ColumnKey, t: Ticket) => {
    if (k === "seq") return <td className="px-4 py-2.5 text-slate-500">#{t.seq}</td>;
    if (k === "code") return <td className="px-4 py-2.5"><Link href={`/tickets/${t.code}`} className="font-bold text-blue-700 hover:underline" dir="ltr">{t.code}</Link></td>;
    if (k === "kind") { const urgent = t.ticket_kind === "instant_support" || t.is_urgent; const ended = urgent && !!t.urgent_ended_at; return <td className="px-4 py-2.5 text-xs"><div className={`mb-1 w-fit rounded-full px-2 py-0.5 font-bold ${ended ? "bg-emerald-100 text-emerald-700" : urgent ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{ended ? "✅ دعم فوري — انتهى" : urgent ? "🚨 دعم فوري" : TICKET_KIND_LABELS.standard}</div><div className="text-slate-500">{REQUEST_TYPE_LABELS[t.request_type ?? "issue"]}</div></td>; }
    if (k === "client") return <td className="px-4 py-2.5 font-semibold">{t.client_name}</td>;
    if (k === "title") return <td className="max-w-72 px-4 py-2.5"><div className="font-bold text-slate-800">{t.title || "بدون عنوان"}</div><span className="line-clamp-2 text-xs text-slate-500">{t.details}</span></td>;
    if (k === "creator") return <td className="px-4 py-2.5 text-slate-600">{t.created_by_name}</td>;
    if (k === "tester") return <td className="px-4 py-2.5 text-slate-600"><div>{t.tester_name ?? <span className="text-slate-400">—</span>}</div><div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.tester_assignment_status ?? "unassigned"]}</div></td>;
    if (k === "developer") return <td className="px-4 py-2.5 text-slate-600"><div>{t.developer_name ?? <span className="text-slate-400">—</span>}</div><div className="text-[11px] text-slate-400">{ASSIGNMENT_STATUS_LABELS[t.developer_assignment_status ?? "unassigned"]}</div></td>;
    if (k === "status") return <td className="px-4 py-2.5"><Badge color={STATUS_COLORS[t.dev_status]}>{STATUS_LABELS[t.dev_status]}</Badge></td>;
    return <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(t.last_status_change)}</td>;
  };

  if (!rows.length) return <EmptyState>لا توجد تذاكر مطابقة — جرّب تعديل الفلاتر أو أنشئ طلباً جديداً.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="flex justify-end border-b border-slate-100 px-3 py-2">
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">☷ الأعمدة: إظهار وترتيب بالسحب</summary>
          <div className="absolute left-0 z-20 mt-2 w-72 space-y-1 rounded-xl border bg-white p-3 shadow-xl">
            {visible.map((k, i) => (
              <label key={k} draggable onDragStart={() => setDragIndex(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 ${dragIndex === i ? "opacity-50" : ""}`}>
                <span className="cursor-grab text-slate-400">⋮⋮</span><span className="w-5 text-slate-400">{i + 1}</span>
                <input type="checkbox" checked onChange={() => toggle(k)} className="accent-blue-600" />{COLUMN_LABELS[k]}
              </label>
            ))}
            {ALL_COLUMNS.filter((k) => !visible.includes(k)).map((k) => <label key={k} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-400"><input type="checkbox" checked={false} onChange={() => toggle(k)} />{COLUMN_LABELS[k]}</label>)}
            <button onClick={() => { setVisible(ALL_COLUMNS); localStorage.removeItem(storageKey); }} className="mt-2 w-full rounded bg-slate-100 py-1 text-xs font-bold">إعادة الضبط</button>
          </div>
        </details>
      </div>
      {readOnlyNote && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{readOnlyNote}</div>}
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 bg-slate-50 text-right text-xs text-slate-500">{visible.map((k) => <th key={k} className="px-4 py-3">{COLUMN_LABELS[k]}</th>)}</tr></thead>
        <tbody>{rows.map((t) => <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">{visible.map((k) => <Fragment key={k}>{cell(k, t)}</Fragment>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
