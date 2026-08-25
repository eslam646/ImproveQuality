"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { listPendingEmailJobsAction, processQueueNowAction, sendSingleJobAction } from "@/app/actions/admin";

type PendingJob = {
  id: string; ticket: string; template: string; status: string; attempts: number;
  runAfter: string; reason: string; to: string[]; cc: string[]; excluded: string | null;
};

const JOB_STATUS: Record<string, { l: string; c: string }> = {
  queued: { l: "في الانتظار", c: "bg-amber-100 text-amber-800" },
  processing: { l: "عالقة قيد المعالجة", c: "bg-orange-100 text-orange-800" },
  dead: { l: "فشلت نهائياً", c: "bg-rose-100 text-rose-700" },
  failed: { l: "فشلت", c: "bg-rose-100 text-rose-700" },
};

// لوحة تشخيص طابور البريد: عدّادات + معالجة جماعية + قائمة تفصيلية (المستلمون والسبب) + إرسال فردي لكل رسالة
export function QueueStatus({ queued, dead, lastError }: { queued: number; dead: number; lastError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [details, setDetails] = useState<PendingJob[] | null>(null);
  const [detailsTotal, setDetailsTotal] = useState(0);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const loadDetails = async () => {
    setDetailsBusy(true);
    const r = await listPendingEmailJobsAction() as { ok: boolean; jobs?: PendingJob[]; total?: number };
    setDetailsBusy(false);
    setDetails(r.jobs ?? []);
    setDetailsTotal(r.total ?? r.jobs?.length ?? 0);
  };

  const healthy = queued === 0 && dead === 0;
  return (
    <div className={`rounded-xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">
            {healthy ? "✅ طابور البريد سليم — لا رسائل عالقة" : `⚠️ في الطابور: ${queued} بانتظار الإرسال${dead ? ` — ${dead} فشلت نهائياً` : ""}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            الإرسال يتم فور كل حدث تلقائياً — «معالجة الآن» تستعيد العالق وترسل الجميع، أو أرسل كل رسالة منفردة من القائمة.
          </p>
          {lastError && <p className="mt-1 text-xs font-semibold text-rose-600">آخر خطأ: {lastError.slice(0, 160)}</p>}
        </div>
        <span className="inline-flex flex-wrap items-center gap-2">
          {!healthy && (
            <button
              disabled={detailsBusy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={async () => { if (details) { setDetails(null); return; } await loadDetails(); }}
            >
              {detailsBusy ? "⏳…" : details ? "إخفاء التفاصيل" : "🔎 ما الذي لم يُرسل ولماذا؟"}
            </button>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={async () => {
              // دفعات صغيرة متتالية تلقائياً (كل نداء طلب مستقل → لا يتخطى حدود Cloudflare أبداً)
              setBusy(true); setMsg(null);
              let sent = 0, recovered = 0, forced = 0, deadCount = 0;
              let lastErr: string | null = null;
              for (let round = 0; round < 30; round++) {
                const r = await processQueueNowAction() as { ok: boolean; sent?: number; recovered?: number; forced?: number; dead?: number; remaining?: boolean; error?: string };
                if (!r.ok) { lastErr = r.error ?? "فشل"; break; }
                sent += r.sent ?? 0; recovered += r.recovered ?? 0; forced += r.forced ?? 0; deadCount += r.dead ?? 0;
                setMsg(`⏳ جارٍ الإرسال… ${sent} حتى الآن`);
                if (!r.remaining) break;
              }
              setBusy(false);
              setMsg(lastErr ?? `تمت ✓ أُرسل ${sent}${recovered ? ` — استُعيد ${recovered} عالقة` : ""}${deadCount ? ` — ${deadCount} فشلت نهائياً (انظر الأسباب بالقائمة)` : ""}`);
              setDetails(null);
              router.refresh();
            }}
          >
            {busy ? "⏳ جارٍ المعالجة…" : "🚀 معالجة الآن (الكل)"}
          </button>
          {msg && <span className="text-xs font-semibold text-slate-600">{msg}</span>}
        </span>
      </div>

      {details && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          {detailsTotal > details.length && (
            <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              يُعرض أول {details.length} من {detailsTotal} — عالج أو أرسل هذه الدفعة وستظهر البقية.
            </p>
          )}
          {details.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">لا مهام بريد معلقة الآن ✓</p>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">الطلب</th>
                  <th className="px-3 py-2">القالب / الرسالة</th>
                  <th className="px-3 py-2">سيصل إلى</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">السبب — لماذا لم تُرسل؟</th>
                  <th className="px-3 py-2">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {details.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono font-bold" dir="ltr">{j.ticket}</td>
                    <td className="px-3 py-2">{j.template}<div className="mt-0.5 text-[10px] text-slate-400">محاولات: {j.attempts}</div></td>
                    <td className="px-3 py-2 leading-relaxed">
                      {j.to.length === 0 && j.cc.length === 0 ? (
                        <span className="text-slate-400">لا مستلمين (لن تُرسل)</span>
                      ) : (
                        <>
                          {j.to.map((r, i) => <div key={`t${i}`} dir="ltr" className="text-slate-700"><b className="text-[10px] text-blue-600">To</b> {r}</div>)}
                          {j.cc.map((r, i) => <div key={`c${i}`} dir="ltr" className="text-slate-500"><b className="text-[10px] text-slate-400">CC</b> {r}</div>)}
                        </>
                      )}
                      {j.excluded && <div className="mt-0.5 text-[10px] text-amber-600">⊘ مستثنى: {j.excluded}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-bold ${JOB_STATUS[j.status]?.c ?? "bg-slate-100"}`}>{JOB_STATUS[j.status]?.l ?? j.status}</span>
                    </td>
                    <td className="px-3 py-2 leading-relaxed text-slate-600">{j.reason}</td>
                    <td className="px-3 py-2">
                      <button
                        disabled={rowBusy === j.id || (j.to.length === 0 && j.cc.length === 0)}
                        className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                        onClick={async () => {
                          setRowBusy(j.id);
                          const r = await sendSingleJobAction(j.id) as { ok: boolean; error?: string };
                          setRowBusy(null);
                          setRowMsg((m) => ({ ...m, [j.id]: r.ok ? "أُرسلت ✓" : r.error ?? "فشل" }));
                          if (r.ok) { await loadDetails(); router.refresh(); }
                        }}
                      >
                        {rowBusy === j.id ? "⏳…" : "📤 إرسال هذه فقط"}
                      </button>
                      {rowMsg[j.id] && <div className={`mt-1 text-[10px] font-bold ${rowMsg[j.id].includes("✓") ? "text-emerald-600" : "text-rose-600"}`}>{rowMsg[j.id]}</div>}
                    </td>
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
