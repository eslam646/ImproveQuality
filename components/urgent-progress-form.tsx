"use client";

import { useState } from "react";
import { updateUrgentProgressAction } from "@/app/actions/tickets";

// الدعم الفوري «طلب جانبي»: المكلَّف يحدّث موقفه بوضوح —
// «مازلت في الطلب» أو «انتهيت» فينتهي الدعم لهذه النقطة نهائياً
export function UrgentProgressForm({ code, roleLabel }: { code: string; roleLabel: string }) {
  const [mode, setMode] = useState<"idle" | "finish">("idle");

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
      <h3 className="font-extrabold text-emerald-900">🚨 موقف الدعم الفوري — أنت {roleLabel} المكلَّف بهذه النقطة</h3>
      <p className="mt-1 text-sm text-emerald-800">
        الدعم الفوري طلب جانبي لمساعدة السبورت في نقطة محددة. حدّث موقفك ليعرف الجميع:
        إمّا أنك <b>مازلت تعمل عليها</b>، أو أنك <b>انتهيت</b> فينتهي الدعم الخاص بهذه النقطة ويُغلق الطلب.
      </p>

      {mode === "idle" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <form action={updateUrgentProgressAction} className="space-y-2">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="progress" value="still_working" />
            <input
              name="note"
              placeholder="ملاحظة اختيارية: أين وصلت حتى الآن…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
            >
              🔄 مازلت في الطلب — أعمل على هذه النقطة
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("finish")}
            className="h-fit w-full self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            ✅ خلصت الطلب — إنهاء الدعم الفوري
          </button>
        </div>
      ) : (
        <form action={updateUrgentProgressAction} className="mt-3 space-y-2">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="progress" value="done" />
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-emerald-900">نتيجة الدعم (إجباري) — تُرسل بالإيميل وتُحفظ في السجل</span>
            <textarea
              name="note"
              required
              minLength={3}
              rows={3}
              placeholder="مثال: تم إصلاح مشكلة الاتصال بقاعدة البيانات وإعادة تشغيل الخدمة، وتم التأكد مع السبورت أن كل شيء يعمل…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              ✅ تأكيد إنهاء الدعم الفوري لهذه النقطة
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              رجوع
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
