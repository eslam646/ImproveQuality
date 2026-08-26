"use client";

import { useEffect, useState } from "react";

// ⏱️ عدّاد حي (زي الدعم الفوري): يعد لايف من لحظة بدء الشغل الفعلي —
// ولو له تقدير يعرض المتبقي، وعند التجاوز يتحول أحمر «متأخر بـ…»
function fmt(mins: number): string {
  if (mins < 1) return "أقل من دقيقة";
  if (mins < 60) return `${Math.floor(mins)} دقيقة`;
  const h = Math.floor(mins / 60); const m = Math.floor(mins % 60);
  if (h < 24) return `${h} س${m ? ` ${m} د` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} يوم${h % 24 ? ` ${h % 24} س` : ""}`;
}

export function LiveTimer({
  startedAt,
  estimateHours,
  label,
  dayHours = 8,
}: {
  startedAt: string;          // لحظة البدء الفعلي
  estimateHours?: number | null; // إجمالي التقدير بالساعات (أيام×ساعات اليوم + ساعات) — اختياري
  label?: string;             // نص قبل العدّاد («شغال منذ» مثلاً)
  dayHours?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000); // تحديث كل 30 ثانية يكفي
    return () => clearInterval(id);
  }, []);

  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const elapsedMin = Math.max(0, (now - start) / 60000);

  let remainNode: React.ReactNode = null;
  if (estimateHours && estimateHours > 0) {
    const totalMin = estimateHours * 60;
    const remainMin = totalMin - elapsedMin;
    remainNode = remainMin >= 0 ? (
      <span className="text-emerald-700">— متبقٍ {fmt(remainMin)}</span>
    ) : (
      <span className="font-bold text-rose-600">— ⚠️ متأخر بـ{fmt(-remainMin)}</span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
      ⏱️ {label ?? "شغال منذ"} <b>{fmt(elapsedMin)}</b> {remainNode}
    </span>
  );
}

