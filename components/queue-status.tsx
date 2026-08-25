"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { processQueueNowAction } from "@/app/actions/admin";

// لوحة تشخيص طابور البريد: كام رسالة منتظرة/فاشلة + زر معالجة فورية —
// عشان «مفيش حاجة وصلت» ميبقاش لغزاً: لو فيه عالق هيبان هنا فوراً
export function QueueStatus({ queued, dead, lastError }: { queued: number; dead: number; lastError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const healthy = queued === 0 && dead === 0;
  return (
    <div className={`rounded-xl border p-4 ${healthy ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">
            {healthy ? "✅ طابور البريد سليم — لا رسائل عالقة" : `⚠️ في الطابور: ${queued} بانتظار الإرسال${dead ? ` — ${dead} فشلت نهائياً` : ""}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            الإرسال يتم فور كل حدث تلقائياً — لو فيه رسائل عالقة اضغط «معالجة الآن» وستُرسل فوراً.
          </p>
          {lastError && <p className="mt-1 text-xs font-semibold text-rose-600">آخر خطأ: {lastError.slice(0, 160)}</p>}
        </div>
        <span className="inline-flex items-center gap-2">
          <button
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={async () => {
              setBusy(true); setMsg(null);
              const r = await processQueueNowAction() as { ok: boolean; sent?: number; dead?: number; error?: string };
              setBusy(false);
              setMsg(r.ok ? `تمت المعالجة ✓ أُرسل ${r.sent ?? 0}` : r.error ?? "فشل");
              router.refresh();
            }}
          >
            {busy ? "⏳ جارٍ المعالجة…" : "🚀 معالجة الآن"}
          </button>
          {msg && <span className="text-xs font-semibold text-slate-600">{msg}</span>}
        </span>
      </div>
    </div>
  );
}
