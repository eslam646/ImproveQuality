"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { listPendingEmailJobsAction, processQueueNowAction } from "@/app/actions/admin";

type PendingJob = { id: string; ticket: string; template: string; status: string; attempts: number; runAfter: string; reason: string };

const JOB_STATUS: Record<string, { l: string; c: string }> = {
  queued: { l: "في الانتظار", c: "bg-amber-100 text-amber-800" },
  processing: { l: "عالقة قيد المعالجة", c: "bg-orange-100 text-orange-800" },
  dead: { l: "فشلت نهائياً", c: "bg-rose-100 text-rose-700" },
  failed: { l: "فشلت", c: "bg-rose-100 text-rose-700" },
};

// لوحة تشخيص طابور البريد: كام رسالة منتظرة/فاشلة + زر معالجة فورية + قائمة تفصيلية بكل رسالة لم تُرسل وسببها
export function QueueStatus({ queued, dead, lastError }: { queued: number; dead: number; lastError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [details, setDetails] = useState<PendingJob[] | null>(null);

  const healthy = queued === 0 && dead === 0;
  return (
    <div className={`rounded-xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">
            {healthy ? "✅ طابور البريد سليم — لا رسائل عالقة" : `⚠️ في الطابور: ${queued} بانتظار الإرسال${dead ? ` — ${dead} فشلت نهائياً` : ""}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            الإرسال يتم فور كل حدث تلقائياً — «معالجة الآن» تستعيد العالق وتجبر المؤجل وترسل الجميع فوراً.
          </p>
          {lastError && <p className="mt-1 text-xs font-semibold text-rose-600">آخر خطأ: {lastError.slice(0, 160)}</p>}
        </div>
        <span className="inline-flex flex-wrap items-center gap-2">
          {!healthy && (
            <button
              disabled={detailsBusy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={async () => {
                if (details) { setDetails(null); return; }
                setDetailsBusy(true);
                const r = await listPendingEmailJobsAction() as { ok: boolean; jobs?: PendingJob[] };
                setDetailsBusy(false);
                setDetails(r.jobs ?? []);
              }}
            >
              {detailsBusy ? "⏳…" : details ? "إخفاء التفاصيل" : "🔎 ما الذي لم يُرسل ولماذا؟"}
            </button>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={async () => {
              setBusy(true); setMsg(null);
              const r = await processQueueNowAction() as { ok: boolean; sent?: number; recovered?: number; forced?: number; dead?: number; error?: string };
              setBusy(false);
              setMsg(r.ok
                ? `تمت ✓ أُرسل ${r.sent ?? 0}${r.recovered ? ` — استُعيد ${r.recovered} عالقة` : ""}${r.forced ? ` — عُجّل ${r.forced} مؤجلة` : ""}${r.dead ? ` — ${r.dead} فشلت نهائياً` : ""}`
                : r.error ?? "فشل");
              setDetails(null);
              router.refresh();
            }}
          >
            {busy ? "⏳ جارٍ المعالجة…" : "🚀 معالجة الآن"}
          </button>
          {msg && <span className="text-xs font-semibold text-slate-600">{msg}</span>}
        </span>
      </div>

      {details && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          {details.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">لا مهام بريد معلقة الآن ✓</p>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">الطلب</th>
                  <th className="px-3 py-2">القالب / الرسالة</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">المحاولات</th>
                  <th className="px-3 py-2">السبب — لماذا لم تُرسل؟</th>
                </tr>
              </thead>
              <tbody>
                {details.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono font-bold" dir="ltr">{j.ticket}</td>
                    <td className="px-3 py-2">{j.template}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${JOB_STATUS[j.status]?.c ?? "bg-slate-100"}`}>{JOB_STATUS[j.status]?.l ?? j.status}</span>
                    </td>
                    <td className="px-3 py-2">{j.attempts}</td>
                    <td className="px-3 py-2 leading-relaxed text-slate-600">{j.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
