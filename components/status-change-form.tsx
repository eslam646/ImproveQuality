"use client";

import { useState } from "react";
import { changeStatusAction } from "@/app/actions/tickets";
import { STATUS_LABELS } from "@/lib/labels";
import type { DevStatus } from "@/lib/types";

// بوكس تغيير الحالة: يفرض كتابة سبب عند «مرفوض» أو «فشل الاختبار» (التحقق مكرر في الخادم)
export function StatusChangeForm({
  code, transitions, noteLabel,
}: {
  code: string;
  transitions: DevStatus[];
  noteLabel: string;
}) {
  const [status, setStatus] = useState<DevStatus | "">("");
  const needNote = status === "rejected" || status === "test_failed";

  return (
    <form action={changeStatusAction} className="space-y-2">
      <input type="hidden" name="code" value={code} />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">تحديث حالة التطوير</span>
        <select
          name="dev_status" required value={status}
          onChange={(e) => setStatus(e.target.value as DevStatus)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>اختر الحالة الجديدة…</option>
          {transitions.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="block">
        <textarea
          name="note" rows={needNote ? 3 : 2} required={needNote} minLength={needNote ? 3 : 0}
          placeholder={
            status === "rejected" ? "سبب الرفض (إجباري) — يُذكر اسمك ودورك في الإيميل…" :
            status === "test_failed" ? "سبب فشل الاختبار / وصف المشكلة للمطوّر (إجباري)…" :
            `${noteLabel} (اختياري — تُرسل في الإيميل)`
          }
          className={`w-full rounded-lg border px-3 py-2 text-sm ${needNote ? "border-rose-300 bg-rose-50 placeholder:text-rose-400" : "border-slate-300"}`}
        />
      </label>
      {needNote && (
        <p className="text-xs font-semibold text-rose-600">
          {status === "rejected" ? "⚠️ سيصل إيميل «تم رفض الطلب» لمقدم الطلب ومدخل البيانات باسمك ودورك وسبب الرفض" : "⚠️ سيصل سبب الفشل للمطوّر بالإيميل للعمل عليه مجدداً"}
        </p>
      )}
      <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        تحديث الحالة
      </button>
    </form>
  );
}
